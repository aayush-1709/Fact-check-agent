'use client';

import { useState } from 'react';
import { UploadCard } from '@/components/upload-card';
import { SummaryStats } from '@/components/summary-stats';
import { ClaimsList } from '@/components/claims-list';
import { LoadingIndicator } from '@/components/loading-indicator';
import { type ClaimData } from '@/components/claim-card';

interface AnalysisResult {
  summary: {
    verified: number;
    inaccurate: number;
    false: number;
  };
  claims: ClaimData[];
}

type PageState = 'idle' | 'loading' | 'results' | 'error';

const LOADING_STEPS = [
  'Reading document...',
  'Extracting claims...',
  'Searching live web...',
  'Generating report...',
];

export default function Home() {
  const [state, setState] = useState<PageState>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [claimsTotal, setClaimsTotal] = useState(0);
  const [claimsSearched, setClaimsSearched] = useState(0);
  const [ocrTotal, setOcrTotal] = useState(0);
  const [ocrCurrent, setOcrCurrent] = useState(0);
  const [isOcrMode, setIsOcrMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);

  const clearAnalysisState = () => {
    setResult(null);
    setError(null);
    setCurrentStep(0);
    setClaimsTotal(0);
    setClaimsSearched(0);
    setOcrTotal(0);
    setOcrCurrent(0);
    setIsOcrMode(false);
  };

  const handleFileChange = (file: File | null) => {
    if (file && (state === 'results' || state === 'error')) {
      clearAnalysisState();
      setState('idle');
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
    clearAnalysisState();

    if (selectedFile.size === 0) {
      setError('This file is empty (0 bytes). Please upload a valid PDF or image.');
      setState('error');
      return;
    }

    try {
      setIsLoading(true);
      setState('loading');
      setCurrentStep(0);

      const formData = new FormData();
      formData.append('file', selectedFile);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      if (!apiUrl) {
        throw new Error('API URL not configured. Please set NEXT_PUBLIC_API_URL environment variable.');
      }

      let response: Response;
      try {
        response = await fetch(`${apiUrl}/analyze`, {
          method: 'POST',
          body: formData,
        });
      } catch {
        throw new Error(
          `Cannot reach the backend at ${apiUrl}. Is the server running? Check NEXT_PUBLIC_API_URL.`
        );
      }

      if (!response.ok) {
        let detail = response.statusText;
        try {
          const errBody = await response.json();
          if (typeof errBody.detail === 'string') {
            detail = errBody.detail;
          } else if (Array.isArray(errBody.detail)) {
            detail = errBody.detail.map((d: { msg?: string }) => d.msg).join(', ');
          }
        } catch {
          // response body is not JSON
        }
        throw new Error(
          detail
            ? `API error (${response.status}): ${detail}`
            : `API error (${response.status}). Check that the backend is deployed and NEXT_PUBLIC_API_URL is correct.`
        );
      }

      // Consume the SSE stream
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: Record<string, unknown>;
          try { event = JSON.parse(raw); } catch { continue; }

          if (event.type === 'step') {
            setCurrentStep(event.step as number);
          } else if (event.type === 'ocr_mode') {
            setIsOcrMode(true);
          } else if (event.type === 'ocr_progress') {
            setOcrTotal(event.total as number);
            setOcrCurrent(event.current as number);
          } else if (event.type === 'ocr_complete') {
            setIsOcrMode(false);
          } else if (event.type === 'claims_found') {
            setClaimsTotal(event.count as number);
          } else if (event.type === 'search_progress') {
            setClaimsSearched(event.current as number);
          } else if (event.type === 'error') {
            throw new Error(event.detail as string);
          } else if (event.type === 'result') {
            setResult(event.data as AnalysisResult);
            setIsLoading(false);
            setState('results');
          }
        }
      }
    } catch (err) {
      setIsLoading(false);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to analyze document. Please try again.'
      );
      setState('error');
    }
  };

  const handleReset = () => {
    clearAnalysisState();
    setIsLoading(false);
    setState('idle');
    setUploadKey((k) => k + 1);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-16 md:py-24 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-14 md:mb-18">
          {/* Top badge */}
          <div className="flex justify-center mb-6">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-sm font-semibold tracking-wide">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Powered by Gemini 2.5 Flash · Live Web Search
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-5 text-balance tracking-tight" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
            Fact-Check Agent
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground text-balance font-medium max-w-2xl mx-auto">
            Upload a document. We extract every claim and verify it against live web data in seconds.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-3 mt-8">
            {[
              { icon: '📄', label: 'PDF & Image Upload' },
              { icon: '🔍', label: 'Claim Extraction' },
              { icon: '🌐', label: 'Live Web Verification' },
              { icon: '✅', label: 'AI Verdict' },
            ].map((f) => (
              <span
                key={f.label}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-card border border-border text-sm font-medium text-foreground shadow-sm"
              >
                <span>{f.icon}</span>
                {f.label}
              </span>
            ))}
          </div>
        </div>

        {/* Upload card — always visible */}
        <div className="max-w-2xl mx-auto">
          <UploadCard
            key={uploadKey}
            onFileSelect={handleFileSelect}
            onFileChange={handleFileChange}
            isLoading={isLoading}
          />
        </div>

        {/* Below-the-fold content */}
        {state !== 'idle' && (
          <div className="mt-14 space-y-12">
            {/* Section divider */}
            <div className="flex items-center gap-4 max-w-2xl mx-auto">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                {state === 'loading' ? 'Analyzing' : state === 'results' ? 'Results' : 'Error'}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
            {state === 'loading' && (
              <div className="max-w-2xl mx-auto">
                <LoadingIndicator
                  steps={LOADING_STEPS}
                  currentStep={currentStep}
                  claimsTotal={claimsTotal}
                  claimsSearched={claimsSearched}
                  ocrTotal={ocrTotal}
                  ocrCurrent={ocrCurrent}
                  isOcrMode={isOcrMode}
                />
              </div>
            )}

            {state === 'error' && (
              <div className="max-w-2xl mx-auto">
                <div className="bg-red-50 border border-red-200 rounded-2xl p-8 shadow-sm">
                  <h3 className="font-bold text-red-900 text-lg mb-3">
                    Error analyzing document
                  </h3>
                  <p className="text-sm text-red-800 mb-6 leading-relaxed">
                    {error}
                  </p>
                  <button
                    onClick={handleReset}
                    className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm transition-all duration-200 active:scale-95"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {state === 'results' && result && (
              <>
                <SummaryStats
                  verified={result.summary.verified}
                  inaccurate={result.summary.inaccurate}
                  false_count={result.summary.false}
                />

                <div>
                  <h2 className="text-3xl font-bold mb-8 text-foreground">Claims Analysis</h2>
                  <ClaimsList claims={result.claims} />
                </div>

                <div className="flex justify-center pt-4">
                  <button
                    onClick={handleReset}
                    className="px-8 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
                  >
                    Analyze Another Document
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {/* Footer */}
      <footer className="mt-24 pb-10 text-center">
        <p className="text-xs text-muted-foreground/60">
          Fact-Check Agent · Gemini 2.5 Flash + Tavily Search · Results may vary based on web availability
        </p>
      </footer>
    </main>
  );
}
