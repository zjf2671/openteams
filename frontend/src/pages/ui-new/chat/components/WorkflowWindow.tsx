import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  FunnelIcon,
  CaretDownIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

function parseTranscriptMeta(
  metaJson: string | null | undefined
): Record<string, unknown> | null {
  if (!metaJson) return null;
  try {
    return JSON.parse(metaJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

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

// -----------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------

export type WorkflowWindowProps = {
  projection: WorkflowWindowProjection;
  transcript?: WorkflowTranscriptEntry[];
  isOpen: boolean;
  onClose: () => void;
  onExecute?: (planId: string) => void;
  onPauseAll?: (executionId: string) => void;
  onInterruptStep?: (executionId: string, stepId: string) => void;
  onApproval?: (action: string, transcriptId: string, inputText?: string) => void;
  pendingTranscriptId?: string | null;
};

// -----------------------------------------------------------------------
// Mini graph for left pane
// -----------------------------------------------------------------------

function MiniGraph({
  nodes,
  edges,
  selectedStepId,
  onSelectStep,
}: {
  nodes: WorkflowCardNode[];
  edges: WorkflowCardEdge[];
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
}) {
  if (nodes.length === 0) return null;

  const canvasHeight = 640;
  const nodeGap = 20;
  const minNodeWidth = 90;
  const maxNodeWidth = 160;
  const height = 36;
  const paddingX = 40;
  const paddingY = 48;
  const sortedNodes = [...nodes].sort(
    (a, b) =>
      a.position.x - b.position.x ||
      a.position.y - b.position.y ||
      a.id.localeCompare(b.id)
  );
  const measureNodeWidth = (node: WorkflowCardNode) => {
    const titleWidth = node.data.title.trim().length * 4 + 28;
    const typeWidth = node.data.stepType.trim().length * 3.5 + 22;
    return Math.max(minNodeWidth, Math.min(maxNodeWidth, Math.max(titleWidth, typeWidth)));
  };
  const nodeWidths = sortedNodes.map(measureNodeWidth);
  const totalNodeWidth = nodeWidths.reduce((sum, width) => sum + width, 0);
  const canvasWidth = Math.max(
    totalNodeWidth + Math.max(sortedNodes.length - 1, 0) * nodeGap + paddingX * 2,
    320
  );
  const layoutNodes = sortedNodes.map((node, index) => {
    const renderWidth = nodeWidths[index];
    const previousWidth = nodeWidths
      .slice(0, index)
      .reduce((sum, width) => sum + width, 0);
    return {
      ...node,
      renderWidth,
      position: {
        x: paddingX + previousWidth + index * nodeGap,
        y: (canvasHeight - height) / 2,
      },
    };
  });
  const nodeById = new Map(layoutNodes.map((n) => [n.id, n]));
  const viewBox = `0 0 ${canvasWidth} ${canvasHeight}`;
  const statusColor = (status?: string | null, selected?: boolean) => {
    const base = (() => {
      switch (status) {
        case 'completed':
          return { fill: '#DCFCE7', stroke: '#16A34A', text: '#166534' };
        case 'running':
          return { fill: '#DBEAFE', stroke: '#2563EB', text: '#1D4ED8' };
        case 'failed':
        case 'interrupted':
          return { fill: '#FEE2E2', stroke: '#DC2626', text: '#991B1B' };
        case 'ready':
          return { fill: '#FEF3C7', stroke: '#D97706', text: '#92400E' };
        default:
          return { fill: '#F8FAFC', stroke: '#CBD5E1', text: '#334155' };
      }
    })();
    if (selected) {
      return { ...base, stroke: '#1E40AF' };
    }
    return base;
  };

  return (
    <svg viewBox={viewBox} className="h-[640px] max-w-none" style={{ width: canvasWidth }}>
      {edges.map((edge) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) return null;
        const x1 = source.position.x + source.renderWidth;
        const y1 = source.position.y + height / 2;
        const x2 = target.position.x;
        const y2 = target.position.y + height / 2;
        const curveOffset = Math.max((x2 - x1) / 2, 16);
        return (
          <path
            key={edge.id}
            d={`M ${x1} ${y1} C ${x1 + curveOffset} ${y1}, ${x2 - curveOffset} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke="#94A3B8"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        );
      })}
      {layoutNodes.map((node) => {
        const colors = statusColor(node.data.status, node.id === selectedStepId);
        return (
          <g
            key={node.id}
            transform={`translate(${node.position.x}, ${node.position.y})`}
            onClick={() => onSelectStep(node.id)}
            className="cursor-pointer"
          >
            <rect
              width={node.renderWidth}
              height={height}
              rx="10"
              fill={colors.fill}
              stroke={colors.stroke}
              strokeWidth={node.id === selectedStepId ? 3 : 1.5}
            />
            <text
              x={node.renderWidth / 2}
              y="14"
              fontSize="8"
              fontWeight="700"
              fill={colors.text}
              textAnchor="middle"
            >
              {node.data.stepType.toUpperCase()}
            </text>
            <text
              x={node.renderWidth / 2}
              y="26"
              fontSize="10"
              fontWeight="600"
              fill="#0F172A"
              textAnchor="middle"
            >
              {node.data.title.length > 20
                ? `${node.data.title.slice(0, 20)}...`
                : node.data.title}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// -----------------------------------------------------------------------
// Agent Selector
// -----------------------------------------------------------------------

function AgentSelector({
  agents,
  selectedAgentId,
  onSelect,
}: {
  agents: WorkflowCardAgent[];
  selectedAgentId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = agents.find(
    (a) => (a.workflow_agent_session_id ?? a.session_agent_id) === selectedAgentId
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#334155] hover:bg-[#F8FAFC] transition-colors"
      >
        <FunnelIcon className="size-3.5" weight="bold" />
        {selected ? selected.name : 'All Agents'}
        <CaretDownIcon className="size-3" weight="bold" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 min-w-[160px] rounded-lg border border-[#E2E8F0] bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => { onSelect(null); setOpen(false); }}
            className={cn(
              'block w-full px-3 py-1.5 text-left text-xs hover:bg-[#F1F5F9]',
              !selectedAgentId && 'font-bold text-[#1D4ED8]'
            )}
          >
            All Agents
          </button>
          {agents.map((agent) => (
            <button
              type="button"
              key={agent.session_agent_id}
              onClick={() => {
                onSelect(agent.workflow_agent_session_id ?? agent.session_agent_id);
                setOpen(false);
              }}
              className={cn(
                'block w-full px-3 py-1.5 text-left text-xs hover:bg-[#F1F5F9]',
                selectedAgentId ===
                  (agent.workflow_agent_session_id ?? agent.session_agent_id) &&
                  'font-bold text-[#1D4ED8]'
              )}
            >
              {agent.name}
            </button>
          ))}
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
  onApprove,
  onReject,
  disabled,
}: {
  title: string;
  description?: string;
  stepId: string;
  onApprove: (stepId: string) => void;
  onReject: (stepId: string) => void;
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
          onClick={() => onApprove(stepId)}
          disabled={disabled}
          className="rounded-full bg-[#16A34A] px-3 py-1 text-xs font-semibold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => onReject(stepId)}
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
  onGrant,
  onDeny,
  disabled,
}: {
  title: string;
  description?: string;
  stepId: string;
  onGrant: (stepId: string) => void;
  onDeny: (stepId: string) => void;
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
          onClick={() => onGrant(stepId)}
          disabled={disabled}
          className="rounded-full bg-[#2563EB] px-3 py-1 text-xs font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-50 transition-colors"
        >
          Grant
        </button>
        <button
          type="button"
          onClick={() => onDeny(stepId)}
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
  onContinue,
  disabled,
}: {
  message: string;
  stepId: string;
  onContinue: (stepId: string) => void;
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
          onClick={() => onContinue(stepId)}
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
  onSubmit,
  disabled,
}: {
  prompt: string;
  description?: string;
  placeholder?: string;
  stepId: string;
  onSubmit: (stepId: string, inputText: string) => void;
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
          onClick={() => onSubmit(stepId, trimmedValue)}
          disabled={disabled || trimmedValue.length === 0}
          className="rounded-full bg-[#4F46E5] px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-50"
        >
          Submit
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Workflow Window
// -----------------------------------------------------------------------

export function WorkflowWindow({
  projection,
  transcript = [],
  isOpen,
  onClose,
  onExecute,
  onPauseAll,
  onInterruptStep,
  onApproval,
  pendingTranscriptId,
}: WorkflowWindowProps) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const isPreview =
    projection.state === 'preview_ready' || projection.state === 'preview_invalid';
  const isRunning = projection.execution_status === 'running';

  const agents = projection.agents ?? [];

  useEffect(() => {
    setSelectedStepId(null);
    setSelectedAgentId(null);
  }, [projection.execution_id, projection.plan_id]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Filter transcript by selected agent/step
  const filteredTranscript = useMemo(() => {
    let entries = transcript;
    if (selectedAgentId) {
      entries = entries.filter(
        (e) => e.workflow_agent_session_id === selectedAgentId
      );
    }
    if (selectedStepId) {
      entries = entries.filter((e) => e.step_key === selectedStepId);
    }
    return entries;
  }, [transcript, selectedAgentId, selectedStepId]);

  const handleSelectStep = useCallback((id: string) => {
    setSelectedStepId((prev) => (prev === id ? null : id));
  }, []);

  const selectedStep = projection.steps.find((s) => s.step_key === selectedStepId);

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
        className="flex h-[min(92vh,880px)] w-full max-w-[1360px] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(248,250,252,0.98)_100%)] shadow-[0_30px_100px_rgba(15,23,42,0.28)] backdrop-blur-xl dark:border-[#243041] dark:bg-[linear-gradient(180deg,rgba(11,16,23,0.96)_0%,rgba(15,23,42,0.94)_100%)] dark:shadow-[0_28px_100px_rgba(0,0,0,0.5)]"
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
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Two-pane body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Left pane: Graph */}
          <div className="w-full shrink-0 overflow-auto border-b border-[#E2E8F0] bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.45),rgba(248,250,252,0.8)_34%,rgba(248,250,252,1)_72%)] p-4 lg:basis-3/4 lg:border-b-0 lg:border-r lg:p-5 dark:border-[#243041] dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),rgba(15,23,42,0.92)_38%,rgba(11,16,23,0.98)_78%)]">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#64748B] mb-3">
              Plan Graph
            </div>
            <div className="overflow-x-auto overflow-y-hidden rounded-[24px] border border-white/70 bg-white/75 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-[#2A3445] dark:bg-[rgba(15,23,42,0.78)]">
              <MiniGraph
                nodes={projection.plan.nodes}
                edges={projection.plan.edges}
                selectedStepId={selectedStepId}
                onSelectStep={handleSelectStep}
              />
            </div>

            {/* Step list below graph */}
            <div className="mt-4 space-y-2">
              {projection.steps.map((step) => (
                <button
                  type="button"
                  key={step.id}
                  onClick={() => handleSelectStep(step.step_key)}
                  className={cn(
                    'w-full rounded-[20px] border px-3 py-3 text-left transition-colors',
                    selectedStepId === step.step_key
                      ? 'border-[#93C5FD] bg-[#DBEAFE] shadow-[0_10px_24px_rgba(59,130,246,0.18)]'
                      : 'border-white/70 bg-white/75 hover:bg-white dark:border-[#2A3445] dark:bg-[rgba(15,23,42,0.78)] dark:hover:bg-[rgba(30,41,59,0.92)]'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-xs font-semibold text-[#0F172A] dark:text-white">
                      {step.title}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-[10px] font-bold uppercase',
                        step.status === 'completed' && 'text-[#16A34A]',
                        step.status === 'running' && 'text-[#2563EB]',
                        step.status === 'failed' && 'text-[#DC2626]',
                        !['completed', 'running', 'failed'].includes(step.status) &&
                          'text-[#94A3B8]'
                      )}
                    >
                      {step.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                    {step.step_type}
                    {step.agent_name ? ` · ${step.agent_name}` : ''}
                  </div>

                  {/* Interrupt button for running steps */}
                  {isRunning &&
                    step.status === 'running' &&
                    projection.execution_id &&
                    onInterruptStep && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onInterruptStep(projection.execution_id!, step.id);
                        }}
                        className="mt-2 flex items-center gap-1 rounded-full bg-[#FEE2E2] px-2.5 py-1 text-[10px] font-semibold text-[#DC2626] transition-colors hover:bg-[#FECACA]"
                      >
                        <StopIcon className="size-3" weight="bold" />
                        Interrupt
                      </button>
                    )}
                </button>
              ))}
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

                  {projection.state === 'preview_ready' && projection.plan_id && onExecute && (
                    <div className="mt-6">
                      <button
                        type="button"
                        onClick={() => onExecute(projection.plan_id!)}
                        className="flex items-center gap-2 rounded-full bg-[#2563EB] px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1D4ED8]"
                      >
                        <PlayIcon className="size-4" weight="bold" />
                        Execute Plan
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Execution mode */}
            {!isPreview && (
              <>
                {/* Agent selector + controls bar */}
                <div className="flex items-center gap-2 border-b border-[#E2E8F0] px-5 py-3 dark:border-[#243041] md:px-6">
                  {agents.length > 0 && (
                    <AgentSelector
                      agents={agents}
                      selectedAgentId={selectedAgentId}
                      onSelect={setSelectedAgentId}
                    />
                  )}
                  <div className="flex-1" />
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
                </div>

                {/* Selected step info */}
                {selectedStep && (
                  <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3 dark:border-[#243041] dark:bg-[rgba(15,23,42,0.7)] md:px-6">
                    <div className="text-xs font-bold text-[#334155] dark:text-white">
                      {selectedStep.title}
                    </div>
                    <div className="text-[10px] text-[#64748B] dark:text-[#94A3B8]">
                      {selectedStep.step_type} · {selectedStep.status}
                      {selectedStep.agent_name ? ` · ${selectedStep.agent_name}` : ''}
                    </div>
                    {selectedStep.summary_text && (
                      <div className="mt-1 text-xs text-[#475569] dark:text-[#CBD5E1]">
                        {selectedStep.summary_text}
                      </div>
                    )}
                  </div>
                )}

                {/* Transcript area */}
                <div className="flex-1 overflow-auto px-5 py-4 md:px-6">
                  {filteredTranscript.length === 0 ? (
                    <div className="flex h-full min-h-[240px] items-center justify-center rounded-[24px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-sm text-[#94A3B8] dark:border-[#334155] dark:bg-[rgba(15,23,42,0.45)]">
                      {selectedStepId || selectedAgentId
                        ? 'No messages matching filter'
                        : 'Waiting for execution messages...'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredTranscript.map((entry) => {
                        if (entry.entry_type === 'approval_request') {
                          const meta = parseTranscriptMeta(entry.meta_json);
                          const resolved = meta?.resolved === true;
                          return (
                            <ApprovalCard
                              key={entry.id}
                              title={entry.content}
                              description={typeof meta?.description === 'string' ? meta.description : undefined}
                              stepId={entry.id}
                              onApprove={(id) => onApproval?.('approved', id)}
                              onReject={(id) => onApproval?.('rejected', id)}
                              disabled={resolved || !onApproval || pendingTranscriptId === entry.id}
                            />
                          );
                        }
                        if (entry.entry_type === 'permission_request') {
                          const meta = parseTranscriptMeta(entry.meta_json);
                          const resolved = meta?.resolved === true;
                          return (
                            <PermissionRequestCard
                              key={entry.id}
                              title={entry.content}
                              description={typeof meta?.description === 'string' ? meta.description : undefined}
                              stepId={entry.id}
                              onGrant={(id) => onApproval?.('granted', id)}
                              onDeny={(id) => onApproval?.('denied', id)}
                              disabled={resolved || !onApproval || pendingTranscriptId === entry.id}
                            />
                          );
                        }
                        if (entry.entry_type === 'continue_confirmation') {
                          const resolved =
                            parseTranscriptMeta(entry.meta_json)?.resolved === true;
                          return (
                            <ContinueConfirmationCard
                              key={entry.id}
                              message={entry.content}
                              stepId={entry.id}
                              onContinue={(id) => onApproval?.('continued', id)}
                              disabled={resolved || !onApproval || pendingTranscriptId === entry.id}
                            />
                          );
                        }
                        if (entry.entry_type === 'input_request') {
                          const meta = parseTranscriptMeta(entry.meta_json);
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
                              stepId={entry.id}
                              onSubmit={(id, inputText) =>
                                onApproval?.('submitted', id, inputText)
                              }
                              disabled={resolved || !onApproval || pendingTranscriptId === entry.id}
                            />
                          );
                        }
                        return (
                          <div
                            key={entry.id}
                            className={cn(
                              'rounded-xl px-3 py-2 text-xs',
                              entry.message_type === 'system' &&
                                'bg-[#F1F5F9] text-[#64748B]',
                              entry.message_type === 'agent' &&
                                'bg-[#EFF6FF] text-[#1E40AF]',
                              entry.message_type === 'control' &&
                                'bg-[#FEF3C7] text-[#92400E]',
                              entry.message_type === 'user' &&
                                'bg-[#F0FDF4] text-[#166534]'
                            )}
                          >
                            {entry.agent_name && (
                              <span className="font-bold">{entry.agent_name}: </span>
                            )}
                            {entry.content}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Status bar */}
                <div className="border-t border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3 text-xs text-[#64748B] dark:border-[#243041] dark:bg-[rgba(15,23,42,0.7)] dark:text-[#94A3B8] md:px-6">
                  {projection.completed_step_count}/{projection.total_step_count} steps completed
                  {projection.error_message && (
                    <span className="ml-2 text-[#DC2626]">{projection.error_message}</span>
                  )}
                  {projection.result_summary && (
                    <span className="ml-2 text-[#16A34A]">{projection.result_summary}</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
