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
MIN_TEXT_CHARS = 50
MAX_OCR_PAGES = 8
OCR_RENDER_SCALE = 2.0

IMAGE_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/tiff",
    "image/x-png",
}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"}

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


# ── Step 1: PDF extraction (+ OCR fallback) ───────────────────────────────────

def configure_tesseract() -> None:
    """Point pytesseract at the system binary (Windows + custom paths)."""
    import pytesseract

    cmd = os.getenv("TESSERACT_CMD", "").strip()
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd
        return

    if os.name == "nt":
        for candidate in (
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ):
            if os.path.isfile(candidate):
                pytesseract.pytesseract.tesseract_cmd = candidate
                return


def is_tesseract_available() -> bool:
    try:
        configure_tesseract()
        import pytesseract

        pytesseract.get_tesseract_version()
        return True
    except Exception as exc:
        logger.warning("Tesseract not available: %s", exc)
        return False


def is_image_file(content_type: Optional[str], filename: Optional[str]) -> bool:
    if content_type:
        if content_type in IMAGE_CONTENT_TYPES or content_type.startswith("image/"):
            return True
    if filename:
        ext = os.path.splitext(filename.lower())[1]
        return ext in IMAGE_EXTENSIONS
    return False


def is_pdf_file(content_type: Optional[str], filename: Optional[str]) -> bool:
    if content_type == "application/pdf":
        return True
    if filename and filename.lower().endswith(".pdf"):
        return True
    return content_type == "application/octet-stream" and bool(
        filename and filename.lower().endswith(".pdf")
    )


def ocr_pil_image(img) -> str:
    """Run Tesseract on a PIL image (grayscale + autocontrast)."""
    import pytesseract
    from PIL import ImageOps

    configure_tesseract()
    img = ImageOps.grayscale(img)
    img = ImageOps.autocontrast(img)
    return pytesseract.image_to_string(
        img,
        lang="eng",
        config="--psm 6 --oem 3",
    )


def ocr_image_bytes(file_bytes: bytes) -> str:
    """OCR a standalone image file (PNG, JPG, WEBP, etc.)."""
    from PIL import Image

    img = Image.open(BytesIO(file_bytes))
    return ocr_pil_image(img.convert("RGB"))


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


def get_ocr_page_count(file_bytes: bytes) -> int:
    import fitz

    doc = fitz.open(stream=file_bytes, filetype="pdf")
    count = min(len(doc), MAX_OCR_PAGES)
    doc.close()
    return count


def ocr_pdf_page(file_bytes: bytes, page_index: int) -> str:
    """OCR a single PDF page using PyMuPDF + Tesseract."""
    import fitz
    from PIL import Image

    doc = fitz.open(stream=file_bytes, filetype="pdf")
    try:
        page = doc[page_index]
        matrix = fitz.Matrix(OCR_RENDER_SCALE, OCR_RENDER_SCALE)
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        return ocr_pil_image(img)
    finally:
        doc.close()


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
    return {
        "status": "ok",
        "gemini_configured": bool(GEMINI_API_KEY),
        "tavily_configured": bool(TAVILY_API_KEY),
        "tesseract_available": is_tesseract_available(),
    }


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    content_type = file.content_type or ""
    filename = file.filename or ""

    if not is_pdf_file(content_type, filename) and not is_image_file(content_type, filename):
        raise HTTPException(
            status_code=400,
            detail="Only PDF and image files are accepted (PNG, JPG, JPEG, WEBP, GIF, BMP, TIFF).",
        )

    file_bytes = await file.read()
    upload_is_image = is_image_file(content_type, filename)

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured on the server.")

    def sse(obj: dict) -> str:
        return f"data: {json.dumps(obj)}\n\n"

    async def event_stream():
        try:
            # ── Step 0: Extract text (PDF, image, or OCR fallback) ────────────
            yield sse({"type": "step", "step": 0})
            used_ocr = False

            if upload_is_image:
                logger.info("SSE Step 0: OCR on uploaded image")
                if not is_tesseract_available():
                    yield sse({
                        "type": "error",
                        "detail": (
                            "Tesseract OCR is not available on the server. "
                            "Image uploads require OCR to read text."
                        ),
                    })
                    return

                yield sse({"type": "ocr_mode"})
                yield sse({"type": "ocr_progress", "current": 0, "total": 1})
                try:
                    raw_text = await asyncio.to_thread(ocr_image_bytes, file_bytes)
                except Exception as exc:
                    logger.error("Image OCR failed: %s", exc)
                    yield sse({"type": "error", "detail": f"Could not read text from image: {exc}"})
                    return
                yield sse({"type": "ocr_progress", "current": 1, "total": 1})
                used_ocr = True
                logger.info("Image OCR extracted %d chars", len(raw_text.strip()))
            else:
                logger.info("SSE Step 0: Extracting PDF text")
                try:
                    raw_text = await asyncio.to_thread(extract_pdf_text, file_bytes)
                except HTTPException as exc:
                    yield sse({"type": "error", "detail": exc.detail})
                    return

                if len(raw_text.strip()) < MIN_TEXT_CHARS:
                    logger.info(
                        "Text layer too short (%d chars), attempting OCR fallback",
                        len(raw_text.strip()),
                    )
                    if not is_tesseract_available():
                        yield sse({
                            "type": "error",
                            "detail": (
                                "This PDF appears to be image-based and Tesseract OCR is not "
                                "available on the server. Install tesseract-ocr or upload an image/PDF with text."
                            ),
                        })
                        return

                    page_count = await asyncio.to_thread(get_ocr_page_count, file_bytes)
                    if page_count == 0:
                        yield sse({"type": "error", "detail": "PDF has no pages to read."})
                        return

                    yield sse({"type": "ocr_mode"})
                    ocr_parts: list[str] = []
                    for i in range(page_count):
                        page_text = await asyncio.to_thread(ocr_pdf_page, file_bytes, i)
                        if page_text.strip():
                            ocr_parts.append(page_text.strip())
                        yield sse({"type": "ocr_progress", "current": i + 1, "total": page_count})

                    raw_text = "\n\n".join(ocr_parts)
                    used_ocr = True
                    logger.info("OCR extracted %d chars from %d pages", len(raw_text), page_count)

            if len(raw_text.strip()) < MIN_TEXT_CHARS:
                yield sse({
                    "type": "error",
                    "detail": (
                        "Could not read enough text from this PDF. "
                        "It may be blank, heavily graphical, or OCR could not decode the content."
                    ),
                })
                return

            if used_ocr:
                yield sse({"type": "ocr_complete", "chars": len(raw_text.strip())})

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
