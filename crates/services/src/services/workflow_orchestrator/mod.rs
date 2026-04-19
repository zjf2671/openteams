//! Workflow Orchestrator 骨架
//!
//! Phase 1a 职责：
//! - command handler: 接收 bootstrap 命令
//! - state reducer: 集中管理执行/步骤/agent session 状态迁移
//! - scheduler loop 骨架: 接口预留
//! - event projector: 审计事件由 reducer 自动写入

pub mod reducer;

use std::collections::HashMap;

use db::models::{
    workflow_agent_session::{CreateWorkflowAgentSession, WorkflowAgentSession},
    workflow_event::{CreateWorkflowEvent, WorkflowEvent},
    workflow_execution::{CreateWorkflowExecution, WorkflowExecution},
    workflow_plan::WorkflowPlan,
    workflow_plan_revision::WorkflowPlanRevision,
    workflow_round::{CreateWorkflowRound, WorkflowRound},
    workflow_step::{CreateWorkflowStep, WorkflowStep},
    workflow_step_edge::{CreateWorkflowStepEdge, WorkflowStepEdge},
    workflow_types::*,
};
use sqlx::SqlitePool;
use uuid::Uuid;

use super::workflow_compiler::WorkflowCompiler;

/// Orchestrator 错误
#[derive(Debug, thiserror::Error)]
pub enum OrchestratorError {
    #[error("数据库错误: {0}")]
    Database(#[from] sqlx::Error),
    #[error("编译错误: {0}")]
    Compile(#[from] super::workflow_compiler::CompileError),
    #[error("状态迁移非法: {0}")]
    IllegalTransition(String),
    #[error("未找到资源: {0}")]
    NotFound(String),
}

impl From<reducer::TransitionError> for OrchestratorError {
    fn from(e: reducer::TransitionError) -> Self {
        OrchestratorError::IllegalTransition(e.to_string())
    }
}

/// Orchestrator 是 workflow mode 的核心调度组件
pub struct WorkflowOrchestrator;

impl WorkflowOrchestrator {
    // -----------------------------------------------------------------------
    // Command Handler: bootstrap
    // -----------------------------------------------------------------------

    /// 从一个已校验的 plan revision 创建 execution 并 bootstrap
    ///
    /// 流程:
    /// 1. 创建 execution (pending)
    /// 2. 通过 reducer 迁移到 bootstrapping
    /// 3. 编译 plan → compiled graph
    /// 4. 创建 agent sessions, round, steps, edges
    /// 5. 通过 reducer 迁移 ready steps
    /// 6. 通过 reducer 迁移到 running 或 failed
    ///
    /// `agent_id_map`: 将 plan JSON 中的 string agent_id 映射到实际的 session_agent UUID
    pub async fn bootstrap_execution(
        pool: &SqlitePool,
        plan: &WorkflowPlan,
        revision: &WorkflowPlanRevision,
        lead_session_agent_id: Option<Uuid>,
        valid_agent_ids: &[String],
        agent_id_map: &HashMap<String, Uuid>,
    ) -> Result<BootstrapResult, OrchestratorError> {
        let execution_id = Uuid::new_v4();

        // 1. 创建 execution (pending)
        let execution = WorkflowExecution::create(
            pool,
            &CreateWorkflowExecution {
                session_id: plan.session_id,
                plan_id: plan.id,
                active_revision_id: Some(revision.id),
                lead_session_agent_id,
                title: plan.title.clone(),
            },
            execution_id,
        )
        .await?;

        // 2. 通过 reducer 迁移到 bootstrapping（校验 + 持久化 + 审计事件）
        let tr = reducer::transition_execution(
            pool,
            &execution,
            WorkflowExecutionStatus::Bootstrapping,
        )
        .await?;
        let execution = tr.entity;

        // 3. 编译 plan
        let compiled = match WorkflowCompiler::compile_from_json(
            &revision.plan_json,
            valid_agent_ids,
        ) {
            Ok(graph) => graph,
            Err(e) => {
                // bootstrapping -> failed（通过 reducer，含审计事件）
                let tr = reducer::transition_execution_with_context(
                    pool,
                    &execution,
                    WorkflowExecutionStatus::Failed,
                    None,
                    Some(&format!("编译失败: {}", e)),
                )
                .await?;

                return Ok(BootstrapResult {
                    execution: tr.entity,
                    round: None,
                    steps: vec![],
                    edges: vec![],
                    agent_sessions: vec![],
                    events: vec![],
                    failed: true,
                    failure_reason: Some(format!("{}", e)),
                });
            }
        };

        // 4. 更新 compiled graph hash（数据字段更新，非状态迁移）
        let execution = WorkflowExecution::update_compiled_graph_hash(
            pool,
            execution.id,
            &compiled.compiled_graph_hash,
            revision.id,
        )
        .await?;

        // 5. 创建 round
        let round_id = Uuid::new_v4();
        let round = WorkflowRound::create(
            pool,
            &CreateWorkflowRound {
                execution_id: execution.id,
                round_index: 1,
                source_revision_id: Some(revision.id),
            },
            round_id,
        )
        .await?;

        // 更新 execution 的 active round（数据字段更新，非状态迁移）
        let execution =
            WorkflowExecution::update_active_round(pool, execution.id, round.id, 1).await?;

        // 6. 创建 workflow agent sessions（去重：每个 agent 只创建一个 session）
        let mut agent_session_map: HashMap<String, Uuid> = HashMap::new();
        let mut created_agent_sessions = Vec::new();

        for compiled_step in &compiled.steps {
            if let Some(ref agent_id_str) = compiled_step.assigned_agent_id {
                if agent_session_map.contains_key(agent_id_str) {
                    continue;
                }
                if let Some(&session_agent_uuid) = agent_id_map.get(agent_id_str) {
                    let role = if lead_session_agent_id == Some(session_agent_uuid) {
                        WorkflowAgentSessionRole::Lead
                    } else {
                        WorkflowAgentSessionRole::Worker
                    };
                    let ws_id = Uuid::new_v4();
                    let ws = WorkflowAgentSession::create(
                        pool,
                        &CreateWorkflowAgentSession {
                            workflow_execution_id: execution.id,
                            session_agent_id: session_agent_uuid,
                            role,
                        },
                        ws_id,
                    )
                    .await?;
                    agent_session_map.insert(agent_id_str.clone(), ws.id);
                    created_agent_sessions.push(ws);
                }
            }
        }

        // 7. 创建 steps 并绑定 agent session
        let mut step_id_map: HashMap<String, Uuid> = HashMap::new();
        let mut created_steps = Vec::new();

        for compiled_step in &compiled.steps {
            let step_id = Uuid::new_v4();
            step_id_map.insert(compiled_step.step_key.clone(), step_id);

            let assigned_ws_id = compiled_step
                .assigned_agent_id
                .as_ref()
                .and_then(|aid| agent_session_map.get(aid))
                .copied();

            let step = WorkflowStep::create(
                pool,
                &CreateWorkflowStep {
                    execution_id: execution.id,
                    round_id: round.id,
                    compiled_revision_id: Some(revision.id),
                    step_key: compiled_step.step_key.clone(),
                    step_type: compiled_step.step_type.clone(),
                    title: compiled_step.title.clone(),
                    instructions: compiled_step.instructions.clone(),
                    assigned_workflow_agent_session_id: assigned_ws_id,
                    max_retry: compiled_step.max_retry as i32,
                    round_index: 1,
                    display_order: compiled_step.display_order,
                },
                step_id,
            )
            .await?;

            created_steps.push(step);
        }

        // 8. 创建 edges
        let mut created_edges = Vec::new();
        for compiled_edge in &compiled.edges {
            let from_id = step_id_map
                .get(&compiled_edge.from_step_key)
                .ok_or_else(|| {
                    OrchestratorError::NotFound(format!(
                        "步骤 {} 未找到",
                        compiled_edge.from_step_key
                    ))
                })?;
            let to_id =
                step_id_map
                    .get(&compiled_edge.to_step_key)
                    .ok_or_else(|| {
                        OrchestratorError::NotFound(format!(
                            "步骤 {} 未找到",
                            compiled_edge.to_step_key
                        ))
                    })?;

            let edge = WorkflowStepEdge::create(
                pool,
                &CreateWorkflowStepEdge {
                    execution_id: execution.id,
                    compiled_revision_id: Some(revision.id),
                    from_step_id: *from_id,
                    to_step_id: *to_id,
                    edge_kind: compiled_edge.edge_kind.clone(),
                },
                Uuid::new_v4(),
            )
            .await?;

            created_edges.push(edge);
        }

        // 9. 将无前驱的 step 标记为 ready（通过 reducer，含组合约束校验 + 审计事件）
        for ready_key in &compiled.ready_step_keys {
            if let Some(&step_id) = step_id_map.get(ready_key) {
                let step = created_steps.iter().find(|s| s.id == step_id);
                if let Some(step) = step {
                    let tr = reducer::transition_step(
                        pool,
                        &execution,
                        step,
                        WorkflowStepStatus::Ready,
                    )
                    .await?;
                    // 更新 created_steps 中的 step 状态
                    if let Some(s) = created_steps.iter_mut().find(|s| s.id == step_id) {
                        *s = tr.entity;
                    }
                }
            }
        }

        // 10. 通过 reducer 迁移到 running（校验 + 持久化 + 审计事件）
        let tr = reducer::transition_execution_with_context(
            pool,
            &execution,
            WorkflowExecutionStatus::Running,
            Some(round.id),
            None,
        )
        .await?;
        let execution = tr.entity;
        // 设置 started_at 时间戳（数据字段更新，非状态迁移）
        let execution = WorkflowExecution::set_started(pool, execution.id).await?;

        // 写入 round 启动事件（非状态迁移事件，由 orchestrator 直接写入）
        WorkflowEvent::create(
            pool,
            &CreateWorkflowEvent {
                execution_id: execution.id,
                round_id: Some(round.id),
                step_id: None,
                agent_session_id: None,
                event_type: WorkflowEventType::RoundStarted,
                status_before: None,
                status_after: Some("running".to_string()),
                detail_json: None,
            },
            Uuid::new_v4(),
        )
        .await?;

        let events = WorkflowEvent::find_by_execution(pool, execution.id).await?;

        Ok(BootstrapResult {
            execution,
            round: Some(round),
            steps: created_steps,
            edges: created_edges,
            agent_sessions: created_agent_sessions,
            events,
            failed: false,
            failure_reason: None,
        })
    }

    // -----------------------------------------------------------------------
    // Scheduler Loop 骨架 (Phase 1b 实现)
    // -----------------------------------------------------------------------

    /// Phase 1b: 唤醒调度循环，找到 ready steps 并触发 agent run
    #[allow(unused)]
    pub async fn wake_scheduler(
        _pool: &SqlitePool,
        _execution_id: Uuid,
    ) -> Result<(), OrchestratorError> {
        // Phase 1b 实现
        Ok(())
    }
}

/// Bootstrap 结果
#[derive(Debug)]
pub struct BootstrapResult {
    pub execution: WorkflowExecution,
    pub round: Option<WorkflowRound>,
    pub steps: Vec<WorkflowStep>,
    pub edges: Vec<WorkflowStepEdge>,
    pub agent_sessions: Vec<WorkflowAgentSession>,
    pub events: Vec<WorkflowEvent>,
    pub failed: bool,
    pub failure_reason: Option<String>,
}
