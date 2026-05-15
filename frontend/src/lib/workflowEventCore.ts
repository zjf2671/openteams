export type WorkflowEventName =
  | 'workflow.session_created'
  | 'workflow.agent_added'
  | 'workflow.plan_generated'
  | 'workflow.plan_executed'
  | 'workflow.step_started'
  | 'workflow.step_completed'
  | 'workflow.execution_state_changed'
  | 'collaboration.agent_mentioned'
  | 'collaboration.agent_state_changed'
  | 'collaboration.approval_requested'
  | 'collaboration.approval_resolved'
  | 'collaboration.handoff_completed'
  | 'engagement.message_sent'
  | 'engagement.attachment_added'
  | 'engagement.workflow_card_opened'
  | 'engagement.transcript_opened'
  | 'engagement.diff_viewed'
  | 'engagement.session_archived'
  | 'quality.workflow_completed'
  | 'quality.workflow_failed'
  | 'quality.step_reviewed'
  | 'quality.diff_generated'
  | 'quality.retry_triggered'
  | 'quality.review_decision_recorded'
  | 'risk.agent_error'
  | 'risk.permission_denied'
  | 'risk.approval_timeout'
  | 'risk.api_failure'
  | 'risk.websocket_disconnected'
  | 'risk.runner_interrupted';

export interface WorkflowEventContext {
  session_id?: string | null;
  workflow_id?: string | null;
  workspace_id?: string | null;
  user_id_hash?: string | null;
  agent_role?: string | null;
  plan_id?: string | null;
  task_id?: string | null;
}

export interface WorkflowAnalyticsEventPayload {
  event_name: WorkflowEventName;
  session_id: string | null;
  workflow_id: string | null;
  workspace_id: string | null;
  user_id_hash: string | null;
  agent_role: string | null;
  timestamp: string;
  event_source: 'frontend';
  plan_id: string | null;
  task_id: string | null;
  status: string | null;
  duration_ms: number | null;
  error_code: string | null;
  metadata_version: 1;
  metadata?: Record<string, unknown>;
}

export const FORBIDDEN_METADATA_KEYS: ReadonlySet<string> = new Set([
  'message_content',
  'file_content',
  'full_path',
  'secret_value',
  'prompt_text',
  'raw_stdout',
  'raw_stderr',
  'stack_trace',
]);

export function stripForbiddenMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!metadata || Object.keys(metadata).length === 0) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!FORBIDDEN_METADATA_KEYS.has(key)) {
      clean[key] = value;
    }
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

export function messageLengthBucket(length: number): string {
  if (length === 0) return 'empty';
  if (length <= 100) return 'short';
  if (length <= 500) return 'medium';
  return 'long';
}

export function fileSizeBucket(bytes: number): string {
  if (bytes < 1024) return 'tiny';
  if (bytes < 100 * 1024) return 'small';
  if (bytes < 1024 * 1024) return 'medium';
  return 'large';
}

export function buildWorkflowEventPayload(
  eventName: WorkflowEventName,
  context: WorkflowEventContext,
  options?: {
    status?: string | null;
    duration_ms?: number | null;
    error_code?: string | null;
    metadata?: Record<string, unknown>;
  }
): WorkflowAnalyticsEventPayload {
  const cleanMetadata = stripForbiddenMetadata(options?.metadata);

  return {
    event_name: eventName,
    session_id: context.session_id ?? null,
    workflow_id: context.workflow_id ?? null,
    workspace_id: context.workspace_id ?? null,
    user_id_hash: context.user_id_hash ?? null,
    agent_role: context.agent_role ?? null,
    timestamp: new Date().toISOString(),
    event_source: 'frontend',
    plan_id: context.plan_id ?? null,
    task_id: context.task_id ?? null,
    status: options?.status ?? null,
    duration_ms: options?.duration_ms ?? null,
    error_code: options?.error_code ?? null,
    metadata_version: 1,
    ...(cleanMetadata ? { metadata: cleanMetadata } : {}),
  };
}

export function createWorkflowEventRecorder(
  getUserIdHash: () => string | null,
  emit: (
    eventName: WorkflowEventName,
    context: WorkflowEventContext,
    options?: {
      status?: string | null;
      duration_ms?: number | null;
      error_code?: string | null;
      metadata?: Record<string, unknown>;
    }
  ) => void
): (
  eventName: WorkflowEventName,
  context: WorkflowEventContext,
  options?: {
    status?: string | null;
    duration_ms?: number | null;
    error_code?: string | null;
    metadata?: Record<string, unknown>;
  }
) => void {
  return (eventName, context, options) => {
    emit(
      eventName,
      {
        ...context,
        user_id_hash: getUserIdHash(),
      },
      options
    );
  };
}
