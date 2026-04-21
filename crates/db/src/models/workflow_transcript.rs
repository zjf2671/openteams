use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
pub struct WorkflowTranscript {
    pub id: Uuid,
    pub execution_id: Uuid,
    pub round_id: Option<Uuid>,
    pub workflow_agent_session_id: Option<Uuid>,
    pub step_id: Option<Uuid>,
    pub sender_type: String,
    pub entry_type: String,
    pub content: String,
    pub meta_json: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorkflowTranscript {
    pub execution_id: Uuid,
    pub round_id: Option<Uuid>,
    pub workflow_agent_session_id: Option<Uuid>,
    pub step_id: Option<Uuid>,
    pub sender_type: String,
    pub entry_type: String,
    pub content: String,
    pub meta_json: Option<String>,
}

impl WorkflowTranscript {
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as::<_, Self>("SELECT * FROM chat_workflow_transcripts WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn find_by_execution(
        pool: &SqlitePool,
        execution_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            "SELECT * FROM chat_workflow_transcripts WHERE execution_id = ? ORDER BY created_at ASC",
        )
        .bind(execution_id)
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_step(pool: &SqlitePool, step_id: Uuid) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            "SELECT * FROM chat_workflow_transcripts WHERE step_id = ? ORDER BY created_at ASC",
        )
        .bind(step_id)
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_execution_and_agent_session(
        pool: &SqlitePool,
        execution_id: Uuid,
        workflow_agent_session_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            "SELECT * FROM chat_workflow_transcripts WHERE execution_id = ? AND workflow_agent_session_id = ? ORDER BY created_at ASC",
        )
        .bind(execution_id)
        .bind(workflow_agent_session_id)
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateWorkflowTranscript,
        id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            "INSERT INTO chat_workflow_transcripts (id, execution_id, round_id, workflow_agent_session_id, step_id, sender_type, entry_type, content, meta_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             RETURNING *",
        )
        .bind(id)
        .bind(data.execution_id)
        .bind(data.round_id)
        .bind(data.workflow_agent_session_id)
        .bind(data.step_id)
        .bind(&data.sender_type)
        .bind(&data.entry_type)
        .bind(&data.content)
        .bind(&data.meta_json)
        .fetch_one(pool)
        .await
    }

    pub async fn update_meta_json(
        pool: &SqlitePool,
        id: Uuid,
        meta_json: &str,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            "UPDATE chat_workflow_transcripts SET meta_json = ? WHERE id = ? RETURNING *",
        )
        .bind(meta_json)
        .bind(id)
        .fetch_one(pool)
        .await
    }
}
