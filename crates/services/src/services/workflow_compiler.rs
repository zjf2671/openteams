use std::collections::{HashMap, HashSet};

use db::models::workflow_types::*;
use sha2::{Digest, Sha256};

use super::workflow_validator::{self, ValidationResult};

/// 编译错误
#[derive(Debug, thiserror::Error)]
pub enum CompileError {
    #[error("计划校验失败: {0}")]
    ValidationFailed(String),
    #[error("编译错误: {0}")]
    CompileError(String),
}

/// 编译器：将 workflow plan JSON 转换为可执行的 compiled graph
pub struct WorkflowCompiler;

impl WorkflowCompiler {
    /// 从 JSON 字符串解析并编译 workflow plan
    pub fn compile_from_json(
        json_str: &str,
        valid_agent_ids: &[String],
    ) -> Result<CompiledGraph, CompileError> {
        let plan: WorkflowPlanJson = serde_json::from_str(json_str).map_err(|e| {
            CompileError::ValidationFailed(format!("JSON 解析失败: {}", e))
        })?;

        Self::compile(&plan, valid_agent_ids)
    }

    /// 编译 workflow plan 为 compiled graph
    pub fn compile(
        plan: &WorkflowPlanJson,
        valid_agent_ids: &[String],
    ) -> Result<CompiledGraph, CompileError> {
        // 1. 执行综合校验
        let validation = workflow_validator::validate_plan(plan, valid_agent_ids);
        if !validation.is_valid {
            let error_messages: Vec<String> = validation
                .errors
                .iter()
                .map(|e| format!("[{}] {}", e.field, e.message))
                .collect();
            return Err(CompileError::ValidationFailed(error_messages.join("; ")));
        }

        // 2. 编译节点为 CompiledStep
        let default_retry = plan
            .globals
            .as_ref()
            .map(|g| g.default_retry)
            .unwrap_or(1);

        let mut steps: Vec<CompiledStep> = Vec::with_capacity(plan.nodes.len());
        let topo_order = Self::topological_sort(plan);

        for (order, node_id) in topo_order.iter().enumerate() {
            let node = plan.nodes.iter().find(|n| n.id == *node_id).unwrap();
            let step_type = match node.data.step_type.as_str() {
                "task" => WorkflowStepType::Task,
                "review" => WorkflowStepType::Review,
                "result" => WorkflowStepType::Result,
                other => {
                    return Err(CompileError::CompileError(format!(
                        "未知步骤类型: {}",
                        other
                    )));
                }
            };

            steps.push(CompiledStep {
                step_key: node.id.clone(),
                step_type,
                title: node.data.title.clone(),
                instructions: node.data.instructions.clone(),
                assigned_agent_id: node.data.agent_id.clone(),
                acceptance: node.data.acceptance.clone(),
                outputs: node.data.outputs.clone(),
                interruptible: node.data.interruptible,
                max_retry: node.data.max_retry.unwrap_or(default_retry),
                display_order: order as i32,
            });
        }

        // 3. 编译边为 CompiledEdge
        let edges: Vec<CompiledEdge> = plan
            .edges
            .iter()
            .map(|e| {
                let kind = e
                    .data
                    .as_ref()
                    .map(|d| match d.kind.as_str() {
                        "soft" => WorkflowEdgeKind::Soft,
                        _ => WorkflowEdgeKind::Hard,
                    })
                    .unwrap_or(WorkflowEdgeKind::Hard);

                CompiledEdge {
                    edge_id: e.id.clone(),
                    from_step_key: e.source.clone(),
                    to_step_key: e.target.clone(),
                    edge_kind: kind,
                }
            })
            .collect();

        // 4. 计算初始 ready steps（无入边的节点）
        let targets: HashSet<&str> = plan.edges.iter().map(|e| e.target.as_str()).collect();
        let ready_step_keys: Vec<String> = plan
            .nodes
            .iter()
            .filter(|n| !targets.contains(n.id.as_str()))
            .map(|n| n.id.clone())
            .collect();

        // 5. 计算确定性 hash
        let plan_hash = Self::compute_hash(plan);
        let compiled_graph_hash = Self::compute_compiled_hash(&steps, &edges);

        Ok(CompiledGraph {
            plan_hash,
            compiled_graph_hash,
            steps,
            edges,
            ready_step_keys,
        })
    }

    /// 仅执行校验，不编译
    pub fn validate_only(
        plan: &WorkflowPlanJson,
        valid_agent_ids: &[String],
    ) -> ValidationResult {
        workflow_validator::validate_plan(plan, valid_agent_ids)
    }

    /// 计算 plan JSON 的确定性 hash
    pub fn compute_hash(plan: &WorkflowPlanJson) -> String {
        // 使用 canonical JSON 序列化保证确定性
        let canonical = serde_json::to_string(plan).unwrap_or_default();
        let mut hasher = Sha256::new();
        hasher.update(canonical.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// 计算编译产物的确定性 hash（覆盖所有影响调度和行为的字段）
    fn compute_compiled_hash(steps: &[CompiledStep], edges: &[CompiledEdge]) -> String {
        let mut hasher = Sha256::new();
        for step in steps {
            hasher.update(step.step_key.as_bytes());
            hasher.update(format!("{:?}", step.step_type).as_bytes());
            hasher.update(step.title.as_bytes());
            hasher.update(step.instructions.as_bytes());
            hasher.update(
                step.assigned_agent_id
                    .as_deref()
                    .unwrap_or("")
                    .as_bytes(),
            );
            if let Some(ref acceptance) = step.acceptance {
                for a in acceptance {
                    hasher.update(a.as_bytes());
                }
            }
            if let Some(ref outputs) = step.outputs {
                for o in outputs {
                    hasher.update(o.as_bytes());
                }
            }
            hasher.update(if step.interruptible { &[1u8] } else { &[0u8] });
            hasher.update(step.max_retry.to_le_bytes());
            hasher.update(step.display_order.to_le_bytes());
        }
        for edge in edges {
            hasher.update(edge.edge_id.as_bytes());
            hasher.update(edge.from_step_key.as_bytes());
            hasher.update(edge.to_step_key.as_bytes());
            hasher.update(format!("{:?}", edge.edge_kind).as_bytes());
        }
        format!("{:x}", hasher.finalize())
    }

    /// 拓扑排序（Kahn's algorithm），返回节点 id 的排序列表
    fn topological_sort(plan: &WorkflowPlanJson) -> Vec<String> {
        let node_ids: Vec<&str> = plan.nodes.iter().map(|n| n.id.as_str()).collect();
        let node_set: HashSet<&str> = node_ids.iter().copied().collect();

        let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();
        let mut in_degree: HashMap<&str, usize> = HashMap::new();

        for &id in &node_ids {
            adj.entry(id).or_default();
            in_degree.entry(id).or_insert(0);
        }

        for edge in &plan.edges {
            if node_set.contains(edge.source.as_str())
                && node_set.contains(edge.target.as_str())
            {
                adj.entry(edge.source.as_str())
                    .or_default()
                    .push(edge.target.as_str());
                *in_degree.entry(edge.target.as_str()).or_insert(0) += 1;
            }
        }

        // 用排序后的队列保证确定性
        let mut queue: Vec<&str> = in_degree
            .iter()
            .filter(|entry| *entry.1 == 0)
            .map(|entry| *entry.0)
            .collect();
        queue.sort();

        let mut result = Vec::with_capacity(node_ids.len());

        while let Some(node) = queue.pop() {
            // pop from sorted → take last for determinism (reverse sorted)
            result.push(node.to_string());
            let mut next_ready = Vec::new();
            if let Some(neighbors) = adj.get(node) {
                for &neighbor in neighbors {
                    let deg = in_degree.get_mut(neighbor).unwrap();
                    *deg -= 1;
                    if *deg == 0 {
                        next_ready.push(neighbor);
                    }
                }
            }
            next_ready.sort();
            // Insert in sorted order so pop() gives deterministic results
            for n in next_ready.into_iter().rev() {
                queue.push(n);
            }
            queue.sort();
        }

        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_plan_json() -> &'static str {
        r#"{
            "version": 1,
            "title": "测试计划",
            "goal": "测试编译",
            "agents": { "lead": "lead-agent", "available": ["agent-1", "agent-2"] },
            "nodes": [
                {
                    "id": "task_1", "type": "workflowStep",
                    "position": { "x": 0, "y": 0 },
                    "data": { "stepType": "task", "agentId": "agent-1", "title": "任务1", "instructions": "做事1" }
                },
                {
                    "id": "task_2", "type": "workflowStep",
                    "position": { "x": 240, "y": 0 },
                    "data": { "stepType": "task", "agentId": "agent-2", "title": "任务2", "instructions": "做事2" }
                },
                {
                    "id": "result", "type": "workflowStep",
                    "position": { "x": 120, "y": 140 },
                    "data": { "stepType": "result", "title": "最终结果", "instructions": "汇总" }
                }
            ],
            "edges": [
                { "id": "task_1->result", "source": "task_1", "target": "result" },
                { "id": "task_2->result", "source": "task_2", "target": "result" }
            ]
        }"#
    }

    fn agents() -> Vec<String> {
        vec![
            "lead-agent".into(),
            "agent-1".into(),
            "agent-2".into(),
        ]
    }

    #[test]
    fn test_compile_success() {
        let graph = WorkflowCompiler::compile_from_json(sample_plan_json(), &agents()).unwrap();
        assert_eq!(graph.steps.len(), 3);
        assert_eq!(graph.edges.len(), 2);
        assert!(!graph.plan_hash.is_empty());
        assert!(!graph.compiled_graph_hash.is_empty());
    }

    #[test]
    fn test_ready_steps() {
        let graph = WorkflowCompiler::compile_from_json(sample_plan_json(), &agents()).unwrap();
        // task_1 and task_2 have no incoming edges
        assert!(graph.ready_step_keys.contains(&"task_1".to_string()));
        assert!(graph.ready_step_keys.contains(&"task_2".to_string()));
        assert!(!graph.ready_step_keys.contains(&"result".to_string()));
    }

    #[test]
    fn test_deterministic_hash() {
        let graph1 = WorkflowCompiler::compile_from_json(sample_plan_json(), &agents()).unwrap();
        let graph2 = WorkflowCompiler::compile_from_json(sample_plan_json(), &agents()).unwrap();
        assert_eq!(graph1.plan_hash, graph2.plan_hash);
        assert_eq!(graph1.compiled_graph_hash, graph2.compiled_graph_hash);
    }

    #[test]
    fn test_compile_invalid_json() {
        let result = WorkflowCompiler::compile_from_json("not json", &agents());
        assert!(result.is_err());
    }

    #[test]
    fn test_compile_invalid_plan() {
        let json = r#"{ "version": 1, "title": "", "goal": "test", "agents": {"lead": "x", "available": []}, "nodes": [], "edges": [] }"#;
        let result = WorkflowCompiler::compile_from_json(json, &["x".into()]);
        assert!(result.is_err());
    }

    #[test]
    fn test_topological_order() {
        let graph = WorkflowCompiler::compile_from_json(sample_plan_json(), &agents()).unwrap();
        // result must come after task_1 and task_2
        let result_pos = graph
            .steps
            .iter()
            .position(|s| s.step_key == "result")
            .unwrap();
        let task1_pos = graph
            .steps
            .iter()
            .position(|s| s.step_key == "task_1")
            .unwrap();
        let task2_pos = graph
            .steps
            .iter()
            .position(|s| s.step_key == "task_2")
            .unwrap();
        assert!(result_pos > task1_pos);
        assert!(result_pos > task2_pos);
    }
}
