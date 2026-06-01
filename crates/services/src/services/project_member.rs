use anyhow::{Result, bail};
use db::models::{
    chat_agent::ChatAgent,
    project_member::{ProjectMember, ProjectMemberType, UpdateProjectMember},
};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

#[derive(Clone, Default)]
pub struct ProjectMemberService;

pub struct ProjectMemberUpdateInput {
    pub role: Option<String>,
    pub display_order: Option<i64>,
    pub default_workspace_path: Option<String>,
    pub is_default: Option<bool>,
    pub allowed_skill_ids: Option<Vec<String>>,
}

impl ProjectMemberService {
    pub fn new() -> Self {
        Self
    }

    pub async fn list_members(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<ProjectMember>> {
        Ok(ProjectMember::find_by_project(pool, project_id).await?)
    }

    pub async fn get_human_member(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Option<ProjectMember>> {
        Ok(ProjectMember::find_human_member(pool, project_id).await?)
    }

    pub async fn list_default_agents(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<ProjectMember>> {
        Ok(ProjectMember::find_default_agents(pool, project_id).await?)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn add_member(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
        member_type: ProjectMemberType,
        user_id: Option<String>,
        agent_id: Option<Uuid>,
        role: Option<String>,
        display_order: i64,
        default_workspace_path: Option<String>,
        allowed_skill_ids: Vec<String>,
        is_default: bool,
    ) -> Result<ProjectMember> {
        if member_type == ProjectMemberType::Agent {
            let Some(agent_id) = agent_id else {
                bail!("agent_id is required for agent project members");
            };
            if ChatAgent::find_by_id(pool, agent_id).await?.is_none() {
                bail!("chat agent not found");
            }
        }

        Ok(ProjectMember::create(
            pool,
            project_id,
            member_type,
            user_id,
            agent_id,
            role,
            display_order,
            default_workspace_path,
            allowed_skill_ids,
            is_default,
        )
        .await?)
    }

    pub async fn update_member(
        &self,
        pool: &SqlitePool,
        id: Uuid,
        input: ProjectMemberUpdateInput,
    ) -> Result<ProjectMember> {
        Ok(ProjectMember::update(
            pool,
            id,
            &UpdateProjectMember {
                member_type: None,
                user_id: None,
                agent_id: None,
                role: input.role,
                display_order: input.display_order,
                default_workspace_path: input.default_workspace_path,
                allowed_skill_ids: input.allowed_skill_ids,
                is_default: input.is_default,
            },
        )
        .await?)
    }

    pub async fn remove_member(&self, pool: &SqlitePool, id: Uuid) -> Result<u64> {
        Ok(ProjectMember::delete(pool, id).await?)
    }

    pub async fn initialize_default_members(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
        user_id: &str,
    ) -> Result<Vec<ProjectMember>> {
        let mut members = Vec::new();

        if ProjectMember::find_human_member(pool, project_id)
            .await?
            .is_none()
        {
            members.push(
                ProjectMember::create(
                    pool,
                    project_id,
                    ProjectMemberType::Human,
                    Some(user_id.to_string()),
                    None,
                    Some("owner".to_string()),
                    0,
                    None,
                    Vec::new(),
                    true,
                )
                .await?,
            );
        }

        let existing_agent_ids: Vec<Uuid> = ProjectMember::find_by_project(pool, project_id)
            .await?
            .into_iter()
            .filter_map(|member| {
                if member.member_type == ProjectMemberType::Agent {
                    member.agent_id
                } else {
                    None
                }
            })
            .collect();

        let rows = default_chat_agent_rows(pool).await?;

        for (index, row) in rows.into_iter().enumerate() {
            let agent_id: Uuid = row.try_get("id")?;
            if existing_agent_ids.contains(&agent_id) {
                continue;
            }

            members.push(
                ProjectMember::create(
                    pool,
                    project_id,
                    ProjectMemberType::Agent,
                    None,
                    Some(agent_id),
                    Some("agent".to_string()),
                    (index + 1) as i64,
                    None,
                    Vec::new(),
                    true,
                )
                .await?,
            );
        }

        Ok(members)
    }
}

async fn default_chat_agent_rows(pool: &SqlitePool) -> Result<Vec<sqlx::sqlite::SqliteRow>> {
    if chat_agents_has_is_default(pool).await? {
        return Ok(sqlx::query(
            r#"
            SELECT id
            FROM chat_agents
            WHERE is_default = 1
            ORDER BY name ASC
            "#,
        )
        .fetch_all(pool)
        .await?);
    }

    Ok(sqlx::query(
        r#"
        SELECT id
        FROM chat_agents
        ORDER BY name ASC
        "#,
    )
    .fetch_all(pool)
    .await?)
}

async fn chat_agents_has_is_default(pool: &SqlitePool) -> Result<bool> {
    let rows = sqlx::query("PRAGMA table_info(chat_agents)")
        .fetch_all(pool)
        .await?;
    Ok(rows
        .iter()
        .filter_map(|row| row.try_get::<String, _>("name").ok())
        .any(|name| name == "is_default"))
}

#[cfg(test)]
mod tests {
    use db::models::{
        chat_agent::{ChatAgent, CreateChatAgent},
        project_member::ProjectMemberType,
    };
    use sqlx::SqlitePool;
    use uuid::Uuid;

    use super::ProjectMemberService;

    async fn setup_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("create sqlite memory pool");

        for statement in [
            "PRAGMA foreign_keys = ON",
            r#"
            CREATE TABLE projects (
                id BLOB PRIMARY KEY,
                name TEXT NOT NULL,
                default_agent_working_dir TEXT,
                remote_project_id BLOB,
                description TEXT,
                status TEXT,
                default_workspace_path TEXT,
                active_repo_id BLOB,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
            )
            "#,
            r#"
            CREATE TABLE chat_agents (
                id BLOB PRIMARY KEY,
                name TEXT NOT NULL,
                runner_type TEXT NOT NULL,
                system_prompt TEXT NOT NULL DEFAULT '',
                tools_enabled TEXT NOT NULL DEFAULT '{}',
                model_name TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
            )
            "#,
            r#"
            CREATE TABLE project_members (
                id BLOB PRIMARY KEY,
                project_id BLOB,
                member_type TEXT CHECK (member_type IN ('human', 'agent')),
                user_id TEXT,
                agent_id BLOB,
                role TEXT,
                display_order INTEGER DEFAULT 0,
                default_workspace_path TEXT,
                allowed_skill_ids TEXT,
                is_default BOOLEAN DEFAULT false,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
            )
            "#,
        ] {
            sqlx::query(statement)
                .execute(&pool)
                .await
                .expect("create minimal project member schema");
        }

        pool
    }

    async fn create_agent(pool: &SqlitePool) -> ChatAgent {
        create_named_agent(pool, "coder").await
    }

    async fn create_named_agent(pool: &SqlitePool, name: &str) -> ChatAgent {
        ChatAgent::create(
            pool,
            &CreateChatAgent {
                name: name.to_string(),
                runner_type: "codex".to_string(),
                system_prompt: None,
                tools_enabled: None,
                model_name: None,
            },
            Uuid::new_v4(),
        )
        .await
        .expect("create chat agent")
    }

    #[tokio::test]
    async fn add_member_rejects_agent_member_without_agent_id() {
        let pool = setup_pool().await;
        let service = ProjectMemberService::new();

        let result = service
            .add_member(
                &pool,
                Uuid::new_v4(),
                ProjectMemberType::Agent,
                None,
                None,
                None,
                0,
                None,
                Vec::new(),
                true,
            )
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn add_member_rejects_missing_agent() {
        let pool = setup_pool().await;
        let service = ProjectMemberService::new();

        let result = service
            .add_member(
                &pool,
                Uuid::new_v4(),
                ProjectMemberType::Agent,
                None,
                Some(Uuid::new_v4()),
                None,
                0,
                None,
                Vec::new(),
                true,
            )
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn initializes_human_and_agent_members_without_global_default_agent_column() {
        let pool = setup_pool().await;
        let service = ProjectMemberService::new();
        let project_id = Uuid::new_v4();
        let agent = create_agent(&pool).await;

        let members = service
            .initialize_default_members(&pool, project_id, "user-1")
            .await
            .expect("initialize project members");

        assert_eq!(members.len(), 2);
        assert!(
            members
                .iter()
                .any(|member| member.member_type == ProjectMemberType::Human
                    && member.user_id.as_deref() == Some("user-1"))
        );
        assert!(
            members
                .iter()
                .any(|member| member.member_type == ProjectMemberType::Agent
                    && member.agent_id == Some(agent.id)
                    && member.is_default)
        );
    }

    #[tokio::test]
    async fn initialize_default_members_is_idempotent() {
        let pool = setup_pool().await;
        let service = ProjectMemberService::new();
        let project_id = Uuid::new_v4();
        create_agent(&pool).await;

        let first = service
            .initialize_default_members(&pool, project_id, "user-1")
            .await
            .expect("first initialization");
        let second = service
            .initialize_default_members(&pool, project_id, "user-1")
            .await
            .expect("second initialization");
        let all_members = service
            .list_members(&pool, project_id)
            .await
            .expect("list project members");

        assert_eq!(first.len(), 2);
        assert!(second.is_empty());
        assert_eq!(all_members.len(), 2);
    }

    #[tokio::test]
    async fn initializes_only_global_default_agents_when_column_exists() {
        let pool = setup_pool().await;
        sqlx::query("ALTER TABLE chat_agents ADD COLUMN is_default BOOLEAN DEFAULT 0")
            .execute(&pool)
            .await
            .expect("add is_default column");
        let default_agent = create_named_agent(&pool, "default-agent").await;
        let non_default_agent = create_named_agent(&pool, "non-default-agent").await;
        sqlx::query("UPDATE chat_agents SET is_default = 1 WHERE id = ?1")
            .bind(default_agent.id)
            .execute(&pool)
            .await
            .expect("mark default agent");

        let members = ProjectMemberService::new()
            .initialize_default_members(&pool, Uuid::new_v4(), "user-1")
            .await
            .expect("initialize project members");
        let agent_members = members
            .iter()
            .filter(|member| member.member_type == ProjectMemberType::Agent)
            .collect::<Vec<_>>();

        assert_eq!(agent_members.len(), 1);
        assert_eq!(agent_members[0].agent_id, Some(default_agent.id));
        assert_ne!(agent_members[0].agent_id, Some(non_default_agent.id));
    }
}
