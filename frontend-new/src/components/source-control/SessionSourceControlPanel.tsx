import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Loader2,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";
import { ScrollArea } from "@/components/ScrollArea";
import { useSessionSourceControl } from "@/hooks/useSessionSourceControl";
import { deliveryApi } from "@/lib/api";
import type {
  JsonValue,
  ProjectDeliveryRecord,
  SourceControlCommitResponse,
  SourceControlDiffArea,
  SourceControlFile,
} from "@/types";
import { SourceControlFileRow } from "./SourceControlFileRow";
import {
  buildSourceControlViewModel,
  sourceControlHasSharedFiles,
  sourceControlVisiblePaths,
  type SourceControlBatchAction,
  type SourceControlPanelViewModel,
  type SourceControlSectionViewModel,
} from "./sourceControlViewModel";

interface SessionSourceControlPanelProps {
  projectId: string | null;
  sessionId: string | null;
  enabled: boolean;
  fallbackRelatedFiles: React.ReactNode;
  linkedWorkItemIds?: string[];
  onOpenDiff: (
    projectId: string,
    sessionId: string,
    filePath: string,
    area: SourceControlDiffArea,
  ) => void;
}

interface SourceControlConfirmDialogState {
  title: string;
  description: string;
  confirmLabel: string;
  tone: "warning" | "danger";
  resolve: (confirmed: boolean) => void;
}

interface SessionCommitSummary {
  id: string;
  sha: string;
  message: string;
}

const actionErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

const describePaths = (files: SourceControlFile[]) =>
  files.length === 1 ? files[0].path : `${files.length} files`;

const findSection = (
  viewModel: SourceControlPanelViewModel,
  id: SourceControlSectionViewModel["id"],
) => viewModel.sections.find((section) => section.id === id);

const isObjectMetadata = (
  value: JsonValue | null,
): value is { [key: string]: JsonValue } =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseRecordMetadata = (
  metadata: ProjectDeliveryRecord["metadata_json"],
): { [key: string]: JsonValue } => {
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata) as JsonValue;
      return isObjectMetadata(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isObjectMetadata(metadata) ? metadata : {};
};

const firstCommitLine = (message: string) =>
  message.split(/\r?\n/)[0]?.trim() || "Commit";

const mergeCommitSummaries = (
  commits: SessionCommitSummary[],
): SessionCommitSummary[] => {
  const seen = new Set<string>();
  return commits.filter((commit) => {
    if (seen.has(commit.sha)) return false;
    seen.add(commit.sha);
    return true;
  });
};

const commitSummaryFromRecord = (
  record: ProjectDeliveryRecord,
): SessionCommitSummary | null => {
  if (record.event_type !== "commit_created") return null;
  const metadata = parseRecordMetadata(record.metadata_json);
  const shaValue = metadata.commit_sha;
  const messageValue = metadata.message;
  const sha = typeof shaValue === "string" ? shaValue : record.external_id;
  if (!sha) return null;

  return {
    id: record.id,
    sha,
    message:
      typeof messageValue === "string"
        ? firstCommitLine(messageValue)
        : "Commit",
  };
};

const commitSummaryFromResponse = (
  response: SourceControlCommitResponse,
): SessionCommitSummary => ({
  id: response.commit_sha,
  sha: response.commit_sha,
  message: firstCommitLine(response.message),
});

function BatchActionButton({
  action,
  pending,
  onClick,
}: {
  action: SourceControlBatchAction;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || action.disabled}
      className="rounded-sm px-1.5 py-0.5 text-[11px] font-medium text-[var(--ink-subtle)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-35"
      title={action.disabledReason ?? action.label}
    >
      {action.label}
    </button>
  );
}

function SessionCommitList({
  commits,
  expanded,
  onToggle,
}: {
  commits: SessionCommitSummary[];
  expanded: boolean;
  onToggle: () => void;
}) {
  if (commits.length === 0) return null;

  return (
    <div className="rounded-md text-[11px]">
      <button
        type="button"
        onClick={onToggle}
        className="flex h-6 w-full items-center gap-1.5 px-2 text-left text-[var(--ink-subtle)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
        aria-expanded={expanded}
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        />
        <span className="min-w-0 flex-1 truncate">Session commits</span>
        <span className="font-mono text-[10px] text-[var(--ink-tertiary)]">
          {commits.length}
        </span>
      </button>
      {expanded && (
        <div className="space-y-0.5 border-t border-[var(--hairline)] px-2 py-1">
          {commits.map((commit) => (
            <div
              key={commit.id}
              className="flex min-w-0 items-center gap-2 leading-5"
              title={`${commit.sha.slice(0, 5)} ${commit.message}`}
            >
              <span className="shrink-0 font-mono text-[10px] text-[var(--ink-tertiary)]">
                {commit.sha.slice(0, 5)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[var(--ink-subtle)]">
                {commit.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceControlConfirmDialog({
  request,
  onCancel,
  onConfirm,
}: {
  request: SourceControlConfirmDialogState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isDanger = request.tone === "danger";
  return (
    <div
      className="fixed inset-0 z-[1002] flex items-center justify-center p-4"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xs"
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="source-control-confirm-title"
        aria-describedby="source-control-confirm-desc"
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-[var(--hairline-strong)] bg-[var(--canvas)] select-none"
      >
        <div className="p-5">
          <div
            className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${
              isDanger ? "bg-red-500/15" : "bg-amber-500/15"
            }`}
          >
            <AlertTriangle
              className={`h-5 w-5 ${
                isDanger ? "text-red-400" : "text-amber-500"
              }`}
            />
          </div>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p
                id="source-control-confirm-title"
                className="text-base font-semibold tracking-tight text-[var(--ink)]"
              >
                {request.title}
              </p>
              <p
                id="source-control-confirm-desc"
                className="mt-1 text-xs leading-relaxed text-[var(--ink-subtle)]"
              >
                {request.description}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--ink-tertiary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
              aria-label="Cancel"
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--hairline)] bg-[var(--surface-1)] px-5 py-3">
          <span className="font-mono text-[10px] text-[var(--ink-tertiary)]">
            Esc to cancel
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="cursor-pointer rounded-md border border-[var(--hairline-strong)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] transition hover:bg-[var(--surface-3)]"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-white transition ${
                isDanger
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-[var(--primary)] hover:bg-[var(--primary-hover)]"
              }`}
              onClick={onConfirm}
            >
              {request.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const SessionSourceControlPanel: React.FC<
  SessionSourceControlPanelProps
> = ({
  projectId,
  sessionId,
  enabled,
  fallbackRelatedFiles,
  linkedWorkItemIds = [],
  onOpenDiff,
}) => {
  const {
    status,
    loading,
    error,
    refresh,
    stage,
    unstage,
    discard,
    commit,
  } = useSessionSourceControl({ projectId, sessionId, enabled });
  const [commitMessage, setCommitMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sessionCommits, setSessionCommits] = useState<
    SessionCommitSummary[]
  >([]);
  const [commitListExpanded, setCommitListExpanded] = useState(true);
  const [confirmDialog, setConfirmDialog] =
    useState<SourceControlConfirmDialogState | null>(null);

  const viewModel = useMemo(
    () => buildSourceControlViewModel(status),
    [status],
  );

  useEffect(() => {
    if (!enabled || !projectId || !sessionId) {
      setSessionCommits([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const records = await deliveryApi.listRecords(projectId);
        if (cancelled) return;
        setSessionCommits(
          mergeCommitSummaries(
            records
              .filter((record) => record.source_session_id === sessionId)
              .map(commitSummaryFromRecord)
              .filter(
                (commit): commit is SessionCommitSummary => commit !== null,
              ),
          ),
        );
      } catch {
        if (!cancelled) setSessionCommits([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, projectId, sessionId]);

  if (!enabled || !projectId || !sessionId) {
    return <>{fallbackRelatedFiles}</>;
  }

  if (status?.mode === "plain") {
    return <>{fallbackRelatedFiles}</>;
  }

  const runOperation = async (
    key: string,
    operation: () => Promise<{ ok?: boolean; failed?: { message: string }[] }>,
    options: { trackPending?: boolean } = {},
  ) => {
    const trackPending = options.trackPending ?? true;
    if (trackPending) setPendingAction(key);
    setActionError(null);
    try {
      const response = await operation();
      const firstFailure = response.failed?.[0]?.message;
      if (response.ok === false && firstFailure) {
        setActionError(firstFailure);
      }
    } catch (err) {
      setActionError(actionErrorMessage(err));
    } finally {
      if (trackPending) setPendingAction(null);
    }
  };

  const requestConfirm = (
    request: Omit<SourceControlConfirmDialogState, "resolve">,
  ): Promise<boolean> =>
    new Promise((resolve) => {
      setConfirmDialog({ ...request, resolve });
    });

  const closeConfirmDialog = (confirmed: boolean) => {
    const request = confirmDialog;
    if (!request) return;
    setConfirmDialog(null);
    request.resolve(confirmed);
  };

  const getSharedForce = async (
    files: SourceControlFile[],
    actionLabel: string,
  ): Promise<boolean | null> => {
    if (!sourceControlHasSharedFiles(files)) return false;
    const confirmed = await requestConfirm({
      title: `${actionLabel} shared files?`,
      description:
        "This operation includes files touched by another active session. Continue only if you intend to override that shared protection.",
      confirmLabel: actionLabel,
      tone: "warning",
    });
    return confirmed ? true : null;
  };

  const handleStageFiles = (files: SourceControlFile[]) => {
    if (files.length === 0) return;
    void (async () => {
      const forceShared = await getSharedForce(files, "Stage");
      if (forceShared === null) return;
      const paths = sourceControlVisiblePaths(files);
      await runOperation(`stage:${paths.join("|")}`, () =>
        stage({
          workspace_id: viewModel.workspaceId,
          paths,
          force_shared: forceShared || undefined,
        }),
        { trackPending: false },
      );
    })();
  };

  const handleUnstageFiles = (files: SourceControlFile[]) => {
    if (files.length === 0) return;
    const paths = sourceControlVisiblePaths(files);
    void runOperation(`unstage:${paths.join("|")}`, () =>
      unstage({
        workspace_id: viewModel.workspaceId,
        paths,
      }),
      { trackPending: false },
    );
  };

  const handleDiscardFiles = (files: SourceControlFile[]) => {
    if (files.length === 0) return;
    void (async () => {
      const discardConfirmed = await requestConfirm({
        title: "Discard changes?",
        description: `Discard changes for ${describePaths(
          files,
        )}? This cannot be undone.`,
        confirmLabel: "Discard",
        tone: "danger",
      });
      if (!discardConfirmed) return;
      const forceShared = await getSharedForce(files, "Discard");
      if (forceShared === null) return;
      const paths = sourceControlVisiblePaths(files);
      await runOperation(`discard:${paths.join("|")}`, () =>
        discard({
          workspace_id: viewModel.workspaceId,
          paths,
          force_shared: forceShared || undefined,
          expected_head_sha: viewModel.headSha,
        }),
      );
    })();
  };

  const handleOpenDiff = (
    file: SourceControlFile,
    area: SourceControlDiffArea,
  ) => {
    onOpenDiff(projectId, sessionId, file.path, area);
  };

  const handleBatchAction = (
    action: SourceControlBatchAction,
    section: SourceControlSectionViewModel,
  ) => {
    if (action.disabled || pendingAction) return;
    if (action.id === "stage-all") {
      handleStageFiles(section.files);
      return;
    }
    if (action.id === "unstage-all") {
      handleUnstageFiles(section.files);
      return;
    }
    handleDiscardFiles(section.files);
  };

  const handleCommit = () => {
    const message = commitMessage.trim();
    if (!message || !viewModel.canCommit) return;
    const stagedSection = findSection(viewModel, "staged");
    const stagedFiles = stagedSection?.files ?? [];
    void (async () => {
      const forceShared = await getSharedForce(stagedFiles, "Commit");
      if (forceShared === null) return;

      await runOperation("commit", async () => {
        const response = await commit({
          workspace_id: viewModel.workspaceId,
          message,
          expected_staged_paths: viewModel.stagedPaths,
          force_shared: forceShared || undefined,
          work_item_ids: linkedWorkItemIds,
          expected_head_sha: viewModel.headSha,
        });
        setSessionCommits((current) =>
          mergeCommitSummaries([
            commitSummaryFromResponse(response),
            ...current,
          ]),
        );
        setCommitMessage("");
        return { ok: true, failed: [] };
      });
    })();
  };

  if (!status && !error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
        <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-[var(--ink)]">
          Files Changes
        </div>
        <div className="flex items-center gap-2 rounded-md bg-[var(--surface-1)] px-3 py-3 text-[13px] text-[var(--ink-tertiary)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading source-control status...
        </div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[var(--ink)]">
            Files Changes
          </h2>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--ink-tertiary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
            title="Refresh source control"
            aria-label="Refresh source control"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="rounded-md bg-[var(--surface-1)] px-3 py-3 text-[13px] text-rose-500">
          {error.message}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between px-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-[14px] font-semibold text-[var(--ink)]">
            Files Changes
          </h2>
          {viewModel.branch && (
            <span
              className="truncate rounded-full bg-[var(--surface-3)] px-2 py-0.5 font-mono text-[11px] text-[var(--ink-tertiary)]"
              title={viewModel.branch}
            >
              {viewModel.branch}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || Boolean(pendingAction)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--ink-tertiary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
          title="Refresh source control"
          aria-label="Refresh source control"
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      <ScrollArea className="flex-1 px-2 pb-2">
        {(viewModel.blockedReason ||
          viewModel.externalStagedPaths.length > 0 ||
          actionError) && (
          <div className="mb-2 space-y-1">
            {viewModel.blockedReason && (
              <div className="flex gap-2 rounded-md bg-[var(--surface-1)] px-3 py-2 text-[12px] text-amber-600">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{viewModel.blockedReason}</span>
              </div>
            )}
            {viewModel.externalStagedPaths.length > 0 && (
              <div className="rounded-md bg-[var(--surface-1)] px-3 py-2 text-[12px] text-rose-500">
                External staged files:{" "}
                <span className="font-mono">
                  {viewModel.externalStagedPaths.join(", ")}
                </span>
              </div>
            )}
            {actionError && (
              <div className="rounded-md bg-[var(--surface-1)] px-3 py-2 text-[12px] text-rose-500">
                {actionError}
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <SessionCommitList
            commits={sessionCommits}
            expanded={commitListExpanded}
            onToggle={() => setCommitListExpanded((expanded) => !expanded)}
          />
          {viewModel.sections.map((section) => (
            <section key={section.id} className="space-y-1">
              <div className="flex min-h-7 items-center justify-between gap-2 px-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h3 className="truncate text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-subtle)]">
                    {section.title}
                  </h3>
                  <span className="rounded-full bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--ink-tertiary)]">
                    {section.files.length}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {section.batchActions.map((action) => (
                    <BatchActionButton
                      key={action.id}
                      action={action}
                      pending={Boolean(pendingAction)}
                      onClick={() => handleBatchAction(action, section)}
                    />
                  ))}
                </div>
              </div>
              {section.files.length === 0 ? (
                <div className="rounded-md bg-[var(--surface-1)] px-3 py-2 text-[13px] text-[var(--ink-tertiary)]">
                  {section.emptyLabel}
                </div>
              ) : (
                <div className="space-y-1">
                  {section.files.map((file) => (
                    <SourceControlFileRow
                      key={`${section.id}-${file.status}-${file.path}`}
                      file={file}
                      area={section.area}
                      viewModel={viewModel}
                      pending={Boolean(pendingAction)}
                      onOpenDiff={handleOpenDiff}
                      onStage={(target) => handleStageFiles([target])}
                      onUnstage={(target) => handleUnstageFiles([target])}
                      onDiscard={(target) => handleDiscardFiles([target])}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-[var(--hairline)] p-2">
        <textarea
          value={commitMessage}
          onChange={(event) => setCommitMessage(event.target.value)}
          rows={2}
          className="mb-2 min-h-14 w-full resize-none rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-tertiary)] focus:border-[var(--primary)]"
          placeholder="commit message"
        />
        <button
          type="button"
          onClick={handleCommit}
          disabled={
            Boolean(pendingAction) ||
            !viewModel.canCommit ||
            !commitMessage.trim()
          }
          className="flex h-8 w-full items-center justify-center rounded-md bg-[var(--primary)] px-3 text-[13px] font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:bg-[var(--surface-3)] disabled:text-[var(--ink-tertiary)] disabled:opacity-80"
          title={
            !commitMessage.trim()
              ? "Enter a commit message"
              : (viewModel.commitDisabledReason ?? "Commit staged changes")
          }
        >
          {pendingAction === "commit" ? "Committing..." : "Commit"}
        </button>
      </div>
      </div>
      {confirmDialog && (
        <SourceControlConfirmDialog
          request={confirmDialog}
          onCancel={() => closeConfirmDialog(false)}
          onConfirm={() => closeConfirmDialog(true)}
        />
      )}
    </>
  );
};
