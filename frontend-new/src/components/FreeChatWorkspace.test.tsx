// Smoke tests for the free-chat workspace layout source.
//
// No test runner is installed. Run with:
//     pnpm exec tsx src/components/FreeChatWorkspace.test.tsx

import { readFileSync } from "node:fs";

let failures = 0;
const check = (label: string, cond: boolean, detail?: unknown) => {
  if (cond) {
    // eslint-disable-next-line no-console
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    // eslint-disable-next-line no-console
    console.error(`  FAIL ${label}`, detail ?? "");
  }
};

console.log("FreeChatWorkspace");

const source = readFileSync(
  new URL("./FreeChatWorkspace.tsx", import.meta.url),
  "utf8",
);
const runStatusSource = readFileSync(
  new URL("./AgentRunStatusPill.tsx", import.meta.url),
  "utf8",
);
const activityPanelSource = readFileSync(
  new URL("./AgentActivityPanel.tsx", import.meta.url),
  "utf8",
);
const messageContentSource = readFileSync(
  new URL("./AgentMessageContent.tsx", import.meta.url),
  "utf8",
);
const markdownSource = readFileSync(
  new URL("./AgentMarkdown.tsx", import.meta.url),
  "utf8",
);
const settingsSource = readFileSync(
  new URL("./SettingsWorkspace.tsx", import.meta.url),
  "utf8",
);
const activityPanelIndex = messageContentSource.indexOf("<AgentActivityPanel");
const markdownIndex = messageContentSource.indexOf("<AgentMarkdown");

check(
  "uses a narrower related-files default width",
  source.includes("const RELATED_FILES_DEFAULT_WIDTH = 240"),
  source,
);
check(
  "allows related-files panel to compress before collapsing",
  source.includes("const RELATED_FILES_MIN_WIDTH = 200") &&
    source.includes("effectiveRelatedFilesWidth") &&
    source.includes("relatedFilesMaxAvailableWidth"),
  source,
);
check(
  "auto-collapses related-files panel when workspace is too narrow",
  source.includes("wasRelatedFilesAutoCollapsed") &&
    source.includes("setWasRelatedFilesAutoCollapsed(true)") &&
    source.includes("setIsRelatedFilesOpen(false)"),
  source,
);
check(
  "keeps related-files panel as a right-side column while open",
  source.includes("grid-cols-[minmax(0,1fr)_6px_var(--related-files-width)]") &&
    !source.includes("grid-rows-[minmax(0,1fr)_16rem]") &&
    !source.includes("xl:grid-cols-[minmax(0,1fr)_6px_var"),
  source,
);
check(
  "delegates agent message rendering to an isolated component",
  source.includes("AgentMessageContent") &&
    messageContentSource.includes("chatRunsApi") &&
    messageContentSource.includes(".getActivity") &&
    messageContentSource.includes("AgentRunStatusPill") &&
    messageContentSource.includes("AgentActivityPanel") &&
    messageContentSource.includes("AgentMarkdown") &&
    !source.includes("formatMessageText={formatMsgText}"),
  { source, messageContentSource },
);
check(
  "renders agent model inline after the agent name",
  source.includes("!msg.isUser && msg.model") &&
    source.includes("·") &&
    source.includes("{msg.model}") &&
    source.includes("text-[11px] font-mono text-[var(--ink-tertiary)]"),
  source,
);
check(
  "shows thinking details above the final agent markdown",
  activityPanelIndex >= 0 &&
    markdownIndex >= 0 &&
    activityPanelIndex < markdownIndex,
  { activityPanelIndex, markdownIndex },
);
check(
  "thinking process toggle title uses 13px type",
  messageContentSource.includes("text-[13px]") &&
    messageContentSource.includes('t("agentActivity.toggle")'),
  messageContentSource,
);
check(
  "hides empty thinking panel and filters final assistant activity lines",
  messageContentSource.includes('line.line_type !== "assistant"') &&
    messageContentSource.includes("hasVisibleActivityLines") &&
    messageContentSource.includes("hasActivityPanelState") &&
    activityPanelSource.includes("if (showEmpty) return null"),
  { messageContentSource, activityPanelSource },
);
check(
  "reloads historical activity when live stream lines are only partial",
  messageContentSource.includes('loadState === "loaded"') &&
    messageContentSource.includes("activityRequestIdRef") &&
    messageContentSource.includes("mountedRef") &&
    messageContentSource.includes("mountedRef.current = true") &&
    messageContentSource.includes("ACTIVITY_LOAD_TIMEOUT_MS") &&
    messageContentSource.includes(
      "Promise.race([activityRequest, timeoutRequest])",
    ) &&
    messageContentSource.includes("[expanded, isRunning, message.runId]") &&
    !messageContentSource.includes("if (activityLines ||"),
  messageContentSource,
);
check(
  "agent markdown renders leading mentions outside markdown content",
  markdownSource.includes("extractAgentMarkdownParts") &&
    markdownSource.includes("ReactMarkdown") &&
    markdownSource.includes("remarkGfm") &&
    markdownSource.includes("remarkPlugins={[remarkGfm]}") &&
    markdownSource.includes("data-agent-mention") &&
    markdownSource.includes("parts.markdown") &&
    markdownSource.includes(
      'className="font-mono font-semibold text-[var(--primary)]"',
    ) &&
    markdownSource.includes("fontSize = 14") &&
    markdownSource.includes("style={markdownStyle}") &&
    markdownSource.includes("text-[1.35em]") &&
    markdownSource.includes("text-[1.22em]") &&
    markdownSource.includes("text-[0.95em]") &&
    markdownSource.includes("text-[0.92em]") &&
    !markdownSource.includes("text-[13px]") &&
    !markdownSource.includes("stripLeadingAgentMentions"),
  markdownSource,
);
check(
  "uses the configured chat message font size for user and agent bodies",
  source.includes("chatMessageFontSize") &&
    source.includes("style={{ fontSize: `${chatMessageFontSize}px` }}") &&
    source.includes("messageFontSize={chatMessageFontSize}") &&
    source.includes("text-[0.95em]") &&
    messageContentSource.includes("messageFontSize?: number") &&
    messageContentSource.includes("fontSize={messageFontSize}") &&
    settingsSource.includes("CHAT_MESSAGE_FONT_SIZE_OPTIONS") &&
    settingsSource.includes("settings.appearance.chatMessageFontSize"),
  { source, messageContentSource, settingsSource },
);
check(
  "running pill uses the required copy and reused visual tokens",
  runStatusSource.includes("Agent努力执行任务中") &&
    runStatusSource.includes("Loader2") &&
    runStatusSource.includes("border-[var(--hairline)]") &&
    runStatusSource.includes("bg-[var(--surface-1)]") &&
    runStatusSource.includes("text-[var(--primary)]"),
  runStatusSource,
);
check(
  "activity panel uses compact Codex-like line rows",
  activityPanelSource.includes("labels.cleaned") &&
    activityPanelSource.includes("data-line-type={line.line_type}") &&
    activityPanelSource.includes('line_type === "tool"') &&
    activityPanelSource.includes("text-[12px]") &&
    activityPanelSource.includes("max-h-[480px]") &&
    activityPanelSource.includes("line-clamp-1") &&
    activityPanelSource.includes("hover:bg-[var(--surface-1)]/70") &&
    activityPanelSource.includes("text-[var(--ink)]") &&
    activityPanelSource.includes("text-[var(--ink-tertiary)]") &&
    activityPanelSource.includes("agent-activity-scrollbar") &&
    !activityPanelSource.includes("border border"),
  activityPanelSource,
);

if (failures > 0) {
  // eslint-disable-next-line no-console
  console.error(`\n${failures} FreeChatWorkspace assertion(s) failed.`);
  process.exit(1);
} else {
  // eslint-disable-next-line no-console
  console.log("\nAll FreeChatWorkspace assertions passed.");
}
