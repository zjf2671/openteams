import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Command, User, X, type LucideIcon } from 'lucide-react';
import type { WorkflowCardData } from '@/lib/api';
import { cn } from '@/lib/utils';

export type WorkflowReviewSettingOverride = {
  stepId: string;
  leadReview: boolean | null;
  userReview: boolean;
};

type WorkflowReviewSettingsDialogProps = {
  projection: WorkflowCardData;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    overrides: WorkflowReviewSettingOverride[]
  ) => Promise<unknown> | void;
  submitLabel: string;
  submittingLabel: string;
  isSubmitting?: boolean;
  disabled?: boolean;
  error?: string | null;
  variant?: 'panel' | 'modal';
  className?: string;
};

type ReviewSettingDraft = Record<
  string,
  {
    leadReview: boolean;
    userReview: boolean;
  }
>;

function buildReviewSettingsDraft(
  taskRows: Array<{
    stepId: string;
    leadReview: boolean;
    userReview: boolean;
  }>,
  loopRows: Array<{
    stepId: string;
    userReview: boolean;
  }>
): ReviewSettingDraft {
  return Object.fromEntries([
    ...taskRows.map((row) => [
      row.stepId,
      {
        leadReview: row.leadReview,
        userReview: row.userReview,
      },
    ]),
    ...loopRows.map((row) => [
      row.stepId,
      {
        leadReview: false,
        userReview: row.userReview,
      },
    ]),
  ] as Array<[string, { leadReview: boolean; userReview: boolean }]>);
}

function ReviewToggleTag({
  icon: Icon,
  label,
  tooltip,
  checked,
  disabled = false,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  tooltip: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={cn(
        'group relative flex h-7 min-w-[58px] items-center justify-center gap-1.5 rounded border px-2 text-left text-[11px] font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5e6ad2]/40',
        checked
          ? 'border-white/[0.14] bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_0_1px_rgba(94,106,210,0.08)]'
          : 'border-transparent bg-transparent text-white/30 hover:border-white/[0.08] hover:bg-white/[0.03] hover:text-white/55',
        disabled &&
          'cursor-not-allowed opacity-45 hover:border-transparent hover:bg-transparent hover:text-white/30'
      )}
    >
      <span className="flex min-w-0 items-center justify-center gap-1.5">
        <Icon
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            checked ? 'text-[#828fff]' : 'text-current'
          )}
          strokeWidth={1.5}
        />
        <span className="truncate">{label}</span>
      </span>
      <span className="pointer-events-none absolute left-0 top-full z-[90] mt-1 hidden max-w-[240px] rounded-md border border-white/[0.08] bg-[#111214] px-2.5 py-1.5 text-xs font-medium leading-4 text-white shadow-[0_12px_28px_rgba(0,0,0,0.32)] group-hover:block">
        {tooltip}
      </span>
    </button>
  );
}

function ReviewSettingTooltipText({
  text,
  className,
  tooltipClassName,
}: {
  text: string;
  className: string;
  tooltipClassName?: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className="relative min-w-0"
      onMouseEnter={(event) => {
        const element = event.currentTarget
          .firstElementChild as HTMLDivElement | null;
        if (!element) return;
        setShowTooltip(
          element.scrollWidth > element.clientWidth ||
            element.scrollHeight > element.clientHeight
        );
      }}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className={className}>{text}</div>
      {showTooltip && (
        <div
          className={cn(
            'pointer-events-none absolute left-0 top-full z-[90] mt-1 max-w-[320px] rounded-md border border-white/[0.08] bg-[#111214] px-2.5 py-1.5 text-xs font-medium leading-4 text-white shadow-[0_12px_28px_rgba(0,0,0,0.32)]',
            tooltipClassName
          )}
        >
          {text}
        </div>
      )}
    </div>
  );
}

export function WorkflowReviewSettingsDialog({
  projection,
  isOpen,
  onClose,
  onSubmit,
  submitLabel,
  submittingLabel,
  isSubmitting = false,
  disabled = false,
  error,
  variant = 'modal',
  className,
}: WorkflowReviewSettingsDialogProps) {
  const { t } = useTranslation('chat');
  const [reviewSettingsDraft, setReviewSettingsDraft] =
    useState<ReviewSettingDraft>({});

  const stepByKey = useMemo(
    () => new Map(projection.steps.map((step) => [step.step_key, step])),
    [projection.steps]
  );
  const stepById = useMemo(
    () => new Map(projection.steps.map((step) => [step.id, step])),
    [projection.steps]
  );
  const planNodeById = useMemo(
    () => new Map(projection.plan.nodes.map((node) => [node.id, node])),
    [projection.plan.nodes]
  );
  const workflowLoops = useMemo(
    () => projection.loops ?? [],
    [projection.loops]
  );

  const taskReviewSettingsRows = useMemo(
    () =>
      projection.plan.nodes
        .filter((node) => node.data.stepType === 'task')
        .map((node) => {
          const step = stepByKey.get(node.id);
          return {
            stepId: node.id,
            title: step?.title ?? node.data.title ?? node.id,
            leadReview: step?.lead_review_required ?? true,
            userReview: step?.user_review_required ?? true,
          };
        }),
    [projection.plan.nodes, stepByKey]
  );

  const loopReviewSettingsRows = useMemo(
    () =>
      workflowLoops.flatMap((workflowLoop) => {
        const reviewStep = stepById.get(workflowLoop.review_step_id);
        if (!reviewStep) return [];
        const reviewNode = planNodeById.get(reviewStep.step_key);
        const reviewStepTitle = reviewStep.title ?? reviewStep.step_key;
        return {
          stepId: reviewStep.step_key,
          title:
            workflowLoop.loop_key || reviewNode?.data.title || reviewStepTitle,
          userReview: workflowLoop.user_review_required,
        };
      }),
    [planNodeById, stepById, workflowLoops]
  );

  const reviewSettingsShapeKey = useMemo(
    () =>
      [
        projection.execution_id ?? '',
        projection.plan_id ?? '',
        taskReviewSettingsRows.map((row) => row.stepId).join(','),
        loopReviewSettingsRows.map((row) => row.stepId).join(','),
      ].join('::'),
    [
      loopReviewSettingsRows,
      projection.execution_id,
      projection.plan_id,
      taskReviewSettingsRows,
    ]
  );
  const taskReviewSettingsRowsRef = useRef(taskReviewSettingsRows);
  const loopReviewSettingsRowsRef = useRef(loopReviewSettingsRows);

  useEffect(() => {
    taskReviewSettingsRowsRef.current = taskReviewSettingsRows;
    loopReviewSettingsRowsRef.current = loopReviewSettingsRows;
  }, [loopReviewSettingsRows, taskReviewSettingsRows]);

  useEffect(() => {
    if (!isOpen) return;
    setReviewSettingsDraft(
      buildReviewSettingsDraft(
        taskReviewSettingsRowsRef.current,
        loopReviewSettingsRowsRef.current
      )
    );
  }, [isOpen, reviewSettingsShapeKey]);

  const updateReviewSettingDraft = useCallback(
    (stepId: string, key: 'leadReview' | 'userReview', value: boolean) => {
      setReviewSettingsDraft((prev) => ({
        ...prev,
        [stepId]: {
          leadReview: prev[stepId]?.leadReview ?? true,
          userReview: prev[stepId]?.userReview ?? true,
          [key]: value,
        },
      }));
    },
    []
  );

  const handleSubmit = useCallback(() => {
    if (disabled || isSubmitting) return;
    return onSubmit([
      ...taskReviewSettingsRows.map((row) => ({
        stepId: row.stepId,
        leadReview:
          reviewSettingsDraft[row.stepId]?.leadReview ?? row.leadReview,
        userReview:
          reviewSettingsDraft[row.stepId]?.userReview ?? row.userReview,
      })),
      ...loopReviewSettingsRows.map((row) => ({
        stepId: row.stepId,
        leadReview: null,
        userReview:
          reviewSettingsDraft[row.stepId]?.userReview ?? row.userReview,
      })),
    ]);
  }, [
    disabled,
    isSubmitting,
    loopReviewSettingsRows,
    onSubmit,
    reviewSettingsDraft,
    taskReviewSettingsRows,
  ]);

  if (!isOpen) return null;

  const content = (
    <div
      className={cn(
        "workflow-review-settings-dialog relative overflow-hidden rounded-[10px] border border-white/[0.10] bg-[#0f1011]/95 shadow-[0_24px_80px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.12)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.32),transparent)] before:content-['']",
        variant === 'panel'
          ? 'flex w-[400px] flex-col'
          : 'w-full max-w-[440px]',
        className
      )}
    >
      <div className="flex items-start justify-between border-b border-white/[0.08] bg-white/[0.025] px-5 py-4">
        <div className="pl-1.5 pr-4">
          <div className="mb-1 text-sm font-semibold text-[#f4f4f5]">
            {t('workflow.reviewSettings.title', {
              defaultValue: 'Review Settings',
            })}
          </div>
          <div className="text-xs leading-relaxed text-[#a1a1aa]">
            {t('workflow.reviewSettings.description', {
              defaultValue: 'Choose who should review each workflow result.',
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="mt-0.5 shrink-0 rounded-md p-1.5 text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t('workflow.reviewSettings.close', {
            defaultValue: 'Close review settings',
          })}
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex max-h-[500px] flex-col gap-6 overflow-y-auto p-4">
        {taskReviewSettingsRows.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="font-mono text-[10px] font-medium uppercase tracking-[0.09em] text-white/70">
                {t('workflow.reviewSettings.taskSteps', {
                  defaultValue: 'Task Steps',
                })}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.09em] text-white/35">
                {t('workflow.reviewSettings.leadUserReview', {
                  defaultValue: 'Lead / User review',
                })}
              </div>
            </div>
            <div className="flex flex-col">
              {taskReviewSettingsRows.map((row) => {
                const draft = reviewSettingsDraft[row.stepId] ?? {
                  leadReview: row.leadReview,
                  userReview: row.userReview,
                };

                return (
                  <div
                    key={row.stepId}
                    className="flex items-center justify-between gap-4 border-b border-dashed border-white/[0.04] py-3.5 last:border-b-0"
                  >
                    <ReviewSettingTooltipText
                      text={row.title}
                      className="truncate text-sm font-medium text-[#E2E8F0]"
                    />
                    <div className="flex shrink-0 flex-row items-center justify-end gap-1.5">
                      <ReviewToggleTag
                        icon={Command}
                        label={t('workflow.reviewSettings.leadLabel', {
                          defaultValue: 'Lead',
                        })}
                        tooltip={
                          draft.leadReview
                            ? t('workflow.reviewSettings.leadReviewOff', {
                                defaultValue:
                                  'Disable lead agent review for this task step',
                              })
                            : t('workflow.reviewSettings.leadReviewOn', {
                                defaultValue:
                                  'Enable lead agent review for this task step',
                              })
                        }
                        checked={draft.leadReview}
                        disabled={disabled || isSubmitting}
                        onChange={(checked) =>
                          updateReviewSettingDraft(
                            row.stepId,
                            'leadReview',
                            checked
                          )
                        }
                      />
                      <ReviewToggleTag
                        icon={User}
                        label={t('workflow.reviewSettings.userLabel', {
                          defaultValue: 'User',
                        })}
                        tooltip={
                          draft.userReview
                            ? t('workflow.reviewSettings.userReviewOff', {
                                defaultValue:
                                  'Disable user review for this task step',
                              })
                            : t('workflow.reviewSettings.userReviewOn', {
                                defaultValue:
                                  'Enable user review for this task step',
                              })
                        }
                        checked={draft.userReview}
                        disabled={disabled || isSubmitting}
                        onChange={(checked) =>
                          updateReviewSettingDraft(
                            row.stepId,
                            'userReview',
                            checked
                          )
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {loopReviewSettingsRows.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="font-mono text-[10px] font-medium uppercase tracking-[0.09em] text-white/70">
                {t('workflow.reviewSettings.workflowLoops', {
                  defaultValue: 'Workflow Loops',
                })}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.09em] text-white/35">
                {t('workflow.reviewSettings.userReviewOnly', {
                  defaultValue: 'User review only',
                })}
              </div>
            </div>
            <div className="flex flex-col">
              {loopReviewSettingsRows.map((row) => {
                const draft = reviewSettingsDraft[row.stepId] ?? {
                  leadReview: false,
                  userReview: row.userReview,
                };

                return (
                  <div
                    key={row.stepId}
                    className="flex items-center justify-between gap-4 border-b border-dashed border-white/[0.04] py-3.5 last:border-b-0"
                  >
                    <ReviewSettingTooltipText
                      text={row.title}
                      className="truncate text-sm font-medium text-[#E2E8F0]"
                      tooltipClassName="max-w-[340px]"
                    />
                    <div className="flex shrink-0 flex-row items-center justify-end gap-1.5">
                      <ReviewToggleTag
                        icon={User}
                        label={t('workflow.reviewSettings.userLabel', {
                          defaultValue: 'User',
                        })}
                        tooltip={
                          draft.userReview
                            ? t('workflow.reviewSettings.loopUserReviewOff', {
                                defaultValue:
                                  'Disable user review for this workflow loop',
                              })
                            : t('workflow.reviewSettings.loopUserReviewOn', {
                                defaultValue:
                                  'Enable user review for this workflow loop',
                              })
                        }
                        checked={draft.userReview}
                        disabled={disabled || isSubmitting}
                        onChange={(checked) =>
                          updateReviewSettingDraft(
                            row.stepId,
                            'userReview',
                            checked
                          )
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {error && (
        <div className="mx-5 mb-3 flex items-start gap-2 rounded-md border border-[#5e6ad2]/30 bg-[#5e6ad2]/10 px-3 py-2 text-xs leading-5 text-[#c7d2fe]">
          <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          <span>{error}</span>
        </div>
      )}
      <div className="flex justify-end gap-2 border-t border-white/[0.08] bg-white/[0.025] px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="rounded-md border border-white/[0.10] bg-transparent px-4 py-2 text-xs font-semibold text-white/55 transition-colors hover:border-white/[0.18] hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('workflow.reviewSettings.cancel', {
            defaultValue: 'Cancel',
          })}
        </button>
        <button
          type="button"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={disabled || isSubmitting}
          className="rounded-md bg-[linear-gradient(180deg,#828fff,#5e6ad2)] px-4 py-2 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_24px_rgba(94,106,210,0.22)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </div>
  );

  if (variant === 'panel') {
    return <div className="absolute right-6 top-6 z-[70]">{content}</div>;
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
      {content}
    </div>
  );
}
