# Fact-Check Agent - Frontend

A modern, professional SaaS web application for verifying marketing claims in PDFs against live data. Built with React, Next.js, and Tailwind CSS.

## Features

✨ **Clean Upload Experience**
- Drag-and-drop PDF upload zone with visual feedback
- File size and name display
- Disabled button state until file is selected

🔄 **Real-Time Processing Feedback**
- Step-by-step loading indicator showing progress
- 4 stages: Extracting claims → Searching live web → Verifying facts → Generating report
- No fake percentages, realistic status updates

📊 **Results Dashboard**
- Summary cards displaying Verified / Inaccurate / False claim counts with percentages
- Color-coded status badges (green/amber/red)
- Full claim details including original text, corrections, explanations, and sources
- Filterable claims by status (All / Verified / Inaccurate / False)
- Smooth animations on card reveals

🎨 **Modern Design**
- Professional SaaS aesthetic with subtle animations
- Dark mode friendly with custom color tokens
- Fully responsive (mobile, tablet, desktop)
- Generous whitespace and clean typography

🔌 **Backend Integration Ready**
- Configurable API endpoint via `NEXT_PUBLIC_API_URL` environment variable
- FormData submission with proper error handling
- Expects structured JSON response from backend

## Setup

### Installation

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set environment variables:**
   ```bash
   # Create or update .env.local
   NEXT_PUBLIC_API_URL=http://your-backend-api.com
   ```

3. **Run development server:**
   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
pnpm build
pnpm start
```

## API Integration

The frontend sends a POST request to `{NEXT_PUBLIC_API_URL}/analyze` with the uploaded PDF file.

### Request Format

```
POST /analyze
Content-Type: multipart/form-data

file: <PDF binary data>
```

### Expected Response Format

```json
{
  "summary": {
    "verified": number,
    "inaccurate": number,
    "false": number
  },
  "claims": [
    {
      "claim_text": "The product increases efficiency by 50%",
      "status": "verified" | "inaccurate" | "false",
      "correct_fact": "The product increases efficiency by 45% according to studies",
      "sources": [
        {
          "title": "Study Title",
          "url": "https://example.com/study"
        }
      ],
      "explanation": "Independent testing shows a 45% efficiency gain, not 50%"
    }
  ]
}
```

### Response Fields

- **claim_text** (string): The original claim extracted from the PDF
- **status** (enum): One of `"verified"`, `"inaccurate"`, or `"false"`
- **correct_fact** (string | null): The accurate information (required if status is not "verified")
- **sources** (array): List of references used for verification
  - **title** (string): Name of the source
  - **url** (string): URL to the source
- **explanation** (string): Brief explanation of the verification result

## Component Structure

```
components/
├── upload-card.tsx          # Drag-and-drop PDF upload interface
├── summary-stats.tsx        # Summary cards (Verified/Inaccurate/False)
├── claims-list.tsx          # Filterable claims list with status tabs
├── claim-card.tsx           # Individual claim display with status badge
└── loading-indicator.tsx    # Step-by-step loading progress

app/
├── page.tsx                 # Main page with state management
└── layout.tsx               # Root layout with metadata
```

## Styling

The app uses Tailwind CSS with custom color tokens defined in `globals.css`:

- **Primary**: Professional blue (`#6F6ADB`) for actions and accents
- **Status Colors**:
  - **Verified**: Green (`oklch(0.60 0.18 142)`)
  - **Inaccurate**: Amber (`oklch(0.68 0.22 60)`)
  - **False**: Red (`oklch(0.56 0.25 28)`)
- **Neutrals**: Light background with dark text, optimized for both light and dark modes

## Error Handling

The app gracefully handles:
- Missing API URL configuration
- Network errors and timeouts
- Invalid file types (only `.pdf` accepted)
- API errors with user-friendly messages
- Allows retrying from error state

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

- Lightweight bundle (minimal dependencies)
- CSS animations using Tailwind utilities
- Lazy loading support ready
- Optimized for Core Web Vitals

## Customization

### Change API Endpoint

Update the `NEXT_PUBLIC_API_URL` environment variable in production deployment.

### Modify Loading Steps

Edit the `LOADING_STEPS` array in `app/page.tsx` to customize progress messages.

### Adjust Colors

Modify the color tokens in `app/globals.css` under the `:root` and `.dark` sections.

### Custom Animations

Add animation classes in Tailwind config or use inline `animate-*` classes in components.

## License

Built with v0 by Vercel.
