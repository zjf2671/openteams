import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useLayoutEffect,
} from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  Plus,
  ArrowUp,
  Mic,
  AtSign,
  PanelRightClose,
  PanelRightOpen,
  ChevronsLeft,
} from "lucide-react";
import { ResourceStateNotice } from "@/components/ResourceState";
import { ScrollArea } from "@/components/ScrollArea";
import { AgentMessageContent } from "@/components/AgentMessageContent";
import { mockFrontendApi } from "@/lib/mockFrontendApi";
import { mockSessionWorkspaceChanges } from "@/mockSessionWorkspaceChanges";

interface FreeChatWorkspaceProps {
  embedded?: boolean;
}

type RelatedFileStatus = "M" | "A" | "D";

interface RelatedFileChange {
  path: string;
  status: RelatedFileStatus;
  additions?: number;
  deletions?: number;
}

const statusTextTone: Record<RelatedFileStatus, string> = {
  M: "text-amber-600",
  A: "text-emerald-600",
  D: "text-rose-500",
};

const getSessionFileChanges = (sessionId: string): RelatedFileChange[] => {
  const fallbackSessionId = "sess-1";
  const response =
    mockSessionWorkspaceChanges[sessionId] ??
    mockSessionWorkspaceChanges[fallbackSessionId];
  const changes = response?.changes;

  if (!changes) return [];

  return [
    ...changes.modified.map((file) => ({
      path: file.path,
      status: "M" as const,
      additions: file.additions,
      deletions: file.deletions,
    })),
    ...changes.added.map((file) => ({
      path: file.path,
      status: "A" as const,
      additions: file.additions,
      deletions: file.deletions,
    })),
    ...changes.untracked.map((file) => ({
      path: file.path,
      status: "A" as const,
    })),
    ...changes.deleted.map((file) => ({
      path: file.path,
      status: "D" as const,
    })),
  ];
};

const hasLineStat = (value?: number) => typeof value === "number" && value > 0;

interface TruncatedFileNameProps {
  path: string;
}

const TruncatedFileName: React.FC<TruncatedFileNameProps> = ({ path }) => {
  const textRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) return;

    const updateTruncation = () => {
      const nextIsTruncated = element.scrollWidth > element.clientWidth;
      setIsTruncated((current) =>
        current === nextIsTruncated ? current : nextIsTruncated,
      );
    };

    updateTruncation();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateTruncation);
      return () => window.removeEventListener("resize", updateTruncation);
    }

    const observer = new ResizeObserver(updateTruncation);
    observer.observe(element);
    return () => observer.disconnect();
  }, [path]);

  return (
    <span
      ref={textRef}
      className="min-w-0 flex-1 truncate font-mono text-[13px] text-[var(--ink)]"
      title={isTruncated ? path : undefined}
    >
      {path}
    </span>
  );
};

const RELATED_FILES_DEFAULT_WIDTH = 240;
const RELATED_FILES_MIN_WIDTH = 200;
const RELATED_FILES_MAX_WIDTH = 360;
const RELATED_FILES_MIN_CENTER_WIDTH = 540;
const RELATED_FILES_SEPARATOR_WIDTH = 6;
const SIDEBAR_MEMBER_AVATAR_WIDTH = 28;
const SIDEBAR_MEMBER_GAP = 6;
const SIDEBAR_MEMBER_OVERFLOW_CONTROLS_WIDTH =
  SIDEBAR_MEMBER_AVATAR_WIDTH * 2 + SIDEBAR_MEMBER_GAP;
const SIDEBAR_MEMBER_COLLAPSED_MIN_VISIBLE = 5;

const getVisibleSidebarMemberCount = (
  memberCount: number,
  railWidth: number,
) => {
  if (memberCount === 0) return 0;

  const fullWidth =
    memberCount * SIDEBAR_MEMBER_AVATAR_WIDTH +
    Math.max(0, memberCount - 1) * SIDEBAR_MEMBER_GAP;

  if (railWidth <= 0) {
    return Math.min(SIDEBAR_MEMBER_COLLAPSED_MIN_VISIBLE, memberCount);
  }
  if (fullWidth <= railWidth) return memberCount;

  const availableWidth = Math.max(
    0,
    railWidth - SIDEBAR_MEMBER_OVERFLOW_CONTROLS_WIDTH - SIDEBAR_MEMBER_GAP,
  );
  const visibleCount = Math.floor(
    (availableWidth + SIDEBAR_MEMBER_GAP) /
      (SIDEBAR_MEMBER_AVATAR_WIDTH + SIDEBAR_MEMBER_GAP),
  );

  return Math.max(
    Math.min(SIDEBAR_MEMBER_COLLAPSED_MIN_VISIBLE, memberCount - 1),
    Math.min(memberCount - 1, visibleCount),
  );
};

export const FreeChatWorkspace: React.FC<FreeChatWorkspaceProps> = ({
  embedded = false,
}) => {
  const {
    t,
    activeSessionId,
    messages,
    sendMessage,
    members,
    showToast,
    setTasks,
    sessionsAsync,
    refreshSessions,
    messagesAsync,
    refreshMessages,
    membersAsync,
    refreshMembers,
    workflowCardAsync,
    chatMessageFontSize,
  } = useWorkspace();

  const [inputText, setInputText] = useState("");
  const [isMemberPickerOpen, setIsMemberPickerOpen] = useState(false);
  const [isRelatedFilesOpen, setIsRelatedFilesOpen] = useState(true);
  const [wasRelatedFilesAutoCollapsed, setWasRelatedFilesAutoCollapsed] =
    useState(false);
  const [isMemberRailExpanded, setIsMemberRailExpanded] = useState(false);
  const [memberRailWidth, setMemberRailWidth] = useState(0);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const [relatedFilesWidth, setRelatedFilesWidth] = useState(
    RELATED_FILES_DEFAULT_WIDTH,
  );
  const workspaceGridRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const memberRailRef = useRef<HTMLDivElement>(null);
  const relatedFileChanges = useMemo(
    () => getSessionFileChanges(activeSessionId),
    [activeSessionId],
  );
  const sidebarMembers = members;
  const visibleSidebarMemberCount = getVisibleSidebarMemberCount(
    sidebarMembers.length,
    memberRailWidth,
  );
  const hasSidebarMemberOverflow =
    visibleSidebarMemberCount < sidebarMembers.length;
  const displayedSidebarMembers = isMemberRailExpanded
    ? sidebarMembers
    : sidebarMembers.slice(0, visibleSidebarMemberCount);
  const canFitRelatedFiles =
    workspaceWidth === 0 ||
    workspaceWidth >=
      RELATED_FILES_MIN_CENTER_WIDTH +
        RELATED_FILES_SEPARATOR_WIDTH +
        RELATED_FILES_MIN_WIDTH;
  const relatedFilesMaxAvailableWidth =
    workspaceWidth > 0
      ? Math.min(
          RELATED_FILES_MAX_WIDTH,
          Math.max(
            RELATED_FILES_MIN_WIDTH,
            workspaceWidth -
              RELATED_FILES_SEPARATOR_WIDTH -
              RELATED_FILES_MIN_CENTER_WIDTH,
          ),
        )
      : RELATED_FILES_DEFAULT_WIDTH;
  const effectiveRelatedFilesWidth = Math.min(
    relatedFilesWidth,
    relatedFilesMaxAvailableWidth,
  );

  const openRelatedFiles = () => {
    setWasRelatedFilesAutoCollapsed(false);
    setIsRelatedFilesOpen(true);
  };

  const closeRelatedFiles = () => {
    setWasRelatedFilesAutoCollapsed(false);
    setIsRelatedFilesOpen(false);
  };

  useLayoutEffect(() => {
    const element = workspaceGridRef.current;
    if (!element) return;

    const updateWorkspaceWidth = () => setWorkspaceWidth(element.clientWidth);
    updateWorkspaceWidth();
    const frameId =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame(updateWorkspaceWidth)
        : undefined;

    const cancelMeasureFrame = () => {
      if (
        frameId !== undefined &&
        typeof window.cancelAnimationFrame === "function"
      ) {
        window.cancelAnimationFrame(frameId);
      }
    };

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWorkspaceWidth);
      return () => {
        cancelMeasureFrame();
        window.removeEventListener("resize", updateWorkspaceWidth);
      };
    }

    const observer = new ResizeObserver(updateWorkspaceWidth);
    observer.observe(element);
    return () => {
      cancelMeasureFrame();
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (workspaceWidth === 0) return;

    if (!canFitRelatedFiles) {
      if (isRelatedFilesOpen) {
        setIsRelatedFilesOpen(false);
      }
      setWasRelatedFilesAutoCollapsed(true);
      return;
    }

    if (wasRelatedFilesAutoCollapsed) {
      if (!isRelatedFilesOpen) {
        setIsRelatedFilesOpen(true);
      }
      setWasRelatedFilesAutoCollapsed(false);
    }
  }, [
    canFitRelatedFiles,
    isRelatedFilesOpen,
    wasRelatedFilesAutoCollapsed,
    workspaceWidth,
  ]);

  useLayoutEffect(() => {
    if (!isRelatedFilesOpen) return;

    const element = memberRailRef.current;
    if (!element) return;

    const updateWidth = () => setMemberRailWidth(element.clientWidth);
    updateWidth();
    const frameId =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame(updateWidth)
        : undefined;

    const cancelMeasureFrame = () => {
      if (
        frameId !== undefined &&
        typeof window.cancelAnimationFrame === "function"
      ) {
        window.cancelAnimationFrame(frameId);
      }
    };

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => {
        cancelMeasureFrame();
        window.removeEventListener("resize", updateWidth);
      };
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => {
      cancelMeasureFrame();
      observer.disconnect();
    };
  }, [isRelatedFilesOpen]);

  useEffect(() => {
    if (!hasSidebarMemberOverflow && isMemberRailExpanded) {
      setIsMemberRailExpanded(false);
    }
  }, [hasSidebarMemberOverflow, isMemberRailExpanded]);

  // Auto scroll messages to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    sendMessage(inputText);
    setInputText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Convert chat context through the local mock API workflow preset.
  const handleTurnIntoWorkflow = () => {
    void mockFrontendApi.getWorkflowPreset("chat").then((preset) => {
      if (!preset) return;
      setTasks(preset.tasks);
      showToast(t("turnWorkflowSuccess"));
    });
  };

  // Quick summon clicks
  const handleQuickAddClick = (handle: string) => {
    setInputText((prev) => {
      const space = prev.endsWith(" ") || prev === "" ? "" : " ";
      return `${prev}${space}${handle} `;
    });
    inputRef.current?.focus();
  };

  const handleRelatedFileClick = (path: string) => {
    showToast(t("diffPreviewToast", { path }));
  };

  const handleRelatedFilesResizeStart = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = effectiveRelatedFilesWidth;
    const originalCursor = document.body.style.cursor;
    const originalUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const nextWidth = Math.min(
        relatedFilesMaxAvailableWidth,
        Math.max(RELATED_FILES_MIN_WIDTH, startWidth + delta),
      );
      setRelatedFilesWidth(nextWidth);
    };

    const handleMouseUp = () => {
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalUserSelect;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const mentionedMemberNames = new Set(
    (inputText.match(/@[a-zA-Z0-9_-]+/g) || []).map((mention) =>
      mention.toLowerCase(),
    ),
  );
  const mentionedMembers = members.filter((member) =>
    mentionedMemberNames.has(member.name.toLowerCase()),
  );

  const formatMessageTime = (time: string) => {
    if (time === "just now") return t("justNow");

    const minuteMatch = time.match(/^(\d+)m ago$/);
    if (minuteMatch) {
      return t("minutesAgo", { minutes: minuteMatch[1] });
    }

    const hourMatch = time.match(/^(\d+)h ago$/);
    if (hourMatch) {
      return t("hoursAgo", { hours: hourMatch[1] });
    }

    return time;
  };

  // Parse @mentions or `code` formatted blocks inside messages for beautiful styling
  const formatMsgText = (text: string) => {
    if (!text) return "";
    const elements = text.split(/(`[^`]+`|@[a-zA-Z0-9_-]+)/g);

    return elements.map((el, idx) => {
      if (el.startsWith("`") && el.endsWith("`")) {
        return (
          <code
            key={idx}
            className="bg-[var(--mono-bg)] border border-[var(--mono-border)] px-1.5 py-0.5 rounded text-[0.95em] font-mono font-medium text-[var(--ink)] mx-1 select-all"
          >
            {el.substring(1, el.length - 1)}
          </code>
        );
      }
      if (el.startsWith("@")) {
        return (
          <span
            key={idx}
            className="text-[var(--primary)] hover:text-[var(--primary-hover)] font-semibold font-mono mx-0.5"
          >
            {el}
          </span>
        );
      }
      return <span key={idx}>{el}</span>;
    });
  };

  return (
    <div
      className={
        embedded
          ? "relative h-full w-full flex flex-col font-sans text-xs select-none"
          : "relative rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] overflow-hidden font-sans text-xs select-none"
      }
    >
      <div
        style={
          isRelatedFilesOpen
            ? ({
                "--related-files-width": `${effectiveRelatedFilesWidth}px`,
              } as React.CSSProperties)
            : undefined
        }
        ref={workspaceGridRef}
        className={
          isRelatedFilesOpen
            ? embedded
              ? "grid h-full w-full min-h-0 grid-cols-[minmax(0,1fr)_6px_var(--related-files-width)] grid-rows-1 gap-0"
              : "grid min-h-[500px] w-full grid-cols-[minmax(0,1fr)_6px_var(--related-files-width)] gap-0"
            : embedded
              ? "grid h-full w-full min-h-0 grid-cols-1"
              : "grid min-h-[500px] w-full grid-cols-1"
        }
      >
        {/* Center Panel (Conversation) */}
        <main
          className={`relative flex h-full min-h-0 w-full min-w-0 flex-col p-4 ${
            embedded ? "bg-transparent" : "bg-[var(--canvas)]"
          }`}
        >
          {!isRelatedFilesOpen && (
            <button
              type="button"
              onClick={openRelatedFiles}
              className="absolute top-1 right-1 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] text-[var(--ink-subtle)] shadow-sm transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
              title={t("relatedFiles.show")}
              aria-label={t("relatedFiles.show")}
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          )}
          <div
            className={`mb-3 space-y-2 ${!isRelatedFilesOpen ? "pr-10" : ""}`}
          >
            <ResourceStateNotice
              resource={sessionsAsync}
              labels={{
                loading: t("resource.sessions.loading"),
                empty: t("resource.sessions.empty"),
                error: t("resource.sessions.error"),
                fallback: t("resource.sessions.fallback"),
              }}
              onRetry={() => void refreshSessions()}
              compact
            />
          </div>

          {/* Messages Feed */}
          <ScrollArea className="mb-4 flex-1 space-y-4 pr-1">
            <ResourceStateNotice
              resource={messagesAsync}
              labels={{
                loading: t("resource.messages.loading"),
                empty: t("resource.messages.empty"),
                error: t("resource.messages.error"),
                fallback: t("resource.messages.fallback"),
              }}
              onRetry={() => void refreshMessages()}
            />
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 items-start rounded-md ${
                  msg.isUser
                    ? "border border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-2.5"
                    : "px-1 py-2"
                }`}
              >
                {msg.isUser ? (
                  <span className="h-7 w-7 rounded-full bg-[var(--primary)] text-white font-bold flex items-center justify-center text-[9px] font-mono border border-[var(--primary)] flex-shrink-0">
                    {t("youShort")}
                  </span>
                ) : (
                  <span className="h-7 w-7 rounded-full bg-[var(--mono-bg)] border border-[var(--mono-border)] flex items-center justify-center text-[9px] font-mono font-bold text-[var(--ink-muted)] flex-shrink-0">
                    {msg.avatar}
                  </span>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[11px] font-semibold text-[var(--ink)]">
                      {msg.isUser ? t("you") : msg.sender}
                    </span>
                    {msg.model && (
                      <span className="rounded-full bg-[var(--surface-3)] border border-[var(--hairline-strong)] px-2 py-0.5 text-[9px] font-mono text-[var(--ink-muted)] shrink-0 select-text">
                        {msg.model}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-[var(--ink-tertiary)] ml-auto">
                      {formatMessageTime(msg.time)}
                    </span>
                  </div>

                  {msg.isUser ? (
                    <div
                      className="leading-relaxed text-[var(--ink)] select-text"
                      style={{ fontSize: `${chatMessageFontSize}px` }}
                    >
                      {formatMsgText(msg.text)}
                    </div>
                  ) : (
                    <AgentMessageContent
                      message={msg}
                      t={t}
                      messageFontSize={chatMessageFontSize}
                    />
                  )}

                  {msg.cost && (
                    <div className="mt-1 text-[10px] font-mono text-[var(--ink-tertiary)]">
                      {msg.cost}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </ScrollArea>

          {/* Chat discussion input styled in GPT-4 style with space */}
          <div className="shrink-0 pt-4 pb-0">
            <div
              onClick={() => inputRef.current?.focus()}
              className="relative rounded-md border border-[var(--hairline-strong)] bg-[var(--surface-1)] focus-within:border-[var(--primary)] p-3.5 transition-all flex flex-col gap-3 min-h-[95px]"
            >
              {/* Text Area */}
              <textarea
                ref={inputRef}
                rows={1}
                className="w-full bg-transparent resize-none border-none text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-tertiary)] select-text flex-1 min-h-[30px]"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                placeholder={t("discussPlaceholder")}
              />

              {/* Bottom control row inside input slot */}
              <div className="flex flex-wrap items-center justify-between pt-1 shrink-0 gap-2 select-none">
                {/* Switch to workflow/Turn into workflow on the left */}
                <div className="flex items-center gap-1.5">
                  {/* Plus symbol */}
                  <button
                    type="button"
                    onClick={() => showToast(t("toast.attachmentReady"))}
                    className="p-1 rounded-full hover:bg-[var(--surface-3)] text-[var(--ink-subtle)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                    title={t("uploadFile")}
                  >
                    <Plus className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleTurnIntoWorkflow}
                    className="flex items-center gap-1 bg-[var(--surface-2)] border border-[var(--hairline)] hover:bg-[var(--surface-3)] px-2.5 py-1.5 rounded-md text-[11px] text-[var(--ink-muted)] font-medium transition cursor-pointer"
                    title={t("generateWorkflowFromChat")}
                  >
                    <span>{t("updatePlan")}</span>
                  </button>
                </div>

                {/* Right controls: session members, voice icon, and send action */}
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMemberPickerOpen((prev) => !prev);
                      }}
                      className="flex items-center gap-1.5 bg-[var(--surface-2)] border border-[var(--hairline)] px-2 py-1 rounded-md text-[11px] text-[var(--ink-muted)] font-mono hover:bg-[var(--surface-3)] cursor-pointer"
                      title={t("inThisSession")}
                    >
                      <AtSign className="h-3.5 w-3.5 text-[var(--ink-tertiary)]" />
                      {mentionedMembers.length > 0 && (
                        <span>
                          {mentionedMembers
                            .map((member) => member.name)
                            .join(", ")}
                        </span>
                      )}
                      <span className="text-[7px] text-[var(--ink-tertiary)] font-bold">
                        ▼
                      </span>
                    </button>

                    {isMemberPickerOpen && (
                      <div className="absolute bottom-full right-0 mb-2 w-56 rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-3)] p-1 z-20">
                        <div className="px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-tertiary)]">
                          {t("inThisSession")}
                        </div>
                        <ResourceStateNotice
                          resource={membersAsync}
                          labels={{
                            loading: t("resource.members.loading"),
                            empty: t("resource.members.empty"),
                            error: t("resource.members.error"),
                            fallback: t("resource.members.fallback"),
                          }}
                          onRetry={() => void refreshMembers()}
                          compact
                          className="mb-1"
                        />
                        {members.length === 0 ? (
                          <div className="px-2 py-2 text-[10px] text-[var(--ink-tertiary)]">
                            {t("noSessionMembers")}
                          </div>
                        ) : (
                          members.map((member) => (
                            <button
                              key={member.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickAddClick(member.name);
                                setIsMemberPickerOpen(false);
                              }}
                              className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--surface-2)] cursor-pointer"
                            >
                              <span className="h-5 w-5 rounded-full bg-[var(--mono-bg)] border border-[var(--mono-border)] flex items-center justify-center text-[8px] font-mono font-semibold text-[var(--ink-muted)]">
                                {member.avatar}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[11px] font-semibold text-[var(--ink)]">
                                  {member.name}
                                </span>
                                <span className="block truncate text-[9px] font-mono text-[var(--ink-tertiary)]">
                                  {member.roleDetail}
                                </span>
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => showToast(t("toast.voiceReady"))}
                    className="p-1 rounded-full hover:bg-[var(--surface-2)] text-[var(--ink-subtle)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                    title={t("voiceInput")}
                  >
                    <Mic className="h-4 w-4" />
                  </button>

                  {/* Send action on the right */}
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!inputText.trim()}
                    className={`p-1.5 rounded-full transition-all flex items-center justify-center shrink-0 ${
                      inputText.trim()
                        ? "bg-[var(--primary)] text-white hover:opacity-95 cursor-pointer hover:scale-105"
                        : "bg-[var(--surface-3)] text-[var(--ink-tertiary)] cursor-not-allowed"
                    }`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>

        {isRelatedFilesOpen && (
          <div
            className="group flex cursor-col-resize items-stretch justify-center"
            role="separator"
            aria-orientation="vertical"
            aria-label={t("relatedFiles.resize")}
            title={t("relatedFiles.resize")}
            onMouseDown={handleRelatedFilesResizeStart}
          >
            <span className="my-2 w-px rounded-full bg-[var(--hairline)] transition-[width,background-color] group-hover:w-1 group-hover:bg-[var(--hairline-tertiary)] group-active:w-1 group-active:bg-[var(--hairline-tertiary)]" />
          </div>
        )}

        {isRelatedFilesOpen && (
          <aside
            className={`relative flex min-h-0 flex-col overflow-hidden border-l border-[var(--hairline)] ${
              embedded ? "bg-transparent" : "bg-[var(--canvas)]"
            }`}
          >
            <button
              type="button"
              onClick={closeRelatedFiles}
              className="absolute right-1 top-0 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] text-[var(--ink-subtle)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
              title={t("relatedFiles.hide")}
              aria-label={t("relatedFiles.hide")}
            >
              <PanelRightClose className="h-4 w-4" />
            </button>

            <div className="shrink-0 px-3 pb-6 pt-2">
              <div className="mb-2 pr-10 text-[14px] font-semibold text-[var(--ink)]">
                {t("sessionMembers")}
              </div>
              <div className="flex h-9 min-w-0 items-start gap-1.5">
                <ScrollArea
                  ref={memberRailRef}
                  orientation="horizontal"
                  scrollbar={isMemberRailExpanded ? "styled" : "hidden"}
                  className={`flex h-9 flex-1 items-start gap-1.5 ${
                    isMemberRailExpanded ? "pb-1" : ""
                  }`}
                >
                  {displayedSidebarMembers.map((member) => (
                    <div
                      key={member.id}
                      className={`group/member flex h-7 w-7 shrink-0 items-center overflow-hidden rounded-full border border-[var(--hairline)] bg-[var(--surface-1)] text-left ${
                        isMemberRailExpanded
                          ? ""
                          : "transition-[width,background-color,border-color] duration-200 hover:w-28 hover:border-[var(--hairline-strong)] hover:bg-[var(--surface-3)] focus-visible:w-28 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)]"
                      }`}
                      title={member.name}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--mono-bg)] font-mono text-[9px] font-semibold text-[var(--ink-muted)]">
                        {member.avatar}
                      </span>
                      {!isMemberRailExpanded && (
                        <span className="min-w-0 max-w-0 truncate pr-2 font-mono text-[10px] font-semibold text-[var(--ink)] opacity-0 transition-[max-width,opacity] duration-200 group-hover/member:max-w-20 group-hover/member:opacity-100 group-focus-visible/member:max-w-20 group-focus-visible/member:opacity-100">
                          {member.name}
                        </span>
                      )}
                    </div>
                  ))}
                  {hasSidebarMemberOverflow && (
                    <button
                      type="button"
                      onClick={() =>
                        setIsMemberRailExpanded((current) => !current)
                      }
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--hairline)] bg-[var(--surface-1)] font-mono text-[11px] font-semibold text-[var(--ink-subtle)] transition hover:border-[var(--hairline-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
                      title={
                        isMemberRailExpanded
                          ? t("memberRail.collapse")
                          : t("memberRail.expand")
                      }
                      aria-label={
                        isMemberRailExpanded
                          ? t("memberRail.collapse")
                          : t("memberRail.expand")
                      }
                    >
                      {isMemberRailExpanded ? (
                        <ChevronsLeft className="h-3.5 w-3.5" />
                      ) : (
                        "..."
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => showToast(t("toast.memberInviteReady"))}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--hairline)] bg-[var(--surface-1)] text-[var(--ink-subtle)] transition hover:border-[var(--hairline-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
                    title={t("inviteMember")}
                    aria-label={t("inviteMember")}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </ScrollArea>
              </div>
            </div>
            <div className="flex h-10 shrink-0 items-center justify-between px-3">
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">
                {t("relatedFiles.title")}
              </h2>
              <span className="rounded-full bg-[var(--surface-3)] px-2 py-0.5 font-mono text-[13px] text-[var(--ink-tertiary)]">
                {relatedFileChanges.length}
              </span>
            </div>

            <ScrollArea className="flex-1 px-2 pb-2">
              {relatedFileChanges.length === 0 ? (
                <div className="rounded-md bg-[var(--surface-1)] px-3 py-3 text-[13px] text-[var(--ink-tertiary)]">
                  {t("relatedFiles.noChangedFiles")}
                </div>
              ) : (
                <div className="space-y-1">
                  {relatedFileChanges.map((file) => (
                    <button
                      type="button"
                      key={`${file.status}-${file.path}`}
                      onClick={() => handleRelatedFileClick(file.path)}
                      className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md bg-[var(--surface-1)] px-2 text-left text-[13px] transition-colors hover:bg-[var(--surface-3)]"
                      aria-label={t("relatedFiles.openDiff", {
                        path: file.path,
                      })}
                    >
                      <TruncatedFileName path={file.path} />
                      {hasLineStat(file.additions) && (
                        <span className="shrink-0 font-mono text-[13px] text-emerald-500">
                          +{file.additions}
                        </span>
                      )}
                      {hasLineStat(file.deletions) && (
                        <span className="shrink-0 font-mono text-[13px] text-rose-500">
                          -{file.deletions}
                        </span>
                      )}
                      <span
                        className={`w-4 shrink-0 text-right font-mono text-[13px] font-semibold ${statusTextTone[file.status]}`}
                      >
                        {file.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </aside>
        )}
      </div>
    </div>
  );
};
