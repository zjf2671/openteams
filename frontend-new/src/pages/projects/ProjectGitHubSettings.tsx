import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Github, RefreshCw, Unplug } from 'lucide-react';
import { ApiError, githubAuthApi, projectGithubApi } from '@/lib/api';
import type {
  GitHubAccount,
  GitHubDeviceFlowStartResponse,
  GitHubErrorData,
  ProjectRepoIntegration,
} from '@/types';
import {
  extractGitHubError,
  formatDateTime,
  presentGitHubError,
} from './githubErrorPresentation';

interface ProjectGitHubSettingsProps {
  projectId: string;
}

const statusClass: Record<string, string> = {
  connected: 'text-[var(--success)]',
  disconnected: 'text-red-400',
  error: 'text-amber-400',
};

export function ProjectGitHubSettings({ projectId }: ProjectGitHubSettingsProps) {
  const [account, setAccount] = useState<GitHubAccount | null>(null);
  const [repos, setRepos] = useState<ProjectRepoIntegration[]>([]);
  const [deviceFlow, setDeviceFlow] =
    useState<GitHubDeviceFlowStartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<GitHubErrorData | null>(null);
  const [repoId, setRepoId] = useState('');
  const [owner, setOwner] = useState('');
  const [repoName, setRepoName] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');

  const primaryRepo = repos[0] ?? null;
  const auxiliaryRepos = repos.slice(1);
  const canAddRepo = repos.length < 3;
  const shownError = useMemo(() => presentGitHubError(error), [error]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountResult, repoResult] = await Promise.all([
        githubAuthApi.getAccount(),
        projectGithubApi.listRepos(projectId),
      ]);
      setAccount(accountResult);
      setRepos(repoResult);
    } catch (err) {
      setError(extractGitHubError(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const startDeviceFlow = async () => {
    setAction('connect');
    setError(null);
    try {
      const flow = await githubAuthApi.startDeviceFlow();
      setDeviceFlow(flow);
    } catch (err) {
      setError(extractGitHubError(err));
    } finally {
      setAction(null);
    }
  };

  const pollDeviceFlow = async () => {
    if (!deviceFlow) return;
    setAction('poll');
    setError(null);
    try {
      const result = await githubAuthApi.pollDeviceFlow(deviceFlow.device_code);
      if (result.account) {
        setAccount(result.account);
        setDeviceFlow(null);
      } else if (result.error && typeof result.error === 'object') {
        setError(result.error);
      }
    } catch (err) {
      setError(extractGitHubError(err));
    } finally {
      setAction(null);
    }
  };

  const disconnectAccount = async () => {
    setAction('disconnect-account');
    setError(null);
    try {
      await githubAuthApi.disconnect();
      setAccount(null);
    } catch (err) {
      setError(extractGitHubError(err));
    } finally {
      setAction(null);
    }
  };

  const addRepo = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!repoId.trim() || !canAddRepo) return;
    setAction('add-repo');
    setError(null);
    try {
      const created = await projectGithubApi.createRepo(projectId, {
        repo_id: repoId.trim(),
        owner: owner.trim() || null,
        name: repoName.trim() || null,
        default_branch: defaultBranch.trim() || 'main',
        repo_grant_json: null,
      });
      setRepos((current) => [...current, created].slice(0, 3));
      setRepoId('');
      setOwner('');
      setRepoName('');
    } catch (err) {
      setError(extractGitHubError(err));
    } finally {
      setAction(null);
    }
  };

  const refreshRepo = async (repo: ProjectRepoIntegration) => {
    setAction(`refresh-${repo.id}`);
    setError(null);
    try {
      const refreshed = await projectGithubApi.refreshRepo(projectId, repo.id);
      setRepos((current) =>
        current.map((item) => (item.id === refreshed.id ? refreshed : item)),
      );
    } catch (err) {
      setError(extractGitHubError(err));
    } finally {
      setAction(null);
    }
  };

  const disconnectRepo = async (repo: ProjectRepoIntegration) => {
    setAction(`disconnect-${repo.id}`);
    setError(null);
    try {
      const updated = await projectGithubApi.disconnectRepo(projectId, repo.id);
      setRepos((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err) {
      setError(extractGitHubError(err));
    } finally {
      setAction(null);
    }
  };

  const reconnectRepo = async (repo: ProjectRepoIntegration) => {
    setAction(`reconnect-${repo.id}`);
    setError(null);
    try {
      const updated = await projectGithubApi.updateRepo(projectId, repo.id, {
        repo_grant_json: repo.repo_grant_json,
      });
      setRepos((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err) {
      setError(extractGitHubError(err));
    } finally {
      setAction(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-[12px] text-[var(--ink)]">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold">{shownError.title}</p>
              <p className="mt-0.5 text-[var(--ink-subtle)]">
                {shownError.message}
              </p>
              {shownError.meta && (
                <p className="mt-1 font-mono text-[11px] text-[var(--ink-tertiary)]">
                  {shownError.meta}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <section className="rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--ink)]">
              GitHub account
            </h2>
            {loading ? (
              <p className="mt-1 text-xs text-[var(--ink-tertiary)]">Loading...</p>
            ) : account ? (
              <div className="mt-2 flex items-center gap-3">
                {account.avatar_url ? (
                  <img
                    src={account.avatar_url}
                    alt=""
                    className="h-9 w-9 rounded-full border border-[var(--hairline)]"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--hairline)]">
                    <Github className="h-4 w-4 text-[var(--ink-tertiary)]" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--ink)]">
                    {account.login}
                  </p>
                  <p className="truncate font-mono text-[11px] text-[var(--ink-tertiary)]">
                    {account.scopes.join(', ') || 'minimal scopes'} · connected{' '}
                    {formatDateTime(account.connected_at)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-xs text-[var(--ink-subtle)]">
                No GitHub account is connected in the local backend.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={startDeviceFlow}
              disabled={action === 'connect'}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              <Github className="h-3.5 w-3.5" />
              {account ? 'Reconnect' : 'Connect'}
            </button>
            {account && (
              <button
                type="button"
                onClick={disconnectAccount}
                disabled={action === 'disconnect-account'}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hairline)] px-3 py-1.5 text-xs font-medium text-[var(--ink-subtle)] hover:text-[var(--ink)] disabled:opacity-50"
              >
                <Unplug className="h-3.5 w-3.5" />
                Disconnect
              </button>
            )}
          </div>
        </div>

        {deviceFlow && (
          <div className="mt-4 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-medium text-[var(--ink)]">
                  Enter code {deviceFlow.user_code} at GitHub
                </p>
                <p className="mt-1 font-mono text-[11px] text-[var(--ink-tertiary)]">
                  {deviceFlow.verification_uri_complete ??
                    deviceFlow.verification_uri}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard?.writeText(deviceFlow.user_code)
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hairline)] px-3 py-1.5 text-xs text-[var(--ink-subtle)]"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
                <button
                  type="button"
                  onClick={pollDeviceFlow}
                  disabled={action === 'poll'}
                  className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  Check status
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">
              Project repositories
            </h2>
            <p className="mt-0.5 text-xs text-[var(--ink-tertiary)]">
              Primary plus up to two auxiliary GitHub grants.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hairline)] px-2.5 py-1.5 text-xs text-[var(--ink-subtle)] hover:text-[var(--ink)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {[primaryRepo, ...auxiliaryRepos].filter(Boolean).map((repo, index) => (
            <RepoCard
              key={repo.id}
              repo={repo}
              role={index === 0 ? 'primary' : 'auxiliary'}
              action={action}
              onRefresh={() => void refreshRepo(repo)}
              onDisconnect={() => void disconnectRepo(repo)}
              onReconnect={() => void reconnectRepo(repo)}
            />
          ))}
          {repos.length === 0 && (
            <div className="rounded-md border border-dashed border-[var(--hairline)] bg-[var(--surface-2)] p-4 text-xs text-[var(--ink-tertiary)]">
              No project repositories are bound yet.
            </div>
          )}
        </div>

        <form
          onSubmit={(event) => void addRepo(event)}
          className="mt-4 grid gap-2 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] p-3 md:grid-cols-[1fr_1fr_1fr_120px_auto]"
        >
          <input
            value={repoId}
            onChange={(event) => setRepoId(event.target.value)}
            placeholder="local repo id"
            className="rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none"
          />
          <input
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            placeholder="owner"
            className="rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none"
          />
          <input
            value={repoName}
            onChange={(event) => setRepoName(event.target.value)}
            placeholder="repo name"
            className="rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none"
          />
          <input
            value={defaultBranch}
            onChange={(event) => setDefaultBranch(event.target.value)}
            placeholder="base"
            className="rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none"
          />
          <button
            type="submit"
            disabled={!canAddRepo || action === 'add-repo' || !repoId.trim()}
            className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Add repo
          </button>
        </form>
      </section>
    </div>
  );
}

function RepoCard({
  repo,
  role,
  action,
  onRefresh,
  onDisconnect,
  onReconnect,
}: {
  repo: ProjectRepoIntegration;
  role: 'primary' | 'auxiliary';
  action: string | null;
  onRefresh: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
}) {
  const status = repo.sync_status ?? 'error';
  const busy = action?.endsWith(repo.id) ?? false;
  return (
    <article className="rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--ink)]">
            {repo.owner && repo.name ? `${repo.owner}/${repo.name}` : repo.repo_id}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-[var(--ink-tertiary)]">
            {role} · base {repo.default_branch ?? 'unknown'}
          </p>
        </div>
        {status === 'connected' ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success)]" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
        )}
      </div>
      <div className="space-y-1 text-[12px]">
        <div className="flex justify-between gap-2">
          <span className="text-[var(--ink-tertiary)]">sync_status</span>
          <span className={statusClass[status] ?? 'text-[var(--ink-subtle)]'}>
            {status}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[var(--ink-tertiary)]">last_synced_at</span>
          <span className="font-mono text-[var(--ink-subtle)]">
            {formatDateTime(repo.last_synced_at)}
          </span>
        </div>
        {repo.last_error && (
          <p className="rounded-sm bg-red-500/10 px-2 py-1 text-red-300">
            {repo.last_error}
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onRefresh}
          className="rounded-md border border-[var(--hairline)] px-2 py-1 text-[11px] text-[var(--ink-subtle)] hover:text-[var(--ink)] disabled:opacity-50"
        >
          Refresh grant
        </button>
        {status === 'disconnected' ? (
          <button
            type="button"
            disabled={busy}
            onClick={onReconnect}
            className="rounded-md bg-[var(--primary)] px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
          >
            Reconnect
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onDisconnect}
            className="rounded-md border border-red-400/30 px-2 py-1 text-[11px] text-red-300 disabled:opacity-50"
          >
            Disconnect
          </button>
        )}
      </div>
    </article>
  );
}
