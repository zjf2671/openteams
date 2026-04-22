import { useMemo } from 'react';
import { ArrowClockwiseIcon, RobotIcon, SparkleIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

type WorkflowGraphStep = {
  id: string;
  step_key: string;
  title: string;
  step_type: string;
  status: string;
  agent_name?: string | null;
  summary_text?: string | null;
};

type WorkflowGraphNode = {
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

type WorkflowGraphEdge = {
  id: string;
  source: string;
  target: string;
};

type WorkflowGraphBoardProps = {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  steps: WorkflowGraphStep[];
  selectedStepId?: string | null;
  onSelectStep?: (id: string) => void;
  onRetryStep?: (stepId: string) => void;
  compact?: boolean;
  className?: string;
};

type LayoutNode = WorkflowGraphNode & {
  step?: WorkflowGraphStep;
  x: number;
  y: number;
  rank: number;
  order: number;
};

function statusTone(status?: string | null, selected?: boolean) {
  const base = (() => {
    switch (status) {
      case 'completed':
        return {
          badge: 'bg-[#DCFCE7] text-[#166534]',
          border: '#16A34A',
          accent: 'rgba(34,197,94,0.18)',
          glow: 'shadow-[0_20px_40px_rgba(34,197,94,0.10)]',
        };
      case 'running':
        return {
          badge: 'bg-[#DBEAFE] text-[#1D4ED8]',
          border: '#2563EB',
          accent: 'rgba(59,130,246,0.18)',
          glow: 'shadow-[0_20px_40px_rgba(37,99,235,0.14)]',
        };
      case 'failed':
      case 'interrupted':
        return {
          badge: 'bg-[#FEE2E2] text-[#991B1B]',
          border: '#DC2626',
          accent: 'rgba(239,68,68,0.18)',
          glow: 'shadow-[0_20px_40px_rgba(220,38,38,0.12)]',
        };
      case 'ready':
        return {
          badge: 'bg-[#FEF3C7] text-[#92400E]',
          border: '#D97706',
          accent: 'rgba(245,158,11,0.16)',
          glow: 'shadow-[0_20px_40px_rgba(217,119,6,0.12)]',
        };
      case 'waiting_input':
      case 'waiting_review':
        return {
          badge: 'bg-[#E0E7FF] text-[#4338CA]',
          border: '#6366F1',
          accent: 'rgba(99,102,241,0.16)',
          glow: 'shadow-[0_20px_40px_rgba(99,102,241,0.12)]',
        };
      default:
        return {
          badge: 'bg-[#E2E8F0] text-[#334155]',
          border: '#CBD5E1',
          accent: 'rgba(148,163,184,0.14)',
          glow: 'shadow-[0_16px_34px_rgba(15,23,42,0.08)]',
        };
    }
  })();

  return {
    ...base,
    border: selected ? '#1D4ED8' : base.border,
  };
}

function layoutGraph(
  nodes: WorkflowGraphNode[],
  edges: WorkflowGraphEdge[],
  steps: WorkflowGraphStep[],
  compact: boolean
) {
  if (nodes.length === 0) {
    return null;
  }

  const cardWidth = compact ? 212 : 232;
  const cardHeight = compact ? 138 : 156;
  const horizontalGap = compact ? 56 : 72;
  const verticalGap = compact ? 24 : 30;
  const paddingX = compact ? 28 : 40;
  const paddingY = compact ? 28 : 40;

  const sortedNodes = [...nodes].sort(
    (left, right) =>
      left.position.x - right.position.x ||
      left.position.y - right.position.y ||
      left.id.localeCompare(right.id)
  );
  const originalOrder = new Map(sortedNodes.map((node, index) => [node.id, index]));
  const stepByKey = new Map(steps.map((step) => [step.step_key, step]));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const node of sortedNodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
    indegree.set(node.id, 0);
  }

  for (const edge of edges) {
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) {
      continue;
    }
    outgoing.get(edge.source)?.push(edge.target);
    incoming.get(edge.target)?.push(edge.source);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const queue = sortedNodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  queue.sort((left, right) => (originalOrder.get(left) ?? 0) - (originalOrder.get(right) ?? 0));

  const topo: string[] = [];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }
    topo.push(currentId);
    for (const targetId of outgoing.get(currentId) ?? []) {
      const nextIndegree = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(targetId);
        queue.sort(
          (left, right) => (originalOrder.get(left) ?? 0) - (originalOrder.get(right) ?? 0)
        );
      }
    }
  }

  for (const node of sortedNodes) {
    if (!topo.includes(node.id)) {
      topo.push(node.id);
    }
  }

  const rankById = new Map<string, number>();
  for (const nodeId of topo) {
    const rank = Math.max(
      0,
      ...(incoming.get(nodeId) ?? []).map(
        (sourceId) => (rankById.get(sourceId) ?? 0) + 1
      )
    );
    rankById.set(nodeId, rank);
  }

  const groups = new Map<number, string[]>();
  for (const nodeId of topo) {
    const rank = rankById.get(nodeId) ?? 0;
    const group = groups.get(rank) ?? [];
    group.push(nodeId);
    groups.set(rank, group);
  }

  const orderById = new Map<string, number>();
  const ranks = [...groups.keys()].sort((left, right) => left - right);
  for (const rank of ranks) {
    const group = [...(groups.get(rank) ?? [])];
    group.sort((left, right) => {
      const leftIncoming = incoming.get(left) ?? [];
      const rightIncoming = incoming.get(right) ?? [];
      const leftScore =
        leftIncoming.length > 0
          ? leftIncoming.reduce((sum, item) => sum + (orderById.get(item) ?? 0), 0) /
            leftIncoming.length
          : originalOrder.get(left) ?? 0;
      const rightScore =
        rightIncoming.length > 0
          ? rightIncoming.reduce((sum, item) => sum + (orderById.get(item) ?? 0), 0) /
            rightIncoming.length
          : originalOrder.get(right) ?? 0;

      return leftScore - rightScore || (originalOrder.get(left) ?? 0) - (originalOrder.get(right) ?? 0);
    });

    group.forEach((nodeId, index) => {
      orderById.set(nodeId, index);
    });
    groups.set(rank, group);
  }

  const maxRankSize = Math.max(...[...groups.values()].map((group) => group.length));
  const totalHeight = paddingY * 2 + maxRankSize * cardHeight + Math.max(maxRankSize - 1, 0) * verticalGap;

  const layoutNodes: LayoutNode[] = topo.map((nodeId) => {
    const node = sortedNodes.find((item) => item.id === nodeId)!;
    const rank = rankById.get(nodeId) ?? 0;
    const group = groups.get(rank) ?? [];
    const order = group.indexOf(nodeId);
    const groupHeight = group.length * cardHeight + Math.max(group.length - 1, 0) * verticalGap;
    const topOffset = paddingY + (totalHeight - paddingY * 2 - groupHeight) / 2;

    return {
      ...node,
      step: stepByKey.get(node.id),
      rank,
      order,
      x: paddingX + rank * (cardWidth + horizontalGap),
      y: topOffset + order * (cardHeight + verticalGap),
    };
  });

  const maxRank = Math.max(...layoutNodes.map((node) => node.rank));
  const totalWidth = paddingX * 2 + (maxRank + 1) * cardWidth + maxRank * horizontalGap;

  return {
    nodes: layoutNodes,
    width: totalWidth,
    height: totalHeight,
    cardWidth,
    cardHeight,
  };
}

export function WorkflowGraphBoard({
  nodes,
  edges,
  steps,
  selectedStepId = null,
  onSelectStep,
  onRetryStep,
  compact = false,
  className,
}: WorkflowGraphBoardProps) {
  const layout = useMemo(
    () => layoutGraph(nodes, edges, steps, compact),
    [compact, edges, nodes, steps]
  );

  if (!layout) {
    return null;
  }

  const nodeById = new Map(layout.nodes.map((node) => [node.id, node]));

  return (
    <div
      className={cn(
        'overflow-auto rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(241,245,249,0.92)_100%)] p-4 dark:border-[#243041] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.88)_0%,rgba(11,16,23,0.94)_100%)]',
        className
      )}
    >
      <div
        className="relative"
        style={{ width: layout.width, height: layout.height }}
      >
        <svg
          className="pointer-events-none absolute inset-0"
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
        >
          <defs>
            <linearGradient id="workflow-edge-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#94A3B8" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#CBD5E1" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          {edges.map((edge) => {
            const source = nodeById.get(edge.source);
            const target = nodeById.get(edge.target);
            if (!source || !target) {
              return null;
            }

            const x1 = source.x + layout.cardWidth;
            const y1 = source.y + layout.cardHeight / 2;
            const x2 = target.x;
            const y2 = target.y + layout.cardHeight / 2;
            const controlOffset = Math.max((x2 - x1) / 2, compact ? 36 : 48);

            return (
              <path
                key={edge.id}
                d={`M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="url(#workflow-edge-gradient)"
                strokeWidth={compact ? '2' : '2.5'}
                strokeDasharray={compact ? '6 5' : '7 6'}
              />
            );
          })}
        </svg>

        {layout.nodes.map((node) => {
          const step = node.step;
          const tone = statusTone(step?.status ?? node.data.status, node.id === selectedStepId);
          const summary = step?.summary_text?.trim() || 'Summary pending';
          const agentName = step?.agent_name?.trim() || 'Lead';
          const showRetry = step?.status === 'failed' && !!onRetryStep;

          return (
            <div
              key={node.id}
              role={onSelectStep ? 'button' : undefined}
              tabIndex={onSelectStep ? 0 : -1}
              onClick={() => onSelectStep?.(node.id)}
              onKeyDown={(event) => {
                if (!onSelectStep) {
                  return;
                }
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectStep(node.id);
                }
              }}
              className={cn(
                'absolute flex flex-col rounded-[26px] border bg-white/92 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-white dark:bg-[rgba(15,23,42,0.92)] dark:hover:bg-[rgba(15,23,42,0.98)]',
                compact ? 'h-[138px] w-[212px] p-3.5' : 'h-[156px] w-[232px] p-4',
                onSelectStep && 'cursor-pointer',
                tone.glow,
                node.id === selectedStepId && 'ring-2 ring-[#60A5FA]/70'
              )}
              style={{
                left: node.x,
                top: node.y,
                borderColor: tone.border,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.7), 0 0 0 1px ${tone.accent}`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#94A3B8]">
                    {step?.step_type ?? node.data.stepType}
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-[#0F172A] dark:text-white">
                    {step?.title ?? node.data.title}
                  </div>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]',
                    tone.badge
                  )}
                >
                  {step?.status ?? node.data.status ?? 'pending'}
                </span>
              </div>

              <div className={cn('mt-3 text-xs leading-5 text-[#475569] dark:text-[#CBD5E1]', compact ? 'line-clamp-3' : 'line-clamp-4')}>
                {summary}
              </div>

              <div className="mt-auto flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[#94A3B8]">
                    <RobotIcon className="size-3" weight="fill" />
                    Agent
                  </div>
                  <div className="truncate text-xs font-semibold text-[#0F172A] dark:text-white">
                    {agentName}
                  </div>
                </div>

                {showRetry ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!step) {
                        return;
                      }
                      onRetryStep(step.id);
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-[#991B1B] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-[#7F1D1D]"
                  >
                    <ArrowClockwiseIcon className="size-3" weight="bold" />
                    Retry
                  </button>
                ) : (
                  <div className="inline-flex items-center gap-1 rounded-full bg-[#F8FAFC] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[#64748B] dark:bg-[rgba(30,41,59,0.88)] dark:text-[#CBD5E1]">
                    <SparkleIcon className="size-3" weight="fill" />
                    {node.id === selectedStepId ? 'Focused' : 'Open'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
