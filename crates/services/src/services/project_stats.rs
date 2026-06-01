use anyhow::Result;
use chrono::NaiveDate;
use db::models::{
    project_delivery_event::{ProjectDeliveryEvent, ProjectDeliveryEventType},
    project_stats::ProjectStats,
};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

#[derive(Clone, Default)]
pub struct ProjectStatsService;

impl ProjectStatsService {
    pub fn new() -> Self {
        Self
    }

    pub async fn get_stats(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<ProjectStats>> {
        Ok(ProjectStats::find_by_project(pool, project_id).await?)
    }

    pub async fn record_delivery_event(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
        event_type: ProjectDeliveryEventType,
        title: Option<String>,
        source: Option<String>,
    ) -> Result<ProjectDeliveryEvent> {
        Ok(ProjectDeliveryEvent::create(
            pool, project_id, event_type, None, None, None, title, source,
        )
        .await?)
    }

    pub async fn refresh_stats(
        &self,
        pool: &SqlitePool,
        project_id: Uuid,
        period_start: NaiveDate,
        period_end: NaiveDate,
    ) -> Result<ProjectStats> {
        let rows = sqlx::query(
            r#"
            SELECT event_type, COUNT(*) AS count
            FROM project_delivery_events
            WHERE project_id = ?1
              AND date(created_at) >= ?2
              AND date(created_at) <= ?3
            GROUP BY event_type
            "#,
        )
        .bind(project_id)
        .bind(period_start.to_string())
        .bind(period_end.to_string())
        .fetch_all(pool)
        .await?;

        let mut feature_count = 0;
        let mut bugfix_count = 0;
        let mut test_count = 0;

        for row in rows {
            let event_type: String = row.try_get("event_type")?;
            let count: i64 = row.try_get("count")?;
            match event_type.as_str() {
                "feature" => feature_count = count,
                "bugfix" => bugfix_count = count,
                "test" => test_count = count,
                _ => {}
            }
        }

        Ok(ProjectStats::upsert(
            pool,
            project_id,
            period_start,
            period_end,
            feature_count,
            bugfix_count,
            test_count,
            0,
            0,
            0,
            Some(0.0),
        )
        .await?)
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use db::models::project_delivery_event::ProjectDeliveryEventType;
    use sqlx::SqlitePool;
    use uuid::Uuid;

    use super::ProjectStatsService;

    async fn setup_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("create sqlite memory pool");

        for statement in [
            r#"
            CREATE TABLE project_delivery_events (
                id BLOB PRIMARY KEY,
                project_id BLOB,
                session_id BLOB,
                workflow_execution_id BLOB,
                step_id BLOB,
                event_type TEXT CHECK (event_type IN ('feature', 'bugfix', 'test')),
                title TEXT,
                source TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
            )
            "#,
            r#"
            CREATE TABLE project_stats (
                id BLOB PRIMARY KEY,
                project_id BLOB,
                period_start DATE,
                period_end DATE,
                feature_count INTEGER DEFAULT 0,
                bugfix_count INTEGER DEFAULT 0,
                test_count INTEGER DEFAULT 0,
                input_tokens BIGINT DEFAULT 0,
                output_tokens BIGINT DEFAULT 0,
                total_tokens BIGINT DEFAULT 0,
                cost_total DECIMAL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
            )
            "#,
            r#"
            CREATE UNIQUE INDEX idx_project_stats_project_period
            ON project_stats(project_id, period_start, period_end)
            "#,
        ] {
            sqlx::query(statement)
                .execute(&pool)
                .await
                .expect("create minimal project stats schema");
        }

        pool
    }

    #[tokio::test]
    async fn refresh_stats_counts_delivery_events_and_zeroes_usage() {
        let pool = setup_pool().await;
        let service = ProjectStatsService::new();
        let project_id = Uuid::new_v4();

        service
            .record_delivery_event(
                &pool,
                project_id,
                ProjectDeliveryEventType::Feature,
                Some("feature".to_string()),
                Some("test".to_string()),
            )
            .await
            .expect("record feature");
        service
            .record_delivery_event(
                &pool,
                project_id,
                ProjectDeliveryEventType::Bugfix,
                Some("bug".to_string()),
                Some("test".to_string()),
            )
            .await
            .expect("record bugfix");

        let stats = service
            .refresh_stats(
                &pool,
                project_id,
                Utc::now().date_naive(),
                Utc::now().date_naive(),
            )
            .await
            .expect("refresh stats");

        assert_eq!(stats.feature_count, 1);
        assert_eq!(stats.bugfix_count, 1);
        assert_eq!(stats.test_count, 0);
        assert_eq!(stats.total_tokens, 0);
        assert_eq!(stats.cost_total, Some(0.0));
    }

    #[tokio::test]
    async fn refresh_stats_returns_zero_row_for_empty_project() {
        let pool = setup_pool().await;
        let service = ProjectStatsService::new();
        let project_id = Uuid::new_v4();

        let stats = service
            .refresh_stats(
                &pool,
                project_id,
                Utc::now().date_naive(),
                Utc::now().date_naive(),
            )
            .await
            .expect("refresh stats for empty project");

        assert_eq!(stats.feature_count, 0);
        assert_eq!(stats.bugfix_count, 0);
        assert_eq!(stats.test_count, 0);
        assert_eq!(stats.input_tokens, 0);
        assert_eq!(stats.output_tokens, 0);
        assert_eq!(stats.total_tokens, 0);
        assert_eq!(stats.cost_total, Some(0.0));
    }
}
