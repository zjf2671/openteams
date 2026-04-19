use serde::{Deserialize, Serialize};
use sqlx::Type;
use ts_rs::TS;

// ---------------------------------------------------------------------------
// Plan-level enums
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "workflow_plan_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(use_ts_enum)]
pub enum WorkflowPlanStatus {
    Draft,
    Ready,
    Superseded,
    Cancelled,
}

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "workflow_validation_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(use_ts_enum)]
pub enum WorkflowValidationStatus {
    Pending,
    Valid,
    Invalid,
}

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "workflow_revision_editor", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(use_ts_enum)]
pub enum WorkflowRevisionEditor {
    Lead,
    System,
}

// ---------------------------------------------------------------------------
// Execution-level enums
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "workflow_execution_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(use_ts_enum)]
pub enum WorkflowExecutionStatus {
    Pending,
    Bootstrapping,
    Running,
    Interrupting,
    #[sqlx(rename = "waiting_user")]
    #[serde(rename = "waiting_user")]
    WaitingUser,
    #[sqlx(rename = "waiting_user_acceptance")]
    #[serde(rename = "waiting_user_acceptance")]
    WaitingUserAcceptance,
    Pausing,
    Paused,
    Recompiling,
    Resuming,
    Completing,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "workflow_round_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(use_ts_enum)]
pub enum WorkflowRoundStatus {
    Running,
    #[sqlx(rename = "waiting_user_acceptance")]
    #[serde(rename = "waiting_user_acceptance")]
    WaitingUserAcceptance,
    Accepted,
    Rejected,
    Archived,
}

// ---------------------------------------------------------------------------
// Step-level enums
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "workflow_step_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(use_ts_enum)]
pub enum WorkflowStepType {
    Task,
    Review,
    Result,
}

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "workflow_step_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(use_ts_enum)]
pub enum WorkflowStepStatus {
    Pending,
    Ready,
    Running,
    #[sqlx(rename = "interrupt_requested")]
    #[serde(rename = "interrupt_requested")]
    InterruptRequested,
    Interrupted,
    #[sqlx(rename = "waiting_input")]
    #[serde(rename = "waiting_input")]
    WaitingInput,
    #[sqlx(rename = "waiting_review")]
    #[serde(rename = "waiting_review")]
    WaitingReview,
    Blocked,
    Completed,
    Failed,
    Skipped,
    Cancelled,
}

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "workflow_edge_kind", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(use_ts_enum)]
pub enum WorkflowEdgeKind {
    Hard,
    Soft,
}

// ---------------------------------------------------------------------------
// Agent session enums
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "workflow_agent_session_role", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(use_ts_enum)]
pub enum WorkflowAgentSessionRole {
    Lead,
    Worker,
    Reviewer,
}

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "workflow_agent_session_state", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(use_ts_enum)]
pub enum WorkflowAgentSessionState {
    Idle,
    Running,
    #[sqlx(rename = "interrupt_requested")]
    #[serde(rename = "interrupt_requested")]
    InterruptRequested,
    Interrupted,
    #[sqlx(rename = "waiting_input")]
    #[serde(rename = "waiting_input")]
    WaitingInput,
    #[sqlx(rename = "waiting_approval")]
    #[serde(rename = "waiting_approval")]
    WaitingApproval,
    Paused,
    Completed,
    Failed,
    Expired,
}

// ---------------------------------------------------------------------------
// Event enums
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "workflow_event_type", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
#[ts(use_ts_enum)]
pub enum WorkflowEventType {
    ExecutionCreated,
    ExecutionBootstrapping,
    ExecutionRunning,
    ExecutionFailed,
    ExecutionCompleted,
    ExecutionCancelled,
    ExecutionPauseRequested,
    ExecutionPaused,
    ExecutionResumeRequested,
    ExecutionInterruptRequested,
    ExecutionInterrupted,
    RoundStarted,
    RoundResultReady,
    UserAcceptanceRequested,
    UserAccepted,
    UserRejected,
    RoundArchived,
    PlanRevisionCreated,
    PlanRecompiled,
    StepStatusChanged,
    AgentSessionStateChanged,
}

// ---------------------------------------------------------------------------
// Workflow Plan JSON types (React Flow compatible)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct WorkflowPlanJson {
    pub version: u32,
    pub title: String,
    pub goal: String,
    pub agents: WorkflowPlanAgents,
    #[serde(default)]
    pub globals: Option<WorkflowPlanGlobals>,
    #[serde(default)]
    pub viewport: Option<WorkflowPlanViewport>,
    pub nodes: Vec<WorkflowPlanNode>,
    pub edges: Vec<WorkflowPlanEdge>,
    #[serde(default)]
    pub policies: Option<WorkflowPlanPolicies>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct WorkflowPlanAgents {
    pub lead: String,
    pub available: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct WorkflowPlanGlobals {
    #[serde(default = "default_interrupt_mode")]
    pub interrupt_mode: String,
    #[serde(default = "default_retry")]
    pub default_retry: u32,
    #[serde(default = "default_true")]
    pub global_pause_supported: bool,
}

fn default_interrupt_mode() -> String {
    "cooperative".to_string()
}

fn default_retry() -> u32 {
    1
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct WorkflowPlanViewport {
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default = "default_zoom")]
    pub zoom: f64,
}

fn default_zoom() -> f64 {
    1.0
}

impl Default for WorkflowPlanViewport {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            zoom: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct WorkflowPlanNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub position: WorkflowNodePosition,
    pub data: WorkflowNodeData,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct WorkflowNodePosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowNodeData {
    pub step_type: String,
    #[serde(default)]
    pub agent_id: Option<String>,
    pub title: String,
    pub instructions: String,
    #[serde(default)]
    pub acceptance: Option<Vec<String>>,
    #[serde(default)]
    pub outputs: Option<Vec<String>>,
    #[serde(default = "default_true")]
    pub interruptible: bool,
    #[serde(default)]
    pub max_retry: Option<u32>,
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct WorkflowPlanEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(rename = "type", default)]
    pub edge_type: Option<String>,
    #[serde(default)]
    pub data: Option<WorkflowEdgeData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct WorkflowEdgeData {
    #[serde(default = "default_edge_kind")]
    pub kind: String,
}

fn default_edge_kind() -> String {
    "hard".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct WorkflowPlanPolicies {
    #[serde(default)]
    pub approval_required_on: Option<Vec<String>>,
    #[serde(default)]
    pub permission_required_on: Option<Vec<String>>,
    #[serde(default)]
    pub on_failure: Option<String>,
    #[serde(default = "default_true")]
    pub allow_plan_revision: bool,
}

// ---------------------------------------------------------------------------
// Compiled graph DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CompiledGraph {
    pub plan_hash: String,
    pub compiled_graph_hash: String,
    pub steps: Vec<CompiledStep>,
    pub edges: Vec<CompiledEdge>,
    pub ready_step_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CompiledStep {
    pub step_key: String,
    pub step_type: WorkflowStepType,
    pub title: String,
    pub instructions: String,
    pub assigned_agent_id: Option<String>,
    pub acceptance: Option<Vec<String>>,
    pub outputs: Option<Vec<String>>,
    pub interruptible: bool,
    pub max_retry: u32,
    pub display_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CompiledEdge {
    pub edge_id: String,
    pub from_step_key: String,
    pub to_step_key: String,
    pub edge_kind: WorkflowEdgeKind,
}
