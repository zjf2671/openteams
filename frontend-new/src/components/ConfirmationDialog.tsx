import { AlertTriangle, X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

export type ConfirmationDialogTone = 'warning' | 'danger';

type ConfirmationDialogProps = {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  escLabel: string;
  tone?: ConfirmationDialogTone;
  confirming?: boolean;
  idPrefix?: string;
  confirmIcon?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmationDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  escLabel,
  tone = 'warning',
  confirming = false,
  idPrefix = 'confirmation-dialog',
  confirmIcon,
  onCancel,
  onConfirm,
}: ConfirmationDialogProps) {
  const isDanger = tone === 'danger';
  const titleId = `${idPrefix}-title`;
  const descriptionId = `${idPrefix}-desc`;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !confirming) {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [confirming, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[1002] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label={cancelLabel}
        className="absolute inset-0 bg-black/60 backdrop-blur-xs"
        disabled={confirming}
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-[var(--hairline-strong)] bg-[var(--canvas)] select-none"
      >
        <div className="p-5">
          <div
            className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${
              isDanger ? 'bg-red-500/15' : 'bg-amber-500/15'
            }`}
          >
            <AlertTriangle
              className={`h-5 w-5 ${
                isDanger ? 'text-red-400' : 'text-amber-500'
              }`}
            />
          </div>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p
                id={titleId}
                className="text-base font-semibold tracking-tight text-[var(--ink)]"
              >
                {title}
              </p>
              <div
                id={descriptionId}
                className="mt-1 text-xs leading-relaxed text-[var(--ink-subtle)]"
              >
                {description}
              </div>
            </div>
            <button
              type="button"
              disabled={confirming}
              onClick={onCancel}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--ink-tertiary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={cancelLabel}
              title={cancelLabel}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--hairline)] bg-[var(--surface-1)] px-5 py-3">
          <span className="font-mono text-[10px] text-[var(--ink-tertiary)]">
            {escLabel}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="cursor-pointer rounded-md border border-[var(--hairline-strong)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] transition hover:bg-[var(--surface-3)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={confirming}
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                isDanger
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-[var(--primary)] hover:bg-[var(--primary-hover)]'
              }`}
              disabled={confirming}
              onClick={onConfirm}
            >
              {confirmIcon}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
