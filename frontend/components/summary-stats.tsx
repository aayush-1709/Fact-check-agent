'use client';

import { CheckCircle, AlertCircle, XCircle } from 'lucide-react';

interface SummaryStatsProps {
  verified: number;
  inaccurate: number;
  false_count: number;
}

export function SummaryStats({ verified, inaccurate, false_count }: SummaryStatsProps) {
  const total = verified + inaccurate + false_count;
  const verifiedPct   = total > 0 ? Math.round((verified   / total) * 100) : 0;
  const inaccuratePct = total > 0 ? Math.round((inaccurate / total) * 100) : 0;
  const falsePct      = total > 0 ? Math.round((false_count / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Distribution bar */}
      <div>
        <div className="flex justify-between text-xs font-semibold text-muted-foreground mb-2">
          <span>{total} claims analysed</span>
          <span>{verifiedPct}% accurate</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
          {verifiedPct > 0 && (
            <div
              className="bg-green-500 transition-all duration-700"
              style={{ width: `${verifiedPct}%` }}
              title={`Verified: ${verifiedPct}%`}
            />
          )}
          {inaccuratePct > 0 && (
            <div
              className="bg-amber-400 transition-all duration-700"
              style={{ width: `${inaccuratePct}%` }}
              title={`Inaccurate: ${inaccuratePct}%`}
            />
          )}
          {falsePct > 0 && (
            <div
              className="bg-red-500 transition-all duration-700"
              style={{ width: `${falsePct}%` }}
              title={`False: ${falsePct}%`}
            />
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Verified */}
        <div className="relative bg-card border border-border rounded-2xl p-7 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-green-500" />
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-green-100 rounded-xl">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="font-semibold text-foreground">Verified</h3>
          </div>
          <p className="text-5xl font-bold text-green-600 mb-1">{verified}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-green-100 rounded-full">
              <div className="h-1.5 bg-green-500 rounded-full" style={{ width: `${verifiedPct}%` }} />
            </div>
            <span className="text-xs font-semibold text-green-600">{verifiedPct}%</span>
          </div>
        </div>

        {/* Inaccurate */}
        <div className="relative bg-card border border-border rounded-2xl p-7 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-amber-400" />
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-amber-100 rounded-xl">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="font-semibold text-foreground">Inaccurate</h3>
          </div>
          <p className="text-5xl font-bold text-amber-600 mb-1">{inaccurate}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-amber-100 rounded-full">
              <div className="h-1.5 bg-amber-400 rounded-full" style={{ width: `${inaccuratePct}%` }} />
            </div>
            <span className="text-xs font-semibold text-amber-600">{inaccuratePct}%</span>
          </div>
        </div>

        {/* False */}
        <div className="relative bg-card border border-border rounded-2xl p-7 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-red-500" />
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-red-100 rounded-xl">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <h3 className="font-semibold text-foreground">False</h3>
          </div>
          <p className="text-5xl font-bold text-red-600 mb-1">{false_count}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-red-100 rounded-full">
              <div className="h-1.5 bg-red-500 rounded-full" style={{ width: `${falsePct}%` }} />
            </div>
            <span className="text-xs font-semibold text-red-600">{falsePct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
