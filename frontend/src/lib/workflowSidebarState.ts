import type {
  Session,
  WorkflowSessionStatusResponse,
  WorkflowSidebarState,
} from '@/types';

export const workflowRunningSidebarStates: ReadonlySet<WorkflowSidebarState> =
  new Set<WorkflowSidebarState>(['running', 'reviewing', 'waiting']);

export const workflowNonRunningSidebarStates: ReadonlySet<WorkflowSidebarState> =
  new Set<WorkflowSidebarState>([
    'waiting_input',
    'waiting_user_review',
    'paused',
    'failed',
  ]);

export const idleWorkflowSessionStatus: WorkflowSessionStatusResponse = {
  sidebar_workflow_state: 'idle',
  has_running_workflow: false,
  pending_workflow_input_id: null,
  pending_workflow_review_id: null,
};

export const resolveWorkflowSidebarState = (
  status: {
    sidebar_workflow_state?: WorkflowSidebarState | null;
    has_running_workflow?: boolean;
    pending_workflow_input_id?: string | null;
    pending_workflow_review_id?: string | null;
  },
): WorkflowSidebarState => {
  if (status.sidebar_workflow_state) return status.sidebar_workflow_state;
  if (status.pending_workflow_review_id) return 'waiting_user_review';
  if (status.pending_workflow_input_id) return 'waiting_input';
  return status.has_running_workflow ? 'running' : 'idle';
};

export const isWorkflowSidebarRunning = (
  state: WorkflowSidebarState,
): boolean => workflowRunningSidebarStates.has(state);

export const hasRunningWorkflowActivity = (
  session: Pick<Session, 'hasRunningWorkflow' | 'workflowSidebarState'>,
): boolean => {
  const workflowSidebarState = session.workflowSidebarState ?? 'idle';
  return (
    !workflowNonRunningSidebarStates.has(workflowSidebarState) &&
    (Boolean(session.hasRunningWorkflow) ||
      isWorkflowSidebarRunning(workflowSidebarState))
  );
};
