'use client';

import { CheckCircle, AlertCircle, XCircle, ExternalLink, Lightbulb } from 'lucide-react';

export interface ClaimData {
  claim_text: string;
  status: 'verified' | 'inaccurate' | 'false';
  correct_fact: string | null;
  sources: Array<{ title: string; url: string }>;
  explanation: string;
}

interface ClaimCardProps {
  claim: ClaimData;
  index: number;
}

const statusConfig = {
  verified: {
    border: 'border-green-200',
    accent: 'bg-green-500',
    iconBg: 'bg-green-100',
    icon: CheckCircle,
    iconColor: 'text-green-600',
    label: 'Verified',
    badgeBg: 'bg-green-100 text-green-700 border-green-200',
    factBg: 'bg-green-50 border-green-200',
  },
  inaccurate: {
    border: 'border-amber-200',
    accent: 'bg-amber-400',
    iconBg: 'bg-amber-100',
    icon: AlertCircle,
    iconColor: 'text-amber-600',
    label: 'Inaccurate',
    badgeBg: 'bg-amber-100 text-amber-700 border-amber-200',
    factBg: 'bg-amber-50 border-amber-200',
  },
  false: {
    border: 'border-red-200',
    accent: 'bg-red-500',
    iconBg: 'bg-red-100',
    icon: XCircle,
    iconColor: 'text-red-600',
    label: 'False',
    badgeBg: 'bg-red-100 text-red-700 border-red-200',
    factBg: 'bg-red-50 border-red-200',
  },
};

export function ClaimCard({ claim, index }: ClaimCardProps) {
  const cfg = statusConfig[claim.status];
  const Icon = cfg.icon;

  return (
    <div
      className={`relative bg-card border ${cfg.border} rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-3 duration-500`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Left accent stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.accent}`} />

      <div className="pl-6 pr-6 pt-6 pb-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className={`${cfg.iconBg} p-2.5 rounded-xl flex-shrink-0 mt-0.5`}>
            <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-muted-foreground">#{index + 1}</span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.badgeBg}`}>
                {cfg.label}
              </span>
            </div>
            <p className="text-foreground font-semibold text-base leading-relaxed">
              {claim.claim_text}
            </p>
          </div>
        </div>

        {/* Correct fact */}
        {claim.correct_fact && (
          <div className={`ml-11 rounded-xl border ${cfg.factBg} px-4 py-3`}>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Correct Information
            </p>
            <p className="text-sm text-foreground font-medium leading-relaxed">
              {claim.correct_fact}
            </p>
          </div>
        )}

        {/* Explanation */}
        {claim.explanation && (
          <div className="ml-11 flex gap-2.5 bg-muted/50 rounded-xl px-4 py-3">
            <Lightbulb className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground leading-relaxed">{claim.explanation}</p>
          </div>
        )}

        {/* Sources */}
        {claim.sources && claim.sources.length > 0 && (
          <div className="ml-11">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Sources
            </p>
            <div className="flex flex-wrap gap-2">
              {claim.sources.map((source, idx) => (
                <a
                  key={idx}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-all duration-200 max-w-xs truncate"
                  title={source.title}
                >
                  <span className="truncate">{source.title}</span>
                  <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
