use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct ProjectStats {
    pub id: Uuid,
    pub project_id: Uuid,
    #[ts(type = "string | null")]
    pub period_start: Option<NaiveDate>,
    #[ts(type = "string | null")]
    pub period_end: Option<NaiveDate>,
    pub feature_count: i64,
    pub bugfix_count: i64,
    pub test_count: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub cost_total: Option<f64>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

impl ProjectStats {
    #[allow(clippy::too_many_arguments)]
    pub async fn upsert(
        pool: &SqlitePool,
        project_id: Uuid,
        period_start: NaiveDate,
        period_end: NaiveDate,
        feature_count: i64,
        bugfix_count: i64,
        test_count: i64,
        input_tokens: i64,
        output_tokens: i64,
        total_tokens: i64,
        cost_total: Option<f64>,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as!(
            ProjectStats,
            r#"INSERT INTO project_stats (
                    id,
                    project_id,
                    period_start,
                    period_end,
                    feature_count,
                    bugfix_count,
                    test_count,
                    input_tokens,
                    output_tokens,
                    total_tokens,
                    cost_total
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               ON CONFLICT(project_id, period_start, period_end) DO UPDATE SET
                    feature_count = excluded.feature_count,
                    bugfix_count = excluded.bugfix_count,
                    test_count = excluded.test_count,
                    input_tokens = excluded.input_tokens,
                    output_tokens = excluded.output_tokens,
                    total_tokens = excluded.total_tokens,
                    cost_total = excluded.cost_total,
                    updated_at = datetime('now', 'subsec')
               RETURNING id as "id!: Uuid",
                         project_id as "project_id!: Uuid",
                         period_start as "period_start: NaiveDate",
                         period_end as "period_end: NaiveDate",
                         feature_count as "feature_count!: i64",
                         bugfix_count as "bugfix_count!: i64",
                         test_count as "test_count!: i64",
                         input_tokens as "input_tokens!: i64",
                         output_tokens as "output_tokens!: i64",
                         total_tokens as "total_tokens!: i64",
                         cost_total as "cost_total: f64",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            project_id,
            period_start,
            period_end,
            feature_count,
            bugfix_count,
            test_count,
            input_tokens,
            output_tokens,
            total_tokens,
            cost_total
        )
        .fetch_one(pool)
        .await
    }

    pub async fn find_by_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectStats,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      period_start as "period_start: NaiveDate",
                      period_end as "period_end: NaiveDate",
                      feature_count as "feature_count!: i64",
                      bugfix_count as "bugfix_count!: i64",
                      test_count as "test_count!: i64",
                      input_tokens as "input_tokens!: i64",
                      output_tokens as "output_tokens!: i64",
                      total_tokens as "total_tokens!: i64",
                      cost_total as "cost_total: f64",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM project_stats
               WHERE project_id = $1
               ORDER BY period_start DESC, period_end DESC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_project_and_period(
        pool: &SqlitePool,
        project_id: Uuid,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectStats,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      period_start as "period_start: NaiveDate",
                      period_end as "period_end: NaiveDate",
                      feature_count as "feature_count!: i64",
                      bugfix_count as "bugfix_count!: i64",
                      test_count as "test_count!: i64",
                      input_tokens as "input_tokens!: i64",
                      output_tokens as "output_tokens!: i64",
                      total_tokens as "total_tokens!: i64",
                      cost_total as "cost_total: f64",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM project_stats
               WHERE project_id = $1
                 AND period_start = $2
                 AND period_end = $3
               LIMIT 1"#,
            project_id,
            start,
            end
        )
        .fetch_optional(pool)
        .await
    }
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;
    use sqlx::SqlitePool;
    use uuid::Uuid;

    use super::ProjectStats;

    async fn setup_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("create sqlite memory pool");

        sqlx::query(
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
        )
        .execute(&pool)
        .await
        .expect("create project_stats table");
        sqlx::query(
            "CREATE UNIQUE INDEX idx_project_stats_project_period ON project_stats(project_id, period_start, period_end)",
        )
        .execute(&pool)
        .await
        .expect("create project stats unique index");

        pool
    }

    #[tokio::test]
    async fn upsert_uses_unique_project_period_conflict_path() {
        let pool = setup_pool().await;
        let project_id = Uuid::new_v4();
        let period_start = NaiveDate::from_ymd_opt(2026, 5, 1).unwrap();
        let period_end = NaiveDate::from_ymd_opt(2026, 5, 31).unwrap();

        let inserted = ProjectStats::upsert(
            &pool,
            project_id,
            period_start,
            period_end,
            1,
            2,
            3,
            10,
            20,
            30,
            Some(1.0),
        )
        .await
        .expect("insert project stats");
        let updated = ProjectStats::upsert(
            &pool,
            project_id,
            period_start,
            period_end,
            4,
            5,
            6,
            40,
            50,
            90,
            Some(2.0),
        )
        .await
        .expect("update project stats through conflict path");

        assert_eq!(updated.id, inserted.id);
        assert_eq!(updated.feature_count, 4);
        assert_eq!(updated.total_tokens, 90);

        let row_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM project_stats")
            .fetch_one(&pool)
            .await
            .expect("count project stats rows");
        assert_eq!(row_count, 1);

        let stats = ProjectStats::find_by_project(&pool, project_id)
            .await
            .expect("list project stats");
        assert_eq!(stats.len(), 1);
        assert_eq!(stats[0].id, inserted.id);

        let period_stats =
            ProjectStats::find_by_project_and_period(&pool, project_id, period_start, period_end)
                .await
                .expect("find stats by period")
                .expect("period stats exist");
        assert_eq!(period_stats.bugfix_count, 5);
    }
}
