import React, { useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ChevronUp,
  Github,
  History,
  Inbox,
  Network,
  MoreHorizontal,
  PlusCircle,
  Settings2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type {
  Session,
  SidebarNavigationItem,
  SidebarNavigationTarget,
  SidebarPrimaryAction,
} from '@/types';
import type { ShellOptionsMock } from '@/mockApiData';

interface ProjectSidebarProps {
  shellOptions: ShellOptionsMock | null;
  sessions: Session[];
  activeSessionId: string;
  activePage: SidebarNavigationTarget;
  weeklyCost: number;
  t?: (key: string, replacements?: Record<string, string | number>) => string;
  onNavigate: (item: SidebarNavigationItem) => void;
  onSessionSelect: (sessionId: string) => void;
  onPrimaryAction: (action: SidebarPrimaryAction) => void;
  onProjectAction: (actionId: string) => void;
}

const primaryActionIcons: Record<SidebarPrimaryAction['icon'], LucideIcon> = {
  inbox: Inbox,
  'plus-circle': PlusCircle,
};

const navigationIcons: Record<string, LucideIcon> = {
  bot: Bot,
  'book-open': BookOpen,
  github: Github,
  settings: Settings2,
  users: Users,
};

const topControlClass =
  'flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-[var(--ink-tertiary)] transition hover:border-[var(--hairline)] hover:bg-[var(--surface-1)] hover:text-[var(--ink)]';

const sectionLabelClass =
  'px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-tertiary)]';

const sidebarItemClass =
  'flex min-h-6 w-full items-center gap-2 rounded-md border px-2 py-[3px] text-left text-[14px] transition';

const visibleSessionLimit = 6;

const getNavigationIcon = (icon: string): LucideIcon =>
  navigationIcons[icon] ?? CircleDot;

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2" data-section={title}>
      <div className={sectionLabelClass}>{title}</div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function SidebarNavigationButton({
  item,
  label,
  badge,
  title,
  active,
  onClick,
}: {
  item: SidebarNavigationItem;
  label: string;
  badge?: string;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = getNavigationIcon(item.icon);

  return (
    <button
      type="button"
      disabled={item.disabled}
      onClick={onClick}
      title={title}
      className={`${sidebarItemClass} ${
        active
          ? 'border-[var(--hairline)] bg-[var(--surface-1)] font-medium text-[var(--ink)]'
          : 'border-transparent text-[var(--ink-subtle)] hover:bg-[var(--surface-1)] hover:text-[var(--ink)]'
      } ${item.disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}
    >
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${
          active ? 'text-[var(--primary)]' : 'text-[var(--ink-tertiary)]'
        }`}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge && (
        <span className="shrink-0 rounded border border-[var(--hairline)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-tertiary)]">
          {badge}
        </span>
      )}
    </button>
  );
}

export function ProjectSidebar({
  shellOptions,
  sessions,
  activeSessionId,
  activePage,
  weeklyCost,
  t,
  onNavigate,
  onSessionSelect,
  onPrimaryAction,
  onProjectAction,
}: ProjectSidebarProps) {
  const [buildStatsVisible, setBuildStatsVisible] = useState(true);
  const [sessionsExpanded, setSessionsExpanded] = useState(false);
  const activeProject = useMemo(
    () => shellOptions?.projects.find((project) => project.active),
    [shellOptions],
  );
  const buildStats = shellOptions?.buildStats;
  const hasOverflowSessions = sessions.length > visibleSessionLimit;
  const visibleSessions = sessionsExpanded
    ? sessions
    : sessions.slice(0, visibleSessionLimit);
  const hiddenSessionCount = Math.max(sessions.length - visibleSessionLimit, 0);

  const translate = (
    key: string,
    fallback: string,
    replacements?: Record<string, string | number>,
  ) => {
    const translated = t?.(key, replacements);
    return translated && translated !== key ? translated : fallback;
  };

  const sessionToggleLabel = sessionsExpanded
    ? translate('sidebar.less', 'Less')
    : translate('sidebar.more', 'More');
  const sessionToggleAriaLabel = sessionsExpanded
    ? translate('sidebar.collapseSessions', 'Collapse sessions')
    : translate('sidebar.showMoreSessions', `Show ${hiddenSessionCount} more sessions`, {
        count: hiddenSessionCount,
      });

  const statValue = (statId: string, value: string) => {
    if (statId === 'weekly-spend') return `$${weeklyCost.toFixed(2)}`;
    return value;
  };

  return (
    <nav
      className="flex h-full min-h-0 w-full max-w-full flex-col bg-[var(--canvas)] text-[var(--ink)] select-none"
      aria-label={translate('sidebar.aria.projectNavigation', 'Project navigation')}
    >
      <div className="flex h-10 shrink-0 items-center px-2.5">
        <button
          type="button"
          className={topControlClass}
          onClick={() => onProjectAction('history')}
          aria-label={translate('sidebar.aria.openHistory', 'Open history')}
        >
          <History className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-3 py-1.5">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md border border-transparent px-1 py-0.5 text-left transition hover:border-[var(--hairline)] hover:bg-[var(--surface-1)]"
          onClick={() => onProjectAction('project-switcher')}
          aria-label={translate('sidebar.aria.openProjectSwitcher', 'Open project switcher')}
        >
          <span className="flex h-4.5 min-w-5.5 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] px-1 font-mono text-[8px] font-semibold text-white">
            {activeProject?.monogram ?? '--'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-[var(--ink)]">
              {activeProject?.label ?? translate('sidebar.projectFallback', 'Project')}
            </span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--ink-tertiary)]" />
        </button>
      </div>

      <div className="flex-1 space-y-5.5 overflow-y-auto px-3 py-2">
        <section className="space-y-1" data-section="Primary actions">
          {(shellOptions?.primaryActions ?? []).map((action) => {
            const Icon = primaryActionIcons[action.icon] ?? CircleDot;
            return (
              <button
                key={action.id}
                type="button"
                className={`${sidebarItemClass} cursor-pointer border-transparent text-[var(--ink-subtle)] hover:bg-[var(--surface-1)] hover:text-[var(--ink)]`}
                onClick={() => onPrimaryAction(action)}
                title={translate(`sidebar.primary.${action.id}.helper`, action.helper)}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--ink-tertiary)]" />
                <span className="min-w-0 flex-1 truncate">
                  {translate(`sidebar.primary.${action.id}`, action.label)}
                </span>
              </button>
            );
          })}
        </section>

        <section
          className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)]"
          data-section="Build stats"
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
            onClick={() => setBuildStatsVisible((visible) => !visible)}
            aria-expanded={buildStatsVisible}
            aria-controls="project-sidebar-build-stats"
          >
            <Activity className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--ink)]">
              {translate('sidebar.buildStats.title', buildStats?.title ?? 'Build stats')}
            </span>
            <span className="font-mono text-[10px] text-[var(--ink-tertiary)]">
              {buildStatsVisible
                ? translate('sidebar.hide', 'Hide')
                : translate('sidebar.show', 'Show')}
            </span>
            <ChevronRight
              className={`h-3.5 w-3.5 shrink-0 text-[var(--ink-tertiary)] transition ${
                buildStatsVisible ? 'rotate-90' : ''
              }`}
            />
          </button>
          {buildStatsVisible && (
            <div
              id="project-sidebar-build-stats"
              className="space-y-2 border-t border-[var(--hairline)] px-2.5 py-2"
            >
              <p className="text-[11px] leading-4 text-[var(--ink-tertiary)]">
                {translate(
                  'sidebar.buildStats.summary',
                  buildStats?.summary ?? 'Local UI placeholder for project activity.',
                )}
              </p>
              <div className="space-y-1">
                {(buildStats?.stats ?? []).map((stat) => (
                  <div
                    key={stat.id}
                    className="flex items-center justify-between gap-2 text-[12px]"
                  >
                    <span className="truncate text-[var(--ink-subtle)]">
                      {translate(`sidebar.stats.${stat.id}`, stat.label)}
                    </span>
                    <span
                      className={`shrink-0 font-mono font-medium ${
                        stat.tone === 'accent'
                          ? 'text-[var(--primary)]'
                          : stat.tone === 'success'
                            ? 'text-[var(--success)]'
                            : 'text-[var(--ink)]'
                      }`}
                      title={translate(`sidebar.stats.${stat.id}.helper`, stat.helper)}
                    >
                      {statValue(stat.id, stat.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <SidebarSection title={translate('sidebar.sessions', 'Sessions')}>
          {sessions.length > 0 ? (
            <>
              <div
                className={`space-y-1 pr-1 ${
                  sessionsExpanded ? 'h-52 overflow-y-auto' : 'overflow-visible'
                }`}
                data-sidebar-session-list="true"
              >
                {visibleSessions.map((session) => {
                  const active =
                    activePage === 'workspace' && session.id === activeSessionId;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => onSessionSelect(session.id)}
                      className={`${sidebarItemClass} cursor-pointer ${
                        active
                          ? 'border-[var(--hairline)] bg-[var(--surface-1)] font-medium text-[var(--ink)]'
                          : 'border-transparent text-[var(--ink-subtle)] hover:bg-[var(--surface-1)] hover:text-[var(--ink)]'
                      }`}
                    >
                      <Network
                        className={`h-3.5 w-3.5 shrink-0 ${
                          active
                            ? 'text-[var(--primary)]'
                            : 'text-[var(--ink-tertiary)]'
                        }`}
                      />
                      <span className="min-w-0 flex-1 truncate">{session.title}</span>
                    </button>
                  );
                })}
              </div>
              {hasOverflowSessions && (
                <button
                  type="button"
                  className="flex min-h-6 w-full cursor-pointer items-center justify-between rounded-md border border-transparent px-2 py-[3px] text-left text-[14px] font-semibold text-[var(--ink-subtle)] transition hover:bg-[var(--surface-1)] hover:text-[var(--ink)]"
                  data-sidebar-more="true"
                  aria-expanded={sessionsExpanded}
                  aria-label={sessionToggleAriaLabel}
                  onClick={() => setSessionsExpanded((expanded) => !expanded)}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
                    {sessionsExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[var(--ink-tertiary)]" />
                    ) : (
                      <MoreHorizontal className="h-3.5 w-3.5 shrink-0 text-[var(--ink-tertiary)]" />
                    )}
                    <span className="truncate">{sessionToggleLabel}</span>
                  </span>
                  {!sessionsExpanded && (
                    <span className="shrink-0 font-mono text-[11px] font-semibold text-[var(--ink-tertiary)]">
                      +{hiddenSessionCount}
                    </span>
                  )}
                </button>
              )}
            </>
          ) : (
            <div className="rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-2 py-2 text-[12px] text-[var(--ink-tertiary)]">
              {translate('sidebar.noSessions', 'No sessions yet')}
            </div>
          )}
        </SidebarSection>

        <SidebarSection title={translate('sidebar.projectManagement', 'Project management')}>
          {(shellOptions?.projectManagementItems ?? []).map((item) => {
            const label = translate(`sidebar.nav.${item.id}`, item.label);
            const title = translate(`sidebar.nav.${item.id}.helper`, item.helper);
            const badge = item.badge
              ? translate(`sidebar.nav.${item.id}.badge`, item.badge)
              : undefined;
            return (
              <SidebarNavigationButton
                key={item.id}
                item={item}
                label={label}
                badge={badge}
                title={title}
                active={item.targetPage === activePage}
                onClick={() => {
                  if (item.targetPage) {
                    onNavigate(item);
                  } else {
                    onProjectAction(item.id);
                  }
                }}
              />
            );
          })}
        </SidebarSection>

        <SidebarSection title={translate('sidebar.system', 'System')}>
          {(shellOptions?.systemItems ?? []).map((item) => {
            const label = translate(`sidebar.nav.${item.id}`, item.label);
            const title = translate(`sidebar.nav.${item.id}.helper`, item.helper);
            const badge = item.badge
              ? translate(`sidebar.nav.${item.id}.badge`, item.badge)
              : undefined;
            return (
              <SidebarNavigationButton
                key={item.id}
                item={item}
                label={label}
                badge={badge}
                title={title}
                active={item.targetPage === activePage}
                onClick={() => {
                  if (item.targetPage) {
                    onNavigate(item);
                  } else {
                    onProjectAction(item.id);
                  }
                }}
              />
            );
          })}
        </SidebarSection>
      </div>
    </nav>
  );
}
