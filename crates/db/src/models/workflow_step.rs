use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

use super::workflow_types::{WorkflowStepStatus, WorkflowStepType};

const STEP_SELECT: &str = r#"
    SELECT id, execution_id, round_id, compiled_revision_id, step_key,
           step_type, title, instructions, assigned_workflow_agent_session_id,
           status, retry_count, max_retry, round_index, display_order,
           latest_run_id, summary_text, content, loop_id, lead_review_required,
           user_review_required, revision_context,
           created_at, updated_at, started_at, completed_at
    FROM chat_workflow_steps
"#;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct WorkflowStep {
    pub id: Uuid,
    pub execution_id: Uuid,
    pub round_id: Uuid,
    pub compiled_revision_id: Option<Uuid>,
    pub step_key: String,
    pub step_type: WorkflowStepType,
    pub title: String,
    pub instructions: String,
    pub assigned_workflow_agent_session_id: Option<Uuid>,
    pub status: WorkflowStepStatus,
    pub retry_count: i32,
    pub max_retry: i32,
    pub round_index: i32,
    pub display_order: i32,
    pub latest_run_id: Option<Uuid>,
    pub summary_text: Option<String>,
    pub content: Option<String>,
    pub loop_id: Option<Uuid>,
    pub lead_review_required: bool,
    pub user_review_required: bool,
    pub revision_context: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorkflowStep {
    pub execution_id: Uuid,
    pub round_id: Uuid,
    pub compiled_revision_id: Option<Uuid>,
    pub step_key: String,
    pub step_type: WorkflowStepType,
    pub title: String,
    pub instructions: String,
    pub assigned_workflow_agent_session_id: Option<Uuid>,
    pub max_retry: i32,
    pub round_index: i32,
    pub display_order: i32,
    pub loop_id: Option<Uuid>,
    pub lead_review_required: Option<bool>,
    pub user_review_required: Option<bool>,
    pub revision_context: Option<String>,
}

impl WorkflowStep {
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as::<_, Self>(&format!("{STEP_SELECT}\nWHERE id = ?1"))
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn find_by_round(
        pool: &SqlitePool,
        round_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, Self>(&format!(
            "{STEP_SELECT}\nWHERE round_id = ?1\nORDER BY display_order ASC"
        ))
        .bind(round_id)
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_execution(
        pool: &SqlitePool,
        execution_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, Self>(&format!(
            "{STEP_SELECT}\nWHERE execution_id = ?1\nORDER BY display_order ASC"
        ))
        .bind(execution_id)
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateWorkflowStep,
        id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            r#"
            INSERT INTO chat_workflow_steps (
                id, execution_id, round_id, compiled_revision_id, step_key,
                step_type, title, instructions, assigned_workflow_agent_session_id,
                max_retry, round_index, display_order, loop_id,
                lead_review_required, user_review_required, revision_context
            )
            VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                COALESCE(?14, 1), COALESCE(?15, 0), ?16
            )
            RETURNING id, execution_id, round_id, compiled_revision_id, step_key,
                      step_type, title, instructions, assigned_workflow_agent_session_id,
                      status, retry_count, max_retry, round_index, display_order,
                      latest_run_id, summary_text, content, loop_id,
                      lead_review_required, user_review_required, revision_context,
                      created_at, updated_at, started_at, completed_at
            "#,
        )
        .bind(id)
        .bind(data.execution_id)
        .bind(data.round_id)
        .bind(data.compiled_revision_id)
        .bind(&data.step_key)
        .bind(&data.step_type)
        .bind(&data.title)
        .bind(&data.instructions)
        .bind(data.assigned_workflow_agent_session_id)
        .bind(data.max_retry)
        .bind(data.round_index)
        .bind(data.display_order)
        .bind(data.loop_id)
        .bind(data.lead_review_required)
        .bind(data.user_review_required)
        .bind(&data.revision_context)
        .fetch_one(pool)
        .await
    }

    pub async fn update_assigned_agent_session(
        pool: &SqlitePool,
        id: Uuid,
        agent_session_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            r#"
            UPDATE chat_workflow_steps
            SET assigned_workflow_agent_session_id = ?2, updated_at = datetime('now', 'subsec')
            WHERE id = ?1
            RETURNING id, execution_id, round_id, compiled_revision_id, step_key,
                      step_type, title, instructions, assigned_workflow_agent_session_id,
                      status, retry_count, max_retry, round_index, display_order,
                      latest_run_id, summary_text, content, loop_id,
                      lead_review_required, user_review_required, revision_context,
                      created_at, updated_at, started_at, completed_at
            "#,
        )
        .bind(id)
        .bind(agent_session_id)
        .fetch_one(pool)
        .await
    }

    pub async fn update_status(
        pool: &SqlitePool,
        id: Uuid,
        status: WorkflowStepStatus,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            r#"
            UPDATE chat_workflow_steps
            SET status = ?2, updated_at = datetime('now', 'subsec')
            WHERE id = ?1
            RETURNING id, execution_id, round_id, compiled_revision_id, step_key,
                      step_type, title, instructions, assigned_workflow_agent_session_id,
                      status, retry_count, max_retry, round_index, display_order,
                      latest_run_id, summary_text, content, loop_id,
                      lead_review_required, user_review_required, revision_context,
                      created_at, updated_at, started_at, completed_at
            "#,
        )
        .bind(id)
        .bind(status)
        .fetch_one(pool)
        .await
    }

    pub async fn update_status_if_current(
        pool: &SqlitePool,
        id: Uuid,
        expected_status: WorkflowStepStatus,
        status: WorkflowStepStatus,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            r#"
            UPDATE chat_workflow_steps
            SET status = ?3, updated_at = datetime('now', 'subsec')
            WHERE id = ?1 AND status = ?2
            RETURNING id, execution_id, round_id, compiled_revision_id, step_key,
                      step_type, title, instructions, assigned_workflow_agent_session_id,
                      status, retry_count, max_retry, round_index, display_order,
                      latest_run_id, summary_text, content, loop_id,
                      lead_review_required, user_review_required, revision_context,
                      created_at, updated_at, started_at, completed_at
            "#,
        )
        .bind(id)
        .bind(expected_status)
        .bind(status)
        .fetch_optional(pool)
        .await
    }

    pub async fn record_execution_result(
        pool: &SqlitePool,
        id: Uuid,
        latest_run_id: Uuid,
        summary_text: Option<String>,
        content: Option<String>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            r#"
            UPDATE chat_workflow_steps
            SET latest_run_id = ?2,
                summary_text = ?3,
                content = ?4,
                started_at = COALESCE(started_at, datetime('now', 'subsec')),
                completed_at = datetime('now', 'subsec'),
                updated_at = datetime('now', 'subsec')
            WHERE id = ?1
            RETURNING id, execution_id, round_id, compiled_revision_id, step_key,
                      step_type, title, instructions, assigned_workflow_agent_session_id,
                      status, retry_count, max_retry, round_index, display_order,
                      latest_run_id, summary_text, content, loop_id,
                      lead_review_required, user_review_required, revision_context,
                      created_at, updated_at, started_at, completed_at
            "#,
        )
        .bind(id)
        .bind(latest_run_id)
        .bind(summary_text)
        .bind(content)
        .fetch_one(pool)
        .await
    }

    pub async fn update_revision_context(
        pool: &SqlitePool,
        id: Uuid,
        revision_context: Option<String>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            r#"
            UPDATE chat_workflow_steps
            SET revision_context = ?2,
                updated_at = datetime('now', 'subsec')
            WHERE id = ?1
            RETURNING id, execution_id, round_id, compiled_revision_id, step_key,
                      step_type, title, instructions, assigned_workflow_agent_session_id,
                      status, retry_count, max_retry, round_index, display_order,
                      latest_run_id, summary_text, content, loop_id,
                      lead_review_required, user_review_required, revision_context,
                      created_at, updated_at, started_at, completed_at
            "#,
        )
        .bind(id)
        .bind(revision_context)
        .fetch_one(pool)
        .await
    }

    pub async fn update_review_requirements(
        pool: &SqlitePool,
        id: Uuid,
        lead_review_required: bool,
        user_review_required: bool,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            r#"
            UPDATE chat_workflow_steps
            SET lead_review_required = ?2,
                user_review_required = ?3,
                updated_at = datetime('now', 'subsec')
            WHERE id = ?1
            RETURNING id, execution_id, round_id, compiled_revision_id, step_key,
                      step_type, title, instructions, assigned_workflow_agent_session_id,
                      status, retry_count, max_retry, round_index, display_order,
                      latest_run_id, summary_text, content, loop_id,
                      lead_review_required, user_review_required, revision_context,
                      created_at, updated_at, started_at, completed_at
            "#,
        )
        .bind(id)
        .bind(lead_review_required)
        .bind(user_review_required)
        .fetch_one(pool)
        .await
    }

    pub async fn update_loop_id(
        pool: &SqlitePool,
        id: Uuid,
        loop_id: Option<Uuid>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            r#"
            UPDATE chat_workflow_steps
            SET loop_id = ?2,
                updated_at = datetime('now', 'subsec')
            WHERE id = ?1
            RETURNING id, execution_id, round_id, compiled_revision_id, step_key,
                      step_type, title, instructions, assigned_workflow_agent_session_id,
                      status, retry_count, max_retry, round_index, display_order,
                      latest_run_id, summary_text, content, loop_id,
                      lead_review_required, user_review_required, revision_context,
                      created_at, updated_at, started_at, completed_at
            "#,
        )
        .bind(id)
        .bind(loop_id)
        .fetch_one(pool)
        .await
    }

    pub async fn prepare_retry(pool: &SqlitePool, id: Uuid) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            r#"
            UPDATE chat_workflow_steps
            SET retry_count = retry_count + 1,
                latest_run_id = NULL,
                summary_text = NULL,
                content = NULL,
                started_at = NULL,
                completed_at = NULL,
                updated_at = datetime('now', 'subsec')
            WHERE id = ?1
            RETURNING id, execution_id, round_id, compiled_revision_id, step_key,
                      step_type, title, instructions, assigned_workflow_agent_session_id,
                      status, retry_count, max_retry, round_index, display_order,
                      latest_run_id, summary_text, content, loop_id,
                      lead_review_required, user_review_required, revision_context,
                      created_at, updated_at, started_at, completed_at
            "#,
        )
        .bind(id)
        .fetch_one(pool)
        .await
    }

    /// Like `prepare_retry` but keeps the task outputs (summary_text, content, latest_run_id).
    /// Used when retrying only the review phase, not the task execution.
    pub async fn prepare_retry_review(pool: &SqlitePool, id: Uuid) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            r#"
            UPDATE chat_workflow_steps
            SET retry_count = retry_count + 1,
                completed_at = NULL,
                updated_at = datetime('now', 'subsec')
            WHERE id = ?1
            RETURNING id, execution_id, round_id, compiled_revision_id, step_key,
                      step_type, title, instructions, assigned_workflow_agent_session_id,
                      status, retry_count, max_retry, round_index, display_order,
                      latest_run_id, summary_text, content, loop_id,
                      lead_review_required, user_review_required, revision_context,
                      created_at, updated_at, started_at, completed_at
            "#,
        )
        .bind(id)
        .fetch_one(pool)
        .await
    }
}
