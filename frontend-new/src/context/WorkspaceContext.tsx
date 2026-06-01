import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Theme,
  Locale,
  TaskNode,
  Member,
  Session,
  Message,
  Provider,
  Strategy,
  BackendChatSkill,
  Config,
  WorkflowCardProjection,
  WorkspaceChangesResponse,
} from '@/types';
import { i18nDict } from '@/i18n';
import { mockFrontendApi } from '@/lib/mockFrontendApi';
import type { WorkspaceBootstrapMock } from '@/mockApiData';
import {
  chatAgentsApi,
  chatMessagesApi,
  chatSessionsApi,
  cliConfigApi,
  projectApi,
  sessionAgentsApi,
  skillsApi,
  systemApi,
  workflowApi,
} from '@/lib/api';
import type { CreateProjectRequest, Project } from '../../../shared/types';
import {
  mapMessages,
  mapProviders,
  mapSessionAgentsToMembers,
  mapSessions,
} from '@/lib/mappers';
import {
  AsyncResourceState,
  beginLoad,
  fail,
  initialAsync,
  succeed,
} from '@/lib/asyncResource';

type ListUpdater<T> = T[] | ((prev: T[]) => T[]);

interface WorkspaceContextProps {
  theme: Theme;
  setTheme: (t: Theme) => void;
  locale: Locale;
  setLocale: (l: Locale) => void;
  tasks: TaskNode[];
  setTasks: (t: ListUpdater<TaskNode>) => void;
  members: Member[];
  setMembers: (m: ListUpdater<Member>) => void;
  sessions: Session[];
  setSessions: (s: ListUpdater<Session>) => void;
  projects: Project[];
  projectsAsync: AsyncResourceState<Project[]>;
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  refreshProjects: () => Promise<void>;
  createProject: (data: CreateProjectRequest) => Promise<Project>;
  messages: Message[];
  activeSessionId: string;
  setActiveSessionId: (id: string) => void;
  providers: Provider[];
  setProviders: (p: ListUpdater<Provider>) => void;
  strategies: Strategy[];
  selectedStrategyId: string;
  setSelectedStrategyId: (id: string) => void;
  selectedOnboardType: 'saas' | 'cli' | 'game' | 'ai';
  setSelectedOnboardType: (type: 'saas' | 'cli' | 'game' | 'ai') => void;
  smartRouting: boolean;
  setSmartRouting: (b: boolean) => void;
  showCost: boolean;
  setShowCost: (b: boolean) => void;
  showExplanation: boolean;
  setShowExplanation: (b: boolean) => void;
  warnOverDollar: boolean;
  setWarnOverDollar: (b: boolean) => void;
  weeklyCost: number;
  weeklySaved: number;
  earlyBirdLeft: number;
  setEarlyBirdLeft: (n: number | ((prev: number) => number)) => void;

  // Modals state
  isNewTaskModalOpen: boolean;
  setIsNewTaskModalOpen: (b: boolean) => void;
  isRetryModalOpen: boolean;
  setIsRetryModalOpen: (b: boolean) => void;
  isAddMemberModalOpen: boolean;
  setIsAddMemberModalOpen: (b: boolean) => void;
  isAddProviderModalOpen: boolean;
  setIsAddProviderModalOpen: (b: boolean) => void;

  // Active Simulation Utilities
  sendMessage: (text: string) => void;
  addNewTask: (title: string, details: string, chosenMembers: string[]) => void;
  retryWorkflowFromStep3: () => void;
  addMemberToOrganization: (name: string, model: string) => void;
  addProviderToKeychain: (name: string, key: string) => void;

  // i18n hook helper
  t: (key: string, replacements?: Record<string, string | number>) => string;

  // Toast notifications
  toast: string | null;
  showToast: (msg: string) => void;

  // Settings active section
  activeSettingsTab: string;
  setActiveSettingsTab: (tab: string) => void;

  // Async-status surface appended to the preserved legacy context shape.
  sessionsAsync: AsyncResourceState<Session[]>;
  refreshSessions: () => Promise<void>;
  messagesAsync: AsyncResourceState<Message[]>;
  refreshMessages: () => Promise<void>;
  membersAsync: AsyncResourceState<Member[]>;
  refreshMembers: () => Promise<void>;
  providersAsync: AsyncResourceState<Provider[]>;
  refreshProviders: () => Promise<void>;
  skills: BackendChatSkill[];
  skillsAsync: AsyncResourceState<BackendChatSkill[]>;
  refreshSkills: () => Promise<void>;
  config: Config | null;
  configAsync: AsyncResourceState<Config | null>;
  refreshConfig: () => Promise<void>;
  workflowCard: WorkflowCardProjection | null;
  workflowCardAsync: AsyncResourceState<WorkflowCardProjection | null>;
  refreshWorkflowCard: (messageId: string) => Promise<void>;
  workspaceChanges: WorkspaceChangesResponse | null;
  workspaceChangesAsync: AsyncResourceState<WorkspaceChangesResponse | null>;
  refreshWorkspaceChanges: (
    sessionId: string,
    path: string,
    includeDiff?: boolean,
  ) => Promise<void>;
  /** Re-runs every auto-loaded resource. Useful as a global retry. */
  refreshAll: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextProps | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('openteams-design-mode');
      return (saved === 'light' || saved === 'dark') ? (saved as Theme) : 'dark';
    } catch {
      return 'dark';
    }
  });

  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      const saved = localStorage.getItem('openteams-locale');
      return ['en', 'zh', 'ja', 'ko', 'fr', 'es'].includes(saved ?? '')
        ? (saved as Locale)
        : 'zh';
    } catch {
      return 'zh';
    }
  });
  const [tasks, setTasks] = useState<TaskNode[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const mockBootstrapRef = useRef<WorkspaceBootstrapMock | null>(null);
  const toastDurationMsRef = useRef(3000);

  // Async-backed primary resources. Each is seeded with the existing mock so
  // the UI renders before the first API response arrives (or if the backend
  // is unreachable / has a contract gap).
  const [sessionsAsync, setSessionsAsync] =
    useState<AsyncResourceState<Session[]>>(() => initialAsync([]));
  const [projectsAsync, setProjectsAsync] =
    useState<AsyncResourceState<Project[]>>(() => initialAsync([]));
  const [selectedProjectId, setSelectedProjectIdState] = useState<string>('');
  const [allMessages, setAllMessages] =
    useState<Record<string, Message[]>>({});
  const [messagesAsync, setMessagesAsync] =
    useState<AsyncResourceState<Message[]>>(() =>
      initialAsync([]),
    );
  const [membersAsync, setMembersAsync] =
    useState<AsyncResourceState<Member[]>>(() => initialAsync([]));
  const [providersAsync, setProvidersAsync] =
    useState<AsyncResourceState<Provider[]>>(() => initialAsync([]));
  const [skillsAsync, setSkillsAsync] =
    useState<AsyncResourceState<BackendChatSkill[]>>(() => initialAsync([]));
  const [configAsync, setConfigAsync] =
    useState<AsyncResourceState<Config | null>>(() => initialAsync(null));
  const [workflowCardAsync, setWorkflowCardAsync] =
    useState<AsyncResourceState<WorkflowCardProjection | null>>(() =>
      initialAsync(null),
    );
  const [workspaceChangesAsync, setWorkspaceChangesAsync] =
    useState<AsyncResourceState<WorkspaceChangesResponse | null>>(() =>
      initialAsync(null),
    );

  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [mockAgentRepliesByMention, setMockAgentRepliesByMention] =
    useState<Record<string, string[]>>({ default: ['Working on it.'] });
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('');
  const [selectedOnboardType, setSelectedOnboardType] = useState<'saas' | 'cli' | 'game' | 'ai'>('saas');

  // Global Settings Switches
  const [smartRouting, setSmartRouting] = useState<boolean>(true);
  const [showCost, setShowCost] = useState<boolean>(true);
  const [showExplanation, setShowExplanation] = useState<boolean>(true);
  const [warnOverDollar, setWarnOverDollar] = useState<boolean>(false);

  // Stats (LOCAL / MOCK-FALLBACK per backend_contract_audit §5.1)
  const [weeklyCost, setWeeklyCost] = useState<number>(0);
  const [weeklySaved, setWeeklySaved] = useState<number>(0);
  const [earlyBirdLeft, setEarlyBirdLeft] = useState<number>(0);

  // Settings view controller
  const [activeSettingsTab, setActiveSettingsTab] = useState<string>('providers');

  // Modal Switches
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState<boolean>(false);
  const [isRetryModalOpen, setIsRetryModalOpen] = useState<boolean>(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState<boolean>(false);
  const [isAddProviderModalOpen, setIsAddProviderModalOpen] = useState<boolean>(false);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  // Cache the latest activeSessionId so async callbacks see the live value.
  const activeSessionIdRef = useRef(activeSessionId);
  const selectedProjectIdRef = useRef(selectedProjectId);
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);
  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast(null);
    }, toastDurationMsRef.current);
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem('openteams-design-mode', t);
    } catch {}
  };

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem('openteams-locale', l);
    } catch {}
  };

  useEffect(() => {
    document.body.setAttribute('data-mode', theme);
  }, [theme]);

  const makeListSetter =
    <T,>(
      setAsync: React.Dispatch<React.SetStateAction<AsyncResourceState<T[]>>>,
    ) =>
    (next: ListUpdater<T>) => {
      setAsync((prev) => {
        const newData =
          typeof next === 'function'
            ? (next as (p: T[]) => T[])(prev.data)
            : next;
        return { ...prev, data: newData, empty: newData.length === 0 };
      });
    };

  const setSessions = useCallback(makeListSetter<Session>(setSessionsAsync), []);
  const setMembers = useCallback(makeListSetter<Member>(setMembersAsync), []);
  const setProviders = useCallback(makeListSetter<Provider>(setProvidersAsync), []);

  const setSelectedProjectId = useCallback((id: string) => {
    selectedProjectIdRef.current = id;
    setSelectedProjectIdState(id);
  }, []);

  const applyMockBootstrap = useCallback((bootstrap: WorkspaceBootstrapMock) => {
    mockBootstrapRef.current = bootstrap;
    toastDurationMsRef.current = bootstrap.defaults.toastDurationMs;
    setTasks(bootstrap.tasks);
    setSessionsAsync(initialAsync(bootstrap.sessions));
    setAllMessages(bootstrap.messagesBySession);
    const nextActiveSessionId =
      bootstrap.defaults.activeSessionId || bootstrap.sessions[0]?.id || '';
    setActiveSessionId(nextActiveSessionId);
    activeSessionIdRef.current = nextActiveSessionId;
    setMessagesAsync(
      initialAsync(bootstrap.messagesBySession[nextActiveSessionId] ?? []),
    );
    setMembersAsync(initialAsync(bootstrap.members));
    setProvidersAsync(initialAsync(bootstrap.providers));
    setStrategies(bootstrap.strategies);
    setMockAgentRepliesByMention(bootstrap.agentRepliesByMention);
    setSelectedStrategyId(bootstrap.defaults.selectedStrategyId);
    setSelectedOnboardType(bootstrap.defaults.selectedOnboardType);
    setSmartRouting(bootstrap.defaults.smartRouting);
    setShowCost(bootstrap.defaults.showCost);
    setShowExplanation(bootstrap.defaults.showExplanation);
    setWarnOverDollar(bootstrap.defaults.warnOverDollar);
    setWeeklyCost(bootstrap.defaults.weeklyCost);
    setWeeklySaved(bootstrap.defaults.weeklySaved);
    setEarlyBirdLeft(bootstrap.defaults.earlyBirdLeft);
    setActiveSettingsTab(bootstrap.defaults.activeSettingsTab);
  }, []);

  const refreshProjects = useCallback(async (): Promise<void> => {
    setProjectsAsync(beginLoad);
    try {
      const projects = await projectApi.listProjects();
      setProjectsAsync(succeed(projects));
      const currentProjectId = selectedProjectIdRef.current;
      if (
        projects.length > 0 &&
        !projects.some((project) => project.id === currentProjectId)
      ) {
        setSelectedProjectId(projects[0].id);
      }
    } catch (err) {
      setProjectsAsync((prev) => fail(prev, err, []));
    }
  }, [setSelectedProjectId]);

  const createProject = useCallback(
    async (data: CreateProjectRequest): Promise<Project> => {
      const project = await projectApi.createProject(data);
      setProjectsAsync((prev) =>
        succeed([project, ...prev.data.filter((item) => item.id !== project.id)]),
      );
      setSelectedProjectId(project.id);
      return project;
    },
    [setSelectedProjectId],
  );

  const refreshSessions = useCallback(async (): Promise<void> => {
    setSessionsAsync(beginLoad);
    try {
      const projectId = selectedProjectIdRef.current || undefined;
      const backend = await chatSessionsApi.list(undefined, projectId);
      const mapped = mapSessions(backend, activeSessionIdRef.current);
      setSessionsAsync(succeed(mapped));
      // If the previously active session id no longer exists, fall back to the
      // first available session so the UI is never stuck on a stale id.
      if (
        mapped.length > 0 &&
        !mapped.some((s) => s.id === activeSessionIdRef.current)
      ) {
        setActiveSessionId(mapped[0].id);
      } else if (mapped.length === 0 && activeSessionIdRef.current) {
        activeSessionIdRef.current = '';
        setActiveSessionId('');
      }
    } catch (err) {
      setSessionsAsync((prev) => fail(prev, err));
    }
  }, []);

  const refreshMessages = useCallback(async (): Promise<void> => {
    const sid = activeSessionIdRef.current;
    setMessagesAsync(beginLoad);
    try {
      const [backendMsgs, backendAgents] = await Promise.all([
        chatMessagesApi.list(sid),
        chatAgentsApi.list().catch(() => []),
      ]);
      const agentNamesById: Record<string, string> = {};
      const agentModelsById: Record<string, string | null> = {};
      for (const a of backendAgents) {
        agentNamesById[a.id] = a.name;
        agentModelsById[a.id] = a.model_name;
      }
      const mapped = mapMessages(backendMsgs, {
        agentNamesById,
        agentModelsById,
      });
      setMessagesAsync(succeed(mapped));
      setAllMessages((prev) => ({ ...prev, [sid]: mapped }));
    } catch (err) {
      const mock = mockBootstrapRef.current?.messagesBySession[sid] ?? [];
      setMessagesAsync((prev) => fail(prev, err, mock));
    }
  }, []);

  const refreshMembers = useCallback(async (): Promise<void> => {
    const sid = activeSessionIdRef.current;
    setMembersAsync(beginLoad);
    try {
      const [agents, sessionAgents] = await Promise.all([
        chatAgentsApi.list(),
        sessionAgentsApi.list(sid).catch(() => []),
      ]);
      const mapped = mapSessionAgentsToMembers(sessionAgents, agents);
      setMembersAsync(succeed(mapped));
    } catch (err) {
      setMembersAsync((prev) =>
        fail(prev, err, mockBootstrapRef.current?.members ?? []),
      );
    }
  }, []);

  const refreshProviders = useCallback(async (): Promise<void> => {
    setProvidersAsync(beginLoad);
    try {
      const [infos, cliConfig] = await Promise.all([
        cliConfigApi.listProviders(),
        cliConfigApi.getConfig().catch(() => null),
      ]);
      const mapped = mapProviders(infos, cliConfig);
      setProvidersAsync(succeed(mapped));
    } catch (err) {
      setProvidersAsync((prev) =>
        fail(prev, err, mockBootstrapRef.current?.providers ?? []),
      );
    }
  }, []);

  const refreshSkills = useCallback(async (): Promise<void> => {
    setSkillsAsync(beginLoad);
    try {
      const list = await skillsApi.list();
      setSkillsAsync(succeed(list));
    } catch (err) {
      setSkillsAsync((prev) => fail(prev, err, []));
    }
  }, []);

  const refreshConfig = useCallback(async (): Promise<void> => {
    setConfigAsync(beginLoad);
    try {
      const info = await systemApi.getInfo();
      setConfigAsync(succeed(info.config));
    } catch (err) {
      setConfigAsync((prev) => fail(prev, err, null));
    }
  }, []);

  const refreshWorkflowCard = useCallback(
    async (messageId: string): Promise<void> => {
      setWorkflowCardAsync(beginLoad);
      try {
        const card = await chatMessagesApi.getWorkflowCard(messageId, 'full');
        setWorkflowCardAsync(succeed(card));
      } catch (err) {
        setWorkflowCardAsync((prev) => fail(prev, err, null));
      }
    },
    [],
  );

  const refreshWorkspaceChanges = useCallback(
    async (
      sessionId: string,
      path: string,
      includeDiff?: boolean,
    ): Promise<void> => {
      setWorkspaceChangesAsync(beginLoad);
      try {
        const resp = await chatSessionsApi.getWorkspaceChanges(
          sessionId,
          path,
          includeDiff,
        );
        setWorkspaceChangesAsync(succeed(resp));
      } catch (err) {
        setWorkspaceChangesAsync((prev) => fail(prev, err, null));
      }
    },
    [],
  );

  const refreshAll = useCallback(async (): Promise<void> => {
    await Promise.all([
      refreshProjects(),
      refreshSessions(),
      refreshProviders(),
      refreshSkills(),
      refreshConfig(),
      refreshMembers(),
      refreshMessages(),
    ]);
  }, [
    refreshSessions,
    refreshProjects,
    refreshProviders,
    refreshSkills,
    refreshConfig,
    refreshMembers,
    refreshMessages,
  ]);

  // Initial load: hydrate local mock API data first, then try backend-backed
  // resources. Backend failures keep the mock API payload visible.
  useEffect(() => {
    void (async () => {
      const bootstrap = await mockFrontendApi.getWorkspaceBootstrap();
      applyMockBootstrap(bootstrap);
      await refreshAll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the active session changes, re-fetch its scoped data.
  useEffect(() => {
    if (!activeSessionId) return;
    void refreshMessages();
    void refreshMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions, selectedProjectId]);

  // ---------------------------------------------------------------------------
  // i18n
  // ---------------------------------------------------------------------------

  const t = (key: string, replacements?: Record<string, string | number>): string => {
    const dict = i18nDict[locale] || i18nDict['en'];
    let val = dict[key] || i18nDict['en'][key] || key;
    if (replacements) {
      Object.entries(replacements).forEach(([k, v]) => {
        val = val.replace(`{${k}}`, String(v));
      });
    }
    return val;
  };

  const sessions = sessionsAsync.data;
  const projects = projectsAsync.data;
  const members = membersAsync.data;
  const providers = providersAsync.data;
  const messages = allMessages[activeSessionId] || messagesAsync.data;

  // ---------------------------------------------------------------------------
  // sendMessage: try the real API first; fall back to mock cascade when the
  // backend is unavailable, the session is mock-only, or the request errors.
  // ---------------------------------------------------------------------------

  const dispatchMockReply = (text: string) => {
    const words = text.split(/\s+/);
    const mentions = words.filter((w) => w.startsWith('@'));
    let responderMention = '@claude';
    if (mentions.length > 0) {
      responderMention = mentions[0].toLowerCase();
    } else if (
      text.toLowerCase().includes('bug') ||
      text.toLowerCase().includes('fix')
    ) {
      responderMention = '@codex';
    } else if (
      text.toLowerCase().includes('test') ||
      text.toLowerCase().includes('check')
    ) {
      responderMention = '@qa';
    } else if (
      text.toLowerCase().includes('front') ||
      text.toLowerCase().includes('css') ||
      text.toLowerCase().includes('ui')
    ) {
      responderMention = '@frontend';
    }

    let responderName = responderMention;
    let responderAvatar = 'CL';
    let responderLabel = 'Claude';
    if (responderMention === '@codex') {
      responderAvatar = 'CO';
      responderName = '@codex';
      responderLabel = 'Codex';
    } else if (responderMention === '@frontend') {
      responderAvatar = 'FE';
      responderName = '@frontend';
      responderLabel = 'Cursor';
    } else if (responderMention === '@qa') {
      responderAvatar = 'QA';
      responderName = '@qa';
      responderLabel = 'Gemini';
    } else if (responderMention === '@lead' || responderMention === '@claude') {
      responderAvatar = 'LD';
      responderName = '@lead';
      responderLabel = 'Claude';
    }

    const thinMsgId = `msg-thin-${Date.now()}`;
    const thinkingMsg: Message = {
      id: thinMsgId,
      avatar: responderAvatar,
      sender: responderName,
      model: responderLabel,
      time: 'just now',
      text: '',
      isThinking: true,
    };

    const sid = activeSessionIdRef.current;
    setTimeout(() => {
      setAllMessages((prev) => {
        const cur = prev[sid] || [];
        return { ...prev, [sid]: [...cur, thinkingMsg] };
      });
      setTimeout(() => {
        const candidates =
          mockAgentRepliesByMention[responderMention] ||
          mockAgentRepliesByMention['default'];
        const idx = Math.floor(Math.random() * candidates.length);
        const replyText = candidates[idx];
        const costVal = (Math.random() * 0.12 + 0.02).toFixed(3);
        const tokenNum = Math.floor(Math.random() * 1500 + 400);
        const realReplyMsg: Message = {
          id: `msg-agent-${Date.now()}`,
          avatar: responderAvatar,
          sender: responderName,
          model: responderLabel,
          time: 'just now',
          text: replyText,
          cost: `$${costVal} · ${tokenNum} tokens`,
        };
        setAllMessages((prev) => {
          const cur = prev[sid] || [];
          const base = cur.filter((m) => m.id !== thinMsgId);
          return { ...prev, [sid]: [...base, realReplyMsg] };
        });
        setWeeklyCost((prev) =>
          parseFloat((prev + parseFloat(costVal)).toFixed(2)),
        );
      }, 1500);
    }, 600);
  };

  const sendMessage = (text: string) => {
    if (!text.trim()) return;

    const sid = activeSessionIdRef.current;
    const userMsgId = `msg-user-${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      avatar: 'YOU',
      sender: 'You',
      time: 'just now',
      text,
      isUser: true,
    };
    setAllMessages((prev) => {
      const cur = prev[sid] || [];
      return { ...prev, [sid]: [...cur, userMsg] };
    });

    // Mock-only session (e.g., backend offline): use the local cascade.
    if (sessionsAsync.source !== 'api') {
      dispatchMockReply(text);
      return;
    }

    // Real backend: persist the user message; rely on subsequent message
    // refresh (or a future stream subscription) to surface agent replies.
    const mentions = text
      .split(/\s+/)
      .filter((w) => w.startsWith('@'))
      .map((m) => m.slice(1).toLowerCase());
    chatMessagesApi
      .send(sid, {
        sender_type: 'user',
        sender_id: null,
        content: text,
        meta: mentions.length > 0 ? { mentions } : null,
      })
      .then(() => {
        void refreshMessages();
      })
      .catch((err) => {
        // Roll forward with mock cascade so the UI is never stuck silent.
        showToast(
          err instanceof Error
            ? `Send failed: ${err.message} (using mock reply)`
            : 'Send failed (using mock reply)',
        );
        dispatchMockReply(text);
      });
  };

  // Add new workflow task representing Prototype 4 action into Prototype 1 List
  const addNewTask = (title: string, _details: string, chosenMembers: string[]) => {
    const mainMembersMap: Record<string, string> = {
      Lead: 'CL',
      Backend: 'CO',
      Frontend: 'CU',
      QA: 'GE',
      Security: 'SE',
    };
    const newNodes: TaskNode[] = chosenMembers.map((m, idx) => {
      const isFirst = idx === 0;
      const avatarStr = mainMembersMap[m] || 'CL';
      return {
        id: `node-sub-${Date.now()}-${idx}`,
        name: idx === 0 ? title : `${m}: processing...`,
        subText: `${m.toLowerCase()} -> ${avatarStr === 'CL' ? 'Claude' : avatarStr === 'CO' ? 'Codex' : avatarStr === 'CU' ? 'Cursor' : 'Gemini'}`,
        avatar: avatarStr,
        cost: idx === 0 ? '$0.15' : '—',
        status: isFirst ? 'run' : 'wait',
      };
    });
    setTasks(newNodes);
    showToast(t('toastPlanStarted'));

    // Best-effort: kick off the real backend workflow generator when we have a
    // live session. Failures are non-fatal; the mock task list still drives UI.
    const sid = activeSessionIdRef.current;
    if (sessionsAsync.source === 'api') {
      workflowApi
        .generatePlanAndRun(sid, title)
        .then((res) => {
          void refreshWorkflowCard(res.workflow_card_message.id);
          void refreshMessages();
        })
        .catch(() => {
          // Silent: mock state remains in place.
        });
    }
  };

  const retryWorkflowFromStep3 = () => {
    setTasks((prev) =>
      prev.map((task, idx) => {
        if (idx < 2) return { ...task, status: 'done' as const };
        if (idx === 2) return { ...task, status: 'run' as const, cost: '$0.41' };
        return { ...task, status: 'wait' as const, cost: '—' };
      }),
    );
    showToast('Re-running steps from Step 3...');
    setTimeout(() => {
      setTasks((prev) =>
        prev.map((task, idx) => {
          if (idx <= 2) return { ...task, status: 'done' as const };
          if (idx === 3) return { ...task, status: 'run' as const, cost: '$0.28' };
          return task;
        }),
      );
      showToast('Step 3 Done. Gemini evaluating integration tests...');
      setTimeout(() => {
        setTasks((prev) =>
          prev.map((task, idx) => {
            if (idx <= 3) return { ...task, status: 'done' as const };
            if (idx === 4) return { ...task, status: 'run' as const, cost: '$0.12' };
            return task;
          }),
        );
        showToast('Step 4 done. Initializing deployment pipeline...');
        setTimeout(() => {
          setTasks((prev) => prev.map((task) => ({ ...task, status: 'done' as const })));
          showToast('Deployment completed successfully! Product live on Cloud Run!');
          setWeeklyCost((prev) => parseFloat((prev + 0.42).toFixed(2)));
          setWeeklySaved((prev) => parseFloat((prev + 1.20).toFixed(2)));
        }, 2000);
      }, 2500);
    }, 3000);
  };

  const addMemberToOrganization = (name: string, model: string) => {
    if (!name) return;
    const cleanName = name.startsWith('@') ? name : `@${name}`;
    const monogram = name.replaceAll('@', '').substring(0, 2).toUpperCase();
    const newM: Member = {
      id: `mem-${Date.now()}`,
      avatar: monogram,
      status: 'i',
      name: cleanName,
      roleDetail: `${model} · idle`,
      modelName: model,
    };
    setMembers((prev) => [...prev, newM]);
    showToast(`Added agent ${cleanName} equipped with ${model} engine!`);
  };

  const addProviderToKeychain = (name: string, key: string) => {
    if (!name) return;
    const mono = name.substring(0, 2).toUpperCase();
    const mask = key ? `${key.substring(0, 4)}••••••••••••` : 'sk-••••••••••••';
    const newProv: Provider = {
      id: `prov-${Date.now()}`,
      monogram: mono,
      name,
      keyMask: mask,
      lastUsed: 'Just configured',
      active: true,
    };
    setProviders((prev) => [...prev, newProv]);
    showToast(`Connected ${name} endpoint securely inside local keychain!`);
  };

  return (
    <WorkspaceContext.Provider
      value={{
        theme,
        setTheme,
        locale,
        setLocale,
        tasks,
        setTasks,
        members,
        setMembers,
        sessions,
        setSessions,
        projects,
        projectsAsync,
        selectedProjectId,
        setSelectedProjectId,
        refreshProjects,
        createProject,
        messages,
        activeSessionId,
        setActiveSessionId,
        providers,
        setProviders,
        strategies,
        selectedStrategyId,
        setSelectedStrategyId,
        selectedOnboardType,
        setSelectedOnboardType,
        smartRouting,
        setSmartRouting,
        showCost,
        setShowCost,
        showExplanation,
        setShowExplanation,
        warnOverDollar,
        setWarnOverDollar,
        weeklyCost,
        weeklySaved,
        earlyBirdLeft,
        setEarlyBirdLeft,
        isNewTaskModalOpen,
        setIsNewTaskModalOpen,
        isRetryModalOpen,
        setIsRetryModalOpen,
        isAddMemberModalOpen,
        setIsAddMemberModalOpen,
        isAddProviderModalOpen,
        setIsAddProviderModalOpen,

        sendMessage,
        addNewTask,
        retryWorkflowFromStep3,
        addMemberToOrganization,
        addProviderToKeychain,

        t,
        toast,
        showToast,
        activeSettingsTab,
        setActiveSettingsTab,

        sessionsAsync,
        refreshSessions,
        messagesAsync,
        refreshMessages,
        membersAsync,
        refreshMembers,
        providersAsync,
        refreshProviders,
        skills: skillsAsync.data,
        skillsAsync,
        refreshSkills,
        config: configAsync.data,
        configAsync,
        refreshConfig,
        workflowCard: workflowCardAsync.data,
        workflowCardAsync,
        refreshWorkflowCard,
        workspaceChanges: workspaceChangesAsync.data,
        workspaceChangesAsync,
        refreshWorkspaceChanges,
        refreshAll,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used inside a WorkspaceProvider');
  }
  return context;
};
