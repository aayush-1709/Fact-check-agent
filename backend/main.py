import asyncio
import os
import re
import json
import time
import logging
from io import BytesIO
from typing import Optional

import httpx
import pypdf
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")

MAX_FILE_SIZE_BYTES = None  # No file size limit
MAX_PDF_CHARS = 15_000
MAX_CLAIMS = 12
SEARCH_RESULTS_PER_CLAIM = 4
MAX_RETRIES = 2

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

app = FastAPI(title="Fact-Check Agent API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Response models ───────────────────────────────────────────────────────────
class Source(BaseModel):
    title: str
    url: str

class Claim(BaseModel):
    claim_text: str
    status: str          # "verified" | "inaccurate" | "false"
    correct_fact: Optional[str]
    sources: list[Source]
    explanation: str

class Summary(BaseModel):
    verified: int
    inaccurate: int
    false: int

class AnalysisResponse(BaseModel):
    summary: Summary
    claims: list[Claim]


# ── Helpers ───────────────────────────────────────────────────────────────────

def extract_json_array(text: str) -> list:
    """Strip markdown fences and extract the first JSON array from a string."""
    # Remove code fences
    text = re.sub(r"```(?:json)?", "", text).strip()
    # Find first [...] block
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        return json.loads(match.group())
    return json.loads(text)


def call_gemini(prompt: str, model_name: str = "gemini-2.5-flash") -> str:
    """Call Gemini with retry logic. Returns raw text."""
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured.")

    model = genai.GenerativeModel(model_name)
    generation_config = genai.types.GenerationConfig(temperature=0)

    last_error = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            response = model.generate_content(
                prompt,
                generation_config=generation_config,
            )
            return response.text
        except Exception as exc:
            last_error = exc
            logger.warning("Gemini attempt %d failed: %s", attempt + 1, exc)
            if attempt < MAX_RETRIES:
                time.sleep(2 ** attempt)

    raise RuntimeError(f"Gemini call failed after {MAX_RETRIES + 1} attempts: {last_error}")


def search_web(query: str) -> list[dict]:
    """Search using Tavily API. Returns list of {title, url, content} dicts."""
    if not TAVILY_API_KEY:
        return []

    url = "https://api.tavily.com/search"
    payload = {
        "api_key": TAVILY_API_KEY,
        "query": query,
        "search_depth": "basic",
        "max_results": SEARCH_RESULTS_PER_CLAIM,
        "include_answer": False,
    }

    last_error = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=15) as client:
                resp = client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                results = data.get("results", [])
                return [
                    {
                        "title": r.get("title", ""),
                        "url": r.get("url", ""),
                        "content": r.get("content", "")[:400],
                    }
                    for r in results
                ]
        except Exception as exc:
            last_error = exc
            logger.warning("Tavily attempt %d failed: %s", attempt + 1, exc)
            if attempt < MAX_RETRIES:
                time.sleep(1)

    logger.error("Tavily search failed: %s", last_error)
    return []


# ── Step 1: PDF extraction ────────────────────────────────────────────────────

def extract_pdf_text(file_bytes: bytes) -> str:
    try:
        reader = pypdf.PdfReader(BytesIO(file_bytes))
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        return "\n".join(pages)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"PDF parse error: {exc}")


# ── Step 2: Claim extraction ──────────────────────────────────────────────────

def extract_claims(text: str) -> list[dict]:
    truncated = text[:MAX_PDF_CHARS]

    prompt = f"""You are a precise fact-checking assistant. Extract all factual, verifiable claims from the text below — specifically statistics, dates, financial figures, percentages, market sizes, growth rates, and technical numbers. Ignore opinions, vague statements, and marketing fluff.

Return ONLY a JSON array of objects with no markdown formatting: [{{"claim_text": "..."}}]
Limit to the most important 8-12 claims to control cost.

TEXT:
{truncated}"""

    raw = call_gemini(prompt)
    try:
        claims = extract_json_array(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("Failed to parse claims JSON: %s\nRaw: %s", exc, raw[:500])
        raise HTTPException(status_code=502, detail="Gemini returned malformed claim data.")

    if not isinstance(claims, list):
        raise HTTPException(status_code=502, detail="Unexpected claims structure from Gemini.")

    return claims[:MAX_CLAIMS]


# ── Step 3: Web search ────────────────────────────────────────────────────────

def search_all_claims(claims: list[dict]) -> list[dict]:
    """Attach search results to each claim dict."""
    enriched = []
    for claim in claims:
        claim_text = claim.get("claim_text", "")
        # Build a compact search query
        query = claim_text[:200]
        results = search_web(query)
        enriched.append({**claim, "search_results": results})
    return enriched


# ── Step 4: Batched verdict generation ───────────────────────────────────────

def generate_verdicts(enriched_claims: list[dict]) -> list[dict]:
    """Single Gemini call for all claims. Returns list of verdict dicts."""

    if not enriched_claims:
        return []

    # Build a numbered list of claims + snippets for the prompt
    claims_block_parts = []
    for i, c in enumerate(enriched_claims, 1):
        snippets = "\n".join(
            f"  [{j+1}] {r['title']} — {r['content']}"
            for j, r in enumerate(c.get("search_results", []))
        ) or "  [No search results available]"
        claims_block_parts.append(
            f"CLAIM {i}: {c['claim_text']}\nSEARCH SNIPPETS:\n{snippets}"
        )

    claims_block = "\n\n".join(claims_block_parts)

    prompt = f"""You are an expert fact-checker. For each numbered claim below, evaluate it against the provided search snippets and produce a verdict.

Rules:
- "verified": snippets confirm the claim is accurate
- "inaccurate": snippets show a different or updated figure
- "false": snippets contradict the claim or no supporting evidence exists

Return ONLY valid JSON array, no markdown, matching this schema exactly:
[{{"claim_text": "...", "status": "verified"|"inaccurate"|"false", "correct_fact": "..." or null, "explanation": "1-2 sentences citing what snippets showed"}}]

CLAIMS TO EVALUATE:
{claims_block}"""

    raw = call_gemini(prompt)
    try:
        verdicts = extract_json_array(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("Failed to parse verdicts JSON: %s\nRaw: %s", exc, raw[:500])
        raise HTTPException(status_code=502, detail="Gemini returned malformed verdict data.")

    if not isinstance(verdicts, list):
        raise HTTPException(status_code=502, detail="Unexpected verdict structure from Gemini.")

    return verdicts


# ── Step 5: Aggregate response ────────────────────────────────────────────────

def build_response(enriched_claims: list[dict], verdicts: list[dict]) -> AnalysisResponse:
    final_claims: list[Claim] = []

    verdict_map: dict[str, dict] = {}
    for v in verdicts:
        key = v.get("claim_text", "").strip()
        verdict_map[key] = v

    for c in enriched_claims:
        claim_text = c.get("claim_text", "").strip()

        # Match verdict — try exact first, then positional fallback
        verdict = verdict_map.get(claim_text)
        if verdict is None:
            # Fallback: use index order if lengths match
            idx = enriched_claims.index(c)
            if idx < len(verdicts):
                verdict = verdicts[idx]

        if verdict is None:
            verdict = {
                "status": "false",
                "correct_fact": None,
                "explanation": "No verification data available.",
            }

        status = verdict.get("status", "false")
        if status not in ("verified", "inaccurate", "false"):
            status = "false"

        sources = [
            Source(title=r["title"], url=r["url"])
            for r in c.get("search_results", [])
            if r.get("title") and r.get("url")
        ]

        # If no search was possible, mark appropriately
        if not sources and not TAVILY_API_KEY:
            verdict["status"] = "false"
            verdict["explanation"] = "No verification data available — search API key not configured."

        final_claims.append(
            Claim(
                claim_text=claim_text,
                status=status,
                correct_fact=verdict.get("correct_fact"),
                sources=sources,
                explanation=verdict.get("explanation", ""),
            )
        )

    summary = Summary(
        verified=sum(1 for fc in final_claims if fc.status == "verified"),
        inaccurate=sum(1 for fc in final_claims if fc.status == "inaccurate"),
        false=sum(1 for fc in final_claims if fc.status == "false"),
    )

    return AnalysisResponse(summary=summary, claims=final_claims)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "gemini_configured": bool(GEMINI_API_KEY), "tavily_configured": bool(TAVILY_API_KEY)}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        if not (file.filename or "").lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    file_bytes = await file.read()

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured on the server.")

    def sse(obj: dict) -> str:
        return f"data: {json.dumps(obj)}\n\n"

    async def event_stream():
        try:
            # ── Step 0: Extract PDF text ──────────────────────────────────────
            yield sse({"type": "step", "step": 0})
            logger.info("SSE Step 0: Extracting PDF text")
            try:
                raw_text = await asyncio.to_thread(extract_pdf_text, file_bytes)
            except HTTPException as exc:
                yield sse({"type": "error", "detail": exc.detail})
                return

            if not raw_text or len(raw_text.strip()) < 50:
                yield sse({"type": "error", "detail": "Could not extract meaningful text from this PDF. It may be scanned/image-based."})
                return

            # ── Step 1: Extract claims (Gemini call #1) ───────────────────────
            yield sse({"type": "step", "step": 1})
            logger.info("SSE Step 1: Extracting claims")
            try:
                claims = await asyncio.to_thread(extract_claims, raw_text)
            except HTTPException as exc:
                yield sse({"type": "error", "detail": exc.detail})
                return

            if not claims:
                yield sse({"type": "error", "detail": "No verifiable factual claims found in this document."})
                return

            logger.info("SSE: Extracted %d claims", len(claims))
            yield sse({"type": "claims_found", "count": len(claims)})

            # ── Step 2: Web search per claim ──────────────────────────────────
            yield sse({"type": "step", "step": 2})
            logger.info("SSE Step 2: Searching web for %d claims", len(claims))
            enriched: list[dict] = []
            for i, claim in enumerate(claims):
                query = claim.get("claim_text", "")[:200]
                results = await asyncio.to_thread(search_web, query)
                enriched.append({**claim, "search_results": results})
                yield sse({"type": "search_progress", "current": i + 1, "total": len(claims)})

            # ── Step 3: Batch verdict (Gemini call #2) ────────────────────────
            yield sse({"type": "step", "step": 3})
            logger.info("SSE Step 3: Generating verdicts (batched Gemini call)")
            try:
                verdicts = await asyncio.to_thread(generate_verdicts, enriched)
            except HTTPException as exc:
                yield sse({"type": "error", "detail": exc.detail})
                return

            result = build_response(enriched, verdicts)
            yield sse({"type": "result", "data": result.model_dump()})

        except Exception as exc:
            logger.error("Unexpected SSE error: %s", exc)
            yield sse({"type": "error", "detail": f"Unexpected error: {str(exc)}"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
