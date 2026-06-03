import { useEffect, useMemo, useState } from 'react';
import { Bot, Plus, Save, Users } from 'lucide-react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { agentRuntimeApi, chatAgentsApi, projectApi } from '@/lib/api';
import type {
  AgentRuntimeStatus,
  BackendChatAgent,
  BaseCodingAgent,
} from '@/types';
import type { ProjectMember } from '../../../shared/types';
import {
  DropdownSelect,
  type DropdownSelectOption,
} from '@/components/DropdownSelect';
import { getRunnerLabel } from './agent-runtime/agentRuntimeViewModel';

type MemberExecutionConfig = {
  runner_type?: BaseCodingAgent | null;
  model_name?: string | null;
  thinking_effort?: string | null;
  model_variant?: string | null;
};

type ProjectMemberWithExecution = ProjectMember & {
  execution_config?: MemberExecutionConfig | null;
};

type ThinkingCapability =
  | { kind: 'effort'; options: string[] }
  | { kind: 'variant'; options: string[] };

const runnerCapabilities: Partial<Record<BaseCodingAgent, ThinkingCapability>> = {
  CLAUDE_CODE: { kind: 'effort', options: ['low', 'medium', 'high'] },
  CODEX: { kind: 'effort', options: ['low', 'medium', 'high', 'xhigh'] },
  DROID: {
    kind: 'effort',
    options: ['none', 'dynamic', 'off', 'low', 'medium', 'high'],
  },
  GEMINI: { kind: 'effort', options: ['off', 'low', 'medium', 'high', 'max'] },
  OPENCODE: { kind: 'variant', options: [''] },
  QWEN_CODE: { kind: 'effort', options: ['off', 'low', 'medium', 'high', 'max'] },
};

const normalizeRunnerType = (value?: string | null): BaseCodingAgent | null => {
  if (!value) return null;
  const normalized = value.trim().replaceAll('-', '_').toUpperCase();
  const known: BaseCodingAgent[] = [
    'CLAUDE_CODE',
    'AMP',
    'GEMINI',
    'CODEX',
    'OPENCODE',
    'OPEN_TEAMS_CLI',
    'CURSOR_AGENT',
    'QWEN_CODE',
    'COPILOT',
    'DROID',
    'KIMI_CODE',
  ];
  return known.includes(normalized as BaseCodingAgent)
    ? (normalized as BaseCodingAgent)
    : null;
};

const trimOrNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parseSkillIds = (value: string): string[] =>
  value
    .split(/[,\n]/u)
    .map((item) => item.trim())
    .filter(Boolean);

const runnerOptions = (runners: AgentRuntimeStatus[]): DropdownSelectOption[] =>
  runners.map((runner) => ({
    id: runner.runner_type,
    label: getRunnerLabel(runner.runner_type),
    hint: runner.installed ? runner.version ?? undefined : 'Not installed',
  }));

export function TeamPage() {
  const { selectedProjectId } = useWorkspace();
  const [members, setMembers] = useState<ProjectMemberWithExecution[]>([]);
  const [agents, setAgents] = useState<BackendChatAgent[]>([]);
  const [runners, setRunners] = useState<AgentRuntimeStatus[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [role, setRole] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isDefault, setIsDefault] = useState(true);
  const [allowedSkillIds, setAllowedSkillIds] = useState('');
  const [runnerType, setRunnerType] = useState<BaseCodingAgent>('CODEX');
  const [modelName, setModelName] = useState('');
  const [thinkingEffort, setThinkingEffort] = useState('');
  const [modelVariant, setModelVariant] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedMember?.agent_id) ?? null,
    [agents, selectedMember],
  );
  const availableAgentOptions = useMemo(() => {
    const memberAgentIds = new Set(
      members
        .map((member) => member.agent_id)
        .filter((id): id is string => Boolean(id)),
    );
    return agents
      .filter((agent) => !memberAgentIds.has(agent.id))
      .map((agent) => ({
        id: agent.id,
        label: agent.name,
        hint: getRunnerLabel(normalizeRunnerType(agent.runner_type) ?? 'CODEX'),
      }));
  }, [agents, members]);
  const modelOptions = useMemo(() => {
    const discovered =
      runners.find((runner) => runner.runner_type === runnerType)?.discovered_models ?? [];
    return Array.from(new Set([modelName, ...discovered].filter(Boolean)));
  }, [modelName, runnerType, runners]);
  const capability = runnerCapabilities[runnerType];

  const load = async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);
    try {
      const [projectMembers, chatAgents, runtimeData] = await Promise.all([
        projectApi.listMembers(selectedProjectId),
        chatAgentsApi.list(),
        agentRuntimeApi.list(),
      ]);
      const nextMembers = projectMembers as ProjectMemberWithExecution[];
      setMembers(nextMembers);
      setAgents(chatAgents);
      setRunners(runtimeData.runners);
      setSelectedMemberId((current) => current || nextMembers[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members');
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
      normalizeRunnerType(selectedMember.member_type === 'agent' ? agent?.runner_type : null) ??
      'CODEX';

    setRole(selectedMember.role ?? '');
    setWorkspacePath(selectedMember.default_workspace_path ?? '');
    setDisplayOrder(Number(selectedMember.display_order ?? 0));
    setIsDefault(Boolean(selectedMember.is_default));
    setAllowedSkillIds((selectedMember.allowed_skill_ids ?? []).join('\n'));
    setRunnerType(runner);
    setModelName(config.model_name ?? agent?.model_name ?? '');
    setThinkingEffort(config.thinking_effort ?? '');
    setModelVariant(config.model_variant ?? '');
  }, [selectedMember, agents]);

  const addMember = async () => {
    if (!selectedProjectId || !selectedAgentId) return;
    const agent = agents.find((item) => item.id === selectedAgentId);
    const runner = normalizeRunnerType(agent?.runner_type) ?? 'CODEX';
    setSaving(true);
    setError(null);
    try {
      const member = await projectApi.addMember(
        selectedProjectId,
        {
          member_type: 'agent',
          agent_id: selectedAgentId,
          user_id: null,
          role: 'agent',
          display_order: members.length + 1,
          default_workspace_path: null,
          allowed_skill_ids: [],
          is_default: true,
          execution_config: {
            runner_type: runner,
            model_name: agent?.model_name ?? null,
            thinking_effort: null,
            model_variant: null,
          },
        } as never,
      );
      setMembers((current) => [...current, member as ProjectMemberWithExecution]);
      setSelectedMemberId(member.id);
      setSelectedAgentId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setSaving(false);
    }
  };

  const saveMember = async () => {
    if (!selectedProjectId || !selectedMember) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await projectApi.updateMember(
        selectedProjectId,
        selectedMember.id,
        {
          role: trimOrNull(role),
          display_order: displayOrder,
          default_workspace_path: trimOrNull(workspacePath),
          is_default: isDefault,
          allowed_skill_ids: parseSkillIds(allowedSkillIds),
          execution_config: {
            runner_type: runnerType,
            model_name: trimOrNull(modelName),
            thinking_effort:
              capability?.kind === 'effort' ? trimOrNull(thinkingEffort) : null,
            model_variant:
              capability?.kind === 'variant' ? trimOrNull(modelVariant) : null,
          },
        } as never,
      );
      setMembers((current) =>
        current.map((member) =>
          member.id === updated.id ? (updated as ProjectMemberWithExecution) : member,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save member');
    } finally {
      setSaving(false);
    }
  };

  if (!selectedProjectId) {
    return (
      <div className="mx-auto max-w-6xl rounded-[6px] border border-[var(--border)] bg-[var(--surface)] p-6 text-[13px] text-[var(--ink-subtle)]">
        Select a project to configure members.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-base font-bold text-[var(--ink)]">Members</h1>
          <p className="mt-1 text-xs text-[var(--ink-subtle)]">
            Configure project member runners, models, and thinking behavior.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownSelect
            value={selectedAgentId}
            options={availableAgentOptions}
            placeholder="Add agent"
            onChange={(value) => setSelectedAgentId(value)}
            className="w-56"
          />
          <button
            type="button"
            onClick={() => void addMember()}
            disabled={!selectedAgentId || saving}
            className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-[var(--accent)] px-3 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-[6px] border border-red-400/30 bg-red-400/10 px-3 py-2 text-[13px] text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-2">
          {members.map((member) => {
            const agent = agents.find((item) => item.id === member.agent_id);
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => setSelectedMemberId(member.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-[6px] border px-3 py-3 text-left ${
                  selectedMemberId === member.id
                    ? 'border-[var(--accent)] bg-[var(--surface-hover)]'
                    : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Bot className="h-4 w-4 shrink-0 text-[var(--ink-subtle)]" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-[var(--ink)]">
                      {agent?.name ?? member.role ?? 'Member'}
                    </span>
                    <span className="block truncate text-[12px] text-[var(--ink-subtle)]">
                      {getRunnerLabel(
                        member.execution_config?.runner_type ??
                          normalizeRunnerType(agent?.runner_type) ??
                          'CODEX',
                      )}
                    </span>
                  </span>
                </span>
                {member.is_default && (
                  <span className="rounded-[6px] border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--ink-subtle)]">
                    Default
                  </span>
                )}
              </button>
            );
          })}
          {!members.length && !loading && (
            <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] p-4 text-[13px] text-[var(--ink-subtle)]">
              No project members yet.
            </div>
          )}
        </aside>

        <main className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] p-4">
          {selectedMember ? (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[var(--ink-subtle)]" />
                <h2 className="text-sm font-semibold text-[var(--ink)]">
                  {selectedAgent?.name ?? 'Member'}
                </h2>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-[12px] font-medium text-[var(--ink-subtle)]">
                    Runner
                  </span>
                  <DropdownSelect
                    value={runnerType}
                    options={runnerOptions(runners)}
                    onChange={(value) => setRunnerType(value as BaseCodingAgent)}
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[12px] font-medium text-[var(--ink-subtle)]">
                    Model
                  </span>
                  <input
                    list="member-model-options"
                    value={modelName}
                    onChange={(event) => setModelName(event.target.value)}
                    className="h-9 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                  />
                  <datalist id="member-model-options">
                    {modelOptions.map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                </label>

                {capability?.kind === 'effort' && (
                  <label className="space-y-1">
                    <span className="text-[12px] font-medium text-[var(--ink-subtle)]">
                      Thinking effort
                    </span>
                    <DropdownSelect
                      value={thinkingEffort}
                      options={capability.options.map((option) => ({
                        id: option,
                        label: option,
                      }))}
                      placeholder="Default"
                      onChange={(value) => setThinkingEffort(value)}
                    />
                  </label>
                )}

                {capability?.kind === 'variant' && (
                  <label className="space-y-1">
                    <span className="text-[12px] font-medium text-[var(--ink-subtle)]">
                      Model variant
                    </span>
                    <input
                      value={modelVariant}
                      onChange={(event) => setModelVariant(event.target.value)}
                      className="h-9 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                )}

                <label className="space-y-1">
                  <span className="text-[12px] font-medium text-[var(--ink-subtle)]">
                    Role
                  </span>
                  <input
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    className="h-9 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[12px] font-medium text-[var(--ink-subtle)]">
                    Workspace
                  </span>
                  <input
                    value={workspacePath}
                    onChange={(event) => setWorkspacePath(event.target.value)}
                    className="h-9 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[12px] font-medium text-[var(--ink-subtle)]">
                    Display order
                  </span>
                  <input
                    type="number"
                    value={displayOrder}
                    onChange={(event) => setDisplayOrder(Number(event.target.value))}
                    className="h-9 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-[13px] text-[var(--ink)]">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(event) => setIsDefault(event.target.checked)}
                />
                Default member for new sessions
              </label>

              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-[var(--ink-subtle)]">
                  Skill IDs
                </span>
                <textarea
                  value={allowedSkillIds}
                  onChange={(event) => setAllowedSkillIds(event.target.value)}
                  rows={4}
                  className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                />
              </label>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void saveMember()}
                  disabled={saving}
                  className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-[var(--accent)] px-3 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving' : 'Save member'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-[13px] text-[var(--ink-subtle)]">
              Select a member to edit.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
