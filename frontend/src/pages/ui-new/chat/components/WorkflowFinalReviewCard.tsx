type FinalReviewTranscriptLike = {
  id: string;
  entry_type: string;
  content: string;
  meta_json?: string | null;
};

export type WorkflowFinalReviewActionData = {
  executionId: string;
  transcriptId: string;
  message: string;
  description?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseWorkflowTranscriptMeta(
  metaJson: string | null | undefined
): Record<string, unknown> | null {
  if (!metaJson) return null;
  try {
    const parsed = JSON.parse(metaJson) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function findPendingFinalReviewTranscript<
  T extends FinalReviewTranscriptLike,
>(entries: T[]): T | null {
  return (
    entries.find((entry) => {
      if (entry.entry_type !== 'final_review') {
        return false;
      }
      const meta = parseWorkflowTranscriptMeta(entry.meta_json);
      return meta?.resolved === false;
    }) ?? null
  );
}

export function toWorkflowFinalReviewAction<
  T extends FinalReviewTranscriptLike,
>(
  executionId: string | null | undefined,
  entries: T[]
): WorkflowFinalReviewActionData | null {
  if (!executionId) {
    return null;
  }

  const transcript = findPendingFinalReviewTranscript(entries);
  if (!transcript) {
    return null;
  }

  const meta = parseWorkflowTranscriptMeta(transcript.meta_json);
  return {
    executionId,
    transcriptId: transcript.id,
    message: transcript.content || '任务已完成，是否接受结果？',
    description:
      typeof meta?.description === 'string' ? meta.description : undefined,
  };
}

type WorkflowFinalReviewCardProps = {
  message?: string;
  description?: string;
  onAccept: () => void;
  onReject: () => void;
  disabled?: boolean;
};

export function WorkflowFinalReviewCard({
  message = '任务已完成，是否接受结果？',
  description,
  onAccept,
  onReject,
  disabled,
}: WorkflowFinalReviewCardProps) {
  return (
    <div className="rounded-[24px] border border-[#FDE68A] bg-[#FFFBEB] p-4">
      <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#92400E]">
        Final Review
      </div>
      <div className="mt-2 text-sm font-semibold text-[#0F172A]">{message}</div>
      {description && (
        <div className="mt-1 text-xs leading-5 text-[#475569]">
          {description}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={disabled}
          className="rounded-full bg-[#16A34A] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#15803D] disabled:cursor-not-allowed disabled:opacity-50"
        >
          接受
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={disabled}
          className="rounded-full border border-[#FCA5A5] bg-white px-3 py-1.5 text-xs font-semibold text-[#991B1B] transition-colors hover:bg-[#FEF2F2] disabled:cursor-not-allowed disabled:opacity-50"
        >
          拒绝
        </button>
      </div>
    </div>
  );
}
