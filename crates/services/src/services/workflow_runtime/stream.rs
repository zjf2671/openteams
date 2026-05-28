#[derive(Default)]
struct WorkflowRuntimeStreamState {
    last_content_by_index: HashMap<usize, String>,
    assistant_buffer: String,
    thinking_buffer: String,
    error_buffer: String,
}

impl WorkflowRuntimeStreamState {
    fn drain_patch_lines(&mut self, patch: &Patch) -> Vec<(ChatStreamDeltaType, String)> {
        let Some((index, entry)) = extract_normalized_entry_from_patch(patch) else {
            return Vec::new();
        };

        let Some(line) = workflow_runtime_line_for_entry(&entry) else {
            return Vec::new();
        };

        let previous = self
            .last_content_by_index
            .insert(index, line.content.clone())
            .unwrap_or_default();
        if previous == line.content {
            return Vec::new();
        }

        if line.immediate {
            return vec![(line.stream_type, line.content)];
        }

        let chunk = if line.content.starts_with(&previous) {
            line.content[previous.len()..].to_string()
        } else if previous == line.content {
            String::new()
        } else {
            line.content
        };

        self.drain_chunk_lines(line.stream_type, &chunk)
    }

    fn drain_chunk_lines(
        &mut self,
        stream_type: ChatStreamDeltaType,
        chunk: &str,
    ) -> Vec<(ChatStreamDeltaType, String)> {
        if chunk.is_empty() {
            return Vec::new();
        }

        let normalized = chunk.replace("\r\n", "\n").replace('\r', "\n");
        let buffer = match stream_type {
            ChatStreamDeltaType::Assistant => &mut self.assistant_buffer,
            ChatStreamDeltaType::Thinking => &mut self.thinking_buffer,
            ChatStreamDeltaType::Error => &mut self.error_buffer,
        };
        buffer.push_str(&normalized);

        let mut emitted = Vec::new();
        while let Some(newline_index) = buffer.find('\n') {
            let line = buffer[..newline_index].trim();
            if !line.is_empty() {
                emitted.push((stream_type.clone(), line.to_string()));
            }
            buffer.drain(..=newline_index);
        }

        emitted
    }

    fn flush_pending_lines(&mut self) -> Vec<(ChatStreamDeltaType, String)> {
        let mut emitted = Vec::new();

        for (stream_type, buffer) in [
            (ChatStreamDeltaType::Assistant, &mut self.assistant_buffer),
            (ChatStreamDeltaType::Thinking, &mut self.thinking_buffer),
            (ChatStreamDeltaType::Error, &mut self.error_buffer),
        ] {
            let line = buffer.trim();
            if !line.is_empty() {
                emitted.push((stream_type, line.to_string()));
            }
            buffer.clear();
        }

        emitted
    }
}

fn workflow_runtime_line_for_entry(entry: &NormalizedEntry) -> Option<WorkflowRuntimeEntryLine> {
    match &entry.entry_type {
        NormalizedEntryType::Thinking => Some(WorkflowRuntimeEntryLine {
            stream_type: ChatStreamDeltaType::Thinking,
            content: entry.content.clone(),
            immediate: false,
        }),
        NormalizedEntryType::ToolUse {
            tool_name,
            action_type,
            status,
        } => workflow_tool_activity_content(tool_name, action_type, status, &entry.content).map(
            |content| WorkflowRuntimeEntryLine {
                stream_type: ChatStreamDeltaType::Thinking,
                content,
                immediate: true,
            },
        ),
        // AssistantMessage remains reserved for the final workflow protocol
        // payload, so streaming it into transcript would duplicate or expose
        // the final_result JSON before the orchestrator handles it.
        NormalizedEntryType::ErrorMessage { .. } => Some(WorkflowRuntimeEntryLine {
            stream_type: ChatStreamDeltaType::Error,
            content: entry.content.clone(),
            immediate: true,
        }),
        _ => None,
    }
}

fn workflow_tool_activity_content(
    tool_name: &str,
    action_type: &ActionType,
    status: &ToolStatus,
    fallback_content: &str,
) -> Option<String> {
    let status_label = workflow_tool_status_label(status);

    let content = match action_type {
        ActionType::FileEdit { path, changes } => {
            let change_summary = workflow_file_change_summary(changes);
            format!("{status_label} file edit: {path}{change_summary}")
        }
        ActionType::CommandRun { command, .. } => {
            format!(
                "{status_label} command: {}",
                truncate_workflow_runtime_line(command)
            )
        }
        ActionType::Tool {
            tool_name: inner_tool_name,
            result,
            ..
        } => {
            let display_tool_name = if inner_tool_name.trim().is_empty() {
                tool_name
            } else {
                inner_tool_name
            };
            let prefix = if tool_name.starts_with("mcp:") || display_tool_name.starts_with("mcp:") {
                "MCP tool"
            } else {
                "Tool"
            };
            let mut line = format!("{status_label} {prefix}: {display_tool_name}");
            if let Some(preview) = workflow_tool_result_preview(result) {
                line.push_str(": ");
                line.push_str(&preview);
            }
            line
        }
        ActionType::TaskCreate {
            description,
            subagent_type,
            result,
        } => {
            let mut line = format!(
                "{status_label} task: {}",
                truncate_workflow_runtime_line(description)
            );
            if let Some(subagent_type) = subagent_type
                && !subagent_type.trim().is_empty()
            {
                line.push_str(" (");
                line.push_str(subagent_type.trim());
                line.push(')');
            }
            if let Some(preview) = workflow_tool_result_preview(result) {
                line.push_str(": ");
                line.push_str(&preview);
            }
            line
        }
        ActionType::FileRead { path } => format!("{status_label} file read: {path}"),
        ActionType::Search { query } => {
            format!(
                "{status_label} search: {}",
                truncate_workflow_runtime_line(query)
            )
        }
        ActionType::WebFetch { url } => format!("{status_label} web fetch: {url}"),
        ActionType::TodoManagement { todos, operation } => {
            format!("{status_label} plan {operation}: {} item(s)", todos.len())
        }
        ActionType::PlanPresentation { plan } => {
            format!(
                "{status_label} plan: {}",
                truncate_workflow_runtime_line(plan)
            )
        }
        ActionType::Other { description } => {
            format!(
                "{status_label} activity: {}",
                truncate_workflow_runtime_line(description)
            )
        }
    };

    let content = content.trim();
    if !content.is_empty() {
        return Some(content.to_string());
    }

    let fallback = fallback_content.trim();
    (!fallback.is_empty()).then(|| {
        format!(
            "{status_label} activity: {}",
            truncate_workflow_runtime_line(fallback)
        )
    })
}

fn workflow_tool_status_label(status: &ToolStatus) -> &'static str {
    match status {
        ToolStatus::Created => "Started",
        ToolStatus::Success => "Completed",
        ToolStatus::Failed => "Failed",
        ToolStatus::Denied { .. } => "Denied",
        ToolStatus::PendingApproval { .. } => "Waiting approval for",
        ToolStatus::TimedOut => "Timed out",
    }
}

fn workflow_file_change_summary(changes: &[FileChange]) -> String {
    if changes.is_empty() {
        return String::new();
    }

    let mut write_count = 0;
    let mut edit_count = 0;
    let mut delete_count = 0;
    let mut rename_count = 0;

    for change in changes {
        match change {
            FileChange::Write { .. } => write_count += 1,
            FileChange::Edit { .. } => edit_count += 1,
            FileChange::Delete => delete_count += 1,
            FileChange::Rename { .. } => rename_count += 1,
        }
    }

    let mut parts = Vec::new();
    if write_count > 0 {
        parts.push(format!("{write_count} write"));
    }
    if edit_count > 0 {
        parts.push(format!("{edit_count} edit"));
    }
    if delete_count > 0 {
        parts.push(format!("{delete_count} delete"));
    }
    if rename_count > 0 {
        parts.push(format!("{rename_count} rename"));
    }

    if parts.is_empty() {
        String::new()
    } else {
        format!(" ({})", parts.join(", "))
    }
}

fn workflow_tool_result_preview(result: &Option<ToolResult>) -> Option<String> {
    let result = result.as_ref()?;
    let preview = match &result.value {
        serde_json::Value::String(value) => value.clone(),
        value => value.to_string(),
    };
    let preview = preview
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())?;
    Some(truncate_workflow_runtime_line(preview))
}

fn truncate_workflow_runtime_line(value: &str) -> String {
    const MAX_LEN: usize = 220;

    let trimmed = value.trim();
    let mut chars = trimmed.chars();
    let truncated = chars.by_ref().take(MAX_LEN).collect::<String>();
    if chars.next().is_some() {
        format!("{truncated}...")
    } else {
        truncated
    }
}

async fn finish_workflow_runtime_stream(
    msg_store: &Arc<MsgStore>,
    stream_task: &mut Option<tokio::task::JoinHandle<()>>,
) {
    msg_store.push_finished();
    if let Some(task) = stream_task.take() {
        let _ = time::timeout(WORKFLOW_DRAIN_TIMEOUT, task).await;
    }
}

async fn finish_workflow_runtime_session_id_persistor(
    session_id_task: &mut Option<tokio::task::JoinHandle<()>>,
) {
    if let Some(task) = session_id_task.take() {
        time::sleep(WORKFLOW_SESSION_ID_DRAIN_TIMEOUT).await;
        task.abort();
        let _ = task.await;
    }
}

fn spawn_workflow_runtime_session_id_persistor(
    pool: SqlitePool,
    session_agent_id: Uuid,
    workflow_agent_session_id: Option<Uuid>,
    msg_store: Arc<MsgStore>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut stream = msg_store.history_plus_stream();
        let mut last_agent_session_id: Option<String> = None;
        let mut last_agent_message_id: Option<String> = None;

        while let Some(item) = stream.next().await {
            match item {
                Ok(LogMsg::SessionId(agent_session_id)) => {
                    if last_agent_session_id.as_deref() == Some(agent_session_id.as_str()) {
                        continue;
                    }
                    last_agent_session_id = Some(agent_session_id.clone());

                    if let Err(error) = ChatSessionAgent::update_agent_session_id(
                        &pool,
                        session_agent_id,
                        Some(agent_session_id.clone()),
                    )
                    .await
                    {
                        tracing::warn!(
                            session_agent_id = %session_agent_id,
                            %error,
                            "failed to persist workflow runtime agent_session_id on session agent"
                        );
                    }

                    if let Some(workflow_agent_session_id) = workflow_agent_session_id
                        && let Err(error) = WorkflowAgentSession::update_agent_session_id(
                            &pool,
                            workflow_agent_session_id,
                            Some(agent_session_id),
                        )
                        .await
                    {
                        tracing::warn!(
                            workflow_agent_session_id = %workflow_agent_session_id,
                            %error,
                            "failed to persist workflow runtime agent_session_id on workflow agent session"
                        );
                    }
                }
                Ok(LogMsg::MessageId(agent_message_id)) => {
                    if last_agent_message_id.as_deref() == Some(agent_message_id.as_str()) {
                        continue;
                    }
                    last_agent_message_id = Some(agent_message_id.clone());

                    if let Err(error) = ChatSessionAgent::update_agent_message_id(
                        &pool,
                        session_agent_id,
                        Some(agent_message_id.clone()),
                    )
                    .await
                    {
                        tracing::warn!(
                            session_agent_id = %session_agent_id,
                            %error,
                            "failed to persist workflow runtime agent_message_id on session agent"
                        );
                    }

                    if let Some(workflow_agent_session_id) = workflow_agent_session_id
                        && let Err(error) = WorkflowAgentSession::update_agent_message_id(
                            &pool,
                            workflow_agent_session_id,
                            Some(agent_message_id),
                        )
                        .await
                    {
                        tracing::warn!(
                            workflow_agent_session_id = %workflow_agent_session_id,
                            %error,
                            "failed to persist workflow runtime agent_message_id on workflow agent session"
                        );
                    }
                }
                _ => {}
            }
        }
    })
}

#[allow(clippy::too_many_arguments)]
fn spawn_workflow_runtime_stream(
    pool: SqlitePool,
    chat_runner: ChatRunner,
    session_id: Uuid,
    execution_id: Uuid,
    workflow_agent_session_id: Option<Uuid>,
    step_id: Uuid,
    step_key: String,
    agent_id: Uuid,
    agent_name: String,
    msg_store: Arc<MsgStore>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut state = WorkflowRuntimeStreamState::default();
        let mut stream = msg_store.history_plus_stream();

        while let Some(item) = stream.next().await {
            let Ok(LogMsg::JsonPatch(patch)) = item else {
                continue;
            };

            for (stream_type, line) in state.drain_patch_lines(&patch) {
                let created_at = Utc::now().to_rfc3339();
                match persist_workflow_runtime_transcript_line(
                    &pool,
                    execution_id,
                    workflow_agent_session_id,
                    step_id,
                    &line,
                )
                .await
                {
                    Ok(_) => chat_runner.emit_workflow_runtime_line(
                        session_id,
                        execution_id,
                        workflow_agent_session_id,
                        step_id,
                        step_key.clone(),
                        agent_id,
                        agent_name.clone(),
                        stream_type,
                        line,
                        created_at,
                    ),
                    Err(error) => tracing::warn!(
                        execution_id = %execution_id,
                        step_id = %step_id,
                        workflow_agent_session_id = ?workflow_agent_session_id,
                        %error,
                        "failed to persist workflow runtime thinking line"
                    ),
                }
            }
        }

        for (stream_type, line) in state.flush_pending_lines() {
            let created_at = Utc::now().to_rfc3339();
            match persist_workflow_runtime_transcript_line(
                &pool,
                execution_id,
                workflow_agent_session_id,
                step_id,
                &line,
            )
            .await
            {
                Ok(_) => chat_runner.emit_workflow_runtime_line(
                    session_id,
                    execution_id,
                    workflow_agent_session_id,
                    step_id,
                    step_key.clone(),
                    agent_id,
                    agent_name.clone(),
                    stream_type,
                    line,
                    created_at,
                ),
                Err(error) => tracing::warn!(
                    execution_id = %execution_id,
                    step_id = %step_id,
                    workflow_agent_session_id = ?workflow_agent_session_id,
                    %error,
                    "failed to persist buffered workflow runtime thinking line"
                ),
            }
        }
    })
}

#[derive(Clone)]
struct WorkflowRuntimeStreamContext {
    pool: SqlitePool,
    chat_runner: ChatRunner,
    session_id: Uuid,
    execution_id: Uuid,
    workflow_agent_session_id: Option<Uuid>,
    step_id: Uuid,
    step_key: String,
    agent_id: Uuid,
    agent_name: String,
}
