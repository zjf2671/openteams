import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Check,
  ChevronUp,
  Code2,
  FileText,
  Folder,
  FolderOpen,
  Home,
  LoaderCircle,
  Palette,
  RefreshCw,
  Rocket,
  Sparkles,
  TerminalSquare,
  Users,
} from 'lucide-react';
import { DropdownSelect, type DropdownSelectOption } from '@/components/DropdownSelect';
import { cn } from '@/lib/utils';
import {
  agentRuntimeApi,
  chatSessionsApi,
  filesystemApi,
  onboardingApi,
} from '@/lib/api';
import { recommendOnboardingTeamTemplate } from '@/lib/onboardingTemplateRecommendations';
import { sanitizeProjectName } from '@/lib/projectName';
import { buildTemplateMemberSpecs } from '@/lib/teamTemplateRuntime';
import {
  getRunnerLabel,
  getRuntimeDisplayState,
} from '@/pages/agent-runtime/agentRuntimeViewModel';
import type {
  AgentRuntimeStatus,
  DirectoryEntry,
  Locale,
  Theme,
  ValidateWorkspacePathResponse,
} from '@/types';
import {
  OnboardingAppearance,
  OnboardingLanguage,
  OnboardingScenario,
  OnboardingStep,
  type ChatTeamPreset,
  type OnboardingState,
  type OnboardingTeamMemberConfig,
  type UpdateOnboardingStateRequest,
} from '../../../../shared/types';

const welcomeStepKey = 'welcome';
const defaultProjectName = 'MyProject';
const onboardingSteps = ['scenario', 'executor', 'project_path', 'appearance'] as const;

type OnboardingStepKey = (typeof onboardingSteps)[number];
type ActiveStepKey = OnboardingStepKey | typeof welcomeStepKey;
type OnboardingMode = 'onboarding' | 'upgrade';
type TranslateFn = (
  key: string,
  replacements?: Record<string, string | number>,
) => string;

interface OnboardingGuideProps {
  mode: 'onboarding' | 'upgrade';
  initialState: OnboardingState | null;
  currentVersion: string;
  locale: Locale;
  theme: Theme;
  t: TranslateFn;
  teamPresets: ChatTeamPreset[];
  onCreateProjectFromOnboarding: (input: {
    name: string;
    path: string;
    teamId: string | null;
  }) => Promise<{ projectId: string; sessionId: string | null }>;
  onPreviewLocaleChange: (locale: Locale) => void;
  onPreviewAppearanceChange: (appearance: OnboardingAppearance) => void;
  onClose: () => void;
  onOpenCreateSession: (state: OnboardingState) => void;
  onStateChange?: (state: OnboardingState) => void;
  onUpgradeRead: (state: OnboardingState) => void;
}

type ScenarioDefinition = {
  key: OnboardingScenario;
  titleKey: string;
  titleFallback: string;
  descKey: string;
  descFallback: string;
  teamKey: string;
  teamFallback: string;
  members: OnboardingTeamMemberConfig[];
};

const scenarioDefinitions: ScenarioDefinition[] = [
  {
    key: OnboardingScenario.software,
    titleKey: 'onboarding.scenario.software.title',
    titleFallback: 'Software product',
    descKey: 'onboarding.scenario.software.desc',
    descFallback: 'Plan, build, review, and ship product code.',
    teamKey: 'onboarding.scenario.software.team',
    teamFallback: 'Software delivery team',
    members: [
      { member: 'Lead Agent', runner_type: 'codex', model_name: 'gpt-5' },
      { member: 'Frontend Engineer', runner_type: 'claude_code', model_name: 'claude-sonnet' },
      { member: 'Backend Engineer', runner_type: 'openteams_cli', model_name: 'gpt-5' },
      { member: 'QA Reviewer', runner_type: 'gemini', model_name: 'gemini-2.5-pro' },
    ],
  },
  {
    key: OnboardingScenario.design,
    titleKey: 'onboarding.scenario.design.title',
    titleFallback: 'Design implementation',
    descKey: 'onboarding.scenario.design.desc',
    descFallback: 'Turn product screens into polished frontend work.',
    teamKey: 'onboarding.scenario.design.team',
    teamFallback: 'Design implementation team',
    members: [
      { member: 'UX Lead', runner_type: 'claude_code', model_name: 'claude-sonnet' },
      { member: 'Visual Reviewer', runner_type: 'gemini', model_name: 'gemini-2.5-pro' },
      { member: 'Frontend Implementer', runner_type: 'codex', model_name: 'gpt-5' },
    ],
  },
  {
    key: OnboardingScenario.research,
    titleKey: 'onboarding.scenario.research.title',
    titleFallback: 'Research and analysis',
    descKey: 'onboarding.scenario.research.desc',
    descFallback: 'Collect context, compare options, and write decisions.',
    teamKey: 'onboarding.scenario.research.team',
    teamFallback: 'Research analysis team',
    members: [
      { member: 'Research Lead', runner_type: 'gemini', model_name: 'gemini-2.5-pro' },
      { member: 'Analyst', runner_type: 'claude_code', model_name: 'claude-sonnet' },
      { member: 'Report Writer', runner_type: 'openteams_cli', model_name: 'gpt-5' },
    ],
  },
  {
    key: OnboardingScenario.other,
    titleKey: 'onboarding.scenario.other.title',
    titleFallback: 'General collaboration',
    descKey: 'onboarding.scenario.other.desc',
    descFallback: 'Start with a flexible team and adapt later.',
    teamKey: 'onboarding.scenario.other.team',
    teamFallback: 'General collaboration team',
    members: [
      { member: 'General Lead', runner_type: 'openteams_cli', model_name: 'gpt-5' },
      { member: 'Executor', runner_type: 'codex', model_name: 'gpt-5' },
    ],
  },
];

const fallbackRunnerOptions: DropdownSelectOption[] = [
  { id: 'codex', label: 'Codex' },
  { id: 'claude_code', label: 'Claude Code' },
  { id: 'gemini', label: 'Gemini CLI' },
  { id: 'openteams_cli', label: 'OpenTeams CLI' },
  { id: 'qwen_code', label: 'Qwen Code' },
  { id: 'opencode', label: 'OpenCode' },
];

const stepToBackend: Record<OnboardingStepKey, OnboardingStep> = {
  scenario: OnboardingStep.scenario,
  executor: OnboardingStep.executor,
  project_path: OnboardingStep.project_path,
  appearance: OnboardingStep.appearance,
};
const stepI18nKeys: Record<OnboardingStepKey, string> = {
  scenario: 'scenario',
  executor: 'executor',
  project_path: 'projectPath',
  appearance: 'appearance',
};

const stepFromBackend = (
  value: OnboardingState['current_step'] | null | undefined,
): OnboardingStepKey => {
  return onboardingSteps.includes(value as OnboardingStepKey)
    ? (value as OnboardingStepKey)
    : 'scenario';
};

const scenarioFromState = (
  value: OnboardingState['selected_scenario'] | null | undefined,
) =>
  scenarioDefinitions.some((scenario) => scenario.key === value)
    ? (value as OnboardingScenario)
    : OnboardingScenario.software;

const localeToOnboardingLanguage: Record<Locale, OnboardingLanguage> = {
  en: OnboardingLanguage.en,
  zh: OnboardingLanguage.zh_hans,
  ja: OnboardingLanguage.ja,
  ko: OnboardingLanguage.ko,
  fr: OnboardingLanguage.fr,
  es: OnboardingLanguage.es,
};

const onboardingLanguageToLocale = (
  language: OnboardingLanguage | null | undefined,
  fallback: Locale,
): Locale => {
  switch (language) {
    case OnboardingLanguage.en:
      return 'en';
    case OnboardingLanguage.fr:
      return 'fr';
    case OnboardingLanguage.ja:
      return 'ja';
    case OnboardingLanguage.ko:
      return 'ko';
    case OnboardingLanguage.es:
      return 'es';
    case OnboardingLanguage.zh_hans:
    case OnboardingLanguage.zh_hant:
      return 'zh';
    default:
      return fallback;
  }
};

const isGitRepoLabel = (value: boolean, t: TranslateFn) =>
  value ? t('onboarding.project.gitYes') : t('onboarding.project.gitNo');

const directoryEntryTime = (entry: DirectoryEntry): number =>
  typeof entry.last_modified === 'number' ? entry.last_modified : 0;

const getParentPath = (path: string): string => {
  const trimmed = path.trim().replace(/[\\/]+$/, '');
  if (!trimmed) return '';

  const slash = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  if (slash < 0) return '';
  if (slash === 0) return '/';
  if (/^[A-Za-z]:$/.test(trimmed.slice(0, slash))) {
    return `${trimmed.slice(0, slash)}\\`;
  }
  return trimmed.slice(0, slash);
};

const compareVersions = (left: string | null | undefined, right: string) => {
  const leftParts = String(left ?? '')
    .replace(/^v/u, '')
    .split(/[.-]/u)
    .map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right
    .replace(/^v/u, '')
    .split(/[.-]/u)
    .map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

function useTranslatedScenario(t: TranslateFn, selectedScenario: OnboardingScenario) {
  const scenarios = useMemo(
    () =>
      scenarioDefinitions.map((scenario) => ({
        ...scenario,
        title: t(scenario.titleKey) || scenario.titleFallback,
        desc: t(scenario.descKey) || scenario.descFallback,
        teamName: t(scenario.teamKey) || scenario.teamFallback,
      })),
    [t],
  );
  const currentScenario =
    scenarios.find((scenario) => scenario.key === selectedScenario) ??
    scenarios[0];

  return { scenarios, currentScenario };
}

const teamPresetToOnboardingConfig = (
  teamPreset: ChatTeamPreset | null,
  runtimes: AgentRuntimeStatus[],
): OnboardingTeamMemberConfig[] => {
  if (!teamPreset) return [];
  const resolvedMembers = buildTemplateMemberSpecs(teamPreset, null, runtimes);
  if (resolvedMembers.length > 0) {
    return resolvedMembers.map((member) => ({
      member: member.name,
      runner_type: member.runnerType,
      model_name: member.modelName ?? undefined,
    }));
  }

  return teamPreset.members
    .filter((member) => member.enabled !== false)
    .map((member) => ({
      member: member.name,
      runner_type: member.runner_type?.trim() || undefined,
      model_name: member.recommended_model?.trim() || undefined,
    }));
};

export { compareVersions };

export function OnboardingGuide({
  mode,
  initialState,
  currentVersion,
  locale,
  theme,
  t,
  teamPresets,
  onCreateProjectFromOnboarding,
  onPreviewLocaleChange,
  onPreviewAppearanceChange,
  onClose,
  onOpenCreateSession,
  onStateChange,
  onUpgradeRead,
}: OnboardingGuideProps) {
  const initialStep = initialState?.welcome_seen_at
    ? stepFromBackend(initialState.current_step)
    : welcomeStepKey;
  const [state, setState] = useState<OnboardingState | null>(initialState);
  const [activeStepKey, setActiveStepKey] = useState<ActiveStepKey>(initialStep);
  const [selectedScenario, setSelectedScenario] = useState<OnboardingScenario>(
    scenarioFromState(initialState?.selected_scenario),
  );
  const [teamConfig, setTeamConfig] = useState<OnboardingTeamMemberConfig[]>(
    initialState?.team_config?.length
      ? initialState.team_config
      : scenarioDefinitions[0].members,
  );
  const [projectName, setProjectName] = useState(initialState?.project_name ?? '');
  const [projectNameTouched, setProjectNameTouched] = useState(
    Boolean(initialState?.project_name?.trim()),
  );
  const [projectPath, setProjectPath] = useState(initialState?.project_path ?? '');
  const [projectStatus, setProjectStatus] =
    useState<ValidateWorkspacePathResponse | null>(
      initialState?.project_path
        ? {
            valid: true,
            is_git_repo: initialState.project_path_is_git,
            error: null,
          }
        : null,
    );
  const [selectedLocale, setSelectedLocale] = useState<Locale>(
    onboardingLanguageToLocale(initialState?.language, locale),
  );
  const [selectedAppearance, setSelectedAppearance] =
    useState<OnboardingAppearance>(
      initialState?.appearance ??
        (theme === 'light' ? OnboardingAppearance.light : OnboardingAppearance.dark),
    );
  const [runtimes, setRuntimes] = useState<AgentRuntimeStatus[]>([]);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [pathLoading, setPathLoading] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { scenarios, currentScenario } = useTranslatedScenario(
    t,
    selectedScenario,
  );
  const recommendedTeam = useMemo(
    () => recommendOnboardingTeamTemplate(selectedScenario, teamPresets),
    [selectedScenario, teamPresets],
  );
  const isWelcome = activeStepKey === welcomeStepKey;
  const activeStepIndex = isWelcome
    ? -1
    : onboardingSteps.indexOf(activeStepKey);
  const recommendedTeamName = recommendedTeam?.name ?? currentScenario.teamName;
  const recommendedTeamId = recommendedTeam?.id ?? null;
  const teamMembers = teamConfig;

  const runnerOptions = useMemo(() => {
    const availableRunners = runtimes
      .filter((runner) => getRuntimeDisplayState(runner) === 'available')
      .map((runner) => ({
        id: runner.runner_type,
        label: getRunnerLabel(runner.runner_type),
        description: runner.version ?? undefined,
      }));
    return availableRunners.length > 0 ? availableRunners : fallbackRunnerOptions;
  }, [runtimes]);

  const modelOptionsForRunner = (runnerType?: string): DropdownSelectOption[] => {
    const runtime = runtimes.find((candidate) => candidate.runner_type === runnerType);
    const discoveredModels = runtime?.discovered_models ?? [];
    const configuredModel =
      runtime?.executor_options &&
      typeof runtime.executor_options === 'object' &&
      !Array.isArray(runtime.executor_options) &&
      typeof runtime.executor_options.model === 'string'
        ? runtime.executor_options.model
        : '';
    const models = Array.from(
      new Set([configuredModel, ...discoveredModels].filter(Boolean)),
    );
    if (models.length === 0) {
      return [
        { id: 'gpt-5', label: 'gpt-5' },
        { id: 'claude-sonnet', label: 'claude-sonnet' },
        { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
      ];
    }
    return models.map((model) => ({
      id: model,
      label: model,
      description: t('onboarding.executor.discoveredModel'),
    }));
  };

  const buildTeamConfigForScenario = useCallback(
    (
      scenarioKey: OnboardingScenario,
      runtimeOptions: AgentRuntimeStatus[] = runtimes,
    ) => {
      const teamPreset = recommendOnboardingTeamTemplate(
        scenarioKey,
        teamPresets,
      );
      const templateConfig = teamPresetToOnboardingConfig(
        teamPreset,
        runtimeOptions,
      );
      if (templateConfig.length > 0) return templateConfig;

      return (
        scenarioDefinitions.find((scenario) => scenario.key === scenarioKey)
          ?.members ?? scenarioDefinitions[0].members
      );
    },
    [runtimes, teamPresets],
  );

  const initializeFromState = (nextInitialState: OnboardingState | null) => {
    setState(nextInitialState);
    setActiveStepKey(
      nextInitialState?.welcome_seen_at
        ? stepFromBackend(nextInitialState.current_step)
        : welcomeStepKey,
    );
    const nextScenario = scenarioFromState(nextInitialState?.selected_scenario);
    setSelectedScenario(nextScenario);
    setTeamConfig(
      nextInitialState?.team_config?.length
        ? nextInitialState.team_config
        : buildTeamConfigForScenario(nextScenario),
    );
    setProjectName((current) =>
      sanitizeProjectName(
        nextInitialState?.project_name ??
          (current.trim() ? current : defaultProjectName),
      ),
    );
    setProjectNameTouched((current) =>
      Boolean(nextInitialState?.project_name?.trim()) || current,
    );
    setProjectPath(nextInitialState?.project_path ?? '');
    setProjectStatus(
      nextInitialState?.project_path
        ? {
            valid: true,
            is_git_repo: nextInitialState.project_path_is_git,
            error: null,
          }
        : null,
    );
    setSelectedLocale(onboardingLanguageToLocale(nextInitialState?.language, locale));
    setSelectedAppearance(
      nextInitialState?.appearance ??
        (theme === 'light'
          ? OnboardingAppearance.light
          : OnboardingAppearance.dark),
    );
  };

  useEffect(() => {
    initializeFromState(initialState);
  }, [initialState]);

  useEffect(() => {
    if (mode !== 'onboarding') return;
    let cancelled = false;
    void agentRuntimeApi
      .list()
      .then((response) => {
        if (!cancelled) {
          setRuntimes(response.runners);
          if (!initialState?.team_config?.length) {
            const teamPreset = recommendOnboardingTeamTemplate(
              selectedScenario,
              teamPresets,
            );
            const templateConfig = teamPresetToOnboardingConfig(
              teamPreset,
              response.runners,
            );
            setTeamConfig(
              templateConfig.length > 0
                ? templateConfig
                : (scenarioDefinitions.find(
                    (scenario) => scenario.key === selectedScenario,
                  )?.members ?? scenarioDefinitions[0].members),
            );
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRuntimeError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialState?.team_config?.length, mode, selectedScenario, teamPresets]);

  useEffect(() => {
    if (mode !== 'onboarding' || activeStepKey !== 'project_path') return;
    if (entries.length > 0 || pathLoading) return;
    void loadRoots();
  }, [activeStepKey, entries.length, mode, pathLoading]);

  const applyState = (nextState: OnboardingState) => {
    setState(nextState);
    onStateChange?.(nextState);
  };

  const saveState = async (payload: UpdateOnboardingStateRequest) => {
    setSaving(true);
    setError(null);
    try {
      const nextState = await onboardingApi.updateState(payload);
      applyState(nextState);
      return nextState;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t('onboarding.error.saveFailed');
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const currentPayload = (
    targetStep?: OnboardingStepKey,
  ): UpdateOnboardingStateRequest => ({
    current_step: targetStep ? stepToBackend[targetStep] : undefined,
    selected_scenario: selectedScenario,
    recommended_team_name: recommendedTeamName,
    team_config: teamConfig,
    project_path: projectPath.trim() || undefined,
    project_name: sanitizeProjectName(projectName) || undefined,
    created_project_id: state?.created_project_id ?? undefined,
    language: localeToOnboardingLanguage[selectedLocale],
    appearance: selectedAppearance,
  });

  const saveDraft = (payload: UpdateOnboardingStateRequest) => {
    void saveState({
      ...currentPayload(activeStepKey === welcomeStepKey ? undefined : activeStepKey),
      ...payload,
    }).catch(() => undefined);
  };

  const validateProjectDraft = async () => {
    const name = sanitizeProjectName(projectName);
    if (!name) {
      setError(t('onboarding.project.nameRequired'));
      return null;
    }
    setProjectName(name);

    const path = projectPath.trim();
    if (!path) {
      setError(t('onboarding.project.invalid'));
      return null;
    }

    const status = await validateProjectPath(path);
    if (!status?.valid) {
      setError(status?.error ?? t('onboarding.project.invalid'));
      return null;
    }

    return { name, path };
  };

  const handleFinish = async () => {
    const projectDraft = await validateProjectDraft();
    if (!projectDraft) return;

    setSaving(true);
    setError(null);
    try {
      const createdProject = await onCreateProjectFromOnboarding({
        name: projectDraft.name,
        path: projectDraft.path,
        teamId: recommendedTeamId,
      });
      const state = await onboardingApi.complete({
        ...currentPayload('appearance'),
        project_name: projectDraft.name,
        project_path: projectDraft.path,
        created_project_id: createdProject.projectId,
      });
      applyState(state);
      onOpenCreateSession(state);
    } catch {
      setError(t('onboarding.project.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleWelcomeNext = async () => {
    await saveState({
      welcome_seen: true,
      current_step: OnboardingStep.scenario,
      selected_scenario: selectedScenario,
      recommended_team_name: recommendedTeamName,
    });
    setActiveStepKey('scenario');
  };

  const handleStepBack = () => {
    if (isWelcome) return;
    const previousIndex = Math.max(0, activeStepIndex - 1);
    setActiveStepKey(onboardingSteps[previousIndex]);
  };

  const handleStepNext = async () => {
    if (isWelcome) {
      await handleWelcomeNext();
      return;
    }

    if (activeStepKey === 'project_path') {
      const projectDraft = await validateProjectDraft();
      if (!projectDraft) return;
    }

    if (activeStepKey === 'appearance') {
      await handleFinish();
      return;
    }

    const nextStep = onboardingSteps[activeStepIndex + 1] ?? 'appearance';
    await saveState(currentPayload(nextStep));
    setActiveStepKey(nextStep);
  };

  const handleSkip = async () => {
    setSaving(true);
    setError(null);
    try {
      const state = await onboardingApi.complete(currentPayload('appearance'));
      applyState(state);
      onOpenCreateSession(state);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('onboarding.error.completeFailed'),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleScenarioSelect = (scenarioKey: OnboardingScenario) => {
    const scenario =
      scenarioDefinitions.find((candidate) => candidate.key === scenarioKey) ??
      scenarioDefinitions[0];
    const teamPreset = recommendOnboardingTeamTemplate(scenarioKey, teamPresets);
    const templateConfig = teamPresetToOnboardingConfig(teamPreset, runtimes);
    const nextTeamConfig =
      templateConfig.length > 0 ? templateConfig : scenario.members;
    const nextTeamName =
      teamPreset?.name ??
      scenarios.find((candidate) => candidate.key === scenarioKey)?.teamName ??
      scenario.teamFallback;
    setSelectedScenario(scenarioKey);
    setTeamConfig(nextTeamConfig);
    if (!projectNameTouched) {
      setProjectName(defaultProjectName);
    }
    setState((current) =>
      current
        ? {
            ...current,
            selected_scenario: scenarioKey,
            recommended_team_name: nextTeamName,
            team_config: nextTeamConfig,
          }
        : current,
    );
  };

  const updateTeamMember = (
    index: number,
    patch: Partial<OnboardingTeamMemberConfig>,
  ) => {
    setTeamConfig((members) =>
      members.map((member, memberIndex) =>
        memberIndex === index ? { ...member, ...patch } : member,
      ),
    );
  };

  const handleLocaleSelect = (option: { id: Locale; label: string }) => {
    setSelectedLocale(option.id);
    onPreviewLocaleChange(option.id);
    saveDraft({ language: localeToOnboardingLanguage[option.id] });
  };

  const handleAppearanceSelect = (option: { id: OnboardingAppearance }) => {
    setSelectedAppearance(option.id);
    onPreviewAppearanceChange(option.id);
    saveDraft({ appearance: option.id });
  };

  const loadDirectory = async (path?: string) => {
    setPathLoading(true);
    setPathError(null);
    try {
      const response = await filesystemApi.listDirectory(path?.trim() || undefined);
      const sortedEntries = [...response.entries].sort((a, b) => {
        if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(sortedEntries);
      setCurrentPath(response.current_path);
      setProjectPath(response.current_path);
    } catch (err) {
      setPathError(
        err instanceof Error ? err.message : t('onboarding.project.readFailed'),
      );
    } finally {
      setPathLoading(false);
    }
  };

  const loadRoots = async () => {
    setPathLoading(true);
    setPathError(null);
    try {
      const roots = await filesystemApi.listRoots();
      setEntries(roots);
      setCurrentPath('');
    } catch (err) {
      setPathError(
        err instanceof Error ? err.message : t('onboarding.project.rootsFailed'),
      );
    } finally {
      setPathLoading(false);
    }
  };

  const validateProjectPath = async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) {
      setProjectStatus(null);
      return null;
    }
    setPathLoading(true);
    setPathError(null);
    try {
      const status = await chatSessionsApi.validateWorkspacePath(trimmed);
      setProjectStatus(status);
      if (!status.valid) {
        setPathError(status.error ?? t('onboarding.project.invalid'));
      }
      return status;
    } catch (err) {
      setProjectStatus(null);
      setPathError(
        err instanceof Error ? err.message : t('onboarding.project.invalid'),
      );
      throw err;
    } finally {
      setPathLoading(false);
    }
  };

  const handleMarkUpgradeRead = async () => {
    setSaving(true);
    setError(null);
    try {
      const state = await onboardingApi.markUpgradeRead({ version: currentVersion });
      applyState(state);
      onUpgradeRead(state);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('onboarding.error.upgradeReadFailed'),
      );
    } finally {
      setSaving(false);
    }
  };

  const renderUpgradeGuide = () => (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)]">
      <div className="flex min-h-12 items-center justify-between border-b border-[var(--hairline)] px-5">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--primary)]" />
          <span className="truncate text-[13px] font-semibold text-[var(--ink)]">
            {t('onboarding.upgrade.eyebrow', { version: currentVersion })}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[var(--ink-tertiary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
        >
          {t('onboarding.upgrade.later')}
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-2)] p-5">
            <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">
              {t('onboarding.upgrade.title')}
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[var(--ink-subtle)]">
              {t('onboarding.upgrade.desc')}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              {
                title: t('onboarding.upgrade.featureGuide.title'),
                desc: t('onboarding.upgrade.featureGuide.desc'),
                Icon: Rocket,
              },
              {
                title: t('onboarding.upgrade.featureTeam.title'),
                desc: t('onboarding.upgrade.featureTeam.desc'),
                Icon: Users,
              },
              {
                title: t('onboarding.upgrade.featureComposer.title'),
                desc: t('onboarding.upgrade.featureComposer.desc'),
                Icon: Bot,
              },
            ].map(({ title, desc, Icon }) => (
              <div
                key={title}
                className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] p-4"
              >
                <Icon className="h-4 w-4 text-[var(--primary)]" />
                <h2 className="mt-3 text-[13px] font-semibold text-[var(--ink)]">
                  {title}
                </h2>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-subtle)]">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
        <aside className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-2)] p-4">
          <h2 className="text-[13px] font-semibold text-[var(--ink)]">
            {t('onboarding.upgrade.stateTitle')}
          </h2>
          <div className="mt-3 divide-y divide-[var(--hairline)] rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] text-[12px]">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-[var(--ink-subtle)]">current_version</span>
              <span className="font-mono text-[var(--ink)]">{currentVersion}</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-[var(--ink-subtle)]">
                last_seen_upgrade_version
              </span>
              <span className="truncate font-mono text-[var(--ink)]">
                {state?.last_seen_upgrade_version ?? 'null'}
              </span>
            </div>
          </div>
          {error && <p className="mt-3 text-[12px] text-red-400">{error}</p>}
          <button
            type="button"
            onClick={() => void handleMarkUpgradeRead()}
            disabled={saving}
            className="mt-4 inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-4 text-[13px] font-semibold text-[var(--on-primary)] transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            {t('onboarding.upgrade.markRead')}
          </button>
        </aside>
      </div>
    </section>
  );

  const renderExecutorStep = () => (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-semibold text-[var(--ink)]">
          {t('onboarding.executor.teamTitle', { team: recommendedTeamName })}
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-subtle)]">
          {t('onboarding.executor.desc')}
        </p>
      </div>
      {runtimeError && (
        <p className="rounded-[8px] border border-yellow-500/25 bg-yellow-500/10 px-3 py-2 text-[12px] text-yellow-200">
          {runtimeError}
        </p>
      )}
      <div className="overflow-hidden rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)]">
        {teamMembers.map((member, index) => {
          const runnerValue = member.runner_type || runnerOptions[0]?.id || '';
          const modelOptions = modelOptionsForRunner(runnerValue);
          const modelValue = member.model_name || modelOptions[0]?.id || '';
          return (
            <div
              key={`${member.member}-${index}`}
              className={cn(
                'grid gap-3 px-4 py-3 md:grid-cols-[minmax(150px,1fr)_minmax(160px,220px)_minmax(160px,220px)] md:items-center',
                index < teamMembers.length - 1 && 'border-b border-[var(--hairline)]',
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] text-[11px] font-semibold text-[var(--ink-muted)]">
                  {member.member.slice(0, 2).toUpperCase()}
                </span>
                <span className="truncate text-[13px] font-semibold text-[var(--ink)]">
                  {member.member}
                </span>
              </div>
              <DropdownSelect
                value={runnerValue}
                options={runnerOptions}
                showSearch={false}
                placeholder={t('onboarding.executor.runnerPlaceholder')}
                onChange={(value) =>
                  updateTeamMember(index, {
                    runner_type: value,
                    model_name: modelOptionsForRunner(value)[0]?.id,
                  })
                }
                maxPanelHeightClassName="max-h-[190px]"
              />
              <DropdownSelect
                value={modelValue}
                options={modelOptions}
                placeholder={t('onboarding.executor.modelPlaceholder')}
                onChange={(value) => updateTeamMember(index, { model_name: value })}
                maxPanelHeightClassName="max-h-[190px]"
              />
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderScenarioStep = () => (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-semibold text-[var(--ink)]">
          {t('onboarding.scenario.title')}
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-subtle)]">
          {t('onboarding.scenario.desc')}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {scenarios.map((scenario) => {
          const selected = scenario.key === selectedScenario;
          return (
            <button
              key={scenario.key}
              type="button"
              onClick={() => handleScenarioSelect(scenario.key)}
              className={cn(
                'min-h-[118px] cursor-pointer rounded-[8px] border bg-[var(--surface-1)] p-4 text-left transition hover:border-[var(--hairline-strong)] hover:bg-[var(--surface-3)]',
                selected
                  ? 'border-[var(--primary)] bg-[var(--primary-tint)]'
                  : 'border-[var(--hairline)]',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="truncate text-[13px] font-semibold text-[var(--ink)]">
                  {scenario.title}
                </h3>
                {selected && <Check className="h-4 w-4 text-[var(--primary)]" />}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink-subtle)]">
                {scenario.desc}
              </p>
            </button>
          );
        })}
      </div>
      <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] p-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--ink-tertiary)]">
          {t('onboarding.scenario.recommendedTeam')}
        </p>
        <div className="mt-3 flex items-center gap-3 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-3">
          <Users className="h-4 w-4 shrink-0 text-[var(--primary)]" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[var(--ink)]">
              {recommendedTeamName}
            </p>
            <p className="mt-0.5 text-[12px] text-[var(--ink-subtle)]">
              {t('onboarding.scenario.memberDetailsHint')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderProjectPathStep = () => (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-semibold text-[var(--ink)]">
          {t('onboarding.project.createTitle')}
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-subtle)]">
          {t('onboarding.project.createDesc')}
        </p>
      </div>
      <section className="grid gap-3 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] p-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <label className="block min-w-0 text-[12px] font-semibold text-[var(--ink-tertiary)]">
          {t('onboarding.project.nameTitle')}
          <input
            value={projectName}
            onChange={(event) => {
              setProjectName(event.target.value);
              setProjectNameTouched(true);
            }}
            onBlur={() => setProjectName((current) => sanitizeProjectName(current))}
            className="mt-2 h-9 w-full rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-3 text-[13px] text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-tertiary)] focus:border-[var(--primary)]"
            placeholder={t('onboarding.project.namePlaceholder')}
          />
        </label>
        <div className="min-w-0 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--ink-tertiary)]">
            {t('onboarding.scenario.recommendedTemplate')}
          </p>
          <p className="mt-1 truncate text-[13px] font-semibold text-[var(--ink)]">
            {recommendedTeamName}
          </p>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <section className="overflow-hidden rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)]">
          <div className="flex items-center gap-1.5 border-b border-[var(--hairline)] px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--ink-tertiary)]">
              {currentPath || t('onboarding.project.localRoots')}
            </span>
            <button
              type="button"
              onClick={() => void loadRoots()}
              className="flex h-7 w-7 items-center justify-center rounded-[5px] text-[var(--ink-tertiary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
              aria-label={t('onboarding.project.roots')}
              title={t('onboarding.project.roots')}
            >
              <Home className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={!currentPath}
              onClick={() => {
                const parent = getParentPath(currentPath);
                if (parent) void loadDirectory(parent);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-[5px] text-[var(--ink-tertiary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('onboarding.project.up')}
              title={t('onboarding.project.up')}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void loadDirectory(projectPath)}
              className="flex h-7 w-7 items-center justify-center rounded-[5px] text-[var(--ink-tertiary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
              aria-label={t('onboarding.project.refresh')}
              title={t('onboarding.project.refresh')}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="h-[236px] overflow-y-auto p-1.5">
            {pathLoading ? (
              <div className="px-2 py-2 text-[12px] text-[var(--ink-tertiary)]">
                {t('onboarding.project.loading')}
              </div>
            ) : entries.length === 0 ? (
              <div className="px-2 py-2 text-[12px] text-[var(--ink-tertiary)]">
                {t('onboarding.project.empty')}
              </div>
            ) : (
              entries.map((entry) => {
                const Icon = entry.is_directory ? Folder : FileText;
                const selected = entry.path === projectPath.trim();
                return (
                  <div
                    key={`${entry.path}-${directoryEntryTime(entry)}`}
                    className={cn(
                      'group/path-entry flex items-center rounded-[6px]',
                      selected && 'bg-[var(--surface-3)]',
                    )}
                  >
                    <button
                      type="button"
                      disabled={!entry.is_directory}
                      onClick={() => {
                        if (entry.is_directory) void loadDirectory(entry.path);
                      }}
                      className="flex min-h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12px] text-[var(--ink-subtle)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-55"
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0',
                          entry.is_git_repo
                            ? 'text-[var(--primary)]'
                            : 'text-[var(--ink-tertiary)]',
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate font-mono">
                        {entry.name}
                      </span>
                      {entry.is_git_repo && (
                        <span className="rounded-[4px] bg-[var(--primary-tint)] px-1.5 py-px font-mono text-[10px] font-semibold text-[var(--primary-hover)]">
                          GIT
                        </span>
                      )}
                    </button>
                    {entry.is_directory && (
                      <button
                        type="button"
                        onClick={() => {
                          setProjectPath(entry.path);
                          void validateProjectPath(entry.path);
                        }}
                        className={cn(
                          'mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] text-[var(--ink-tertiary)] opacity-0 transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)] group-hover/path-entry:opacity-100',
                          selected && '!opacity-100',
                        )}
                        aria-label={t('onboarding.project.select')}
                        title={t('onboarding.project.select')}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <aside className="space-y-3 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] p-3">
          <label className="block text-[12px] font-semibold text-[var(--ink-tertiary)]">
            {t('onboarding.project.selectedPath')}
            <input
              value={projectPath}
              onChange={(event) => setProjectPath(event.target.value)}
              className="mt-2 h-9 w-full rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-3 font-mono text-[12px] text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-tertiary)] focus:border-[var(--primary)]"
              placeholder={t('onboarding.project.pathPlaceholder')}
            />
          </label>
          <button
            type="button"
            onClick={() => void validateProjectPath(projectPath)}
            disabled={!projectPath.trim() || pathLoading}
            className="inline-flex h-8 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-[var(--hairline-strong)] px-3 text-[12px] font-semibold text-[var(--ink-muted)] transition hover:bg-[var(--surface-3)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            {t('onboarding.project.validate')}
          </button>
          <div className="divide-y divide-[var(--hairline)] rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] text-[12px]">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-[var(--ink-subtle)]">
                {t('onboarding.project.status')}
              </span>
              <span className="font-semibold text-[var(--ink)]">
                {projectStatus?.valid
                  ? t('onboarding.project.valid')
                  : t('onboarding.project.pending')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-[var(--ink-subtle)]">
                {t('onboarding.project.gitStatus')}
              </span>
              <span className="font-semibold text-[var(--ink)]">
                {projectStatus
                  ? isGitRepoLabel(projectStatus.is_git_repo, t)
                  : '-'}
              </span>
            </div>
          </div>
          {(pathError || error) && (
            <p className="text-[12px] leading-relaxed text-red-400">
              {pathError || error}
            </p>
          )}
        </aside>
      </div>
    </div>
  );

  const renderAppearanceStep = () => {
    const languageOptions: Array<{ id: Locale; label: string }> = [
      { id: 'zh', label: t('language.zh') },
      { id: 'en', label: t('language.en') },
      { id: 'ja', label: t('language.ja') },
      { id: 'ko', label: t('language.ko') },
      { id: 'fr', label: t('language.fr') },
      { id: 'es', label: t('language.es') },
    ];
    const appearanceOptions = [
      {
        id: OnboardingAppearance.dark,
        label: t('onboarding.appearance.dark'),
      },
      {
        id: OnboardingAppearance.light,
        label: t('onboarding.appearance.light'),
      },
      {
        id: OnboardingAppearance.system,
        label: t('onboarding.appearance.system'),
      },
    ];

    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-[16px] font-semibold text-[var(--ink)]">
            {t('onboarding.appearance.title')}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-subtle)]">
            {t('onboarding.appearance.desc')}
          </p>
        </div>
        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold text-[var(--ink)]">
            {t('onboarding.appearance.languageTitle')}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {languageOptions.map((option) => (
              <label
                key={option.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-[8px] border px-3 py-2 text-[13px] transition',
                  selectedLocale === option.id
                    ? 'border-[var(--primary)] bg-[var(--primary-tint)] text-[var(--ink)]'
                    : 'border-[var(--hairline)] bg-[var(--surface-1)] text-[var(--ink-subtle)] hover:border-[var(--hairline-strong)] hover:text-[var(--ink)]',
                )}
              >
                <input
                  type="radio"
                  name="onboarding-language"
                  value={option.id}
                  checked={selectedLocale === option.id}
                  onChange={() => handleLocaleSelect(option)}
                  className="h-3.5 w-3.5 accent-[var(--primary)]"
                />
                <span className="truncate">{option.label}</span>
              </label>
            ))}
          </div>
        </section>
        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold text-[var(--ink)]">
            {t('onboarding.appearance.themeTitle')}
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {appearanceOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleAppearanceSelect(option)}
                className={cn(
                  'cursor-pointer rounded-[8px] border p-3 text-left transition',
                  selectedAppearance === option.id
                    ? 'border-[var(--primary)] bg-[var(--primary-tint)]'
                    : 'border-[var(--hairline)] bg-[var(--surface-1)] hover:border-[var(--hairline-strong)] hover:bg-[var(--surface-3)]',
                )}
              >
                <div className="h-12 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] p-2">
                  <div className="h-2 rounded bg-[var(--surface-3)]" />
                  <div className="mt-3 h-2 w-1/2 rounded bg-[var(--primary)]" />
                </div>
                <p className="mt-2 text-[13px] font-semibold text-[var(--ink)]">
                  {option.label}
                </p>
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  };

  const renderStepBody = () => {
    if (isWelcome) {
      return (
        <div className="grid min-h-0 flex-1 place-items-center p-6">
          <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr_340px] lg:items-center">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold uppercase tracking-[0.08em] text-[var(--primary)]">
                OpenTeams
              </p>
              <h1 className="mt-3 max-w-2xl text-[28px] font-semibold leading-tight tracking-tight text-[var(--ink)]">
                {t('onboarding.welcome.title')}
              </h1>
              <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-[var(--ink-subtle)]">
                {t('onboarding.welcome.desc')}
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {[
                  t('onboarding.welcome.pointLocal'),
                  t('onboarding.welcome.pointTeams'),
                  t('onboarding.welcome.pointWorkflow'),
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-[12px] font-medium text-[var(--ink-muted)]"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="relative h-[310px] overflow-hidden rounded-[18px] border border-[var(--hairline)] bg-[var(--surface-2)]">
              <div className="absolute inset-5 rounded-[14px] border border-[var(--hairline)]" />
              <div className="absolute left-8 top-8 flex h-11 w-16 items-center justify-center rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-1)]">
                <TerminalSquare className="h-5 w-5 text-[var(--primary)]" />
              </div>
              <div className="absolute right-9 top-16 flex h-11 w-16 items-center justify-center rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-1)]">
                <Code2 className="h-5 w-5 text-[var(--ink-muted)]" />
              </div>
              <div className="absolute left-24 top-32 flex h-11 w-16 items-center justify-center rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-1)]">
                <Bot className="h-5 w-5 text-[var(--ink-muted)]" />
              </div>
              <div className="absolute bottom-8 left-8 right-8 rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--canvas)] p-4">
                <div className="h-2.5 w-3/4 rounded-full bg-[var(--primary)]" />
                <div className="mt-3 h-2.5 w-1/2 rounded-full bg-[var(--hairline-strong)]" />
                <div className="mt-3 h-2.5 w-5/6 rounded-full bg-[var(--hairline-strong)]" />
              </div>
            </div>
          </div>
        </div>
      );
    }

    switch (activeStepKey) {
      case 'executor':
        return renderExecutorStep();
      case 'project_path':
        return renderProjectPathStep();
      case 'appearance':
        return renderAppearanceStep();
      case 'scenario':
      default:
        return renderScenarioStep();
    }
  };

  if (mode === 'upgrade') {
    return (
      <div className="fixed inset-0 z-[90] bg-black/55 p-4 backdrop-blur-sm">
        <div className="mx-auto flex h-full max-w-6xl flex-col">
          {renderUpgradeGuide()}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[90] bg-[var(--canvas)] p-3 text-[var(--ink)]">
      <section className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)]">
        {!isWelcome && (
          <header className="flex min-h-12 items-center justify-between border-b border-[var(--hairline)] px-5">
            <div className="flex min-w-0 items-center gap-2">
              <Rocket className="h-4 w-4 text-[var(--primary)]" />
              <span className="truncate text-[13px] font-semibold text-[var(--ink)]">
                {t('onboarding.header.title')}
              </span>
            </div>
            <span className="rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] px-2.5 py-1 text-[12px] font-medium text-[var(--ink-subtle)]">
              {t('onboarding.header.step', {
                current: activeStepIndex + 1,
                total: onboardingSteps.length,
              })}
            </span>
          </header>
        )}

        <div className={cn('grid min-h-0 flex-1', !isWelcome && 'lg:grid-cols-[280px_1fr]')}>
          {!isWelcome && (
            <aside className="hidden min-h-0 border-r border-[var(--hairline)] bg-[var(--surface-2)] p-4 lg:block">
              <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--ink-tertiary)]">
                {t('onboarding.steps.title')}
              </p>
              <div className="mt-4 space-y-1.5">
                {onboardingSteps.map((step, index) => {
                  const active = step === activeStepKey;
                  const done = index < activeStepIndex;
                  const Icon =
                    step === 'scenario'
                      ? Users
                      : step === 'executor'
                        ? Bot
                        : step === 'project_path'
                          ? FolderOpen
                          : Palette;
                  return (
                    <button
                      key={step}
                      type="button"
                      onClick={() => {
                        if (index <= activeStepIndex) setActiveStepKey(step);
                      }}
                      disabled={index > activeStepIndex}
                      className={cn(
                        'grid w-full cursor-pointer grid-cols-[28px_1fr] gap-2 rounded-[8px] border px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
                        active
                          ? 'border-[var(--hairline-strong)] bg-[var(--surface-1)] text-[var(--ink)]'
                          : 'border-transparent text-[var(--ink-subtle)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]',
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-7 w-7 place-items-center rounded-[7px] border border-[var(--hairline)] bg-[var(--surface-2)] text-[11px] font-semibold',
                          done && 'border-[var(--primary)] text-[var(--primary)]',
                        )}
                      >
                        {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-semibold">
                          {t(`onboarding.step.${stepI18nKeys[step]}.title`)}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-[var(--ink-tertiary)]">
                          {t(`onboarding.step.${stepI18nKeys[step]}.hint`)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 h-1 overflow-hidden rounded-full bg-[var(--surface-4)]">
                <div
                  className="h-full rounded-full bg-[var(--primary)] transition-[width]"
                  style={{
                    width: `${((activeStepIndex + 1) / onboardingSteps.length) * 100}%`,
                  }}
                />
              </div>
            </aside>
          )}

          <main className="flex min-h-0 min-w-0 flex-col">
            <div className={cn('min-h-0 flex-1 overflow-y-auto', isWelcome ? 'flex flex-col' : 'p-5')}>
              {renderStepBody()}
            </div>
            {error && !isWelcome && (
              <p className="border-t border-[var(--hairline)] px-5 py-2 text-[12px] text-red-400">
                {error}
              </p>
            )}
            {isWelcome ? (
              <footer className="flex justify-center border-t border-[var(--hairline)] px-5 py-4">
                <button
                  type="button"
                  onClick={() => void handleWelcomeNext()}
                  disabled={saving}
                  className="inline-flex h-11 min-w-[180px] cursor-pointer items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-6 text-[14px] font-semibold text-[var(--on-primary)] transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  {t('onboarding.welcome.next')}
                </button>
              </footer>
            ) : (
              <footer className="flex min-h-[64px] items-center justify-between gap-3 border-t border-[var(--hairline)] px-5">
                <button
                  type="button"
                  onClick={() => void handleSkip()}
                  disabled={saving}
                  className="cursor-pointer rounded-md px-3 py-2 text-[12px] font-medium text-[var(--ink-tertiary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('onboarding.action.skip')}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleStepBack}
                    disabled={saving || activeStepIndex === 0}
                    className="h-9 cursor-pointer rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-4 text-[13px] font-medium text-[var(--ink-muted)] transition hover:bg-[var(--surface-3)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {t('onboarding.action.back')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStepNext()}
                    disabled={saving}
                    className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-4 text-[13px] font-semibold text-[var(--on-primary)] transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                    {activeStepKey === 'appearance'
                      ? t('onboarding.action.startNow')
                      : t('onboarding.action.next')}
                  </button>
                </div>
              </footer>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}
