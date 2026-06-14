# Fact-Check Agent

A **Truth Layer** full-stack application that extracts factual claims from **PDF documents and images**, then verifies them against live web data.

| Part | Stack | Folder |
|------|-------|--------|
| **Backend** | Python · FastAPI · Gemini 2.5 Flash · Tavily | `backend/` |
| **Frontend** | Next.js · React · Tailwind CSS | `frontend/` |

Upload a **PDF or image** → the backend reads the content (text layer or free Tesseract OCR), extracts verifiable claims, searches the web for each one, and returns structured verdicts: **verified**, **inaccurate**, or **false**. The frontend shows live progress and a filterable results dashboard.

**Supported uploads:** PDF · PNG · JPG · JPEG · WEBP · GIF · BMP · TIFF

---

## Table of Contents

- [Complete Workflow](#complete-workflow)
- [Image & PDF Analysis](#image--pdf-analysis)
- [Backend](#backend)
- [Frontend](#frontend)
- [Run Locally](#run-locally)
- [Deployment](#deployment)
- [Limitations](#limitations)

---

## Complete Workflow

```
User uploads PDF or image (frontend)
        │
        ▼
POST /analyze  ──►  Server-Sent Events (SSE) stream
        │
        ├── Step 0  Read document text
        │             • PDF → pypdf text layer
        │             • Image → Tesseract OCR (direct)
        │             • Image PDF / scan → Tesseract OCR (up to 8 pages)
        ├── Step 1  Extract claims            (Gemini 2.5 Flash — call #1)
        ├── Step 2  Web search per claim      (Tavily — progress events)
        ├── Step 3  Batch verdict generation  (Gemini 2.5 Flash — call #2)
        └── Step 4  Aggregate & return JSON
```

**Cost design:** exactly **2 Gemini 2.5 Flash calls** per upload (never one call per claim). Extracted text is truncated to ~15,000 characters. Max **12 claims** per run.

---

## Image & PDF Analysis

The backend handles three input types using **free Tesseract OCR** (no paid vision API):

| Input type | How text is read | Example use case |
|------------|------------------|------------------|
| **Text-based PDF** | `pypdf` reads embedded text | Reports, whitepapers with selectable text |
| **Image-based / scanned PDF** | PyMuPDF renders pages → Tesseract OCR (max 8 pages) | Scanned documents, image-only PDFs |
| **Image file** | Tesseract OCR directly on the upload | Marketing screenshots, campaign posters, photos of slides |

### Image upload flow

1. User uploads PNG, JPG, WEBP, etc. from the frontend drop zone
2. Backend runs **Tesseract OCR** on the image (grayscale + autocontrast preprocessing)
3. Extracted text feeds the same claim extraction → Tavily search → **Gemini 2.5 Flash** verdict pipeline

### PDF upload flow

1. Try `pypdf` text extraction first (fast, no OCR cost)
2. If fewer than ~50 characters are found, automatically fall back to **Tesseract OCR** page-by-page
3. SSE emits `ocr_progress` events so the UI shows page-by-page OCR progress

### Requirements for image analysis

- **Tesseract** must be installed locally, or use the **Docker** deploy on Render (Tesseract included)
- Check `GET /health` → `"tesseract_available": true` before testing image uploads
- Windows: install [Tesseract](https://github.com/UB-Mannheim/tesseract/wiki) or set `TESSERACT_CMD` in `.env`

---

## Backend

Python **FastAPI** API — the Truth Layer that powers claim extraction and verification.

### Pipeline

1. **Document reading** — PDFs use `pypdf` first; image files and image-only PDFs use **Tesseract OCR** via PyMuPDF + Pillow (free, no vision API).
2. **Claim extraction** — Sends text to **Gemini 2.5 Flash** (`gemini-2.5-flash`) with a strict prompt; returns factual claims as JSON.
3. **Web verification** — For each claim, queries **Tavily Search** (top 4 results: title, URL, snippet).
4. **Verdict generation** — One batched **Gemini 2.5 Flash** call evaluates all claims + snippets; assigns `status`, `correct_fact`, and `explanation`.
5. **Response** — Summary counts plus claims with attached sources.

Progress is streamed to the client via **SSE** so the UI can show real per-claim search progress.

### Project Files

```
backend/
├── main.py              # FastAPI app, pipeline, endpoints
├── requirements.txt     # Python dependencies
├── .env.example         # API key template
├── deploy.md            # Render deployment guide
├── Dockerfile           # Docker image with Tesseract (Render)
└── render.yaml          # Render Blueprint config (repo root)
```

### Dependencies

| Package | Purpose |
|---------|---------|
| `fastapi` / `uvicorn` | Web server |
| `pypdf` | PDF text extraction |
| `pymupdf` | PDF page rendering for OCR |
| `pytesseract` + `Pillow` | Tesseract OCR (images + image PDF fallback) |
| `google-generativeai` | Gemini 2.5 Flash API (`gemini-2.5-flash`) |
| `httpx` | Tavily HTTP client |
| `python-multipart` | File uploads |
| `python-dotenv` | Environment variables |

### Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in your keys:

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | [Google AI Studio](https://aistudio.google.com/app/apikey) — powers `gemini-2.5-flash` |
| `TAVILY_API_KEY` | Yes | [Tavily](https://app.tavily.com/sign-up) — 1,000 searches/month free |
| `TESSERACT_CMD` | No | Path to tesseract binary if not on PATH (Windows) |
| `PORT` | Auto | Set by Render in production |

Install **Tesseract** locally for image uploads and image-based PDFs. Verify with `GET /health` → `"tesseract_available": true`.

### API Endpoints

#### `GET /health`

```json
{
  "status": "ok",
  "gemini_configured": true,
  "gemini_model": "gemini-2.5-flash",
  "tavily_configured": true,
  "tesseract_available": true
}
```

#### `POST /analyze`

| | |
|---|---|
| **Request** | `multipart/form-data` — field `file` (PDF or image) |
| **Accepted types** | PDF · PNG · JPG · JPEG · WEBP · GIF · BMP · TIFF |
| **Response** | `text/event-stream` (SSE) |

**SSE events:**

| Event | Payload | When |
|-------|---------|------|
| `step` | `{ "step": 0–3 }` | Pipeline stage change |
| `claims_found` | `{ "count": N }` | After Gemini 2.5 Flash extracts claims |
| `ocr_mode` | `{}` | Image upload or PDF OCR fallback started |
| `ocr_progress` | `{ "current": N, "total": M }` | During Tesseract OCR (per page or single image) |
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
| `claim_text` | string | Original claim from the document or image |
| `status` | enum | `verified`, `inaccurate`, or `false` |
| `correct_fact` | string \| null | Accurate information when claim is wrong or outdated |
| `sources` | array | Web references (`title`, `url`) |
| `explanation` | string | Brief reasoning citing search results |

**HTTP errors (before stream starts):**

| Code | Meaning |
|------|---------|
| 400 | Invalid file type, or empty file |
| 422 | No readable text (even after OCR) |
| 503 | `GEMINI_API_KEY` not configured, or Tesseract missing for image uploads |

### Error Handling

- **Gemini 2.5 Flash** and Tavily calls retry up to **2 times**
- Image uploads and image PDFs require **Tesseract** on the server
- Malformed Gemini 2.5 Flash JSON → regex fallback to extract JSON array
- Missing Tavily key → claims marked **false** with *"No verification data available"*

---

## Frontend

Next.js web app — upload UI, live SSE progress, and results dashboard.

### Features

- **Upload** — Drag-and-drop **PDF or image**; upload card stays visible while results load below
- **Live progress** — SSE-driven steps, OCR page progress for images/scans, per-claim search bar during Tavily
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

1. User selects PDF or image → `FormData` POST to `/analyze`
2. Frontend reads the SSE stream via `ReadableStream`
3. Loading UI updates from `step`, `ocr_progress`, `claims_found`, and `search_progress` events
4. On `result`, renders summary stats and claim cards

### Frontend Error Handling

- Missing `NEXT_PUBLIC_API_URL` configuration
- Network errors and API failures (SSE `error` events)
- Invalid file types (PDF and images only)
- Retry from error state without losing the upload area

---

## Run Locally

### Prerequisites

- Python 3.11+
- Node.js 18+
- **Tesseract OCR** (required for image uploads and scanned PDFs)
- Free API keys: [Google AI Studio](https://aistudio.google.com/app/apikey) · [Tavily](https://app.tavily.com/sign-up)

### Terminal 1 — Backend

```bash
cd backend
cp .env.example .env
# Edit .env — add GEMINI_API_KEY and TAVILY_API_KEY

pip install -r requirements.txt
# Install Tesseract: https://github.com/UB-Mannheim/tesseract/wiki (Windows)
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
| **Backend** | [Render](https://render.com) (Docker) | `deploy.md` · `render.yaml` · `backend/Dockerfile` |
| **Frontend** | [Vercel](https://vercel.com) | Root dir: `frontend` · env: `NEXT_PUBLIC_API_URL` |

**Backend (Render) — Docker:**

Render builds from `backend/Dockerfile` (Python 3.11 + Tesseract). No manual `pip install` needed on Render when using Docker runtime.

**Frontend (Vercel):**

```
NEXT_PUBLIC_API_URL=https://your-render-backend.onrender.com
```

---

## Limitations

- **OCR quality** — Tesseract is free but weaker on glossy marketing layouts, stylized fonts, and low-contrast images than paid vision APIs
- **Image analysis** — Single-frame uploads (one image = one OCR pass); no multi-image batching
- **8 page OCR cap** — Only the first 8 PDF pages are OCR'd to keep processing fast on free tier
- **12 claim cap** — Limits API cost per document
- **Free tier limits** — Gemini 2.5 Flash (15 RPM · 1M tokens/day) and Tavily rate limits apply
- **Not legal advice** — AI + web search verdicts; human review recommended for critical use

---

## License

Built for assessment / demo use.
