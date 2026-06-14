'use client';

import { useState } from 'react';
import { ClaimCard, type ClaimData } from './claim-card';

interface ClaimsListProps {
  claims: ClaimData[];
}

type FilterStatus = 'all' | 'verified' | 'inaccurate' | 'false';

export function ClaimsList({ claims }: ClaimsListProps) {
  const [filter, setFilter] = useState<FilterStatus>('all');

  const filteredClaims = claims.filter((claim) => {
    if (filter === 'all') return true;
    return claim.status === filter;
  });

  const filterOptions: Array<{ value: FilterStatus; label: string; count: number; color: string }> = [
    {
      value: 'all',
      label: 'All Claims',
      count: claims.length,
      color: 'bg-foreground/5 hover:bg-foreground/10 text-foreground',
    },
    {
      value: 'verified',
      label: 'Verified',
      count: claims.filter((c) => c.status === 'verified').length,
      color: 'bg-green-100 hover:bg-green-200 text-green-700',
    },
    {
      value: 'inaccurate',
      label: 'Inaccurate',
      count: claims.filter((c) => c.status === 'inaccurate').length,
      color: 'bg-amber-100 hover:bg-amber-200 text-amber-700',
    },
    {
      value: 'false',
      label: 'False',
      count: claims.filter((c) => c.status === 'false').length,
      color: 'bg-red-100 hover:bg-red-200 text-red-700',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value)}
            className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
              filter === option.value
                ? option.color
                : 'bg-card border border-border hover:border-foreground/20 text-foreground'
            }`}
          >
            {option.label}
            <span className="ml-2 font-bold opacity-80">({option.count})</span>
          </button>
        ))}
      </div>

      {filteredClaims.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-lg font-medium">
            No claims found with this filter.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredClaims.map((claim, idx) => (
            <ClaimCard key={idx} claim={claim} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
}
