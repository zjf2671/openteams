use std::{
    collections::{BTreeSet, HashMap},
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};

use chrono::{DateTime, Utc};
use executors::{
    command::{CmdOverrides, CommandBuilder},
    env::ExecutionEnv,
    executors::{AvailabilityInfo, BaseCodingAgent, CodingAgent, StandardCodingAgentExecutor},
    profile::{ExecutorConfig, ExecutorConfigs},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use tokio::{process::Command, time::timeout};
use ts_rs::TS;

const STORE_FILE_NAME: &str = "agent_runtime_config.json";

#[derive(Debug, Error)]
pub enum AgentRuntimeError {
    #[error("invalid environment variable key: {0}")]
    InvalidEnvKey(String),
    #[error("unknown runner: {0}")]
    UnknownRunner(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum AgentRunMode {
    Auto,
    Local,
    Disabled,
}

impl Default for AgentRunMode {
    fn default() -> Self {
        Self::Auto
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct AgentRuntimeConfig {
    pub runner_type: BaseCodingAgent,
    pub run_mode: AgentRunMode,
    pub env_json: HashMap<String, String>,
    #[serde(default)]
    #[ts(type = "JsonValue")]
    pub executor_options: Value,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct UpdateAgentRuntimeConfig {
    pub run_mode: Option<AgentRunMode>,
    pub env_json: Option<HashMap<String, String>>,
    #[ts(type = "JsonValue | null")]
    pub executor_options: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct AgentRuntimeEnvSummary {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AgentRuntimeStatus {
    pub runner_type: BaseCodingAgent,
    pub installed: bool,
    pub executable: bool,
    pub availability: AvailabilityInfo,
    pub discovered_models: Vec<String>,
    pub version: Option<String>,
    pub last_checked_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub run_mode: AgentRunMode,
    pub env_summary: Vec<AgentRuntimeEnvSummary>,
    #[ts(type = "JsonValue")]
    pub executor_options: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AgentRuntimeListResponse {
    pub runners: Vec<AgentRuntimeStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct AgentRuntimeRefreshError {
    pub runner_type: BaseCodingAgent,
    pub message: String,
    pub preserved_models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AgentRuntimeRefreshResponse {
    pub runners: Vec<AgentRuntimeStatus>,
    pub errors: Vec<AgentRuntimeRefreshError>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AgentRuntimeDiagnostics {
    pub runner_type: BaseCodingAgent,
    pub installed: bool,
    pub executable: bool,
    pub availability: AvailabilityInfo,
    pub config_path: String,
    pub install_indicator_path: Option<String>,
    pub discovered_models: Vec<String>,
    pub version: Option<String>,
    pub last_checked_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub run_mode: AgentRunMode,
    pub env_summary: Vec<AgentRuntimeEnvSummary>,
    #[ts(type = "JsonValue")]
    pub executor_options: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct AgentRuntimeDiscovery {
    models: Vec<String>,
    version: Option<String>,
    last_checked_at: DateTime<Utc>,
    last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
struct AgentRuntimeStore {
    #[serde(default)]
    configs: HashMap<BaseCodingAgent, AgentRuntimeConfig>,
    #[serde(default)]
    discoveries: HashMap<BaseCodingAgent, AgentRuntimeDiscovery>,
}

pub fn store_path() -> PathBuf {
    utils::assets::asset_dir().join(STORE_FILE_NAME)
}

pub fn list_runtime_statuses() -> Result<AgentRuntimeListResponse, AgentRuntimeError> {
    let store = read_store(&store_path())?;
    let profiles = ExecutorConfigs::get_cached();
    Ok(AgentRuntimeListResponse {
        runners: build_statuses(&profiles, &store),
    })
}

pub async fn refresh_runtime_discovery(
    current_dir: &Path,
) -> Result<AgentRuntimeRefreshResponse, AgentRuntimeError> {
    let path = store_path();
    let mut store = read_store(&path)?;
    let profiles = ExecutorConfigs::get_cached();
    let mut errors = Vec::new();

    for (runner, executor_config) in &profiles.executors {
        let Some(mut base) = executor_config
            .get_default()
            .or_else(|| executor_config.configurations.values().next())
            .cloned()
        else {
            continue;
        };

        if !base.get_availability_info().is_available() {
            continue;
        }

        let mut env = ExecutionEnv::new(Default::default(), false, String::new());
        apply_config_to_executor_and_env(*runner, &mut base, &mut env, &store)?;
        let detected_version = detect_refresh_version(&base, &env).await;

        match discover_models_for_executor(&base, current_dir, &env).await {
            Ok(Some(models)) => {
                let version = version_for_discovery_update(&store, *runner, detected_version);
                store.discoveries.insert(
                    *runner,
                    AgentRuntimeDiscovery {
                        models,
                        version,
                        last_checked_at: Utc::now(),
                        last_error: None,
                    },
                );
            }
            Ok(None) => {
                if let Some(version) = detected_version {
                    cache_runner_version(&mut store, *runner, version);
                }
            }
            Err(message) => {
                let preserved_models = models_for_runner(*runner, executor_config, &store);
                store
                    .discoveries
                    .entry(*runner)
                    .and_modify(|entry| {
                        entry.last_checked_at = Utc::now();
                        entry.last_error = Some(message.clone());
                        if let Some(version) = detected_version.clone() {
                            entry.version = Some(version);
                        }
                    })
                    .or_insert_with(|| AgentRuntimeDiscovery {
                        models: Vec::new(),
                        version: detected_version.clone(),
                        last_checked_at: Utc::now(),
                        last_error: Some(message.clone()),
                    });
                errors.push(AgentRuntimeRefreshError {
                    runner_type: *runner,
                    message,
                    preserved_models,
                });
            }
        }
    }

    write_store(&path, &store)?;
    Ok(AgentRuntimeRefreshResponse {
        runners: build_statuses(&profiles, &store),
        errors,
    })
}

pub fn update_runtime_config(
    runner: BaseCodingAgent,
    payload: UpdateAgentRuntimeConfig,
) -> Result<AgentRuntimeStatus, AgentRuntimeError> {
    let path = store_path();
    let mut store = read_store(&path)?;
    let profiles = ExecutorConfigs::get_cached();

    if !profiles.executors.contains_key(&runner) {
        return Err(AgentRuntimeError::UnknownRunner(runner.to_string()));
    }

    let mut config = store
        .configs
        .get(&runner)
        .cloned()
        .unwrap_or_else(|| default_config(runner));

    if let Some(run_mode) = payload.run_mode {
        config.run_mode = run_mode;
    }
    if let Some(env_json) = payload.env_json {
        validate_env_json(&env_json)?;
        config.env_json = env_json;
    }
    if let Some(executor_options) = payload.executor_options {
        config.executor_options = executor_options;
    }
    config.updated_at = Utc::now();

    store.configs.insert(runner, config);
    write_store(&path, &store)?;

    let status = build_statuses(&profiles, &store)
        .into_iter()
        .find(|status| status.runner_type == runner)
        .ok_or_else(|| AgentRuntimeError::UnknownRunner(runner.to_string()))?;
    Ok(status)
}

pub async fn runtime_diagnostics(
    runner: BaseCodingAgent,
) -> Result<AgentRuntimeDiagnostics, AgentRuntimeError> {
    let path = store_path();
    let mut store = read_store(&path)?;
    let profiles = ExecutorConfigs::get_cached();
    let config = profiles
        .executors
        .get(&runner)
        .ok_or_else(|| AgentRuntimeError::UnknownRunner(runner.to_string()))?;
    let Some(base) = config
        .get_default()
        .or_else(|| config.configurations.values().next())
    else {
        return Err(AgentRuntimeError::UnknownRunner(runner.to_string()));
    };

    let cli_config_path = base
        .default_mcp_config_path()
        .map(|path| path.display().to_string());
    let status = build_status(runner, config, base, &store);
    let mut runtime_executor = base.clone();
    let mut env = ExecutionEnv::new(Default::default(), false, String::new());
    apply_config_to_executor_and_env(runner, &mut runtime_executor, &mut env, &store)?;

    let detected_version = if status.installed {
        detect_cli_version(&runtime_executor, &env).await
    } else {
        None
    };
    if let Some(version) = detected_version.as_deref() {
        cache_runner_version(&mut store, runner, version.to_string());
        write_store(&path, &store)?;
    }
    let version = detected_version.or(status.version);

    Ok(AgentRuntimeDiagnostics {
        runner_type: status.runner_type,
        installed: status.installed,
        executable: status.executable,
        availability: status.availability,
        config_path: cli_config_path
            .clone()
            .unwrap_or_else(|| path.display().to_string()),
        install_indicator_path: cli_config_path,
        discovered_models: status.discovered_models,
        version,
        last_checked_at: status.last_checked_at,
        last_error: status.last_error,
        run_mode: status.run_mode,
        env_summary: status.env_summary,
        executor_options: status.executor_options,
    })
}

pub fn apply_agent_runtime_config(
    runner: BaseCodingAgent,
    executor: &mut CodingAgent,
    env: &mut ExecutionEnv,
) -> Result<(), AgentRuntimeError> {
    let store = read_store(&store_path())?;
    apply_config_to_executor_and_env(runner, executor, env, &store)?;
    Ok(())
}

fn apply_config_to_executor_and_env(
    runner: BaseCodingAgent,
    executor: &mut CodingAgent,
    env: &mut ExecutionEnv,
    store: &AgentRuntimeStore,
) -> Result<(), AgentRuntimeError> {
    if let Some(config) = store.configs.get(&runner) {
        merge_agent_env_without_overwriting_session(env, &config.env_json);
        apply_executor_options(runner, executor, &config.executor_options)?;
    }
    Ok(())
}

fn apply_executor_options(
    runner: BaseCodingAgent,
    executor: &mut CodingAgent,
    executor_options: &Value,
) -> Result<(), AgentRuntimeError> {
    let Some(options) = executor_options
        .as_object()
        .filter(|options| !options.is_empty())
    else {
        return Ok(());
    };

    let tag = serde_json::to_value(runner)?
        .as_str()
        .unwrap_or_default()
        .to_string();
    let mut wrapped = serde_json::to_value(&*executor)?;
    let Value::Object(root) = &mut wrapped else {
        return Ok(());
    };
    let Some(inner) = root.get_mut(&tag) else {
        return Ok(());
    };

    merge_json_object(inner, &Value::Object(options.clone()));
    *executor = serde_json::from_value(wrapped)?;
    Ok(())
}

fn merge_json_object(target: &mut Value, source: &Value) {
    match (target, source) {
        (Value::Object(target_map), Value::Object(source_map)) => {
            for (key, value) in source_map {
                match (target_map.get_mut(key), value) {
                    (Some(existing @ Value::Object(_)), Value::Object(_)) => {
                        merge_json_object(existing, value);
                    }
                    _ => {
                        target_map.insert(key.clone(), value.clone());
                    }
                }
            }
        }
        (target, source) => {
            *target = source.clone();
        }
    }
}

fn merge_agent_env_without_overwriting_session(
    env: &mut ExecutionEnv,
    agent_env: &HashMap<String, String>,
) {
    for (key, value) in agent_env {
        if !env.contains_key(key) {
            env.insert(key.clone(), value.clone());
        }
    }
}

async fn detect_cli_version(executor: &CodingAgent, env: &ExecutionEnv) -> Option<String> {
    let base = version_command_base(executor)?;
    let parts = CommandBuilder::new(base)
        .extend_params(["--version"])
        .build_initial()
        .ok()?
        .into_resolved()
        .await
        .ok()?;
    let (executable_path, args) = parts;

    let mut command = Command::new(executable_path);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    if let Some(cmd_overrides) = cmd_overrides_for_executor(executor) {
        env.clone()
            .with_profile(cmd_overrides)
            .apply_to_command(&mut command);
    } else {
        env.apply_to_command(&mut command);
    }

    let output = timeout(Duration::from_secs(12), command.output())
        .await
        .ok()?
        .ok()?;
    normalize_cli_version_output(&output.stdout, &output.stderr)
}

async fn detect_refresh_version(executor: &CodingAgent, env: &ExecutionEnv) -> Option<String> {
    match executor {
        CodingAgent::Opencode(_) | CodingAgent::OpenTeamsCli(_) => {
            detect_cli_version(executor, env).await
        }
        _ => None,
    }
}

fn version_command_base(executor: &CodingAgent) -> Option<String> {
    if let Some(base_override) = cmd_overrides_for_executor(executor)
        .and_then(|cmd| cmd.base_command_override.as_deref())
        .map(str::trim)
        .filter(|base| !base.is_empty())
    {
        return Some(base_override.to_string());
    }

    Some(match executor {
        CodingAgent::ClaudeCode(config) => {
            if config.claude_code_router.unwrap_or(false) {
                "npx -y @musistudio/claude-code-router@2.0.0".to_string()
            } else {
                "npx -y @anthropic-ai/claude-code@2.1.74".to_string()
            }
        }
        CodingAgent::Amp(_) => "npx -y @sourcegraph/amp@0.0.1773273801-g50314c".to_string(),
        CodingAgent::Gemini(_) => "npx -y @google/gemini-cli@0.33.0".to_string(),
        CodingAgent::Codex(_) => "npx -y @openai/codex@0.125.0".to_string(),
        CodingAgent::Opencode(_) => "npx -y opencode-ai@1.2.24".to_string(),
        CodingAgent::OpenTeamsCli(_) => openteams_cli_binary_base(),
        CodingAgent::CursorAgent(_) => "cursor-agent".to_string(),
        CodingAgent::QwenCode(_) => "npx -y @qwen-code/qwen-code@0.12.1".to_string(),
        CodingAgent::Copilot(_) => "npx -y @github/copilot@1.0.4".to_string(),
        CodingAgent::Droid(_) => "droid".to_string(),
        CodingAgent::KimiCode(_) => "kimi".to_string(),
        #[cfg(feature = "qa-mode")]
        CodingAgent::QaMock(_) => return None,
    })
}

fn cmd_overrides_for_executor(executor: &CodingAgent) -> Option<&CmdOverrides> {
    match executor {
        CodingAgent::ClaudeCode(config) => Some(&config.cmd),
        CodingAgent::Amp(config) => Some(&config.cmd),
        CodingAgent::Gemini(config) => Some(&config.cmd),
        CodingAgent::Codex(config) => Some(&config.cmd),
        CodingAgent::Opencode(config) => Some(&config.cmd),
        CodingAgent::OpenTeamsCli(config) => Some(&config.cmd),
        CodingAgent::CursorAgent(config) => Some(&config.cmd),
        CodingAgent::QwenCode(config) => Some(&config.cmd),
        CodingAgent::Copilot(config) => Some(&config.cmd),
        CodingAgent::Droid(config) => Some(&config.cmd),
        CodingAgent::KimiCode(config) => Some(&config.cmd),
        #[cfg(feature = "qa-mode")]
        CodingAgent::QaMock(_) => None,
    }
}

fn openteams_cli_binary_base() -> String {
    let binary_name = if cfg!(windows) {
        "openteams-cli.exe"
    } else {
        "openteams-cli"
    };

    if let Ok(path) = std::env::var("OPENTEAMS_CLI_PATH") {
        let path = PathBuf::from(path);
        if path.exists() {
            return command_base_from_path(path);
        }
    }

    if let Ok(exe_path) = std::env::current_exe()
        && let Some(exe_dir) = exe_path.parent()
    {
        let bundled = exe_dir.join(binary_name);
        if bundled.exists() {
            return command_base_from_path(bundled);
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        let dev_binary = cwd.join("binaries").join(binary_name);
        if dev_binary.exists() {
            return command_base_from_path(dev_binary);
        }
    }

    if let Some(home) = dirs::home_dir() {
        let bundled = home.join(".openteams").join("bin").join(binary_name);
        if bundled.exists() {
            return command_base_from_path(bundled);
        }
    }

    which::which("openteams-cli")
        .ok()
        .map(command_base_from_path)
        .unwrap_or_else(|| "npx -y openteams-cli@latest".to_string())
}

fn command_base_from_path(path: PathBuf) -> String {
    let raw = path.to_string_lossy();
    if raw.contains(' ') {
        format!("\"{raw}\"")
    } else {
        raw.to_string()
    }
}

fn normalize_cli_version_output(stdout: &[u8], stderr: &[u8]) -> Option<String> {
    let stdout = String::from_utf8_lossy(stdout);
    first_version_line(&stdout).or_else(|| {
        let stderr = String::from_utf8_lossy(stderr);
        first_version_line(&stderr)
    })
}

fn first_version_line(output: &str) -> Option<String> {
    output
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(160).collect())
}

fn cache_runner_version(store: &mut AgentRuntimeStore, runner: BaseCodingAgent, version: String) {
    let now = Utc::now();
    store
        .discoveries
        .entry(runner)
        .and_modify(|entry| {
            entry.version = Some(version.clone());
            entry.last_checked_at = now;
        })
        .or_insert_with(|| AgentRuntimeDiscovery {
            models: Vec::new(),
            version: Some(version),
            last_checked_at: now,
            last_error: None,
        });
}

fn version_for_discovery_update(
    store: &AgentRuntimeStore,
    runner: BaseCodingAgent,
    detected_version: Option<String>,
) -> Option<String> {
    detected_version.or_else(|| {
        store
            .discoveries
            .get(&runner)
            .and_then(|entry| entry.version.clone())
    })
}

async fn discover_models_for_executor(
    executor: &CodingAgent,
    current_dir: &Path,
    env: &ExecutionEnv,
) -> Result<Option<Vec<String>>, String> {
    match executor {
        CodingAgent::Opencode(opencode) => opencode
            .list_models(current_dir, env)
            .await
            .map(Some)
            .map_err(|err| err.to_string()),
        CodingAgent::OpenTeamsCli(openteams_cli) => openteams_cli
            .list_models(current_dir, env)
            .await
            .map(Some)
            .map_err(|err| err.to_string()),
        _ => Ok(None),
    }
}

fn build_statuses(
    profiles: &ExecutorConfigs,
    store: &AgentRuntimeStore,
) -> Vec<AgentRuntimeStatus> {
    let mut runners = profiles
        .executors
        .iter()
        .filter_map(|(runner, config)| {
            let base = config
                .get_default()
                .or_else(|| config.configurations.values().next())?;
            Some(build_status(*runner, config, base, store))
        })
        .collect::<Vec<_>>();
    runners.sort_by_key(|status| status.runner_type.to_string());
    runners
}

fn build_status(
    runner: BaseCodingAgent,
    executor_config: &ExecutorConfig,
    base: &CodingAgent,
    store: &AgentRuntimeStore,
) -> AgentRuntimeStatus {
    let config = store
        .configs
        .get(&runner)
        .cloned()
        .unwrap_or_else(|| default_config(runner));
    let discovery = store.discoveries.get(&runner);
    let availability = base.get_availability_info();
    let installed = availability.is_available();
    let executable = installed && config.run_mode != AgentRunMode::Disabled;

    AgentRuntimeStatus {
        runner_type: runner,
        installed,
        executable,
        availability,
        discovered_models: models_for_runner(runner, executor_config, store),
        version: discovery.and_then(|entry| entry.version.clone()),
        last_checked_at: discovery.map(|entry| entry.last_checked_at),
        last_error: discovery.and_then(|entry| entry.last_error.clone()),
        run_mode: config.run_mode,
        env_summary: summarize_env(&config.env_json),
        executor_options: config.executor_options,
    }
}

fn models_for_runner(
    runner: BaseCodingAgent,
    executor_config: &ExecutorConfig,
    store: &AgentRuntimeStore,
) -> Vec<String> {
    if let Some(discovery) = store.discoveries.get(&runner)
        && !discovery.models.is_empty()
    {
        return discovery.models.clone();
    }

    configured_models(executor_config)
}

fn configured_models(executor_config: &ExecutorConfig) -> Vec<String> {
    let mut models = BTreeSet::new();
    for config in executor_config.configurations.values() {
        if let Some(model) = model_name(config) {
            models.insert(model.to_string());
        }
    }
    models.into_iter().collect()
}

fn model_name(config: &CodingAgent) -> Option<&str> {
    match config {
        CodingAgent::Codex(config) => config.model.as_deref(),
        CodingAgent::ClaudeCode(config) => config.model.as_deref(),
        CodingAgent::Gemini(config) => config.model.as_deref(),
        CodingAgent::Opencode(config) => config.model.as_deref(),
        CodingAgent::OpenTeamsCli(config) => config.model.as_deref(),
        CodingAgent::QwenCode(config) => config.model.as_deref(),
        CodingAgent::CursorAgent(config) => config.model.as_deref(),
        CodingAgent::Copilot(config) => config.model.as_deref(),
        CodingAgent::Droid(config) => config.model.as_deref(),
        CodingAgent::KimiCode(config) => config.model.as_deref(),
        #[cfg(feature = "qa-mode")]
        CodingAgent::QaMock(_) => None,
        _ => None,
    }
}

fn default_config(runner: BaseCodingAgent) -> AgentRuntimeConfig {
    AgentRuntimeConfig {
        runner_type: runner,
        run_mode: AgentRunMode::Auto,
        env_json: HashMap::new(),
        executor_options: serde_json::json!({}),
        updated_at: Utc::now(),
    }
}

fn summarize_env(env: &HashMap<String, String>) -> Vec<AgentRuntimeEnvSummary> {
    let mut summaries = env
        .iter()
        .map(|(key, value)| AgentRuntimeEnvSummary {
            key: key.clone(),
            value: value.clone(),
        })
        .collect::<Vec<_>>();
    summaries.sort_by(|a, b| a.key.cmp(&b.key));
    summaries
}

fn validate_env_json(env: &HashMap<String, String>) -> Result<(), AgentRuntimeError> {
    for key in env.keys() {
        validate_env_key(key)?;
    }
    Ok(())
}

fn validate_env_key(key: &str) -> Result<(), AgentRuntimeError> {
    let mut chars = key.chars();
    let Some(first) = chars.next() else {
        return Err(AgentRuntimeError::InvalidEnvKey(key.to_string()));
    };
    if !(first == '_' || first.is_ascii_alphabetic()) {
        return Err(AgentRuntimeError::InvalidEnvKey(key.to_string()));
    }
    if chars.any(|ch| !(ch == '_' || ch.is_ascii_alphanumeric())) {
        return Err(AgentRuntimeError::InvalidEnvKey(key.to_string()));
    }
    Ok(())
}

fn read_store(path: &Path) -> Result<AgentRuntimeStore, AgentRuntimeError> {
    match std::fs::read_to_string(path) {
        Ok(content) => Ok(serde_json::from_str(&content)?),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(AgentRuntimeStore::default()),
        Err(err) => Err(err.into()),
    }
}

fn write_store(path: &Path, store: &AgentRuntimeStore) -> Result<(), AgentRuntimeError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, serde_json::to_string_pretty(store)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use executors::executors::{AppendPrompt, kimi::KimiCode};

    use super::*;

    fn model_agent(model: Option<&str>) -> CodingAgent {
        CodingAgent::KimiCode(KimiCode {
            append_prompt: AppendPrompt::default(),
            model: model.map(str::to_string),
            yolo: None,
            cmd: Default::default(),
        })
    }

    #[test]
    fn env_key_validation_accepts_shell_safe_names() {
        let mut env = HashMap::new();
        env.insert("OPENAI_API_KEY".to_string(), "secret".to_string());
        env.insert("_CUSTOM_1".to_string(), "secret".to_string());

        assert!(validate_env_json(&env).is_ok());
    }

    #[test]
    fn env_key_validation_rejects_invalid_names() {
        let mut env = HashMap::new();
        env.insert("BAD-NAME".to_string(), "secret".to_string());

        assert!(matches!(
            validate_env_json(&env),
            Err(AgentRuntimeError::InvalidEnvKey(key)) if key == "BAD-NAME"
        ));
    }

    #[test]
    fn env_summary_includes_values() {
        let mut env = HashMap::new();
        env.insert("OPENAI_API_KEY".to_string(), "sk-test".to_string());

        let summary = summarize_env(&env);

        assert_eq!(summary[0].key, "OPENAI_API_KEY");
        assert_eq!(summary[0].value, "sk-test");
    }

    #[test]
    fn cli_version_output_prefers_stdout_and_trims() {
        let version =
            normalize_cli_version_output(b"\n codex-cli 0.125.0 \n", b"npm notice ignored\n");

        assert_eq!(version.as_deref(), Some("codex-cli 0.125.0"));
    }

    #[test]
    fn cli_version_output_falls_back_to_stderr() {
        let version = normalize_cli_version_output(b"", b"\nclaude-code 2.1.74\n");

        assert_eq!(version.as_deref(), Some("claude-code 2.1.74"));
    }

    #[test]
    fn discovery_update_version_prefers_detected_then_cached() {
        let runner = BaseCodingAgent::Opencode;
        let mut store = AgentRuntimeStore::default();
        store.discoveries.insert(
            runner,
            AgentRuntimeDiscovery {
                models: vec!["openai/gpt-5.4".to_string()],
                version: Some("opencode 1.2.23".to_string()),
                last_checked_at: Utc::now(),
                last_error: None,
            },
        );

        assert_eq!(
            version_for_discovery_update(&store, runner, Some("opencode 1.2.24".to_string()))
                .as_deref(),
            Some("opencode 1.2.24")
        );
        assert_eq!(
            version_for_discovery_update(&store, runner, None).as_deref(),
            Some("opencode 1.2.23")
        );
    }

    #[test]
    fn refresh_failure_preserves_old_discovery_models() {
        let runner = BaseCodingAgent::Opencode;
        let mut configs = HashMap::new();
        configs.insert(
            runner,
            AgentRuntimeDiscovery {
                models: vec!["openai/gpt-5.4".to_string()],
                version: None,
                last_checked_at: Utc::now(),
                last_error: None,
            },
        );
        let store = AgentRuntimeStore {
            configs: HashMap::new(),
            discoveries: configs,
        };
        let executor_config = ExecutorConfig::new_with_default(model_agent(None));

        let models = models_for_runner(runner, &executor_config, &store);

        assert_eq!(models, vec!["openai/gpt-5.4"]);
    }

    #[test]
    fn aggregation_returns_runner_config_and_models() {
        let runner = BaseCodingAgent::KimiCode;
        let mut executors = HashMap::new();
        executors.insert(
            runner,
            ExecutorConfig::new_with_default(model_agent(Some("kimi-k2.5"))),
        );
        let profiles = ExecutorConfigs { executors };
        let mut runtime = default_config(runner);
        runtime.run_mode = AgentRunMode::Local;
        runtime
            .env_json
            .insert("KIMI_API_KEY".to_string(), "secret".to_string());
        let mut store = AgentRuntimeStore::default();
        store.configs.insert(runner, runtime);

        let statuses = build_statuses(&profiles, &store);

        assert_eq!(statuses.len(), 1);
        assert_eq!(statuses[0].runner_type, runner);
        assert_eq!(statuses[0].run_mode, AgentRunMode::Local);
        assert_eq!(statuses[0].discovered_models, vec!["kimi-k2.5"]);
        assert_eq!(statuses[0].env_summary[0].value, "secret");
    }

    #[test]
    fn config_store_round_trips_runtime_fields() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("runtime.json");
        let runner = BaseCodingAgent::KimiCode;
        let mut runtime = default_config(runner);
        runtime.run_mode = AgentRunMode::Disabled;
        runtime.executor_options = serde_json::json!({
            "yolo": true,
            "cmd": {
                "base_command_override": "kimi-dev"
            }
        });
        runtime
            .env_json
            .insert("KIMI_API_KEY".to_string(), "secret".to_string());
        let mut store = AgentRuntimeStore::default();
        store.configs.insert(runner, runtime);

        write_store(&path, &store).unwrap();
        let restored = read_store(&path).unwrap();

        let restored_config = restored.configs.get(&runner).unwrap();
        assert_eq!(restored_config.runner_type, runner);
        assert_eq!(restored_config.run_mode, AgentRunMode::Disabled);
        assert_eq!(restored_config.env_json["KIMI_API_KEY"], "secret");
        assert_eq!(restored_config.executor_options["yolo"], true);
    }

    #[test]
    fn executor_options_merge_into_default_executor() {
        let runner = BaseCodingAgent::KimiCode;
        let mut runtime = default_config(runner);
        runtime.executor_options = serde_json::json!({
            "model": "kimi-k2.6",
            "yolo": true
        });
        let mut store = AgentRuntimeStore::default();
        store.configs.insert(runner, runtime);
        let mut executor = model_agent(Some("gpt-5.4"));
        let mut env = ExecutionEnv::new(Default::default(), false, String::new());

        apply_config_to_executor_and_env(runner, &mut executor, &mut env, &store).unwrap();

        assert_eq!(model_name(&executor), Some("kimi-k2.6"));
        let CodingAgent::KimiCode(config) = executor else {
            panic!("expected KimiCode executor");
        };
        assert_eq!(config.yolo, Some(true));
    }

    #[test]
    fn session_env_wins_over_agent_env_on_conflict() {
        let runner = BaseCodingAgent::KimiCode;
        let mut runtime = default_config(runner);
        runtime
            .env_json
            .insert("VK_CHAT_SESSION_ID".to_string(), "agent".to_string());
        runtime
            .env_json
            .insert("OPENAI_API_KEY".to_string(), "agent-key".to_string());
        let mut store = AgentRuntimeStore::default();
        store.configs.insert(runner, runtime);
        let mut executor = model_agent(None);
        let mut env = ExecutionEnv::new(Default::default(), false, String::new());
        env.insert("VK_CHAT_SESSION_ID", "session");

        apply_config_to_executor_and_env(runner, &mut executor, &mut env, &store).unwrap();

        assert_eq!(
            env.get("VK_CHAT_SESSION_ID").map(String::as_str),
            Some("session")
        );
        assert_eq!(
            env.get("OPENAI_API_KEY").map(String::as_str),
            Some("agent-key")
        );
    }

    #[test]
    fn serialized_runtime_status_has_no_model_override_or_reasoning_level() {
        let status = AgentRuntimeStatus {
            runner_type: BaseCodingAgent::Codex,
            installed: true,
            executable: true,
            availability: AvailabilityInfo::InstallationFound,
            discovered_models: vec!["gpt-5.5".to_string()],
            version: None,
            last_checked_at: None,
            last_error: None,
            run_mode: AgentRunMode::Auto,
            env_summary: Vec::new(),
            executor_options: serde_json::json!({ "ask_for_approval": "never" }),
        };

        let value = serde_json::to_value(status).unwrap();

        assert!(value.get("model_override").is_none());
        assert!(value.get("reasoning_level").is_none());
        assert!(value.get("model_reasoning_effort").is_none());
        assert_eq!(value["executor_options"]["ask_for_approval"], "never");
    }
}
