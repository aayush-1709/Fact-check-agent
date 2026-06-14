# Fact-Check Agent

A **Truth Layer** full-stack app that extracts factual claims from PDF documents and verifies them against live web data.

| Part | Stack | Folder |
|------|-------|--------|
| **Backend** | Python · FastAPI · Gemini · Tavily | `/backend` |
| **Frontend** | Next.js · React · Tailwind CSS | `/frontend` |

Upload a PDF → the backend extracts verifiable claims, searches the web for each one, and returns structured verdicts: **verified**, **inaccurate**, or **false**. The frontend shows live progress and a filterable results dashboard.

---

## Complete Workflow

```
User uploads PDF (frontend)
        │
        ▼
POST /analyze  ──►  Server-Sent Events (SSE) stream
        │
        ├── Step 0  Extract PDF text          (pypdf)
        ├── Step 1  Extract claims            (Gemini 2.5 Pro — call #1)
        ├── Step 2  Web search per claim      (Tavily — progress events)
        ├── Step 3  Batch verdict generation  (Gemini 2.5 Pro — call #2)
        └── Step 4  Aggregate & return JSON
```

**Cost design:** exactly **2 Gemini calls** per document (never one call per claim). PDF text is truncated to ~15,000 characters. Max **12 claims** per run.

---

# Backend

Python **FastAPI** API — the Truth Layer that powers claim extraction and verification.

## What It Does

1. **PDF text extraction** — Uses `pypdf` to read the PDF text layer.
2. **Claim extraction** — Sends text to **Gemini 2.5 Pro** with a strict prompt; returns JSON array of factual claims (stats, dates, percentages, market sizes, etc.).
3. **Web verification** — For each claim, queries **Tavily Search** (top 4 results: title, URL, snippet).
4. **Verdict generation** — One batched **Gemini** call evaluates all claims + snippets; assigns status, `correct_fact`, and `explanation`.
5. **Response** — Summary counts + claims with attached sources.

Progress is streamed to the client via **SSE** so the UI can show real per-claim search progress.

## Project Files

```
backend/
├── main.py              # FastAPI app, pipeline, endpoints
├── requirements.txt     # Python dependencies
├── .env.example         # API key template
├── deploy.md            # Render deployment guide
└── render.yaml          # Render Blueprint config
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `fastapi` / `uvicorn` | Web server |
| `pypdf` | PDF text extraction |
| `google-generativeai` | Gemini API |
| `httpx` | Tavily HTTP client |
| `python-multipart` | File uploads |
| `python-dotenv` | Environment variables |

## Environment Variables

Create `backend/.env` from `.env.example`:

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `TAVILY_API_KEY` | Yes | [Tavily](https://app.tavily.com/sign-up) (1,000 searches/month free) |
| `PORT` | Auto | Set by Render in production |

## Run Locally

```bash
cd backend
cp .env.example .env
# Edit .env and add your API keys

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

- Health: `GET http://localhost:8000/health`
- Analyze: `POST http://localhost:8000/analyze`

## API Endpoints

### `GET /health`

```json
{
  "status": "ok",
  "gemini_configured": true,
  "tavily_configured": true
}
```

### `POST /analyze`

- **Request:** `multipart/form-data` — field `file` (PDF only)
- **Response:** `text/event-stream` (SSE)

**SSE events:**

| Event | Payload | When |
|-------|---------|------|
| `step` | `{ "step": 0–3 }` | Pipeline stage change |
| `claims_found` | `{ "count": N }` | After Gemini extracts claims |
| `search_progress` | `{ "current": N, "total": M }` | After each Tavily search |
| `result` | `{ "data": { ... } }` | Final JSON (see schema below) |
| `error` | `{ "detail": "..." }` | Failure |

**Final result schema:**

```json
{
  "summary": { "verified": 3, "inaccurate": 2, "false": 1 },
  "claims": [
    {
      "claim_text": "string",
      "status": "verified | inaccurate | false",
      "correct_fact": "string | null",
      "sources": [{ "title": "string", "url": "string" }],
      "explanation": "string"
    }
  ]
}
```

**HTTP errors (before stream starts):**

| Code | Meaning |
|------|---------|
| 400 | Not a PDF or empty file |
| 422 | PDF has no extractable text |
| 503 | `GEMINI_API_KEY` not configured |

## Backend Error Handling

- Gemini and Tavily calls retry up to **2 times**
- Malformed Gemini JSON → regex fallback to extract JSON array
- Missing Tavily key → claims marked **false** with *"No verification data available"*
- Image-only / scanned PDFs → fail at text extraction (no OCR yet)

## Deploy Backend (Render)

See **`backend/deploy.md`** for full instructions.

Quick summary:
- **Build:** `pip install -r requirements.txt`
- **Start:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Or use **`render.yaml`** Blueprint with env vars `GEMINI_API_KEY`, `TAVILY_API_KEY`

---

# Frontend

Next.js web app — upload UI, live SSE progress, and results dashboard.

## Features

- **Upload** — Drag-and-drop PDF zone; upload card stays visible while results load below
- **Live progress** — SSE-driven steps + per-claim mini progress bar during Tavily searches
- **Results** — Summary stats with distribution bar; filterable claim cards (Verified / Inaccurate / False)
- **Design** — Responsive layout, status colors (green / amber / red), source links

## Project Files

```
frontend/
├── app/
│   ├── page.tsx           # Main page, SSE client, state
│   └── layout.tsx         # Root layout, fonts, metadata
├── components/
│   ├── upload-card.tsx
│   ├── loading-indicator.tsx
│   ├── summary-stats.tsx
│   ├── claims-list.tsx
│   └── claim-card.tsx
└── .env.local             # NEXT_PUBLIC_API_URL
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend URL, e.g. `http://localhost:8000` (no trailing slash) |

## Run Locally

```bash
cd frontend
echo NEXT_PUBLIC_API_URL=http://localhost:8000 > .env.local

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Start the backend first** — the frontend calls `{NEXT_PUBLIC_API_URL}/analyze`.

### Production Build

```bash
npm run build
npm start
```

## Frontend ↔ Backend Integration

1. User selects PDF → `FormData` POST to `/analyze`
2. Frontend reads SSE stream via `ReadableStream`
3. Updates loading UI from `step`, `claims_found`, `search_progress` events
4. On `result`, renders summary + claim cards

## Deploy Frontend (Vercel)

1. Import repo, set root directory to `frontend`
2. Add env: `NEXT_PUBLIC_API_URL=https://your-render-backend.onrender.com`
3. Deploy

---

## Run Both (Quick Reference)

```bash
# Terminal 1 — Backend
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm run dev
```

---

## Limitations

- **Text-based PDFs** — `pypdf` cannot read text embedded in images; marketing/image-only PDFs usually fail
- **12 claim cap** — Controls API cost per document
- **Free tier limits** — Gemini Pro RPM limits; Tavily 1,000 searches/month
- **Not legal advice** — Web search + AI verdicts; human review recommended for critical use

---

## License

Built for assessment / demo use.
