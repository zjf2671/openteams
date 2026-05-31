import React from 'react';
import { OnboardingPro } from '@/components/OnboardingPro';

export function TeamPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="pb-4 mb-2 select-all">
        <h1 className="text-base font-bold tracking-tight text-[var(--ink)]">
          AI Team &amp; Copilot
        </h1>
        <p className="text-xs text-[var(--ink-subtle)] mt-1">
          Configure automated digital co-pilot rosters and custom subscription
          plans.
        </p>
      </div>
      <OnboardingPro />
    </div>
  );
}
