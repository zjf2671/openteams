use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct RepoIntegration {
    pub id: Uuid,
    pub repo_id: Uuid,
    pub provider: String,
    pub owner: Option<String>,
    pub name: Option<String>,
    pub remote_url: Option<String>,
    pub default_branch: Option<String>,
    pub external_id: Option<String>,
    pub installation_id: Option<String>,
    pub sync_status: Option<String>,
    #[ts(type = "Date | null")]
    pub last_synced_at: Option<DateTime<Utc>>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateRepoIntegration {
    pub provider: Option<String>,
    pub owner: Option<String>,
    pub name: Option<String>,
    pub remote_url: Option<String>,
    pub default_branch: Option<String>,
    pub external_id: Option<String>,
    pub installation_id: Option<String>,
    pub sync_status: Option<String>,
    #[ts(type = "Date | null")]
    pub last_synced_at: Option<DateTime<Utc>>,
}

impl RepoIntegration {
    pub async fn find_by_repo_id(
        pool: &SqlitePool,
        repo_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            RepoIntegration,
            r#"SELECT id as "id!: Uuid",
                      repo_id as "repo_id!: Uuid",
                      provider,
                      owner,
                      name,
                      remote_url,
                      default_branch,
                      external_id,
                      installation_id,
                      sync_status,
                      last_synced_at as "last_synced_at: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM repo_integrations
               WHERE repo_id = $1
               ORDER BY provider ASC, created_at ASC"#,
            repo_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            RepoIntegration,
            r#"SELECT ri.id as "id!: Uuid",
                      ri.repo_id as "repo_id!: Uuid",
                      ri.provider,
                      ri.owner,
                      ri.name,
                      ri.remote_url,
                      ri.default_branch,
                      ri.external_id,
                      ri.installation_id,
                      ri.sync_status,
                      ri.last_synced_at as "last_synced_at: DateTime<Utc>",
                      ri.created_at as "created_at!: DateTime<Utc>",
                      ri.updated_at as "updated_at!: DateTime<Utc>"
               FROM repo_integrations ri
               INNER JOIN project_repos pr ON pr.repo_id = ri.repo_id
               WHERE pr.project_id = $1
               ORDER BY ri.provider ASC, ri.created_at ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create(
        pool: &SqlitePool,
        repo_id: Uuid,
        provider: String,
        owner: Option<String>,
        name: Option<String>,
        remote_url: Option<String>,
        default_branch: Option<String>,
        external_id: Option<String>,
        installation_id: Option<String>,
        sync_status: Option<String>,
        last_synced_at: Option<DateTime<Utc>>,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        sqlx::query_as!(
            RepoIntegration,
            r#"INSERT INTO repo_integrations (
                    id,
                    repo_id,
                    provider,
                    owner,
                    name,
                    remote_url,
                    default_branch,
                    external_id,
                    installation_id,
                    sync_status,
                    last_synced_at
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               RETURNING id as "id!: Uuid",
                         repo_id as "repo_id!: Uuid",
                         provider,
                         owner,
                         name,
                         remote_url,
                         default_branch,
                         external_id,
                         installation_id,
                         sync_status,
                         last_synced_at as "last_synced_at: DateTime<Utc>",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            repo_id,
            provider,
            owner,
            name,
            remote_url,
            default_branch,
            external_id,
            installation_id,
            sync_status,
            last_synced_at
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateRepoIntegration,
    ) -> Result<Self, sqlx::Error> {
        let existing = sqlx::query_as!(
            RepoIntegration,
            r#"SELECT id as "id!: Uuid",
                      repo_id as "repo_id!: Uuid",
                      provider,
                      owner,
                      name,
                      remote_url,
                      default_branch,
                      external_id,
                      installation_id,
                      sync_status,
                      last_synced_at as "last_synced_at: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM repo_integrations
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;

        let provider = data.provider.clone().unwrap_or(existing.provider);
        let owner = data.owner.clone().or(existing.owner);
        let name = data.name.clone().or(existing.name);
        let remote_url = data.remote_url.clone().or(existing.remote_url);
        let default_branch = data.default_branch.clone().or(existing.default_branch);
        let external_id = data.external_id.clone().or(existing.external_id);
        let installation_id = data.installation_id.clone().or(existing.installation_id);
        let sync_status = data.sync_status.clone().or(existing.sync_status);
        let last_synced_at = data.last_synced_at.or(existing.last_synced_at);

        sqlx::query_as!(
            RepoIntegration,
            r#"UPDATE repo_integrations
               SET provider = $2,
                   owner = $3,
                   name = $4,
                   remote_url = $5,
                   default_branch = $6,
                   external_id = $7,
                   installation_id = $8,
                   sync_status = $9,
                   last_synced_at = $10,
                   updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         repo_id as "repo_id!: Uuid",
                         provider,
                         owner,
                         name,
                         remote_url,
                         default_branch,
                         external_id,
                         installation_id,
                         sync_status,
                         last_synced_at as "last_synced_at: DateTime<Utc>",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            provider,
            owner,
            name,
            remote_url,
            default_branch,
            external_id,
            installation_id,
            sync_status,
            last_synced_at
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM repo_integrations WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
