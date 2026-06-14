# Fact-Check Agent

A **Truth Layer** full-stack application that extracts factual claims from PDF documents and verifies them against live web data.

| Part | Stack | Folder |
|------|-------|--------|
| **Backend** | Python · FastAPI · Gemini · Tavily | `backend/` |
| **Frontend** | Next.js · React · Tailwind CSS | `frontend/` |

Upload a PDF → the backend extracts verifiable claims, searches the web for each one, and returns structured verdicts: **verified**, **inaccurate**, or **false**. The frontend shows live progress and a filterable results dashboard.

---

## Table of Contents

- [Complete Workflow](#complete-workflow)
- [Backend](#backend)
- [Frontend](#frontend)
- [Run Locally](#run-locally)
- [Deployment](#deployment)
- [Limitations](#limitations)

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

## Backend

Python **FastAPI** API — the Truth Layer that powers claim extraction and verification.

### Pipeline

1. **PDF text extraction** — Uses `pypdf` to read the PDF text layer.
2. **Claim extraction** — Sends text to **Gemini 2.5 Pro** with a strict prompt; returns a JSON array of factual claims (statistics, dates, percentages, market sizes, etc.).
3. **Web verification** — For each claim, queries **Tavily Search** (top 4 results: title, URL, snippet).
4. **Verdict generation** — One batched **Gemini** call evaluates all claims + snippets; assigns `status`, `correct_fact`, and `explanation`.
5. **Response** — Summary counts plus claims with attached sources.

Progress is streamed to the client via **SSE** so the UI can show real per-claim search progress.

### Project Files

```
backend/
├── main.py              # FastAPI app, pipeline, endpoints
├── requirements.txt     # Python dependencies
├── .env.example         # API key template
├── deploy.md            # Render deployment guide
└── render.yaml          # Render Blueprint config
```

### Dependencies

| Package | Purpose |
|---------|---------|
| `fastapi` / `uvicorn` | Web server |
| `pypdf` | PDF text extraction |
| `google-generativeai` | Gemini API |
| `httpx` | Tavily HTTP client |
| `python-multipart` | File uploads |
| `python-dotenv` | Environment variables |

### Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in your keys:

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `TAVILY_API_KEY` | Yes | [Tavily](https://app.tavily.com/sign-up) — 1,000 searches/month free |
| `PORT` | Auto | Set by Render in production |

### API Endpoints

#### `GET /health`

```json
{
  "status": "ok",
  "gemini_configured": true,
  "tavily_configured": true
}
```

#### `POST /analyze`

| | |
|---|---|
| **Request** | `multipart/form-data` — field `file` (PDF only) |
| **Response** | `text/event-stream` (SSE) |

**SSE events:**

| Event | Payload | When |
|-------|---------|------|
| `step` | `{ "step": 0–3 }` | Pipeline stage change |
| `claims_found` | `{ "count": N }` | After Gemini extracts claims |
| `search_progress` | `{ "current": N, "total": M }` | After each Tavily search |
| `result` | `{ "data": { ... } }` | Final JSON payload |
| `error` | `{ "detail": "..." }` | On failure |

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

**Response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `claim_text` | string | Original claim from the PDF |
| `status` | enum | `verified`, `inaccurate`, or `false` |
| `correct_fact` | string \| null | Accurate information when claim is wrong or outdated |
| `sources` | array | Web references (`title`, `url`) |
| `explanation` | string | Brief reasoning citing search results |

**HTTP errors (before stream starts):**

| Code | Meaning |
|------|---------|
| 400 | Not a PDF or empty file |
| 422 | PDF has no extractable text |
| 503 | `GEMINI_API_KEY` not configured |

### Error Handling

- Gemini and Tavily calls retry up to **2 times**
- Malformed Gemini JSON → regex fallback to extract JSON array
- Missing Tavily key → claims marked **false** with *"No verification data available"*
- Image-only / scanned PDFs → fail at text extraction (no OCR yet)

---

## Frontend

Next.js web app — upload UI, live SSE progress, and results dashboard.

### Features

- **Upload** — Drag-and-drop PDF zone; upload card stays visible while results load below
- **Live progress** — SSE-driven steps plus per-claim mini progress bar during Tavily searches
- **Results** — Summary stats with distribution bar; filterable claim cards (Verified / Inaccurate / False)
- **Design** — Responsive layout, status colors (green / amber / red), source links

### Project Files

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
└── .env.local             # NEXT_PUBLIC_API_URL (not committed)
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend URL, e.g. `http://localhost:8000` (no trailing slash) |

### Frontend ↔ Backend Integration

1. User selects PDF → `FormData` POST to `/analyze`
2. Frontend reads the SSE stream via `ReadableStream`
3. Loading UI updates from `step`, `claims_found`, and `search_progress` events
4. On `result`, renders summary stats and claim cards

### Frontend Error Handling

- Missing `NEXT_PUBLIC_API_URL` configuration
- Network errors and API failures (SSE `error` events)
- Invalid file types (PDF only)
- Retry from error state without losing the upload area

---

## Run Locally

### Prerequisites

- Python 3.11+
- Node.js 18+
- Free API keys: [Google AI Studio](https://aistudio.google.com/app/apikey) · [Tavily](https://app.tavily.com/sign-up)

### Terminal 1 — Backend

```bash
cd backend
cp .env.example .env
# Edit .env — add GEMINI_API_KEY and TAVILY_API_KEY

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

- Health: http://localhost:8000/health
- Analyze: http://localhost:8000/analyze

### Terminal 2 — Frontend

```bash
cd frontend
echo NEXT_PUBLIC_API_URL=http://localhost:8000 > .env.local

npm install
npm run dev
```

Open http://localhost:3000 — **start the backend first**.

### Production Build (Frontend)

```bash
cd frontend
npm run build
npm start
```

---

## Deployment

| Service | Platform | Config |
|---------|----------|--------|
| **Backend** | [Render](https://render.com) | See `backend/deploy.md` or use `backend/render.yaml` |
| **Frontend** | [Vercel](https://vercel.com) | Root dir: `frontend` · env: `NEXT_PUBLIC_API_URL` |

**Backend (Render) quick reference:**

```bash
# Build
pip install -r requirements.txt

# Start
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Set environment variables on Render: `GEMINI_API_KEY`, `TAVILY_API_KEY`.

**Frontend (Vercel):**

```
NEXT_PUBLIC_API_URL=https://your-render-backend.onrender.com
```

---

## Limitations

- **Text-based PDFs only** — `pypdf` reads the text layer; image-only or scanned PDFs usually fail with *"Could not extract meaningful text"*
- **12 claim cap** — Limits API cost per document
- **Free tier limits** — Gemini Pro rate limits; Tavily 1,000 searches/month
- **Not legal advice** — AI + web search verdicts; human review recommended for critical use

---

## License

Built for assessment / demo use.
