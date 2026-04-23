import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpIcon,
  CaretDownIcon,
  FunnelIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
} from '@phosphor-icons/react';
import { chatApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { WorkflowGraphBoard } from './WorkflowGraphBoard';
import {
  parseWorkflowTranscriptMeta,
  toWorkflowFinalReviewAction,
  WorkflowFinalReviewCard,
} from './WorkflowFinalReviewCard';

type WorkflowCardStep = {
  id: string;
  step_key: string;
  title: string;
  step_type: string;
  status: string;
  agent_name?: string | null;
  summary_text?: string | null;
};

type WorkflowCardAgent = {
  session_agent_id: string;
  workflow_agent_session_id?: string | null;
  agent_id: string;
  name: string;
};

type WorkflowCardNode = {
  id: string;
  position: { x: number; y: number };
  data: {
    stepType: string;
    title: string;
    instructions: string;
    agentId?: string | null;
    status?: string | null;
  };
};

type WorkflowCardEdge = {
  id: string;
  source: string;
  target: string;
};

export type WorkflowWindowProjection = {
  execution_id?: string | null;
  plan_id?: string;
  title: string;
  goal: string;
  state: string;
  execution_status: string;
  error_message?: string | null;
  completed_step_count: number;
  total_step_count: number;
  result_summary?: string | null;
  outputs: string[];
  steps: WorkflowCardStep[];
  agents?: WorkflowCardAgent[];
  plan: {
    nodes: WorkflowCardNode[];
    edges: WorkflowCardEdge[];
    viewport?: { x?: number; y?: number; zoom?: number };
  };
  validation_errors?: string | null;
};

type WorkflowTranscriptEntry = {
  id: string;
  step_id?: string | null;
  step_key?: string | null;
  workflow_agent_session_id?: string | null;
  agent_name?: string | null;
  message_type: 'system' | 'agent' | 'user' | 'control';
  entry_type: string;
  content: string;
  meta_json?: string | null;
  created_at: string;
};

const WORKFLOW_COMPOSER_MIN_HEIGHT = 104;
const WORKFLOW_COMPOSER_MAX_HEIGHT = 192;

// -----------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------

export type WorkflowWindowProps = {
  sessionId?: string | null;
  projection: WorkflowWindowProjection;
  transcript?: WorkflowTranscriptEntry[];
  isOpen: boolean;
  onClose: () => void;
  onExecute?: (planId: string) => void;
  onPauseAll?: (executionId: string) => void;
  onResume?: (executionId: string) => void;
  onInterruptStep?: (stepId: string) => void;
  onStopStep?: (stepId: string) => void;
  onRetryStep?: (stepId: string) => void;
  onSubmitStepInput?: (stepId: string, inputText: string) => void;
  onApproval?: (
    stepId: string,
    action: string,
    transcriptId: string,
    inputText?: string
  ) => void;
  onResolveFinalReview?: (
    executionId: string,
    transcriptId: string,
    action: 'accepted' | 'rejected'
  ) => void;
  pendingActionId?: string | null;
};

function AgentSelector({
  agents,
  selectedAgentId,
  onSelect,
}: {
  agents: WorkflowCardAgent[];
  selectedAgentId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected =
    agents.find(
      (agent) =>
        (agent.workflow_agent_session_id ?? agent.session_agent_id) ===
        selectedAgentId
    ) ?? agents[0];

  if (agents.length === 0 || !selected) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC]"
      >
        <FunnelIcon className="size-3.5" weight="bold" />
        {selected.name}
        <CaretDownIcon className="size-3" weight="bold" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 min-w-[180px] rounded-lg border border-[#E2E8F0] bg-white py-1 shadow-lg">
          {agents.map((agent) => {
            const agentSessionId =
              agent.workflow_agent_session_id ?? agent.session_agent_id;
            return (
              <button
                type="button"
                key={agent.session_agent_id}
                onClick={() => {
                  onSelect(agentSessionId);
                  setOpen(false);
                }}
                className={cn(
                  'block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-[#F1F5F9]',
                  selectedAgentId === agentSessionId &&
                    'font-bold text-[#1D4ED8]'
                )}
              >
                {agent.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Approval Card
// -----------------------------------------------------------------------

export function ApprovalCard({
  title,
  description,
  stepId,
  transcriptId,
  onApprove,
  onReject,
  disabled,
}: {
  title: string;
  description?: string;
  stepId: string;
  transcriptId: string;
  onApprove: (stepId: string, transcriptId: string) => void;
  onReject: (stepId: string, transcriptId: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-3">
      <div className="text-xs font-bold uppercase tracking-wider text-[#92400E]">
        Approval Required
      </div>
      <div className="mt-1 text-sm font-semibold text-[#0F172A]">{title}</div>
      {description && (
        <div className="mt-1 text-xs text-[#475569]">{description}</div>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => onApprove(stepId, transcriptId)}
          disabled={disabled}
          className="rounded-full bg-[#16A34A] px-3 py-1 text-xs font-semibold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => onReject(stepId, transcriptId)}
          disabled={disabled}
          className="rounded-full bg-[#DC2626] px-3 py-1 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50 transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Permission Request Card
// -----------------------------------------------------------------------

export function PermissionRequestCard({
  title,
  description,
  stepId,
  transcriptId,
  onGrant,
  onDeny,
  disabled,
}: {
  title: string;
  description?: string;
  stepId: string;
  transcriptId: string;
  onGrant: (stepId: string, transcriptId: string) => void;
  onDeny: (stepId: string, transcriptId: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-3">
      <div className="text-xs font-bold uppercase tracking-wider text-[#1E40AF]">
        Permission Request
      </div>
      <div className="mt-1 text-sm font-semibold text-[#0F172A]">{title}</div>
      {description && (
        <div className="mt-1 text-xs text-[#475569]">{description}</div>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => onGrant(stepId, transcriptId)}
          disabled={disabled}
          className="rounded-full bg-[#2563EB] px-3 py-1 text-xs font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-50 transition-colors"
        >
          Grant
        </button>
        <button
          type="button"
          onClick={() => onDeny(stepId, transcriptId)}
          disabled={disabled}
          className="rounded-full border border-[#CBD5E1] bg-white px-3 py-1 text-xs font-semibold text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-50 transition-colors"
        >
          Deny
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Continue Confirmation Card
// -----------------------------------------------------------------------

export function ContinueConfirmationCard({
  message,
  stepId,
  transcriptId,
  onContinue,
  disabled,
}: {
  message: string;
  stepId: string;
  transcriptId: string;
  onContinue: (stepId: string, transcriptId: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#D1FAE5] bg-[#ECFDF5] p-3">
      <div className="text-xs font-bold uppercase tracking-wider text-[#15803D]">
        Continue?
      </div>
      <div className="mt-1 text-sm text-[#166534]">{message}</div>
      <div className="mt-2">
        <button
          type="button"
          onClick={() => onContinue(stepId, transcriptId)}
          disabled={disabled}
          className="rounded-full bg-[#16A34A] px-3 py-1 text-xs font-semibold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

export function InputRequestCard({
  prompt,
  description,
  placeholder,
  stepId,
  transcriptId,
  onSubmit,
  disabled,
}: {
  prompt: string;
  description?: string;
  placeholder?: string;
  stepId: string;
  transcriptId: string;
  onSubmit: (stepId: string, transcriptId: string, inputText: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue('');
  }, [stepId]);

  const trimmedValue = value.trim();

  return (
    <div className="rounded-2xl border border-[#C7D2FE] bg-[#EEF2FF] p-3">
      <div className="text-xs font-bold uppercase tracking-wider text-[#4338CA]">
        Input Required
      </div>
      <div className="mt-1 text-sm font-semibold text-[#0F172A]">{prompt}</div>
      {description && (
        <div className="mt-1 text-xs text-[#475569]">{description}</div>
      )}
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder ?? 'Type your response here'}
        disabled={disabled}
        rows={4}
        className="mt-3 w-full resize-y rounded-xl border border-[#C7D2FE] bg-white px-3 py-2 text-xs text-[#0F172A] outline-none transition-colors placeholder:text-[#94A3B8] focus:border-[#818CF8] disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => onSubmit(stepId, transcriptId, trimmedValue)}
          disabled={disabled || trimmedValue.length === 0}
          className="rounded-full bg-[#4F46E5] px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-50"
        >
          Submit
        </button>
      </div>
    </div>
  );
}

function workflowStatusBadgeClass(status?: string | null) {
  switch (status) {
    case 'completed':
      return 'border-[#86EFAC] bg-[#DCFCE7] text-[#166534]';
    case 'running':
      return 'border-[#93C5FD] bg-[#DBEAFE] text-[#1D4ED8]';
    case 'failed':
    case 'interrupted':
      return 'border-[#FCA5A5] bg-[#FEE2E2] text-[#991B1B]';
    case 'ready':
      return 'border-[#FCD34D] bg-[#FEF3C7] text-[#92400E]';
    case 'waiting_input':
    case 'waiting_review':
      return 'border-[#C7D2FE] bg-[#E0E7FF] text-[#4338CA]';
    default:
      return 'border-[#CBD5E1] bg-[#F1F5F9] text-[#334155]';
  }
}

function WorkflowTranscriptFeed({
  entries,
  isLoading,
  emptyMessage,
  pendingActionId,
  onApproval,
}: {
  entries: WorkflowTranscriptEntry[];
  isLoading?: boolean;
  emptyMessage: string;
  pendingActionId?: string | null;
  onApproval?: (
    stepId: string,
    action: string,
    transcriptId: string,
    inputText?: string
  ) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center rounded-[24px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-5 text-center text-sm text-[#94A3B8] dark:border-[#334155] dark:bg-[rgba(15,23,42,0.45)]">
        {isLoading ? 'Loading step transcript...' : emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        if (entry.entry_type === 'approval_request') {
          const meta = parseWorkflowTranscriptMeta(entry.meta_json);
          const resolved = meta?.resolved === true;
          return (
            <ApprovalCard
              key={entry.id}
              title={entry.content}
              description={
                typeof meta?.description === 'string'
                  ? meta.description
                  : undefined
              }
              stepId={entry.step_id ?? ''}
              transcriptId={entry.id}
              onApprove={(stepId, transcriptId) =>
                onApproval?.(stepId, 'approved', transcriptId)
              }
              onReject={(stepId, transcriptId) =>
                onApproval?.(stepId, 'rejected', transcriptId)
              }
              disabled={
                !entry.step_id ||
                resolved ||
                !onApproval ||
                pendingActionId === entry.id
              }
            />
          );
        }
        if (entry.entry_type === 'permission_request') {
          const meta = parseWorkflowTranscriptMeta(entry.meta_json);
          const resolved = meta?.resolved === true;
          return (
            <PermissionRequestCard
              key={entry.id}
              title={entry.content}
              description={
                typeof meta?.description === 'string'
                  ? meta.description
                  : undefined
              }
              stepId={entry.step_id ?? ''}
              transcriptId={entry.id}
              onGrant={(stepId, transcriptId) =>
                onApproval?.(stepId, 'granted', transcriptId)
              }
              onDeny={(stepId, transcriptId) =>
                onApproval?.(stepId, 'denied', transcriptId)
              }
              disabled={
                !entry.step_id ||
                resolved ||
                !onApproval ||
                pendingActionId === entry.id
              }
            />
          );
        }
        if (entry.entry_type === 'continue_confirmation') {
          const resolved =
            parseWorkflowTranscriptMeta(entry.meta_json)?.resolved === true;
          return (
            <ContinueConfirmationCard
              key={entry.id}
              message={entry.content}
              stepId={entry.step_id ?? ''}
              transcriptId={entry.id}
              onContinue={(stepId, transcriptId) =>
                onApproval?.(stepId, 'continued', transcriptId)
              }
              disabled={
                !entry.step_id ||
                resolved ||
                !onApproval ||
                pendingActionId === entry.id
              }
            />
          );
        }
        if (entry.entry_type === 'input_request') {
          const meta = parseWorkflowTranscriptMeta(entry.meta_json);
          const resolved = meta?.resolved === true;
          return (
            <InputRequestCard
              key={entry.id}
              prompt={entry.content}
              description={
                typeof meta?.description === 'string'
                  ? meta.description
                  : undefined
              }
              placeholder={
                typeof meta?.placeholder === 'string'
                  ? meta.placeholder
                  : undefined
              }
              stepId={entry.step_id ?? ''}
              transcriptId={entry.id}
              onSubmit={(stepId, transcriptId, inputText) =>
                onApproval?.(stepId, 'submitted', transcriptId, inputText)
              }
              disabled={
                !entry.step_id ||
                resolved ||
                !onApproval ||
                pendingActionId === entry.id
              }
            />
          );
        }

        return (
          <div
            key={entry.id}
            className={cn(
              'rounded-[18px] border px-3 py-3 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
              entry.message_type === 'system' &&
                'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]',
              entry.message_type === 'agent' &&
                'border-[#BFDBFE] bg-[#EFF6FF] text-[#1E3A8A]',
              entry.message_type === 'control' &&
                'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]',
              entry.message_type === 'user' &&
                'border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]'
            )}
          >
            <div className="mb-1 flex items-center justify-between gap-3">
              <div className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-current/75">
                {entry.agent_name ?? entry.message_type}
              </div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-current/60">
                {entry.entry_type}
              </div>
            </div>
            <div className="whitespace-pre-wrap leading-5">{entry.content}</div>
          </div>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------
// Workflow Window
// -----------------------------------------------------------------------

export function WorkflowWindow({
  sessionId,
  projection,
  transcript = [],
  isOpen,
  onClose,
  onExecute,
  onPauseAll,
  onResume,
  onInterruptStep,
  onStopStep,
  onRetryStep,
  onSubmitStepInput,
  onApproval,
  onResolveFinalReview,
  pendingActionId,
}: WorkflowWindowProps) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [detailStepId, setDetailStepId] = useState<string | null>(null);
  const [composerValue, setComposerValue] = useState('');
  const initializedWorkflowKeyRef = useRef<string | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isPreview =
    projection.state === 'preview_ready' ||
    projection.state === 'preview_invalid';
  const isRunning = projection.execution_status === 'running';
  const canResume =
    projection.execution_status === 'paused' ||
    projection.execution_status === 'failed' ||
    projection.state === 'paused';

  const agents = useMemo(() => projection.agents ?? [], [projection.agents]);
  const leadAgentId =
    agents[0]?.workflow_agent_session_id ?? agents[0]?.session_agent_id ?? null;
  const agentSessionIdByName = useMemo(
    () =>
      new Map(
        agents.map((agent) => [
          agent.name,
          agent.workflow_agent_session_id ?? agent.session_agent_id,
        ])
      ),
    [agents]
  );
  const stepByKey = useMemo(
    () => new Map(projection.steps.map((step) => [step.step_key, step])),
    [projection.steps]
  );
  const planNodeById = useMemo(
    () => new Map(projection.plan.nodes.map((node) => [node.id, node])),
    [projection.plan.nodes]
  );
  const orderedActionableSteps = useMemo(
    () =>
      [...projection.steps].sort((left, right) => {
        const priority = (status: string) => {
          switch (status) {
            case 'running':
              return 0;
            case 'waiting_input':
            case 'waiting_review':
              return 1;
            case 'failed':
              return 2;
            case 'ready':
              return 3;
            default:
              return 10;
          }
        };

        return priority(left.status) - priority(right.status);
      }),
    [projection.steps]
  );
  const workflowInstanceKey = useMemo(
    () => `${projection.execution_id ?? ''}::${projection.plan_id ?? ''}`,
    [projection.execution_id, projection.plan_id]
  );
  const resolveStepAgentId = useCallback(
    (step?: WorkflowCardStep | null) => {
      if (!step) {
        return leadAgentId;
      }
      if (!step.agent_name) {
        return leadAgentId;
      }
      return agentSessionIdByName.get(step.agent_name) ?? leadAgentId;
    },
    [agentSessionIdByName, leadAgentId]
  );
  const findPreferredStepForAgent = useCallback(
    (agentId: string | null) => {
      if (!agentId) {
        return orderedActionableSteps[0] ?? projection.steps[0] ?? null;
      }
      return (
        orderedActionableSteps.find(
          (step) => resolveStepAgentId(step) === agentId
        ) ??
        projection.steps.find((step) => resolveStepAgentId(step) === agentId) ??
        null
      );
    },
    [orderedActionableSteps, projection.steps, resolveStepAgentId]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const initialStep =
      orderedActionableSteps[0] ?? projection.steps[0] ?? null;
    const initialStepKey = initialStep?.step_key ?? null;
    const initialAgentId = resolveStepAgentId(initialStep);

    if (initializedWorkflowKeyRef.current !== workflowInstanceKey) {
      initializedWorkflowKeyRef.current = workflowInstanceKey;
      setSelectedStepId(initialStepKey);
      setSelectedAgentId(initialAgentId);
      setDetailStepId(null);
      setComposerValue('');
      return;
    }

    setSelectedStepId((prev) => {
      if (!prev) {
        return initialStepKey;
      }
      return stepByKey.has(prev) ? prev : initialStepKey;
    });

    setSelectedAgentId((prev) => {
      if (
        prev &&
        agents.some(
          (agent) =>
            (agent.workflow_agent_session_id ?? agent.session_agent_id) === prev
        )
      ) {
        return prev;
      }
      return initialAgentId;
    });

    setDetailStepId((prev) => (prev && stepByKey.has(prev) ? prev : null));
  }, [
    agents,
    isOpen,
    orderedActionableSteps,
    projection.steps,
    resolveStepAgentId,
    stepByKey,
    workflowInstanceKey,
  ]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (detailStepId) {
          setDetailStepId(null);
          return;
        }
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [detailStepId, isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setDetailStepId(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = `${WORKFLOW_COMPOSER_MIN_HEIGHT}px`;
    const fullHeight = textarea.scrollHeight;
    const shouldEnableScroll = fullHeight > WORKFLOW_COMPOSER_MAX_HEIGHT;
    const nextHeight = Math.min(fullHeight, WORKFLOW_COMPOSER_MAX_HEIGHT);
    textarea.style.height = `${Math.max(
      nextHeight,
      WORKFLOW_COMPOSER_MIN_HEIGHT
    )}px`;
    textarea.style.overflowY = shouldEnableScroll ? 'auto' : 'hidden';
  }, [composerValue, isOpen]);

  const selectedStep = projection.steps.find(
    (s) => s.step_key === selectedStepId
  );
  const selectedAgent =
    agents.find(
      (agent) =>
        (agent.workflow_agent_session_id ?? agent.session_agent_id) ===
        selectedAgentId
    ) ??
    agents[0] ??
    null;
  const selectedStepInputRequest = useMemo(() => {
    if (!selectedStep || selectedStep.status !== 'waiting_input') {
      return null;
    }

    for (let index = transcript.length - 1; index >= 0; index -= 1) {
      const entry = transcript[index];
      if (
        entry.entry_type !== 'input_request' ||
        (entry.step_id !== selectedStep.id &&
          entry.step_key !== selectedStep.step_key)
      ) {
        continue;
      }

      const meta = parseWorkflowTranscriptMeta(entry.meta_json);
      if (meta?.resolved === true) {
        continue;
      }

      return {
        prompt: entry.content,
        description:
          typeof meta?.description === 'string' ? meta.description : undefined,
        placeholder:
          typeof meta?.placeholder === 'string' ? meta.placeholder : undefined,
      };
    }

    return null;
  }, [selectedStep, transcript]);
  const composerPlaceholder = useMemo(() => {
    if (selectedStepInputRequest?.placeholder?.trim()) {
      return selectedStepInputRequest.placeholder.trim();
    }
    if (selectedStepInputRequest?.prompt?.trim()) {
      return selectedStepInputRequest.prompt.trim();
    }
    if (selectedStep) {
      return `Send input to ${selectedAgent?.name ?? 'selected agent'}`;
    }
    if (selectedAgent) {
      return 'No step available for the selected agent';
    }
    return 'Pick a node before sending input';
  }, [selectedAgent, selectedStep, selectedStepInputRequest]);
  const detailStep = projection.steps.find((s) => s.step_key === detailStepId);
  const detailStepNode = detailStepId ? planNodeById.get(detailStepId) : null;
  const detailAgentSessionId = detailStep?.agent_name
    ? (agentSessionIdByName.get(detailStep.agent_name) ?? leadAgentId)
    : leadAgentId;

  const {
    data: detailStepTranscriptData,
    isFetching: isFetchingDetailStepTranscript,
  } = useQuery({
    queryKey: [
      'workflowStepTranscripts',
      sessionId,
      detailStep?.id,
      detailAgentSessionId,
    ],
    queryFn: () => {
      if (!sessionId || !detailStep?.id) {
        return [];
      }

      return chatApi.getWorkflowStepTranscripts(sessionId, detailStep.id, {
        stepKey: detailStep.step_key,
        workflowAgentSessionId: detailAgentSessionId,
      });
    },
    enabled: !!sessionId && !!detailStep?.id && !isPreview && isOpen,
    refetchInterval:
      isOpen && !isPreview && !!sessionId && !!detailStep?.id ? 5000 : false,
  });

  const detailFallbackTranscript = useMemo(() => {
    if (!detailStep) {
      return [];
    }

    let entries = transcript.filter(
      (entry) =>
        entry.step_id === detailStep.id ||
        entry.step_key === detailStep.step_key
    );
    if (detailAgentSessionId) {
      entries = entries.filter(
        (entry) => entry.workflow_agent_session_id === detailAgentSessionId
      );
    }
    return entries;
  }, [detailAgentSessionId, detailStep, transcript]);

  const detailStepScopedTranscript = useMemo(() => {
    const entries = detailStepTranscriptData ?? [];
    return entries.map((entry) => ({
      id: entry.id,
      step_id: entry.step_id,
      step_key: entry.step_key,
      workflow_agent_session_id: entry.workflow_agent_session_id,
      agent_name: entry.agent_name,
      message_type: entry.sender_type as
        | 'system'
        | 'agent'
        | 'user'
        | 'control',
      content: entry.content,
      entry_type: entry.entry_type,
      meta_json: entry.meta_json,
      created_at: entry.created_at,
    }));
  }, [detailStepTranscriptData]);

  const visibleDetailTranscript =
    detailStepScopedTranscript.length > 0
      ? detailStepScopedTranscript
      : detailFallbackTranscript;
  const workflowFinalReviewAction = useMemo(
    () => toWorkflowFinalReviewAction(projection.execution_id, transcript),
    [projection.execution_id, transcript]
  );
  const handleSelectStep = useCallback(
    (id: string) => {
      const nextStep = stepByKey.get(id);
      if (!nextStep) {
        return;
      }
      setSelectedStepId(id);
      setSelectedAgentId(resolveStepAgentId(nextStep));
      setDetailStepId(id);
    },
    [resolveStepAgentId, stepByKey]
  );
  const handleSelectAgent = useCallback(
    (agentId: string) => {
      setSelectedAgentId(agentId);
      const nextStep = findPreferredStepForAgent(agentId);
      setSelectedStepId(nextStep?.step_key ?? null);
      setDetailStepId(null);
    },
    [findPreferredStepForAgent]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/42 p-3 backdrop-blur-sm md:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Workflow window: ${projection.title}`}
    >
      <div
        className="relative flex h-[min(92vh,880px)] w-full max-w-[1360px] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(248,250,252,0.98)_100%)] shadow-[0_30px_100px_rgba(15,23,42,0.28)] backdrop-blur-xl dark:border-[#243041] dark:bg-[linear-gradient(180deg,rgba(11,16,23,0.96)_0%,rgba(15,23,42,0.94)_100%)] dark:shadow-[0_28px_100px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#E2E8F0] px-5 py-4 md:px-6">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#64748B]">
              Workflow Window
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="truncate text-lg font-semibold text-[#0F172A] dark:text-white">
                {projection.title}
              </div>
              <div className="rounded-full bg-[#EEF4FF] px-3 py-1 text-[11px] font-semibold text-[#1D4ED8]">
                {projection.completed_step_count}/{projection.total_step_count}
              </div>
            </div>
            <div className="mt-2 max-w-3xl text-sm leading-6 text-[#475569] dark:text-[#94A3B8]">
              {projection.goal}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/75 text-[#64748B] shadow-sm transition-colors hover:bg-white hover:text-[#0F172A] dark:border-[#2A3445] dark:bg-[rgba(25,34,51,0.82)] dark:text-[#94A3B8] dark:hover:text-white"
            aria-label="Close workflow window"
          >
            <svg
              className="size-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Two-pane body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Left pane: Graph */}
          <div className="w-full shrink-0 overflow-auto border-b border-[#E2E8F0] bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.45),rgba(248,250,252,0.8)_34%,rgba(248,250,252,1)_72%)] p-4 lg:basis-3/4 lg:border-b-0 lg:border-r lg:p-5 dark:border-[#243041] dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),rgba(15,23,42,0.92)_38%,rgba(11,16,23,0.98)_78%)]">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#64748B]">
              Plan Graph
            </div>
            <WorkflowGraphBoard
              nodes={projection.plan.nodes}
              edges={projection.plan.edges}
              steps={projection.steps}
              selectedStepId={selectedStepId}
              onSelectStep={handleSelectStep}
              onRetryStep={onRetryStep}
            />

            <div className="mt-4 flex items-center justify-between gap-3 rounded-[22px] border border-white/70 bg-white/80 px-4 py-3 text-xs text-[#475569] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-[#243041] dark:bg-[rgba(15,23,42,0.78)] dark:text-[#CBD5E1]">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#94A3B8]">
                  Step Inspector
                </div>
                <div className="mt-1 text-xs leading-5 text-[#475569] dark:text-[#CBD5E1]">
                  Click a step node to open its detail card with task
                  instructions, summary, agent, status and transcript.
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                  <span className="rounded-full bg-[#EEF4FF] px-2.5 py-1 font-semibold text-[#1D4ED8] dark:bg-[rgba(37,99,235,0.18)] dark:text-[#BFDBFE]">
                    {projection.completed_step_count}/
                    {projection.total_step_count} steps completed
                  </span>
                  {projection.result_summary && (
                    <span className="rounded-full bg-[#DCFCE7] px-2.5 py-1 font-semibold text-[#166534] dark:bg-[rgba(22,163,74,0.18)] dark:text-[#BBF7D0]">
                      {projection.result_summary}
                    </span>
                  )}
                  {projection.error_message && (
                    <span className="rounded-full bg-[#FEE2E2] px-2.5 py-1 font-semibold text-[#991B1B] dark:bg-[rgba(220,38,38,0.18)] dark:text-[#FECACA]">
                      {projection.error_message}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {projection.state === 'preview_ready' &&
                  projection.plan_id &&
                  onExecute && (
                    <button
                      type="button"
                      onClick={() => onExecute(projection.plan_id!)}
                      className="flex items-center gap-2 rounded-full bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#1D4ED8]"
                    >
                      <PlayIcon className="size-3.5" weight="bold" />
                      Execute Plan
                    </button>
                  )}
                {isRunning && projection.execution_id && onPauseAll && (
                  <button
                    type="button"
                    onClick={() => onPauseAll(projection.execution_id!)}
                    className="flex items-center gap-1 rounded-full bg-[#D97706] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#B45309]"
                  >
                    <PauseIcon className="size-3.5" weight="bold" />
                    Pause All
                  </button>
                )}
                {canResume && projection.execution_id && onResume && (
                  <button
                    type="button"
                    onClick={() => onResume(projection.execution_id!)}
                    className="flex items-center gap-1 rounded-full bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1D4ED8]"
                  >
                    <PlayIcon className="size-3.5" weight="bold" />
                    Resume
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right pane: Panel */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white/70 lg:basis-1/4 dark:bg-transparent">
            {/* Preview mode */}
            {isPreview && (
              <div className="flex-1 overflow-auto p-5 md:p-6">
                <div className="max-w-3xl rounded-[24px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_42px_rgba(148,163,184,0.16)] dark:border-[#2A3445] dark:bg-[rgba(15,23,42,0.78)] dark:shadow-none">
                  <div className="text-sm font-semibold text-[#0F172A] dark:text-white">
                    Plan Summary
                  </div>
                  <div className="mt-2 text-sm leading-6 text-[#475569] dark:text-[#94A3B8]">
                    {projection.goal}
                  </div>

                  {projection.validation_errors && (
                    <div className="mt-4 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-3 dark:border-[#7F1D1D] dark:bg-[rgba(127,29,29,0.18)]">
                      <div className="text-xs font-bold uppercase tracking-wider text-[#991B1B] dark:text-[#FCA5A5]">
                        Validation Errors
                      </div>
                      <div className="mt-1 text-sm text-[#991B1B] dark:text-[#FECACA]">
                        {projection.validation_errors}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Execution mode */}
            {!isPreview && (
              <>
                {agents.length > 0 && (
                  <div className="border-b border-[#E2E8F0] px-5 py-3 dark:border-[#243041] md:px-6">
                    <AgentSelector
                      agents={agents}
                      selectedAgentId={
                        selectedAgent
                          ? (selectedAgent.workflow_agent_session_id ??
                            selectedAgent.session_agent_id)
                          : selectedAgentId
                      }
                      onSelect={handleSelectAgent}
                    />
                  </div>
                )}
                <div className="relative min-h-0 flex-1">
                  <div className="h-full overflow-auto px-5 pb-28 pt-4 md:px-6">
                    {workflowFinalReviewAction && onResolveFinalReview && (
                      <div className="mb-3">
                        <WorkflowFinalReviewCard
                          message={workflowFinalReviewAction.message}
                          description={workflowFinalReviewAction.description}
                          onAccept={() =>
                            onResolveFinalReview(
                              workflowFinalReviewAction.executionId,
                              workflowFinalReviewAction.transcriptId,
                              'accepted'
                            )
                          }
                          onReject={() =>
                            onResolveFinalReview(
                              workflowFinalReviewAction.executionId,
                              workflowFinalReviewAction.transcriptId,
                              'rejected'
                            )
                          }
                          disabled={
                            pendingActionId ===
                            workflowFinalReviewAction.transcriptId
                          }
                        />
                      </div>
                    )}
                  </div>

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-white/96 via-white/82 to-transparent px-5 pb-3 pt-8 dark:from-[rgba(15,23,42,0.96)] dark:via-[rgba(15,23,42,0.72)] dark:to-transparent md:px-6">
                    <div className="pointer-events-auto relative">
                      {selectedStepInputRequest && (
                        <div className="mb-2 rounded-2xl border border-[#C7D2FE] bg-[#EEF2FF] px-4 py-3 text-xs text-[#3730A3] dark:border-[#312E81] dark:bg-[rgba(49,46,129,0.24)] dark:text-[#C7D2FE]">
                          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#4338CA] dark:text-[#A5B4FC]">
                            Input Prompt
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#312E81] dark:text-[#E0E7FF]">
                            {selectedStepInputRequest.prompt}
                          </div>
                          {selectedStepInputRequest.description && (
                            <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#4338CA]/90 dark:text-[#C7D2FE]/90">
                              {selectedStepInputRequest.description}
                            </div>
                          )}
                        </div>
                      )}
                      <textarea
                        ref={composerTextareaRef}
                        value={composerValue}
                        onChange={(event) =>
                          setComposerValue(event.target.value)
                        }
                        placeholder={composerPlaceholder}
                        rows={4}
                        disabled={!selectedStep || !onSubmitStepInput}
                        className="w-full resize-none overflow-y-hidden rounded-[24px] border border-[#CBD5E1] bg-white/96 px-4 py-3 pb-12 pr-12 text-[14px] leading-5 text-[#0F172A] shadow-[0_16px_34px_rgba(15,23,42,0.12)] outline-none transition-colors placeholder:text-[#94A3B8] focus:border-[#60A5FA] disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#94A3B8] dark:border-[#243041] dark:bg-[rgba(15,23,42,0.92)] dark:text-white dark:shadow-[0_18px_36px_rgba(0,0,0,0.28)]"
                        style={{
                          height: WORKFLOW_COMPOSER_MIN_HEIGHT,
                          maxHeight: WORKFLOW_COMPOSER_MAX_HEIGHT,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedStep || !onSubmitStepInput) {
                            return;
                          }
                          const nextValue = composerValue.trim();
                          if (!nextValue) {
                            return;
                          }
                          onSubmitStepInput(selectedStep.id, nextValue);
                          setComposerValue('');
                        }}
                        disabled={
                          !selectedStep ||
                          !onSubmitStepInput ||
                          composerValue.trim().length === 0
                        }
                        className="absolute bottom-3 right-3 inline-flex size-8 items-center justify-center rounded-full bg-[#0F172A] text-white transition-colors hover:bg-[#1E293B] disabled:opacity-40"
                        aria-label="Send step input"
                      >
                        <ArrowUpIcon className="size-3" weight="bold" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {detailStep && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/24 p-4 md:p-6"
            onClick={() => setDetailStepId(null)}
          >
            <div
              className="flex max-h-full w-full max-w-[980px] flex-col overflow-hidden rounded-[28px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.98)_100%)] shadow-[0_28px_90px_rgba(15,23,42,0.28)] dark:border-[#243041] dark:bg-[linear-gradient(180deg,rgba(11,16,23,0.98)_0%,rgba(15,23,42,0.96)_100%)] dark:shadow-[0_28px_100px_rgba(0,0,0,0.55)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-[#E2E8F0] px-5 py-4 dark:border-[#243041] md:px-6">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#64748B]">
                    Step Details
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className="truncate text-lg font-semibold text-[#0F172A] dark:text-white">
                      {detailStep.title}
                    </div>
                    <span
                      className={cn(
                        'rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em]',
                        workflowStatusBadgeClass(detailStep.status)
                      )}
                    >
                      {detailStep.status}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
                    {detailStep.step_type}
                    {detailStep.agent_name ? ` · ${detailStep.agent_name}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {detailStep.status === 'running' &&
                    (onInterruptStep || onStopStep) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (onInterruptStep) {
                            onInterruptStep(detailStep.id);
                            return;
                          }
                          onStopStep?.(detailStep.id);
                        }}
                        className="inline-flex items-center gap-1 rounded-full bg-[#991B1B] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#7F1D1D]"
                      >
                        <StopIcon className="size-3.5" weight="bold" />
                        Terminate
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => setDetailStepId(null)}
                    className="inline-flex size-10 items-center justify-center rounded-2xl border border-white/70 bg-white/75 text-[#64748B] shadow-sm transition-colors hover:bg-white hover:text-[#0F172A] dark:border-[#2A3445] dark:bg-[rgba(25,34,51,0.82)] dark:text-[#94A3B8] dark:hover:text-white"
                    aria-label="Close step details"
                  >
                    <svg
                      className="size-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)] md:p-6">
                <div className="min-h-0 space-y-4 overflow-auto pr-1">
                  <div className="rounded-[22px] border border-white/70 bg-white/82 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] dark:border-[#243041] dark:bg-[rgba(15,23,42,0.72)]">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#94A3B8]">
                      Task Instruction
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#334155] dark:text-[#CBD5E1]">
                      {detailStepNode?.data.instructions?.trim() ||
                        'No task instructions were provided for this step.'}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-white/70 bg-white/82 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] dark:border-[#243041] dark:bg-[rgba(15,23,42,0.72)]">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#94A3B8]">
                      Task Summary
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#334155] dark:text-[#CBD5E1]">
                      {detailStep.summary_text?.trim() ||
                        'No summary has been generated for this step yet.'}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[22px] border border-white/70 bg-white/82 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] dark:border-[#243041] dark:bg-[rgba(15,23,42,0.72)]">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#94A3B8]">
                        Agent
                      </div>
                      <div className="mt-2 text-sm font-semibold text-[#0F172A] dark:text-white">
                        {detailStep.agent_name?.trim() || 'Lead'}
                      </div>
                    </div>
                    <div className="rounded-[22px] border border-white/70 bg-white/82 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] dark:border-[#243041] dark:bg-[rgba(15,23,42,0.72)]">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#94A3B8]">
                        Current Status
                      </div>
                      <div className="mt-2">
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]',
                            workflowStatusBadgeClass(detailStep.status)
                          )}
                        >
                          {detailStep.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex min-h-0 flex-col rounded-[24px] border border-white/70 bg-white/82 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] dark:border-[#243041] dark:bg-[rgba(15,23,42,0.72)]">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#94A3B8]">
                    Transcript
                  </div>
                  <div className="mt-3 min-h-0 flex-1 overflow-auto pr-1">
                    <WorkflowTranscriptFeed
                      entries={visibleDetailTranscript}
                      isLoading={isFetchingDetailStepTranscript}
                      emptyMessage={
                        isPreview
                          ? 'Preview mode does not have transcript messages yet.'
                          : 'No transcript messages for this step yet.'
                      }
                      pendingActionId={pendingActionId}
                      onApproval={onApproval}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
