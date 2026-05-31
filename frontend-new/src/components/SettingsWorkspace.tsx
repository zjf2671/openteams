import React, { useEffect, useState } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { 
  User, CreditCard, Bell, Cpu, Route, Users, Github, Key, SlidersHorizontal, Keyboard, FlaskConical, Edit, Trash, Plus
} from 'lucide-react';
import { DropdownSelect, type DropdownSelectOption } from '@/components/DropdownSelect';
import { ResourceStateNotice } from '@/components/ResourceState';
import { mockFrontendApi } from '@/lib/mockFrontendApi';
import type { SettingsOptionsMock } from '@/mockApiData';

type NotificationToggleKey =
  | 'newMessage'
  | 'workflowStatus'
  | 'agentActivity'
  | 'systemBanner'
  | 'soundEnabled';

interface NotificationSettingRowProps {
  title: string;
  description: string;
  checked?: boolean;
  onToggle?: () => void;
  control?: React.ReactNode;
  divided?: boolean;
}

const NotificationSettingRow: React.FC<NotificationSettingRowProps> = ({
  title,
  description,
  checked = false,
  onToggle,
  control,
  divided = true,
}) => (
  <div className={`flex items-center justify-between gap-5 px-5 py-4 ${divided ? 'border-b border-[var(--hairline)]' : ''}`}>
    <div className="min-w-0">
      <p className="text-sm leading-tight text-[var(--ink)]">{title}</p>
      <p className="mt-1 text-sm leading-snug text-[var(--ink-subtle)]">{description}</p>
    </div>
    {control ?? (
      <button
        type="button"
        aria-label={title}
        aria-pressed={checked}
        onClick={onToggle}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
          checked
            ? 'border-[var(--primary)] bg-[var(--primary)]'
            : 'border-[var(--hairline-strong)] bg-[var(--surface-3)]'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    )}
  </div>
);

export const SettingsWorkspace: React.FC = () => {
  const {
    t,
    theme,
    setTheme,
    locale,
    setLocale,
    providers,
    setProviders,
    smartRouting,
    setSmartRouting,
    showCost,
    setShowCost,
    showExplanation,
    setShowExplanation,
    warnOverDollar,
    setWarnOverDollar,
    setIsAddProviderModalOpen,
    showToast,
    activeSettingsTab,
    setActiveSettingsTab,
    providersAsync,
    refreshProviders,
    configAsync,
    refreshConfig
  } = useWorkspace();
  const [settingsOptions, setSettingsOptions] =
    useState<SettingsOptionsMock | null>(null);
  const [notificationToggles, setNotificationToggles] = useState<Record<NotificationToggleKey, boolean>>({
    newMessage: true,
    workflowStatus: true,
    agentActivity: true,
    systemBanner: true,
    soundEnabled: true,
  });
  const [notificationSound, setNotificationSound] = useState('soft-chime');

  useEffect(() => {
    void mockFrontendApi.getSettingsOptions().then(setSettingsOptions);
  }, []);

  const translate = (
    key: string,
    fallback: string,
    replacements?: Record<string, string | number>,
  ) => {
    const translated = t(key, replacements);
    return translated && translated !== key ? translated : fallback;
  };

  const handleToggleProvider = (id: string) => {
    setProviders(providers.map(p => {
      if (p.id === id) {
        return { ...p, active: !p.active };
      }
      return p;
    }));
    const prov = providers.find(p => p.id === id);
    if (prov) {
      showToast(
        t(prov.active ? 'toast.providerDisabled' : 'toast.providerEnabled', {
          name: prov.name,
        }),
      );
    }
  };

  const handleRemoveProvider = (id: string, name: string) => {
    setProviders(providers.filter(p => p.id !== id));
    showToast(t('toast.providerRemoved', { name }));
  };

  const handleToggleNotification = (key: NotificationToggleKey) => {
    setNotificationToggles((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const renderActiveSettingPanel = () => {
    switch (activeSettingsTab) {
      case 'appearance':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-[var(--ink)] tracking-tight">{t('settings.appearance.title')}</h3>
              <p className="mt-0.5 text-sm text-[var(--ink-subtle)]">{t('settings.appearance.desc')}</p>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-[var(--ink)]">{t('settings.appearance.pageLanguage')}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {(settingsOptions?.languages ?? []).map((lang) => (
                  <label
                    key={lang.code}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition ${
                      locale === lang.code
                        ? 'border-[var(--primary)] bg-[var(--surface-2)] text-[var(--ink)]'
                        : 'border-[var(--hairline)] bg-[var(--surface-1)] text-[var(--ink-subtle)] hover:text-[var(--ink)] hover:border-[var(--hairline-strong)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="workspace-language"
                      value={lang.code}
                      checked={locale === lang.code}
                      onChange={() => setLocale(lang.code)}
                      className="h-3.5 w-3.5 accent-[var(--primary)]"
                    />
                    <span className="truncate">{translate(`language.${lang.code}`, lang.label)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-[var(--ink)]">{t('settings.appearance.theme')}</h4>
              <div className="grid grid-cols-2 gap-3.5">
              <div 
                onClick={() => setTheme('dark')}
                className={`rounded-xl border p-4 cursor-pointer flex flex-col gap-2.5 transition ${
                  theme === 'dark' ? 'border-[var(--primary)] bg-[var(--surface-2)]' : 'border-[var(--hairline)] bg-[var(--surface-1)] hover:border-[var(--hairline-strong)]'
                }`}
              >
                <div className="h-16 rounded-lg bg-[#010102] border border-[var(--hairline)] relative overflow-hidden">
                  <div className="absolute top-2 left-2 right-2 h-2 bg-[#0f1011] rounded" />
                  <div className="absolute bottom-2 left-2 w-8 h-2 bg-[var(--primary)] rounded" />
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                  <span className={`h-1.5 w-1.5 rounded-full ${theme === 'dark' ? 'bg-[var(--primary)]' : 'bg-transparent'}`} />
                  <span>{t('settings.appearance.darkThemeDefault')}</span>
                </div>
              </div>

              <div 
                onClick={() => setTheme('light')}
                className={`rounded-xl border p-4 cursor-pointer flex flex-col gap-2.5 transition ${
                  theme === 'light' ? 'border-[var(--primary)] bg-[var(--surface-2)]' : 'border-[var(--hairline)] bg-[var(--surface-1)] hover:border-[var(--hairline-strong)]'
                }`}
              >
                <div className="h-16 rounded-lg bg-[#fbfbfc] border border-[#e3e5ea] relative overflow-hidden">
                  <div className="absolute top-2 left-2 right-2 h-2 bg-[#ffffff] border border-[#e3e5ea] rounded" />
                  <div className="absolute bottom-2 left-2 w-8 h-2 bg-[var(--primary)] rounded" />
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                  <span className={`h-1.5 w-1.5 rounded-full ${theme === 'light' ? 'bg-[var(--primary)]' : 'bg-transparent'}`} />
                  <span>{t('settings.appearance.lightThemeInverted')}</span>
                </div>
              </div>
              </div>
            </div>
          </div>
        );

      case 'notifications': {
        const inboxRows: Array<{
          key: NotificationToggleKey;
          titleKey: string;
          descKey: string;
        }> = [
          {
            key: 'newMessage',
            titleKey: 'settings.notifications.newMessage.title',
            descKey: 'settings.notifications.newMessage.desc',
          },
          {
            key: 'workflowStatus',
            titleKey: 'settings.notifications.workflowStatus.title',
            descKey: 'settings.notifications.workflowStatus.desc',
          },
          {
            key: 'agentActivity',
            titleKey: 'settings.notifications.agentActivity.title',
            descKey: 'settings.notifications.agentActivity.desc',
          },
        ];
        const soundOptions: DropdownSelectOption[] = [
          {
            id: 'soft-chime',
            label: t('settings.notifications.sound.softChime'),
          },
          {
            id: 'bright-ping',
            label: t('settings.notifications.sound.brightPing'),
          },
          {
            id: 'low-bell',
            label: t('settings.notifications.sound.lowBell'),
          },
          {
            id: 'none',
            label: t('settings.notifications.sound.none'),
          },
        ];

        return (
          <div className="settings-notifications-panel mx-auto max-w-5xl space-y-10 text-sm">
            <section className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)] tracking-tight">{t('settings.notifications.inbox.title')}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[var(--ink-subtle)]">{t('settings.notifications.inbox.desc')}</p>
              </div>

              <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)]">
                {inboxRows.map((row, index) => (
                  <NotificationSettingRow
                    key={row.key}
                    title={t(row.titleKey)}
                    description={t(row.descKey)}
                    checked={notificationToggles[row.key]}
                    onToggle={() => handleToggleNotification(row.key)}
                    divided={index < inboxRows.length - 1}
                  />
                ))}
              </div>
            </section>

            <section className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)] tracking-tight">{t('settings.notifications.system.title')}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[var(--ink-subtle)]">{t('settings.notifications.system.desc')}</p>
              </div>

              <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)]">
                <NotificationSettingRow
                  title={t('settings.notifications.systemBanner.title')}
                  description={t('settings.notifications.systemBanner.desc')}
                  checked={notificationToggles.systemBanner}
                  onToggle={() => handleToggleNotification('systemBanner')}
                />
                <NotificationSettingRow
                  title={t('settings.notifications.soundEnabled.title')}
                  description={t('settings.notifications.soundEnabled.desc')}
                  checked={notificationToggles.soundEnabled}
                  onToggle={() => handleToggleNotification('soundEnabled')}
                />
                <NotificationSettingRow
                  title={t('settings.notifications.soundSelect.title')}
                  description={t('settings.notifications.soundSelect.desc')}
                  divided={false}
                  control={
                    <DropdownSelect
                      value={notificationSound}
                      options={soundOptions}
                      showSearch={false}
                      disabled={!notificationToggles.soundEnabled}
                      placeholder={t('settings.notifications.soundSelect.placeholder')}
                      onChange={(value) => setNotificationSound(value)}
                      className="w-[180px] shrink-0"
                      maxPanelHeightClassName="max-h-[180px]"
                    />
                  }
                />
              </div>
            </section>
          </div>
        );
      }

      case 'account':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--ink)] tracking-tight">{t('settings.account.title')}</h3>
              <p className="mt-0.5 text-sm text-[var(--ink-subtle)]">{t('settings.account.desc')}</p>
            </div>

            <ResourceStateNotice
              resource={configAsync}
              className="!text-sm [&_button]:!text-sm [&_p]:!text-sm"
              labels={{
                loading: t('resource.accountConfig.loading'),
                empty: t('resource.accountConfig.empty'),
                error: t('resource.accountConfig.error'),
              }}
              onRetry={() => void refreshConfig()}
            />

            <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-4 space-y-3 font-mono text-sm">
              <div className="flex justify-between py-1 border-b border-[var(--hairline)]">
                <span className="text-[var(--ink-subtle)]">{t('settings.account.emailEndpoint')}</span>
                <span className="text-[var(--ink)] font-semibold select-all">{settingsOptions?.account.email ?? '-'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--hairline)]">
                <span className="text-[var(--ink-subtle)]">{t('settings.account.roleLevel')}</span>
                <span className="text-[var(--ink)] font-semibold">{settingsOptions?.account.roleLevel ?? '-'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[var(--ink-subtle)]">{t('settings.account.localKeysSynced')}</span>
                <span className="text-emerald-500 font-semibold">{settingsOptions?.account.keyStatus ?? '-'}</span>
              </div>
            </div>
          </div>
        );

      case 'shortcuts':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--ink)] tracking-tight">{t('settings.shortcuts.title')}</h3>
              <p className="mt-0.5 text-sm text-[var(--ink-subtle)]">{t('settings.shortcuts.desc')}</p>
            </div>

            <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] divide-y divide-[var(--hairline)] font-mono text-sm text-[var(--ink-muted)]">
              <div className="flex justify-between items-center p-3">
                <span>{t('settings.shortcuts.toggleWorkspaceSearch')}</span>
                <kbd className="rounded border border-[var(--hairline-strong)] bg-[var(--surface-3)] px-1.5 py-0.5 text-sm text-[var(--ink)]">⌘K</kbd>
              </div>
              <div className="flex justify-between items-center p-3">
                <span>{t('settings.shortcuts.startTaskExecution')}</span>
                <kbd className="rounded border border-[var(--hairline-strong)] bg-[var(--surface-3)] px-1.5 py-0.5 text-sm text-[var(--ink)]">⌘↵</kbd>
              </div>
              <div className="flex justify-between items-center p-3">
                <span>{t('settings.shortcuts.dismissModalTriggers')}</span>
                <kbd className="rounded border border-[var(--hairline-strong)] bg-[var(--surface-3)] px-1.5 py-0.5 text-sm text-[var(--ink)]">esc</kbd>
              </div>
            </div>
          </div>
        );

      default: // 'providers'
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)] tracking-tight">{t('Providers')}</h3>
                <p className="mt-0.5 text-sm text-[var(--ink-subtle)]">{t('connectAgentsExisting')}</p>
              </div>
              <span className="rounded-full border border-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-sm font-semibold text-emerald-500">
                {t('activeCount', { count: providers.filter(p => p.active).length })}
              </span>
            </div>

            <p className="text-sm leading-relaxed text-[var(--ink-subtle)] select-text">
              {t('keyStorageTip')}
            </p>

            <ResourceStateNotice
              resource={providersAsync}
              className="!text-sm [&_button]:!text-sm [&_p]:!text-sm"
              labels={{
                loading: t('resource.providers.loading'),
                empty: t('resource.providers.empty'),
                error: t('resource.providers.error'),
                fallback: t('resource.providers.fallback'),
              }}
              onRetry={() => void refreshProviders()}
            />

            {/* Providers Connected List */}
            <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] overflow-hidden divide-y divide-[var(--hairline)]">
              {providers.length === 0 && (
                <div className="p-4 text-sm text-[var(--ink-tertiary)]">
                  {t('settings.providers.noConnected')}
                </div>
              )}
              {providers.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span className="h-7 w-7 rounded-full bg-[var(--mono-bg)] border border-[var(--mono-border)] flex items-center justify-center font-mono font-bold text-[var(--ink-muted)] shrink-0">
                    {p.monogram}
                  </span>
                  
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="font-semibold text-[var(--ink)]">{p.name}</p>
                    <p className="text-sm font-mono text-[var(--ink-tertiary)] truncate">
                      {p.keyMask} · {t('settings.providers.lastUsed', { value: p.lastUsed })}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono text-sm text-[var(--ink-subtle)]">
                    <button 
                      onClick={() => handleToggleProvider(p.id)}
                      disabled={providersAsync.loading}
                      className={`h-2.5 w-6 rounded-full border border-[var(--hairline-strong)] relative cursor-pointer transition-colors ${
                        p.active ? 'bg-[var(--primary)]' : 'bg-[var(--surface-3)]'
                      } disabled:cursor-wait disabled:opacity-60`}
                    >
                      <span className={`absolute top-0.5 h-1.5 w-1.5 rounded-full bg-white transition-all ${
                        p.active ? 'right-0.5' : 'left-0.5'
                      }`} />
                    </button>
                    <span>{p.active ? t('connected') : t('disconnected')}</span>
                  </div>

                  <div className="flex gap-1">
                    <button 
                      onClick={() => showToast(t('toast.providerEdit', { name: p.name }))}
                      className="rounded border border-[var(--hairline-strong)] p-1.5 text-[var(--ink-tertiary)] hover:text-[var(--ink)] cursor-pointer"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button 
                      onClick={() => handleRemoveProvider(p.id, p.name)}
                      className="rounded border border-[var(--hairline-strong)] p-1.5 text-[var(--ink-tertiary)] hover:text-red-500 hover:border-red-500/40 cursor-pointer"
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={() => setIsAddProviderModalOpen(true)}
              className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)] hover:text-[var(--primary-hover)] cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t('addAnotherProvider')}</span>
            </button>

            {/* Routing Options list of switches */}
            <div className="border-t border-[var(--hairline)] pt-5 space-y-4">
              <h4 className="text-sm font-semibold text-[var(--ink)] uppercase tracking-wider">{t('routingDefaults')}</h4>
              
              <div className="space-y-3.5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-[var(--ink)] leading-none">{t('defaultSmartRoutingTitle')}</p>
                    <p className="text-sm text-[var(--ink-tertiary)] mt-1 leading-relaxed">{t('defaultSmartRoutingSub')}</p>
                  </div>
                  <button 
                    onClick={() => setSmartRouting(!smartRouting)}
                    className={`h-5 w-9 rounded-full relative cursor-pointer flex-shrink-0 transition-colors ${
                      smartRouting ? 'bg-[var(--primary)]' : 'bg-[var(--surface-3)] border border-[var(--hairline-strong)]'
                    }`}
                  >
                    <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
                      smartRouting ? 'right-0.5' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-[var(--ink)] leading-none">{t('showCostNodeTitle')}</p>
                    <p className="text-sm text-[var(--ink-tertiary)] mt-1 leading-relaxed">{t('showCostNodeSub')}</p>
                  </div>
                  <button 
                    onClick={() => setShowCost(!showCost)}
                    className={`h-5 w-9 rounded-full relative cursor-pointer flex-shrink-0 transition-colors ${
                      showCost ? 'bg-[var(--primary)]' : 'bg-[var(--surface-3)] border border-[var(--hairline-strong)]'
                    }`}
                  >
                    <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
                      showCost ? 'right-0.5' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-[var(--ink)] leading-none">{t('whyThisModelTitle')}</p>
                    <p className="text-sm text-[var(--ink-tertiary)] mt-1 leading-relaxed">{t('whyThisModelSub')}</p>
                  </div>
                  <button 
                    onClick={() => setShowExplanation(!showExplanation)}
                    className={`h-5 w-9 rounded-full relative cursor-pointer flex-shrink-0 transition-colors ${
                      showExplanation ? 'bg-[var(--primary)]' : 'bg-[var(--surface-3)] border border-[var(--hairline-strong)]'
                    }`}
                  >
                    <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
                      showExplanation ? 'right-0.5' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-[var(--ink)] leading-none">{t('warnOverDollarTitle')}</p>
                    <p className="text-sm text-[var(--ink-tertiary)] mt-1 leading-relaxed">{t('warnOverDollarSub')}</p>
                  </div>
                  <button 
                    onClick={() => setWarnOverDollar(!warnOverDollar)}
                    className={`h-5 w-9 rounded-full relative cursor-pointer flex-shrink-0 transition-colors ${
                      warnOverDollar ? 'bg-[var(--primary)]' : 'bg-[var(--surface-3)] border border-[var(--hairline-strong)]'
                    }`}
                  >
                    <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
                      warnOverDollar ? 'right-0.5' : 'left-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  const renderMenuIcon = (icon: string) => {
    const className = 'h-3.5 w-3.5';
    const icons: Record<string, React.ReactNode> = {
      user: <User className={className} />,
      'credit-card': <CreditCard className={className} />,
      bell: <Bell className={className} />,
      cpu: <Cpu className={className} />,
      route: <Route className={className} />,
      users: <Users className={className} />,
      github: <Github className={className} />,
      key: <Key className={className} />,
      sliders: <SlidersHorizontal className={className} />,
      keyboard: <Keyboard className={className} />,
      flask: <FlaskConical className={className} />,
    };
    return icons[icon] ?? <SlidersHorizontal className={className} />;
  };

  const menuItems = settingsOptions?.menu ?? [];
  const getMenuSectionLabel = (section: string) =>
    translate(`settings.menu.section.${section.toLowerCase()}`, section);
  const getMenuItemLabel = (id: string, label: string) =>
    translate(`settings.menu.item.${id}`, label);

  return (
    <div className="settings-workspace h-full w-full overflow-hidden font-sans text-sm select-none">
      
      <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[180px_1fr]">
        {/* Left Nav menu list */}
        <aside className="border-r border-[var(--hairline)] p-3 space-y-3 overflow-y-auto">
          {menuItems.map(group => (
            <div key={group.section} className="space-y-0.5">
              <div className="text-sm font-semibold text-[var(--ink-tertiary)] uppercase tracking-wider px-1.5 mb-1.5">{getMenuSectionLabel(group.section)}</div>
              {group.items.map(item => {
                const active = item.id === activeSettingsTab;
                return (
                  <button
                    key={item.id}
                    onClick={() => !item.disabled && setActiveSettingsTab(item.id)}
                    disabled={item.disabled}
                    className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left border ${
                      active 
                        ? 'text-[var(--ink)] bg-[var(--surface-1)] font-semibold border-[var(--hairline)]' 
                        : 'text-[var(--ink-subtle)] hover:bg-[var(--surface-1)] hover:text-[var(--ink)] border-transparent'
                    } ${item.disabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : 'cursor-pointer'}`}
                  >
                    <span className="shrink-0">{renderMenuIcon(item.icon)}</span>
                    <span className="truncate">{getMenuItemLabel(item.id, item.label)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        {/* Right content manager */}
        <main className="p-6 min-w-0 overflow-y-auto">
          {renderActiveSettingPanel()}
        </main>
      </div>

    </div>
  );
};
