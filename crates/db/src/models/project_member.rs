use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, Type, types::Json};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "project_member_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(use_ts_enum)]
pub enum ProjectMemberType {
    Human,
    Agent,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct ProjectMember {
    pub id: Uuid,
    pub project_id: Uuid,
    pub member_type: ProjectMemberType,
    pub user_id: Option<String>,
    pub agent_id: Option<Uuid>,
    pub role: Option<String>,
    pub display_order: i64,
    pub default_workspace_path: Option<String>,
    #[ts(type = "string[]")]
    pub allowed_skill_ids: Json<Vec<String>>,
    pub is_default: bool,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateProjectMember {
    pub member_type: ProjectMemberType,
    pub user_id: Option<String>,
    pub agent_id: Option<Uuid>,
    pub role: Option<String>,
    pub display_order: i64,
    pub default_workspace_path: Option<String>,
    pub allowed_skill_ids: Vec<String>,
    pub is_default: bool,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateProjectMember {
    pub member_type: Option<ProjectMemberType>,
    pub user_id: Option<String>,
    pub agent_id: Option<Uuid>,
    pub role: Option<String>,
    pub display_order: Option<i64>,
    pub default_workspace_path: Option<String>,
    pub allowed_skill_ids: Option<Vec<String>>,
    pub is_default: Option<bool>,
}

impl ProjectMember {
    pub async fn find_by_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectMember,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      member_type as "member_type!: ProjectMemberType",
                      user_id,
                      agent_id as "agent_id: Uuid",
                      role,
                      display_order as "display_order!: i64",
                      default_workspace_path,
                      COALESCE(allowed_skill_ids, '[]') as "allowed_skill_ids!: Json<Vec<String>>",
                      is_default as "is_default!: bool",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM project_members
               WHERE project_id = $1
               ORDER BY display_order ASC, created_at ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_default_agents(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectMember,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      member_type as "member_type!: ProjectMemberType",
                      user_id,
                      agent_id as "agent_id: Uuid",
                      role,
                      display_order as "display_order!: i64",
                      default_workspace_path,
                      COALESCE(allowed_skill_ids, '[]') as "allowed_skill_ids!: Json<Vec<String>>",
                      is_default as "is_default!: bool",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM project_members
               WHERE project_id = $1
                 AND member_type = 'agent'
                 AND is_default = 1
               ORDER BY display_order ASC, created_at ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_human_member(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectMember,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      member_type as "member_type!: ProjectMemberType",
                      user_id,
                      agent_id as "agent_id: Uuid",
                      role,
                      display_order as "display_order!: i64",
                      default_workspace_path,
                      COALESCE(allowed_skill_ids, '[]') as "allowed_skill_ids!: Json<Vec<String>>",
                      is_default as "is_default!: bool",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM project_members
               WHERE project_id = $1
                 AND member_type = 'human'
               LIMIT 1"#,
            project_id
        )
        .fetch_optional(pool)
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create(
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
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let allowed_skill_ids = Json(allowed_skill_ids);

        sqlx::query_as!(
            ProjectMember,
            r#"INSERT INTO project_members (
                    id,
                    project_id,
                    member_type,
                    user_id,
                    agent_id,
                    role,
                    display_order,
                    default_workspace_path,
                    allowed_skill_ids,
                    is_default
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
               RETURNING id as "id!: Uuid",
                         project_id as "project_id!: Uuid",
                         member_type as "member_type!: ProjectMemberType",
                         user_id,
                         agent_id as "agent_id: Uuid",
                         role,
                         display_order as "display_order!: i64",
                         default_workspace_path,
                         COALESCE(allowed_skill_ids, '[]') as "allowed_skill_ids!: Json<Vec<String>>",
                         is_default as "is_default!: bool",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            project_id,
            member_type,
            user_id,
            agent_id,
            role,
            display_order,
            default_workspace_path,
            allowed_skill_ids,
            is_default
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateProjectMember,
    ) -> Result<Self, sqlx::Error> {
        let existing = sqlx::query_as!(
            ProjectMember,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      member_type as "member_type!: ProjectMemberType",
                      user_id,
                      agent_id as "agent_id: Uuid",
                      role,
                      display_order as "display_order!: i64",
                      default_workspace_path,
                      COALESCE(allowed_skill_ids, '[]') as "allowed_skill_ids!: Json<Vec<String>>",
                      is_default as "is_default!: bool",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM project_members
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;

        let member_type = data.member_type.clone().unwrap_or(existing.member_type);
        let user_id = data.user_id.clone().or(existing.user_id);
        let agent_id = data.agent_id.or(existing.agent_id);
        let role = data.role.clone().or(existing.role);
        let display_order = data.display_order.unwrap_or(existing.display_order);
        let default_workspace_path = data
            .default_workspace_path
            .clone()
            .or(existing.default_workspace_path);
        let allowed_skill_ids = Json(
            data.allowed_skill_ids
                .clone()
                .unwrap_or(existing.allowed_skill_ids.0),
        );
        let is_default = data.is_default.unwrap_or(existing.is_default);

        sqlx::query_as!(
            ProjectMember,
            r#"UPDATE project_members
               SET member_type = $2,
                   user_id = $3,
                   agent_id = $4,
                   role = $5,
                   display_order = $6,
                   default_workspace_path = $7,
                   allowed_skill_ids = $8,
                   is_default = $9,
                   updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         project_id as "project_id!: Uuid",
                         member_type as "member_type!: ProjectMemberType",
                         user_id,
                         agent_id as "agent_id: Uuid",
                         role,
                         display_order as "display_order!: i64",
                         default_workspace_path,
                         COALESCE(allowed_skill_ids, '[]') as "allowed_skill_ids!: Json<Vec<String>>",
                         is_default as "is_default!: bool",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            member_type,
            user_id,
            agent_id,
            role,
            display_order,
            default_workspace_path,
            allowed_skill_ids,
            is_default
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM project_members WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}

#[cfg(test)]
mod tests {
    use sqlx::SqlitePool;
    use uuid::Uuid;

    use super::{ProjectMember, ProjectMemberType, UpdateProjectMember};

    async fn setup_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("create sqlite memory pool");

        sqlx::query(
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
        )
        .execute(&pool)
        .await
        .expect("create project_members table");
        sqlx::query(
            r#"
            CREATE UNIQUE INDEX idx_project_members_one_human_per_project
            ON project_members(project_id)
            WHERE member_type = 'human'
            "#,
        )
        .execute(&pool)
        .await
        .expect("create partial unique index");

        pool
    }

    #[tokio::test]
    async fn crud_filters_and_default_agents_work() {
        let pool = setup_pool().await;
        let project_id = Uuid::new_v4();
        let agent_id = Uuid::new_v4();

        let human = ProjectMember::create(
            &pool,
            project_id,
            ProjectMemberType::Human,
            Some("user-1".to_string()),
            None,
            Some("owner".to_string()),
            0,
            None,
            Vec::new(),
            true,
        )
        .await
        .expect("create human member");
        let agent = ProjectMember::create(
            &pool,
            project_id,
            ProjectMemberType::Agent,
            None,
            Some(agent_id),
            Some("agent".to_string()),
            1,
            Some("/workspace".to_string()),
            vec!["shell".to_string()],
            true,
        )
        .await
        .expect("create agent member");
        ProjectMember::create(
            &pool,
            project_id,
            ProjectMemberType::Agent,
            None,
            Some(Uuid::new_v4()),
            Some("agent".to_string()),
            2,
            None,
            Vec::new(),
            false,
        )
        .await
        .expect("create non-default agent member");

        let members = ProjectMember::find_by_project(&pool, project_id)
            .await
            .expect("list members");
        assert_eq!(members.len(), 3);
        assert_eq!(members[0].id, human.id);

        let human_member = ProjectMember::find_human_member(&pool, project_id)
            .await
            .expect("find human member")
            .expect("human member exists");
        assert_eq!(human_member.user_id.as_deref(), Some("user-1"));

        let default_agents = ProjectMember::find_default_agents(&pool, project_id)
            .await
            .expect("list default agents");
        assert_eq!(default_agents.len(), 1);
        assert_eq!(default_agents[0].id, agent.id);
        assert_eq!(default_agents[0].allowed_skill_ids.0, vec!["shell"]);

        let updated = ProjectMember::update(
            &pool,
            agent.id,
            &UpdateProjectMember {
                member_type: None,
                user_id: None,
                agent_id: None,
                role: Some("reviewer".to_string()),
                display_order: Some(9),
                default_workspace_path: Some("/updated".to_string()),
                allowed_skill_ids: Some(vec!["read".to_string()]),
                is_default: Some(false),
            },
        )
        .await
        .expect("update project member");
        assert_eq!(updated.role.as_deref(), Some("reviewer"));
        assert_eq!(updated.display_order, 9);
        assert_eq!(updated.allowed_skill_ids.0, vec!["read"]);
        assert!(!updated.is_default);

        assert_eq!(
            ProjectMember::delete(&pool, updated.id)
                .await
                .expect("delete member"),
            1
        );
        assert!(
            ProjectMember::find_default_agents(&pool, project_id)
                .await
                .expect("list default agents after delete")
                .is_empty()
        );
    }

    #[tokio::test]
    async fn one_human_partial_unique_constraint_is_enforced_per_project() {
        let pool = setup_pool().await;
        let project_id = Uuid::new_v4();

        ProjectMember::create(
            &pool,
            project_id,
            ProjectMemberType::Human,
            Some("user-1".to_string()),
            None,
            Some("owner".to_string()),
            0,
            None,
            Vec::new(),
            true,
        )
        .await
        .expect("create first human");

        let duplicate = ProjectMember::create(
            &pool,
            project_id,
            ProjectMemberType::Human,
            Some("user-2".to_string()),
            None,
            Some("owner".to_string()),
            1,
            None,
            Vec::new(),
            true,
        )
        .await;
        assert!(duplicate.is_err());

        ProjectMember::create(
            &pool,
            project_id,
            ProjectMemberType::Agent,
            None,
            Some(Uuid::new_v4()),
            Some("agent".to_string()),
            2,
            None,
            Vec::new(),
            true,
        )
        .await
        .expect("partial unique index allows agent members");
    }
}
