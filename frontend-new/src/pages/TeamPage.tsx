import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Brain,
  CheckCircle2,
  Crown,
  FolderGit2,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  UserRoundCog,
} from "lucide-react";
import {
  DropdownSelect,
  type DropdownSelectOption,
} from "@/components/DropdownSelect";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  agentRuntimeApi,
  chatAgentsApi,
  projectApi,
  skillsApi,
} from "@/lib/api";
import type {
  AgentRuntimeReasoningCapability,
  AgentRuntimeStatus,
  BackendChatAgent,
  BackendChatSkill,
  BaseCodingAgent,
} from "@/types";
import type { ProjectMemberWithRuntime } from "../../../shared/types";
import {
  getRuntimeDisplayState,
  getRunnerLabel,
  type RuntimeDisplayState,
} from "./agent-runtime/agentRuntimeViewModel";

type TranslateFn = (
  key: string,
  replacements?: Record<string, string | number>,
) => string;

type MemberExecutionConfig = {
  runner_type?: BaseCodingAgent | null;
  model_name?: string | null;
  thinking_effort?: string | null;
  model_variant?: string | null;
};

type ProjectMemberWithExecution = ProjectMemberWithRuntime & {
  execution_config?: MemberExecutionConfig | null;
};

const defaultOptionId = "__openteams_default__";

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

/* ---------- Status helpers ---------- */

function StatusDot({ state }: { state: RuntimeDisplayState }) {
  return (
    <span
      className={cx(
        "inline-block h-1.5 w-1.5 rounded-full",
        state === "available" && "bg-[var(--success)]",
        state === "error" && "bg-red-500",
        state === "not_installed" && "bg-[var(--ink-tertiary)]",
      )}
    />
  );
}

function StatusBadge({
  runner,
  t,
  size = "compact",
}: {
  runner?: AgentRuntimeStatus | null;
  t: TranslateFn;
  size?: "compact" | "normal";
}) {
  if (!runner) return null;
  const state = getRuntimeDisplayState(runner);
  const label =
    state === "available"
      ? t("agents.status.available")
      : state === "error"
        ? t("agents.status.error")
        : t("agents.status.notInstalled");
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wider",
        size === "compact" ? "h-5 px-2 text-[10px]" : "h-6 px-2.5 text-[11px]",
        state === "available" &&
          "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]",
        state === "error" && "border-red-500/30 bg-red-500/10 text-red-400",
        state === "not_installed" &&
          "border-[var(--hairline-strong)] bg-[var(--surface-3)] text-[var(--ink-subtle)]",
      )}
    >
      <StatusDot state={state} />
      {label}
    </span>
  );
}

const normalizeRunnerType = (value?: string | null): BaseCodingAgent | null => {
  if (!value) return null;
  let normalized = value.trim().replaceAll("-", "_").toUpperCase();
  if (normalized === "OPENTEAMS_CLI") {
    normalized = "OPEN_TEAMS_CLI";
  }
  const known: BaseCodingAgent[] = [
    "CLAUDE_CODE",
    "AMP",
    "GEMINI",
    "CODEX",
    "OPENCODE",
    "OPEN_TEAMS_CLI",
    "CURSOR_AGENT",
    "QWEN_CODE",
    "COPILOT",
    "DROID",
    "KIMI_CODE",
  ];
  return known.includes(normalized as BaseCodingAgent)
    ? (normalized as BaseCodingAgent)
    : null;
};

const trimOrNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const compactRunnerLabel = (runner?: BaseCodingAgent | null) =>
  runner ? getRunnerLabel(runner) : "Runtime";

const memberName = (
  member: ProjectMemberWithExecution,
  agent?: BackendChatAgent,
) => agent?.name ?? member.role ?? "Member";

const monogram = (value: string) => {
  const parts = value.split(/[\s@._-]+/u).filter(Boolean);
  if (parts.length === 0) return "AI";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const SectionHeader = ({ icon: Icon, title, subtitle }: { icon: any, title: string, subtitle: string }) => (
  <div className="mb-4 flex items-center gap-3">
    <span className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] text-[var(--ink-tertiary)]">
      <Icon className="h-4 w-4" />
    </span>
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--ink-subtle)]">
        {title}
      </h3>
      <p className="text-[12px] leading-normal text-[var(--ink-tertiary)]">
        {subtitle}
      </p>
    </div>
  </div>
);

const createRunnerOptions = (
  runners: AgentRuntimeStatus[],
  runnerType: BaseCodingAgent,
): DropdownSelectOption[] => {
  const options = runners.map((runner) => ({
    id: runner.runner_type,
    label: getRunnerLabel(runner.runner_type),
    description: runner.installed
      ? (runner.version ?? undefined)
      : "Not installed",
  }));

  if (!options.some((option) => option.id === runnerType)) {
    options.unshift({
      id: runnerType,
      label: getRunnerLabel(runnerType),
      description: "Current runtime",
    });
  }

  return options;
};

const createModelOptions = (models: string[]): DropdownSelectOption[] => [
  {
    id: defaultOptionId,
    label: "Default model",
    description: "Use runtime default",
  },
  ...models.map((model) => ({
    id: model,
    label: model,
    description: "Discovered model",
  })),
];

const createReasoningOptions = (
  capability?: AgentRuntimeReasoningCapability | null,
): DropdownSelectOption[] => [
  { id: defaultOptionId, label: "Default", description: "Use runtime default" },
  ...(capability?.options ?? []).filter(Boolean).map((option) => ({
    id: option,
    label: option.replace(/^thinking-/u, ""),
    description:
      capability?.kind === "variant" ? "Runtime variant" : "Reasoning effort",
  })),
];

const createSkillOptions = (
  skills: BackendChatSkill[],
): DropdownSelectOption[] =>
  skills.map((skill) => ({
    id: skill.id,
    label: skill.name,
    description: skill.description,
    group: skill.category ?? "Skills",
    disabled: !skill.enabled,
  }));

export function TeamPage() {
  const { projects, selectedProjectId, t } = useWorkspace();
  const [members, setMembers] = useState<ProjectMemberWithExecution[]>([]);
  const [agents, setAgents] = useState<BackendChatAgent[]>([]);
  const [runners, setRunners] = useState<AgentRuntimeStatus[]>([]);
  const [skills, setSkills] = useState<BackendChatSkill[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [isLeader, setIsLeader] = useState(false);
  const [allowedSkillIds, setAllowedSkillIds] = useState<string[]>([]);
  const [runnerType, setRunnerType] = useState<BaseCodingAgent>("CODEX");
  const [modelName, setModelName] = useState("");
  const [thinkingEffort, setThinkingEffort] = useState("");
  const [modelVariant, setModelVariant] = useState("");
  const [roleDefinition, setRoleDefinition] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const currentProjectMembers = useMemo(
    () =>
      members.filter(
        (member) =>
          member.project_id === selectedProjectId &&
          member.member_type === "agent",
      ),
    [members, selectedProjectId],
  );
  const selectedMember = useMemo(
    () =>
      currentProjectMembers.find((member) => member.id === selectedMemberId) ??
      null,
    [currentProjectMembers, selectedMemberId],
  );
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedMember?.agent_id) ?? null,
    [agents, selectedMember],
  );
  const memberByAgentId = useMemo(
    () =>
      new Set(
        currentProjectMembers
          .map((member) => member.agent_id)
          .filter((id): id is string => Boolean(id)),
      ),
    [currentProjectMembers],
  );
  const availableAgentOptions = useMemo(
    () =>
      agents
        .filter((agent) => !memberByAgentId.has(agent.id))
        .map((agent) => ({
          id: agent.id,
          label: agent.name,
          description: getRunnerLabel(
            normalizeRunnerType(agent.runner_type) ?? "CODEX",
          ),
        })),
    [agents, memberByAgentId],
  );
  const runtimeOptions = useMemo(
    () => createRunnerOptions(runners, runnerType),
    [runnerType, runners],
  );
  const selectedRuntime = useMemo(
    () => runners.find((runner) => runner.runner_type === runnerType),
    [runnerType, runners],
  );
  const modelOptions = useMemo(() => {
    const discovered = selectedRuntime?.discovered_models ?? [];
    const models = Array.from(
      new Set([modelName, ...discovered].filter(Boolean)),
    );
    return createModelOptions(models);
  }, [modelName, selectedRuntime]);
  const capability = selectedMember?.reasoning_capability ?? null;
  const reasoningOptions = useMemo(
    () => createReasoningOptions(capability),
    [capability],
  );
  const skillOptions = useMemo(() => createSkillOptions(skills), [skills]);
  const skillLabel = (selectedOptions: DropdownSelectOption[]) => {
    if (selectedOptions.length === 0) return "No skills selected";
    if (selectedOptions.length === 1) return selectedOptions[0].label;
    return `${selectedOptions.length} skills selected`;
  };
  const activeMemberName = selectedMember
    ? memberName(selectedMember, selectedAgent ?? undefined)
    : "Member";
  const selectedModelValue = modelName || defaultOptionId;
  const selectedReasoningValue =
    (capability?.kind === "variant" ? modelVariant : thinkingEffort) ||
    defaultOptionId;

  const load = async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const [projectMembers, chatAgents, runtimeData, skillList] =
        await Promise.all([
          projectApi.listMembers(selectedProjectId),
          chatAgentsApi.list(),
          agentRuntimeApi.list(),
          skillsApi.list(),
        ]);
      const nextMembers = projectMembers as ProjectMemberWithExecution[];
      setMembers(nextMembers);
      setAgents(chatAgents);
      setRunners(runtimeData.runners);
      setSkills(skillList);
      const nextProjectMembers = nextMembers.filter(
        (member) =>
          member.project_id === selectedProjectId &&
          member.member_type === "agent",
      );
      setSelectedMemberId((current) =>
        nextProjectMembers.some((member) => member.id === current)
          ? current
          : (nextProjectMembers[0]?.id ?? ""),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedMember) return;
    const agent = agents.find((item) => item.id === selectedMember.agent_id);
    const config = selectedMember.execution_config ?? {};
    const runner =
      config.runner_type ??
      normalizeRunnerType(agent?.runner_type) ??
      normalizeRunnerType(
        selectedMember.member_type === "agent" ? agent?.runner_type : null,
      ) ??
      "CODEX";

    setWorkspacePath(
      selectedMember.default_workspace_path ??
        currentProject?.default_workspace_path ??
        "",
    );
    setIsLeader(selectedMember.role === "lead");
    setAllowedSkillIds(selectedMember.allowed_skill_ids ?? []);
    setRunnerType(runner);
    setModelName(config.model_name ?? agent?.model_name ?? "");
    setThinkingEffort(config.thinking_effort ?? config.model_variant ?? "");
    setModelVariant(config.model_variant ?? "");
    setRoleDefinition(agent?.system_prompt ?? "");
    setNotice(null);
  }, [selectedMember, agents, currentProject?.default_workspace_path]);

  const addMember = async () => {
    if (!selectedProjectId || !selectedAgentId) return;
    const agent = agents.find((item) => item.id === selectedAgentId);
    const runner = normalizeRunnerType(agent?.runner_type) ?? "CODEX";
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const member = await projectApi.addMember(selectedProjectId, {
        member_type: "agent",
        agent_id: selectedAgentId,
        user_id: null,
        role: null,
        display_order: currentProjectMembers.length + 1,
        default_workspace_path: currentProject?.default_workspace_path ?? null,
        allowed_skill_ids: [],
        is_default: true,
        execution_config: {
          runner_type: runner,
          model_name: agent?.model_name ?? null,
          thinking_effort: null,
          model_variant: null,
        },
      } as never);
      setMembers((current) => [
        ...current.filter((item) => item.id !== member.id),
        member as ProjectMemberWithExecution,
      ]);
      setSelectedMemberId(member.id);
      setSelectedAgentId("");
      setNotice("Member added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setSaving(false);
    }
  };

  const saveMember = async () => {
    if (!selectedProjectId || !selectedMember) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const memberUpdate = projectApi.updateMember(
        selectedProjectId,
        selectedMember.id,
        {
          role: isLeader ? "lead" : null,
          display_order: null,
          default_workspace_path: trimOrNull(workspacePath),
          is_default: null,
          allowed_skill_ids: allowedSkillIds,
          execution_config: {
            runner_type: runnerType,
            model_name: trimOrNull(modelName),
            thinking_effort:
              capability?.kind === "effort" ? trimOrNull(thinkingEffort) : null,
            model_variant:
              capability?.kind === "variant" ? trimOrNull(modelVariant) : null,
          },
        } as never,
      );
      const agentUpdate =
        selectedAgent && selectedAgent.system_prompt !== roleDefinition
          ? chatAgentsApi.update(selectedAgent.id, {
              name: null,
              runner_type: null,
              system_prompt: roleDefinition,
              tools_enabled: null,
              model_name: null,
            })
          : Promise.resolve(selectedAgent);
      const [updatedMember, updatedAgent] = await Promise.all([
        memberUpdate,
        agentUpdate,
      ]);

      setMembers((current) =>
        current.map((member) =>
          member.id === updatedMember.id
            ? (updatedMember as ProjectMemberWithExecution)
            : member,
        ),
      );
      if (updatedAgent) {
        setAgents((current) =>
          current.map((agent) =>
            agent.id === updatedAgent.id ? updatedAgent : agent,
          ),
        );
      }
      setNotice("Member configuration saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save member");
    } finally {
      setSaving(false);
    }
  };

  if (!selectedProjectId) {
    return (
      <div className="mx-auto max-w-6xl rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] p-6 text-[14px] text-[var(--ink-subtle)]">
        Select a project to configure members.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-2)] text-[var(--ink)]">
      <header className="shrink-0 border-b border-[var(--hairline)] bg-[var(--surface-2)] px-4 py-4 md:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] text-[var(--primary)]">
              <UserRoundCog className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold leading-[1.15] tracking-[-0.4px] text-[var(--ink)]">
                Members
              </h1>
              <p className="mt-1 max-w-[600px] text-[14px] leading-[1.45] text-[var(--ink-subtle)]">
                Configure project member runtimes, model discovery, role
                definitions, and skill sets.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center xl:w-auto">
            <DropdownSelect
              value={selectedAgentId}
              options={availableAgentOptions}
              placeholder="Add agent"
              searchPlaceholder="Search agents..."
              emptyLabel="No available agents."
              triggerIcon={
                <Bot className="h-3.5 w-3.5 shrink-0 text-[var(--ink-tertiary)]" />
              }
              className="min-w-[240px] [&>button]:h-9 [&>button]:bg-[var(--surface-1)] [&>button]:py-0 [&>button]:text-[13px]"
              maxPanelHeightClassName="max-h-[260px]"
              onChange={(value) => setSelectedAgentId(value)}
            />
            <button
              type="button"
              onClick={() => void addMember()}
              disabled={!selectedAgentId || saving}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] bg-[var(--primary)] px-5 text-[14px] font-semibold text-white transition-all hover:bg-[var(--primary-hover)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden p-4">
        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)]">
          {(error || notice) && (
            <div className="shrink-0 space-y-2 border-b border-[var(--hairline)] p-3">
              {error && (
                <div className="flex items-start gap-2 rounded-[8px] border border-red-500/20 bg-red-500/10 p-3 text-[13px] text-red-400">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}
              {notice && (
                <div className="rounded-[8px] border border-[var(--primary)]/30 bg-[var(--primary-tint)] p-3 text-[13px] text-[var(--primary)]">
                  {notice}
                </div>
              )}
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
            <aside className="min-h-0 overflow-y-auto border-b border-[var(--hairline)] bg-[var(--surface-1)] ot-scroll-area-styled lg:border-b-0 lg:border-r">
              {loading ? (
                <div>
                  {[0, 1, 2, 3].map((item) => (
                    <div
                      key={item}
                      className="h-[72px] animate-pulse border-b border-[var(--hairline)] bg-[var(--surface-2)]"
                    />
                  ))}
                </div>
              ) : currentProjectMembers.length === 0 ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
                  <Bot className="h-8 w-8 text-[var(--ink-tertiary)]" />
                  <h3 className="mt-3 text-[14px] font-medium text-[var(--ink)]">
                    No members yet
                  </h3>
                  <p className="mt-1 max-w-[260px] text-[13px] leading-[1.6] text-[var(--ink-subtle)]">
                    Add an agent from the available list to start building your
                    project team.
                  </p>
                </div>
              ) : (
                currentProjectMembers.map((member) => {
                  const agent = agents.find(
                    (item) => item.id === member.agent_id,
                  );
                  const runner =
                    member.execution_config?.runner_type ??
                    normalizeRunnerType(agent?.runner_type);
                  const active = selectedMemberId === member.id;
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => setSelectedMemberId(member.id)}
                      className={cx(
                        "grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-4 border-b border-[var(--hairline)] px-4 py-3.5 text-left transition-all last:border-b-0",
                        active
                          ? "bg-[var(--surface-3)] ring-1 ring-inset ring-[var(--primary)]/35"
                          : "bg-[var(--surface-1)] hover:bg-[var(--surface-2)]",
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--mono-border)] bg-[var(--mono-bg)] font-mono text-[10px] font-bold text-[var(--ink-muted)]">
                        {monogram(memberName(member, agent))}
                      </span>
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[14px] font-semibold text-[var(--ink)]">
                            {memberName(member, agent)}
                          </span>
                          {member.role === "lead" && (
                            <Crown className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
                          )}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-[var(--ink-tertiary)] uppercase tracking-tight">
                          {compactRunnerLabel(runner)}
                        </span>
                      </span>
                      <span className="rounded-[4px] border border-[var(--mono-border)] bg-[var(--mono-bg)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--ink-muted)]">
                        {(member.allowed_skill_ids ?? []).length}
                      </span>
                    </button>
                  );
                })
              )}
            </aside>

            <main className="min-h-0 overflow-y-auto bg-[var(--surface-1)] ot-scroll-area-styled">
              {selectedMember ? (
                <div className="mx-auto max-w-5xl p-6 md:p-8">
                  {/* --- Profile Hero Section --- */}
                  <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex items-center gap-6">
                      <div className="relative">
                        <span className="flex h-20 w-20 items-center justify-center rounded-2xl border border-[var(--mono-border)] bg-[var(--surface-2)] font-mono text-[24px] font-bold text-[var(--ink-muted)] shadow-sm">
                          {monogram(activeMemberName)}
                        </span>
                        {isLeader && (
                          <div className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--primary)] bg-[var(--primary)] text-white shadow-lg">
                            <Crown className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <h2 className="truncate text-[28px] font-bold tracking-tight text-[var(--ink)]">
                            {activeMemberName}
                          </h2>
                          <StatusBadge runner={selectedRuntime} t={t} size="normal" />
                        </div>
                        <div className="mt-2 flex items-center gap-4">
                          <div className="flex items-center gap-1.5 font-mono text-[13px] text-[var(--ink-tertiary)] uppercase tracking-wider">
                            <Bot className="h-3.5 w-3.5" />
                            {compactRunnerLabel(runnerType)}
                          </div>
                          <div className="h-1 w-1 rounded-full bg-[var(--hairline-strong)]" />
                          <div className="flex items-center gap-1.5 font-mono text-[13px] text-[var(--ink-tertiary)] uppercase tracking-wider">
                            <Brain className="h-3.5 w-3.5" />
                            {modelName || "default"}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void saveMember()}
                        disabled={saving}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[var(--primary)] px-6 text-[14px] font-bold text-white transition-all hover:bg-[var(--primary-hover)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        {saving ? "Saving..." : "Save Member Configuration"}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-8">
                    {/* --- Section 1: Identity & Cognition (High Impact) --- */}
                    <section className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-2)] overflow-hidden">
                      <div className="border-b border-[var(--hairline)] bg-[var(--surface-1)]/50 px-6 py-4">
                        <SectionHeader
                          icon={Sparkles}
                          title="Identity & Cognition"
                          subtitle="The core persona and instructions that drive this agent's behavior."
                        />
                      </div>
                      <div className="p-6">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <label className="text-[13px] font-semibold text-[var(--ink)]">
                              System Prompt (Role Definition)
                            </label>
                            <span className="font-mono text-[11px] text-[var(--ink-tertiary)] uppercase">
                              Defines behaviors & constraints
                            </span>
                          </div>
                          <textarea
                            value={roleDefinition}
                            onChange={(event) =>
                              setRoleDefinition(event.target.value)
                            }
                            rows={10}
                            spellCheck={false}
                            placeholder="I am a professional frontend developer specialized in React..."
                            className="block w-full resize-y rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-3)] px-4 py-3 text-[14px] leading-relaxed text-[var(--ink)] outline-none transition-all placeholder:text-[var(--ink-tertiary)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20"
                          />
                        </div>
                      </div>
                    </section>

                    <div className="grid gap-8 lg:grid-cols-2">
                      {/* --- Section 2: Execution Engine --- */}
                      <section className="flex flex-col rounded-xl border border-[var(--hairline)] bg-[var(--surface-2)] overflow-hidden">
                        <div className="border-b border-[var(--hairline)] bg-[var(--surface-1)]/50 px-6 py-4">
                          <SectionHeader
                            icon={Brain}
                            title="Execution Engine"
                            subtitle="Hardware and model configuration for runtime intelligence."
                          />
                        </div>
                        <div className="flex-1 p-6">
                          <div className="space-y-6">
                            <label className="block space-y-2">
                              <span className="text-[13px] font-semibold text-[var(--ink)]">
                                Agent Runtime
                              </span>
                              <DropdownSelect
                                value={runnerType}
                                options={runtimeOptions}
                                searchPlaceholder="Search runtimes..."
                                className="[&>button]:h-10 [&>button]:bg-[var(--surface-3)] [&>button]:font-mono [&>button]:text-[13px]"
                                triggerIcon={<Bot className="h-3.5 w-3.5 text-[var(--ink-tertiary)]" />}
                                onChange={(value) => setRunnerType(value as BaseCodingAgent)}
                              />
                            </label>

                            <label className="block space-y-2">
                              <span className="text-[13px] font-semibold text-[var(--ink)]">
                                Large Language Model
                              </span>
                              <DropdownSelect
                                value={selectedModelValue}
                                options={modelOptions}
                                searchPlaceholder="Search models..."
                                className="[&>button]:h-10 [&>button]:bg-[var(--surface-3)] [&>button]:font-mono [&>button]:text-[13px]"
                                onChange={(value) => setModelName(value === defaultOptionId ? "" : value)}
                              />
                            </label>

                            <label className="block space-y-2">
                              <span className="text-[13px] font-semibold text-[var(--ink)]">
                                Reasoning / Effort Level
                              </span>
                              <DropdownSelect
                                value={selectedReasoningValue}
                                options={reasoningOptions}
                                showSearch={false}
                                className="[&>button]:h-10 [&>button]:bg-[var(--surface-3)] [&>button]:font-mono [&>button]:text-[13px]"
                                onChange={(value) => {
                                  const nextValue = value === defaultOptionId ? "" : value;
                                  if (capability?.kind === "variant") {
                                    setModelVariant(nextValue);
                                  } else {
                                    setThinkingEffort(nextValue);
                                  }
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      </section>

                      {/* --- Section 3: Environment & Access --- */}
                      <section className="flex flex-col rounded-xl border border-[var(--hairline)] bg-[var(--surface-2)] overflow-hidden">
                        <div className="border-b border-[var(--hairline)] bg-[var(--surface-1)]/50 px-6 py-4">
                          <SectionHeader
                            icon={ShieldCheck}
                            title="Environment & Access"
                            subtitle="Privileges, workspace paths, and available toolsets."
                          />
                        </div>
                        <div className="flex-1 p-6">
                          <div className="space-y-6">
                            <div className="space-y-3">
                              <span className="text-[13px] font-semibold text-[var(--ink)]">
                                Leadership Status
                              </span>
                              <button
                                type="button"
                                onClick={() => setIsLeader((v) => !v)}
                                className={cx(
                                  "group flex w-full items-center justify-between rounded-[8px] border px-4 py-3 transition-all",
                                  isLeader
                                    ? "border-[var(--primary)]/40 bg-[var(--primary-tint)] text-[var(--ink)]"
                                    : "border-[var(--hairline)] bg-[var(--surface-3)] text-[var(--ink-subtle)] hover:border-[var(--hairline-strong)] hover:text-[var(--ink)]"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <Crown className={cx("h-4 w-4", isLeader ? "text-[var(--primary)]" : "text-[var(--ink-tertiary)]")} />
                                  <div className="text-left">
                                    <p className="text-[14px] font-semibold">Workflow Lead</p>
                                    <p className="text-[11px] text-[var(--ink-tertiary)]">Empower this agent to guide sessions</p>
                                  </div>
                                </div>
                                <div className={cx("h-5 w-5 rounded-full border flex items-center justify-center transition-all", isLeader ? "border-[var(--primary)] bg-[var(--primary)]" : "border-[var(--hairline-strong)] bg-[var(--surface-2)]")}>
                                  {isLeader && <CheckCircle2 className="h-3 w-3 text-white" />}
                                </div>
                              </button>
                            </div>

                            <label className="block space-y-2">
                              <span className="text-[13px] font-semibold text-[var(--ink)]">
                                Local Workspace Path
                              </span>
                              <input
                                value={workspacePath}
                                onChange={(e) => setWorkspacePath(e.target.value)}
                                placeholder="e.g. /home/user/workspace"
                                className="h-10 w-full rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-3)] px-3 font-mono text-[13px] text-[var(--ink)] outline-none transition-all placeholder:text-[var(--ink-tertiary)] focus:border-[var(--primary)]"
                              />
                            </label>

                            <div className="space-y-3">
                              <span className="text-[13px] font-semibold text-[var(--ink)]">
                                Configurable Skills
                              </span>
                              <DropdownSelect
                                selectionMode="multiple"
                                values={allowedSkillIds}
                                options={skillOptions}
                                placeholder="Select skills..."
                                className="[&>button]:h-10 [&>button]:bg-[var(--surface-3)] [&>button]:text-[13px]"
                                formatValueLabel={skillLabel}
                                onChange={setAllowedSkillIds}
                              />
                              <div className="flex flex-wrap gap-2">
                                {allowedSkillIds.length > 0 ? (
                                  allowedSkillIds.map((id) => {
                                    const skill = skills.find((s) => s.id === id);
                                    return (
                                      <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--mono-border)] bg-[var(--mono-bg)] px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-[var(--ink-muted)]">
                                        <FolderGit2 className="h-3 w-3" />
                                        {skill?.name || id}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <p className="text-[12px] italic text-[var(--ink-tertiary)] py-1">No custom skills enabled.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>

                    {/* --- Section 4: Runtime Analytics (Summary) --- */}
                    <section className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-2)] p-6">
                      <div className="grid gap-6 md:grid-cols-3">
                        <div className="space-y-2">
                          <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--ink-tertiary)]">Status</p>
                          <div className="flex items-center gap-2">
                            <StatusDot state={selectedRuntime ? getRuntimeDisplayState(selectedRuntime) : "not_installed"} />
                            <span className="text-[14px] font-semibold">
                              {selectedRuntime ? (getRuntimeDisplayState(selectedRuntime) === "available" ? "Active" : "Issue Detected") : "Disconnected"}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--ink-tertiary)]">Architecture</p>
                          <p className="text-[14px] font-semibold font-mono">{selectedRuntime?.version || "N/A"}</p>
                        </div>
                        <div className="space-y-2">
                          <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--ink-tertiary)]">Member Type</p>
                          <p className="text-[14px] font-semibold capitalize">{selectedMember.member_type}</p>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-full flex-col items-center justify-center p-12 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-[var(--ink-tertiary)] shadow-inner">
                    <UserRoundCog className="h-8 w-8" />
                  </div>
                  <h3 className="mt-6 text-[18px] font-bold text-[var(--ink)]">
                    No Member Selected
                  </h3>
                  <p className="mt-2 max-w-[320px] text-[14px] leading-relaxed text-[var(--ink-subtle)]">
                    Select a project member from the left sidebar to manage their intelligence, engine, and permissions.
                  </p>
                </div>
              )}
            </main>
          </div>
        </section>
      </div>
    </div>
  );
}
