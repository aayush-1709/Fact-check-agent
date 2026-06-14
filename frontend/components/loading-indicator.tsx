'use client';

interface LoadingIndicatorProps {
  steps: string[];
  currentStep: number;
  claimsTotal?: number;
  claimsSearched?: number;
}

export function LoadingIndicator({
  steps,
  currentStep,
  claimsTotal = 0,
  claimsSearched = 0,
}: LoadingIndicatorProps) {
  const progressPct = Math.round(((currentStep + 1) / steps.length) * 100);
  const claimsPct = claimsTotal > 0 ? Math.round((claimsSearched / claimsTotal) * 100) : 0;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-card border border-border rounded-2xl p-10 shadow-sm">
        {/* Overall progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs font-semibold text-muted-foreground mb-2">
            <span>Processing your document</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-5">
          {steps.map((step, idx) => {
            const done    = idx < currentStep;
            const active  = idx === currentStep;
            const pending = idx > currentStep;

            // Show live claim progress on the active step when we have claim data
            const showClaimBar = active && claimsTotal > 0;

            return (
              <div key={idx} className="flex items-start gap-4">
                {/* Status icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {done ? (
                    <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : active ? (
                    <div className="w-9 h-9 rounded-full border-[3px] border-primary border-t-transparent animate-spin" />
                  ) : (
                    <div className="w-9 h-9 rounded-full border-2 border-border bg-muted flex items-center justify-center">
                      <span className="text-xs font-bold text-muted-foreground">{idx + 1}</span>
                    </div>
                  )}
                </div>

                {/* Label + optional claim bar */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`font-semibold text-sm transition-colors ${
                      done ? 'text-green-600' : active ? 'text-foreground' : 'text-muted-foreground'
                    }`}>
                      {step}
                    </p>
                    {done && (
                      <span className="text-xs font-semibold text-green-600 ml-2">Done</span>
                    )}
                    {showClaimBar && (
                      <span className="text-xs font-semibold text-primary ml-2 tabular-nums">
                        {claimsSearched}/{claimsTotal}
                      </span>
                    )}
                  </div>

                  {/* Per-claim live progress bar */}
                  {showClaimBar && (
                    <div className="mt-2">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${claimsPct}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Verifying claim {claimsSearched} of {claimsTotal}
                        {claimsPct > 0 && ` · ${claimsPct}% complete`}
                      </p>
                    </div>
                  )}

                  {/* Pulse bar when active but no claim data yet */}
                  {active && !showClaimBar && (
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden w-40">
                      <div className="h-full bg-primary/50 rounded-full animate-pulse w-3/4" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8 pt-6 border-t border-border">
          This may take up to 30 seconds — AI is reading the web in real time
        </p>
      </div>
    </div>
  );
}
