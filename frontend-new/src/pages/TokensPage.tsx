import React from 'react';
import { TokensWorkspace } from '@/components/TokensWorkspace';

export function TokensPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="pb-4 mb-2 select-all">
        <h1 className="text-base font-bold tracking-tight text-[var(--ink)]">
          Design Swatches Live Palette
        </h1>
        <p className="text-xs text-[var(--ink-subtle)] mt-1">
          Linear specification color step ladder adapting programmatically with
          light/dark themes.
        </p>
      </div>
      <TokensWorkspace />
    </div>
  );
}
