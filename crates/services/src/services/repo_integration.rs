use anyhow::Result;
use db::models::repo_integration::RepoIntegration;
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Clone, Default)]
pub struct RepoIntegrationService;

impl RepoIntegrationService {
    pub fn new() -> Self {
        Self
    }

    pub async fn list_repo_integrations(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<RepoIntegration>> {
        Ok(RepoIntegration::find_by_project(pool, project_id).await?)
    }

    pub async fn get_repo_integration(
        &self,
        pool: &SqlitePool,
        repo_id: Uuid,
    ) -> Result<Vec<RepoIntegration>> {
        Ok(RepoIntegration::find_by_repo_id(pool, repo_id).await?)
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use db::models::repo_integration::RepoIntegration;
    use sqlx::SqlitePool;
    use uuid::Uuid;

    use super::RepoIntegrationService;

    async fn setup_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("create sqlite memory pool");

        for statement in [
            r#"
            CREATE TABLE project_repos (
                id BLOB PRIMARY KEY,
                project_id BLOB NOT NULL,
                repo_id BLOB NOT NULL
            )
            "#,
            r#"
            CREATE TABLE repo_integrations (
                id BLOB PRIMARY KEY,
                repo_id BLOB,
                provider TEXT NOT NULL,
                owner TEXT,
                name TEXT,
                remote_url TEXT,
                default_branch TEXT,
                external_id TEXT,
                installation_id TEXT,
                sync_status TEXT,
                last_synced_at TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
            )
            "#,
        ] {
            sqlx::query(statement)
                .execute(&pool)
                .await
                .expect("create minimal repo integration schema");
        }

        pool
    }

    #[tokio::test]
    async fn lists_integrations_by_project_join() {
        let pool = setup_pool().await;
        let service = RepoIntegrationService::new();
        let project_id = Uuid::new_v4();
        let repo_id = Uuid::new_v4();

        sqlx::query("INSERT INTO project_repos (id, project_id, repo_id) VALUES (?1, ?2, ?3)")
            .bind(Uuid::new_v4())
            .bind(project_id)
            .bind(repo_id)
            .execute(&pool)
            .await
            .expect("insert project repo");
        RepoIntegration::create(
            &pool,
            repo_id,
            "github".to_string(),
            Some("owner".to_string()),
            Some("repo".to_string()),
            None,
            Some("main".to_string()),
            None,
            None,
            Some("synced".to_string()),
            Some(Utc::now()),
        )
        .await
        .expect("create repo integration");

        let integrations = service
            .list_repo_integrations(&pool, project_id)
            .await
            .expect("list integrations");

        assert_eq!(integrations.len(), 1);
        assert_eq!(integrations[0].provider, "github");
    }
}
