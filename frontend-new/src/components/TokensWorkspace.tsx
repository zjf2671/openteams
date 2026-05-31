import React, { useEffect, useState } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';

export const TokensWorkspace: React.FC = () => {
  const { t, theme, showToast } = useWorkspace();
  const [swatches, setSwatches] = useState<Record<string, string>>({
    canvas: '—',
    'surface-1': '—',
    'surface-2': '—',
    'surface-3': '—',
    primary: '—',
    ink: '—',
    'ink-subtle': '—',
    hairline: '—'
  });

  const updateTokensVals = () => {
    const tokensKeys = ['canvas', 'surface-1', 'surface-2', 'surface-3', 'primary', 'ink', 'ink-subtle', 'hairline'];
    const updatedValues: Record<string, string> = {};
    
    tokensKeys.forEach(key => {
      const cssVar = getComputedStyle(document.body).getPropertyValue(`--${key}`).trim();
      updatedValues[key] = cssVar || '—';
    });
    setSwatches(updatedValues);
  };

  // Re-read CSS variables whenever theme updates
  useEffect(() => {
    // Wait a brief tick for DOM attribute changes to settle
    const timer = setTimeout(() => {
      updateTokensVals();
    }, 100);
    return () => clearTimeout(timer);
  }, [theme]);

  const handleCopyValue = (key: string, val: string) => {
    if (!val || val === '—') return;
    navigator.clipboard.writeText(val);
    showToast(`Copied token --${key} value: ${val}`);
  };

  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-6 select-none space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--ink)] tracking-tight">{t('designTokens')}</h2>
        <p className="mt-0.5 text-xs text-[var(--ink-subtle)]">
          {t('designTokensSub')}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 animate-fade-in font-sans">
        {Object.entries(swatches).map(([key, value]) => {
          const valStr = value as string;
          return (
            <div 
              key={key} 
              onClick={() => handleCopyValue(key, valStr)}
              className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-3 cursor-pointer hover:border-[var(--primary)] transition duration-200"
            >
              <div 
                className="h-10 w-full rounded-md border border-[var(--hairline)] mb-2 shadow-xs" 
                style={{ backgroundColor: `var(--${key})` }}
              />
              <p className="text-[10.5px] font-mono font-bold text-[var(--ink)] leading-none truncate">{key}</p>
              <p className="text-[9.5px] font-mono text-[var(--ink-tertiary)] truncate mt-1">{value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
