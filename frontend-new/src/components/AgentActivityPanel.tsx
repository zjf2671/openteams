import React, { useEffect, useRef, useState } from "react";
import { Loader2, Terminal, ChevronRight } from "lucide-react";
import { ScrollArea } from "@/components/ScrollArea";
import type { ActivityLoadState, ChatRunActivityLine } from "@/types";

interface AgentActivityPanelLabels {
  loading: string;
  cleaned: string;
  error: string;
  empty: string;
}

interface AgentActivityPanelProps {
  lines?: ChatRunActivityLine[];
  state?: ActivityLoadState;
  labels: AgentActivityPanelLabels;
}

const LineItem: React.FC<{ line: ChatRunActivityLine }> = ({ line }) => {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const updateOverflow = () => {
      setOverflows(
        el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight,
      );
    };
    updateOverflow();
    const frame = window.requestAnimationFrame(updateOverflow);
    return () => window.cancelAnimationFrame(frame);
  }, [line.content]);

  const isTool = line.line_type === "tool";
  const isError = line.line_type === "error";

  const textColor = isError ? "text-rose-500/80" : "text-[var(--ink)]";
  const rowClass =
    "group flex w-full min-w-0 items-start gap-2 rounded-sm px-1 py-1 text-left text-[12px] leading-[1.5] transition hover:bg-[var(--surface-1)]/70";
  const collapsedClass = "line-clamp-1 break-all";
  const expandedClass = "whitespace-pre-wrap break-words";

  if (isTool) {
    return (
      <button
        type="button"
        className={rowClass}
        data-line-type={line.line_type}
        onClick={() => overflows && setExpanded((v) => !v)}
        aria-expanded={overflows ? expanded : undefined}
      >
        <Terminal className="mt-[3px] h-3 w-3 shrink-0 text-[var(--ink-tertiary)]" />
        <span
          ref={textRef}
          className={`min-w-0 flex-1 font-mono text-[12px] text-[var(--ink-tertiary)] ${
            expanded ? expandedClass : collapsedClass
          }`}
        >
          {line.content}
        </span>
        {overflows && (
          <ChevronRight
            className={`mt-[3px] h-3 w-3 shrink-0 text-[var(--ink-tertiary)] opacity-0 transition group-hover:opacity-100 ${
              expanded ? "rotate-90 opacity-100" : ""
            }`}
          />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={rowClass}
      data-line-type={line.line_type}
      onClick={() => overflows && setExpanded((v) => !v)}
      aria-expanded={overflows ? expanded : undefined}
    >
      <span
        ref={textRef}
        className={`min-w-0 flex-1 font-mono text-[12px] ${textColor} ${
          expanded ? expandedClass : collapsedClass
        }`}
      >
        {line.content}
      </span>
      {overflows && (
        <ChevronRight
          className={`mt-[3px] h-3 w-3 shrink-0 text-[var(--ink-tertiary)] opacity-0 transition group-hover:opacity-100 ${
            expanded ? "rotate-90 opacity-100" : ""
          }`}
        />
      )}
    </button>
  );
};

export const AgentActivityPanel: React.FC<AgentActivityPanelProps> = ({
  lines = [],
  state = "idle",
  labels,
}) => {
  const showLoading = state === "loading";
  const showPruned = state === "pruned";
  const showError = state === "error";
  const showEmpty =
    !showLoading && !showPruned && !showError && lines.length === 0;

  if (showEmpty) return null;

  return (
    <div className="mt-1 max-h-[480px] overflow-hidden text-[12px] leading-[1.5]">
      {showLoading ? (
        <div className="flex items-center gap-2 py-1 text-[12px] text-[var(--ink-tertiary)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="font-mono">{labels.loading}</span>
        </div>
      ) : showPruned ? (
        <div className="py-1 font-mono text-[12px] text-[var(--ink-tertiary)]">
          {labels.cleaned}
        </div>
      ) : showError ? (
        <div className="py-1 font-mono text-[12px] text-rose-500/80">
          {labels.error}
        </div>
      ) : (
        <ScrollArea
          className="agent-activity-scrollbar max-h-[480px] pr-1"
          scrollbar="styled"
        >
          <div className="space-y-0.5 py-0.5">
            {lines.map((line) => (
              <LineItem key={line.line_id} line={line} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};
