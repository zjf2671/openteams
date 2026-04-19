# Workflow Mode for OpenTeams

## 背景与最新约束

根据最新要求，workflow mode 要从“群聊中的一种协作风格”升级为“一套独立执行系统”，并满足以下约束：

- 群聊里一个 workflow 只保留一张 workflow card
- workflow 进行中，这张卡用于展示实时状态；workflow 完成后，这张卡转为 work item card
- 执行计划的真实源数据是 React Flow 可直接消费的 workflow JSON，而不是前端临时拼装的数据结构
- workflow JSON 必须可确定性地编译成 step/edge/state-machine 可执行数据
- workflow window 是执行过程主界面，用户可随时在其中打断 agent
- lead 与子 agent 之间不再使用当前群聊 structured JSON 协议，而转向更高效的内部通信协议
- 子 agent 内部同意使用 workflow step 协议
- workflow window 聊天区还要承载审批、权限申请、确认 UI
- 执行中的计划允许被用户发起调整请求，但 workflow JSON 实际修改权只属于 lead；并且 workflow JSON 只能在流程已暂停，或发生异常失败且所有 agent 都已回到 `idle` 后才允许修改。一旦 JSON revision 变化，前端图和步骤状态要跟着刷新
- 必须有全局停止按钮，可暂停整个 workflow 下所有任务

这意味着系统需要同时解决三件事：

1. workflow 的真实执行模型
2. workflow window 的中断/审批交互
3. workflow JSON 变更后的重新编译、校验和前端增量刷新

## 核心修订

## 1. 群聊平面只保留一个 workflow card

workflow mode 下，群聊流中一个 workflow 从“计划预览”到“执行完成”只对应一条卡片型消息，不再出现多条过程投影。

### 生命周期

- session agent 在现有结构化回复数组中输出 `{"type": "workflow_generate", "content": ""}` -> 触发 workflow 二段式计划生成链路
- 系统解析这条 structured message 后，向同一个 session agent 追加一条 follow-up 消息，并附带完整的 plan JSON schema 定义，要求其返回严格符合 schema 的 `plan_json`
- `plan_json` 完成校验和 compile 后 -> 创建或更新唯一一张 `workflow card`，并让 workflow window 进入可预览、未执行的 `ready` 态
- 用户在 card 或 workflow window 中点击“执行” -> 创建 `workflow execution`，并向 workflow lead 发送 execution kickoff 消息
- workflow 运行中 -> 该 card 随状态实时更新
- workflow 完成 -> 同一张 card 切换为 `work item card`
- lead 再补一条最终交付消息或把结论嵌入该卡片展开区

### 设计含义

- workflow card 先承载计划预览，执行开始后再承载 execution 投影，但整个生命周期始终只有这一张卡
- `workflow_generate` 是 session agent 结构化回复中的控制信号项，可与 `send` / `artifact` 并列出现，`content` 可以为空
- `workflow_generate` 只表示“进入 plan 生成第二段”，不表示“立即执行”
- `chat_work_items` 只在完成时生成一次，由 lead 汇总输出
- 群聊保持极简，只展示：讨论、计划预览、执行进度、完成

### 建议数据实现

建议给 workflow card 绑定一个稳定消息 id，不在执行过程中反复生成新消息，而是更新其 `message.meta` 投影数据：

- `card_type: workflow`
- `workflow_plan_id`
- `active_revision_id`
- `workflow_execution_id` nullable，执行前为空
- `display_state`
- `progress_summary`
- `work_item_generated`

当 plan 进入 `ready` 时，这张 card 就应被创建出来；当用户真正启动 execution 时，仅回填 `workflow_execution_id` 并切换 `display_state`。当 execution 进入完成态时，前端把该 card 视图切换为 work item card 外观；后端再写入对应 `chat_work_items`，实现数据上的最终归档。

## 2. React Flow workflow JSON 是计划真相源，step/edge 是执行编译产物

这是本次架构里最关键的真相分层。

### 2.1 真相源

建议把计划定义保存在 `chat_workflow_plans.plan_json` 中，使用 React Flow 友好的 `nodes` / `edges` JSON 结构作为唯一真相源。

新增字段建议：

- `plan_json`
- `plan_schema_version`
- `plan_hash`
- `compiled_graph_hash`
- `validation_status`
- `validation_errors_json`

### 2.2 编译产物

workflow JSON 经过后端 compiler 转成可执行图：

- `chat_workflow_executions`
- `chat_workflow_steps`
- `chat_workflow_step_edges`

建议新增 `workflow_plan_compiler` 服务，职责是：

- JSON schema 校验
- 语义校验
- DAG 编译
- 默认值补全
- 编译产物 hash 计算
- 返回前端可渲染 graph model

### 2.3 推荐 JSON 结构

建议 workflow JSON 至少包含以下块：

- `version`
- `title`
- `agents`
- `globals`
- `viewport`
- `nodes`
- `edges`
- `policies`

这里需要强调一条设计原则：

- JSON 的字段结构、必填项、枚举值、默认值由系统定义
- 大模型只负责填充具体业务内容，例如步骤标题、步骤说明、负责人、依赖关系
- 大模型不能自由发明 schema 外字段

也就是说，模型生成的是“符合系统 schema 的 workflow plan JSON”，而不是自由格式文本。

### 2.3.1 系统定义的 JSON Schema 契约

MVP 建议先把 schema 控制在一版稳定格式，避免过早开放。

顶层字段定义建议如下：

- `version`: number，必填，当前固定为 `1`
- `title`: string，必填，workflow 标题
- `goal`: string，必填，任务目标
- `agents`: object，必填，定义 lead 和可分配成员
- `globals`: object，可选，定义全局执行策略
- `viewport`: object，可选，定义 React Flow 初始视口
- `nodes`: array，必填，节点列表
- `edges`: array，必填，依赖关系
- `policies`: object，可选，定义审批、权限、失败处理策略

`agents` 子结构建议固定为：

- `lead`: string，必填，对应团队中预设的 lead agent 标识；session 创建时应从 AI 团队配置解析出来
- `available`: string array，必填，可分配的子 agent 标识列表

这里补充一条实现约束：

- 长期设计上，lead agent 的选择来源于 AI 团队数据，而不是运行时临时推断
- 团队/预设成员数据需要显式保存谁是 lead，session 创建后再映射为 `lead_session_agent_id`
- Phase 1b 过渡期内，在 AI 团队数据尚未完成 lead 字段改造前，后端允许临时回退为“取当前 session 中第一个 `ChatSessionAgent` 作为 lead”
- 该回退仅用于兼容当前实现，不应作为最终稳定契约

`viewport` 建议固定为：

- `x`: number，可选，默认 `0`
- `y`: number，可选，默认 `0`
- `zoom`: number，可选，默认 `1`

`nodes` 中每个节点建议直接对齐 React Flow Node 结构：

- `id`: string，必填，全局唯一，对应 step key
- `type`: string，必填，React Flow 节点类型，MVP 固定为 `workflowStep`
- `position`: object，必填，包含 `x` / `y`；允许 lead 生成初始位置，compiler 也可在缺省时做规范化布局
- `data.stepType`: enum，必填，`task | review | result | approval`
- `data.agentId`: string，可选，分配给哪个 agent；`result` 节点可为空并默认归 lead
- `data.title`: string，必填
- `data.instructions`: string，必填
- `data.acceptance`: string array，可选，完成判定标准
- `data.outputs`: string array，可选，预期输出
- `data.interruptible`: boolean，可选，默认 `true`
- `data.maxRetry`: number，可选，默认继承 `globals.default_retry`
- `data.status`: string，可选，仅作为前端草稿态；运行态状态以编译产物/执行态为准

其中 `data.stepType = result` 的节点需要额外约束：

- 一个 JSON plan 中必须且只能有一个 `result` 节点
- `result` 节点负责汇聚本轮 workflow round 的最终产物
- `result` 节点完成后，结果不会直接视为 execution 完成，而是必须提交给用户对 lead 交付进行接受/拒绝判定
- 用户接受后，本轮才能收口；用户拒绝后，进入下一轮 round 的重新规划

`edges` 中每条边建议直接对齐 React Flow Edge 结构：

- `id`: string，必填，全局唯一，建议使用 `${source}->${target}`
- `source`: string，必填，源节点 id
- `target`: string，必填，目标节点 id
- `type`: string，可选，MVP 固定为 `workflowEdge`
- `data.kind`: enum，可选，`hard | soft`，默认 `hard`

`policies` 中 MVP 建议仅支持以下字段：

- `approval_required_on`: string array，可选
- `permission_required_on`: string array，可选
- `on_failure`: enum，可选，`retry | wait_user | fail`
- `allow_plan_revision`: boolean，可选，默认 `true`

### 2.3.2 大模型填充边界

系统要在 prompt 和校验层同时约束模型：

- 可以填：`title`、`goal`、`nodes[].data.title`、`nodes[].data.instructions`、`nodes[].data.acceptance`、`edges`
- 不可以擅自新增未知字段
- 不可以引用团队里不存在的 agent
- 不可以生成环形依赖
- 不可以缺失必须的 `result` 收口节点

建议把这个 schema 以文档常量和程序校验同时保存：

- 文档里给人看
- Rust/TypeScript 里给编译器、runtime validator 和 React Flow adapter 使用

### 2.3.3 推荐示例

示意：

```json
{
  "version": 1,
  "title": "first round",
  "goal": "deliver the first implementation round",
  "agents": {
    "lead": "lead-agent",
    "available": ["agent-1", "agent-2", "agent-3"]
  },
  "globals": {
    "interrupt_mode": "cooperative",
    "default_retry": 1,
    "global_pause_supported": true
  },
  "viewport": {
    "x": 0,
    "y": 0,
    "zoom": 1
  },
  "nodes": [
    {
      "id": "task_1",
      "type": "workflowStep",
      "position": { "x": 0, "y": 0 },
      "data": {
        "stepType": "task",
        "agentId": "agent-1",
        "title": "Task 1",
        "instructions": "Implement part 1",
        "acceptance": ["Core logic is implemented", "Output is ready for merge"],
        "outputs": ["partial implementation"]
      }
    },
    {
      "id": "task_2",
      "type": "workflowStep",
      "position": { "x": 240, "y": 0 },
      "data": {
        "stepType": "task",
        "agentId": "agent-2",
        "title": "Task 2",
        "instructions": "Implement part 2"
      }
    },
    {
      "id": "task_3",
      "type": "workflowStep",
      "position": { "x": 120, "y": 140 },
      "data": {
        "stepType": "task",
        "agentId": "agent-1",
        "title": "Task 3",
        "instructions": "Merge outputs"
      }
    },
    {
      "id": "review",
      "type": "workflowStep",
      "position": { "x": 120, "y": 280 },
      "data": {
        "stepType": "review",
        "agentId": "agent-3",
        "title": "Review",
        "instructions": "Review final result"
      }
    },
    {
      "id": "result",
      "type": "workflowStep",
      "position": { "x": 120, "y": 420 },
      "data": {
        "stepType": "result",
        "title": "Final result",
        "instructions": "Summarise the workflow result for user delivery"
      }
    }
  ],
  "edges": [
    { "id": "task_1->task_3", "source": "task_1", "target": "task_3", "type": "workflowEdge" },
    { "id": "task_2->task_3", "source": "task_2", "target": "task_3", "type": "workflowEdge" },
    { "id": "task_3->review", "source": "task_3", "target": "review", "type": "workflowEdge" },
    { "id": "review->result", "source": "review", "target": "result", "type": "workflowEdge" }
  ],
  "policies": {
    "approval_required_on": ["permission_request", "lead_decision"],
    "on_failure": "wait_user",
    "allow_plan_revision": true
  }
}
```

### 2.3.4 编译后的约束

plan JSON 一旦通过校验并进入 compiler，系统要生成确定性的执行数据：

- 每个 `node.id` 映射唯一 `chat_workflow_steps` 记录
- 每个 `edge.id` 映射唯一 `chat_workflow_step_edges` 记录
- `result` 节点必须存在且必须是收口节点
- `result` 节点完成后必须进入系统注入的 `user_acceptance` 检查点，由用户对 lead 交付做最终决策
- `review` 节点如果存在，其后继只能是 `result` 或终态收口
- `approval` 节点不能并行触发多个冲突分支，除非 schema 后续显式支持

这里建议采用“显式 result + 隐式 user acceptance”的实现：

- plan JSON 由系统和模型共同定义的部分只写到 `result`
- compiler 在编译执行图时，自动为每一轮 round 注入一个不暴露给模型的 `user_acceptance` 系统节点
- 这样既能保持 JSON 结构稳定，又能强制保证“最终结果一定要经过用户对 lead 交付的决策”

这部分规则也应写入方案，避免后续模型生成的 JSON 虽然“结构合法”，但在执行上不可控。

### 2.4 为什么要区分 plan JSON 和 step 表

- plan JSON 便于被 lead 和 LLM 共同编辑，同时可直接复用到 React Flow 渲染层；用户只能提出修改请求，不能直接改写计划
- step/edge 表便于状态机执行与查询
- JSON revision 变更时可以重新编译，并验证新旧图差异
- 可以精确知道“当前 execution 正在运行的是哪一版 compiled graph”

## 3. 数据模型修订

## 3.1 `chat_workflow_plans`

建议字段：

- `id`
- `session_id`
- `source_message_id`
- `source_message_type`: `workflow_generate | manual`
- `workflow_card_message_id`
- `created_by_session_agent_id`
- `status`: `draft | ready | superseded | cancelled`
- `title`
- `summary_text`
- `plan_json`
- `plan_schema_version`
- `plan_hash`
- `validation_status`: `pending | valid | invalid`
- `validation_errors_json`
- `created_at`, `updated_at`

因为 workflow card 在 plan 预览阶段就已存在，所以 `workflow_card_message_id` 应归属于 `chat_workflow_plans`，而不是等到 execution 创建后再补建第二套关联。

## 3.2 `chat_workflow_plan_revisions`

因为你要求执行中允许修改 workflow JSON，建议不要覆盖原始 plan，而是追加 revision 表。

字段建议：

- `id`
- `plan_id`
- `revision_no`
- `edited_by`: `lead | system`
- `editor_session_agent_id` nullable
- `reason`
- `plan_json`
- `plan_hash`
- `validation_status`
- `validation_errors_json`
- `created_at`

这样可以完整追踪是谁改了计划、为什么改、是否通过校验。

## 3.3 `chat_workflow_executions`

字段建议：

- `id`
- `session_id`
- `plan_id`
- `active_revision_id`
- `active_round_id`
- `lead_session_agent_id`
- `status`: `pending | bootstrapping | running | interrupting | waiting_user | waiting_user_acceptance | pausing | paused | recompiling | resuming | completing | completed | failed | cancelled`
- `current_round`
- `title`
- `compiled_graph_hash`
- `started_at`, `completed_at`, `created_at`, `updated_at`

这里新增了三个关键态：

- `interrupting`：用户发起打断，系统正在收敛运行中任务
- `waiting_user_acceptance`：本轮 result 已产出，等待用户对 lead 交付执行接受或拒绝
- `recompiling`：JSON revision 改动后重新编译执行图
- `resuming`：变更后的图恢复运行前的过渡态

## 3.3.1 `chat_workflow_rounds`

为了支持用户拒绝结果后开启新一轮规划，建议新增 round 实体，而不是只依赖 `current_round` 整数。

字段建议：

- `id`
- `execution_id`
- `round_index`
- `source_revision_id`
- `status`: `running | waiting_user_acceptance | accepted | rejected | archived`
- `result_step_id` nullable
- `user_decision_summary` nullable
- `started_at`, `completed_at`, `archived_at`, `created_at`, `updated_at`

职责：

- 把每一轮的图执行、结果、最终用户决策单独归档
- 当用户拒绝结果时，上一轮 round 标记 `rejected` 并归档保存
- orchestrator 基于新的 JSON revision 创建下一轮 round，并把 `current_round` +1

## 3.4 `chat_workflow_steps`

字段建议：

- `id`
- `execution_id`
- `round_id`
- `compiled_revision_id`
- `step_key`
- `step_type`: `task | review | result | approval`
- `title`
- `instructions`
- `assigned_workflow_agent_session_id`
- `status`: `pending | ready | running | interrupt_requested | interrupted | waiting_input | waiting_review | blocked | completed | failed | skipped | cancelled`
- `retry_count`
- `max_retry`
- `round_index`
- `display_order`
- `latest_run_id` nullable
- `summary_text`
- `created_at`, `updated_at`, `started_at`, `completed_at`

新增 `interrupt_requested` / `interrupted`，用于描述用户在 workflow window 中打断步骤的过程。

## 3.5 `chat_workflow_step_edges`

保留 edge 表方案，字段不变：

- `id`
- `execution_id`
- `compiled_revision_id`
- `from_step_id`
- `to_step_id`
- `edge_kind`: `hard | soft`
- `created_at`

## 3.6 `chat_workflow_agent_sessions`

保留“每个 workflow 一套新 agent 会话”的设计，但要增强暂停/打断相关状态：

- `id`
- `workflow_execution_id`
- `session_agent_id`
- `role`: `lead | worker | reviewer`
- `agent_session_id`
- `agent_message_id` nullable
- `state`: `idle | running | interrupt_requested | interrupted | waiting_input | waiting_approval | paused | completed | failed | expired`
- `created_at`, `updated_at`

## 3.7 `chat_workflow_transcripts`

这张表要支持普通文本、审批卡、权限申请卡。

字段建议：

- `id`
- `execution_id`
- `round_id` nullable
- `workflow_agent_session_id`
- `step_id` nullable
- `sender_type`: `user | agent | system`
- `content`
- `entry_type`: `message | approval_request | permission_request | system_notice | interrupt_notice`
- `meta_json`
- `created_at`

## 3.8 `chat_workflow_events`

事件类型要补充：

- `execution_interrupt_requested`
- `execution_interrupted`
- `execution_pause_requested`
- `execution_paused`
- `execution_resume_requested`
- `round_started`
- `round_result_ready`
- `user_acceptance_requested`
- `lead_accepted`
- `lead_rejected`
- `round_archived`
- `plan_revision_created`
- `plan_recompiled`
- `approval_requested`
- `approval_resolved`
- `permission_requested`
- `permission_resolved`

## 3.9 lead 的角色定义

这里需要明确回答：lead 在执行阶段既不是纯逻辑虚拟角色，也不是直接负责调度的系统组件。

推荐定义：

- lead 是团队中的真实 agent，拥有自己的 `workflow_agent_session`
- orchestrator 才是唯一调度者，负责 step 选择、运行触发、状态迁移、失败兜底
- lead 只在以下场景被显式唤起运行：生成/修订 workflow JSON、处理 review 汇总、请求审批、输出最终结果
- 用户可以请求变更计划，但 orchestrator 只能把请求交给 lead，由 lead 产出新的 JSON revision
- lead 不直接给子 agent 发消息，也不持有调度循环

因此职责边界是：

- lead = 规划者、评审者、汇总者
- orchestrator = 调度者、记账者、容错者

### 3.9.1 lead 的选择来源

- lead 必须是团队配置中的显式角色，而不是 execution 启动时现算出来的隐式角色
- AI 团队成员数据需要补充 lead 标记，session 初始化时据此确定 lead，并写入 execution 的 `lead_session_agent_id`
- `workflow_generate` 触发的二段式 plan generation 与后续 plan revision、review/result 汇总都应收敛到同一个 workflow lead；如果第一段 `workflow_generate` 由非 lead session agent 发出，系统必须在进入第二段 schema follow-up 前先完成 lead 映射
- Phase 1b 可以暂时保留“若团队数据未完成迁移，则回退为当前 session 中第一个 `ChatSessionAgent`”的兼容逻辑
- 兼容逻辑应在团队数据完成升级后删除，避免 lead 选择与团队配置漂移

### 3.9.2 pause all 对 lead 的影响

- 如果 lead 当前没有运行中的 step，`pause all` 不会额外产生 lead run，只会让 lead session 保持 `idle` 或进入 `paused` 投影态
- 如果 lead 正在执行 `review` / `result` / `replan` 类 step，则它和其他 agent 一样要被暂停
- `pause all` 后不允许 orchestrator 自动再次唤起 lead，直到 execution 被 `resume`

### 3.9.3 MVP 并发约束

MVP 明确限制：一个 `workflow_agent_session` 同时最多只运行一个 step。

这样可以避免：

- 一个 agent 输出绑定多个 step
- interrupt 时无法判断要中断哪个 step
- transcript 与 step 归属不清

## 4. workflow window 交互模型

结合 `workflow_window.png`，建议 workflow window 由两大区域组成：

- 左侧：workflow graph
- 右侧：工作聊天与控制面板

### 4.1 左侧 workflow graph

展示：

- 当前 round 标题
- lead -> task -> review -> result 的图
- 每个节点当前状态
- 节点负责人 agent
- 节点是否被打断、暂停、等待审批

图数据完全来自最新 compiled revision。

技术选型建议直接定为：

- 渲染层：`React Flow`，作为 workflow graph 的默认实现
- 布局层：MVP 先用 `dagre`，为后续切换 `elkjs` 预留 adapter
- 数据契约：前端直接消费 `nodes` / `edges` / `viewport` 组成的 JSON，不再额外维护文本转图的浏览器端转换链路
- 增量刷新：后端按 `node.id` / `edge.id` 推送 patch，前端在 React Flow store 中做局部替换，避免整图重绘

当 round 被拒绝并进入下一轮时，左侧 graph 默认显示当前 active round，同时允许用户切换查看已归档的历史 round。

如果 execution 尚未创建，但 plan 已进入 `ready`，左侧 graph 仍应基于 `plan_json` 渲染预览态；此时 graph 的节点状态来自 validation/compile 结果，而不是运行态 step 状态。

### 4.2 右侧 agent 工作聊天窗

分为两种状态：

- 预览态：展示 plan 摘要、lead 规划说明、validation 结果，以及主执行按钮；不展示 running transcript，也不允许发送执行期输入
- 执行态：展示 agent selector、当前 agent/step transcript、实时 running message、底部输入框，以及 `interrupt` / `retry` / `pause all` / `resume` 控制按钮

其中执行态应包含：

- agent selector，例如图里的 `change agent`
- 当前 agent/step transcript
- 实时 running message
- 底部输入框
- 控制按钮：interrupt、retry、pause all、resume

### 4.3 聊天窗中的确认 UI

这部分是新增重点。

lead 在 workflow 内产生的以下事项，不能只显示纯文本：

- 决策审批
- 权限申请
- 继续执行确认
- 计划变更确认

建议前端渲染为专门的 transcript card：

- `ApprovalCard`
- `PermissionRequestCard`
- `InterruptConfirmCard`
- `PlanRevisionConfirmCard`
- `LeadResultDecisionCard`

这些卡的交互结果再写回：

- `chat_workflow_transcripts`
- `chat_workflow_events`
- 对应 execution/step 状态迁移

其中 `LeadResultDecisionCard` 是本次补充的关键卡片：

- 展示本轮 `result` 汇总内容
- 展示 lead agent 汇总后的结果与建议，由用户选择 `accept` 或 `reject`
- `accept` -> execution 进入完成收口
- `reject` -> 当前 round 归档，lead 进入 replan，并开启下一轮 round

## 5. 中断模型

你明确提出用户可以在 workflow window 中随时打断 agent，所以必须把 interrupt 作为一等能力，而不是等价于 pause。

### 5.1 区分三种控制动作

#### `interrupt step`

- 作用域：当前 agent 或当前 step
- 语义：尽快终止当前运行，保留 execution，不影响其他已完成节点
- 结果：step 进入 `interrupt_requested -> interrupted`

#### `pause all`

- 作用域：整个 workflow
- 语义：暂停所有可暂停中的 step，不继续调度新 step
- 结果：execution 进入 `pausing -> paused`

#### `stop execution`

- 作用域：整个 workflow
- 语义：全局终止，不再恢复
- 结果：execution 进入 `cancelled`

你提到“全局停止按钮，可以暂停所有任务”，语义上更接近 `pause all`，建议按钮文案和内部状态机分开：

- UI 文案可以叫“停止全部”
- 后端实际映射为 `pause all`

这样后续还可以再补一个真正不可恢复的 `terminate`。

### 5.2 中断执行流程

建议后端流程：

1. 用户点击 interrupt
2. execution 或 step 进入 `interrupt_requested`
3. orchestrator 向对应 executor 发 cancel/stop 信号
4. agent session 标记 `interrupt_requested`
5. 收到运行终止确认后，step/session 标记 `interrupted`
6. 若用户请求修改计划并被 lead 接纳为新 revision，则进入 `recompiling`
7. 若用户不修改，则可直接重新调度或恢复

### 5.3 中断一致性要求

需要保证：

- 新 step 调度在 `interrupting/pausing/recompiling` 状态下被禁止
- 中断中的 run 不得再产生“完成”态推进后继节点
- 迟到输出只能写 transcript，不得推进状态机，除非 run token 与当前 active execution cursor 匹配

建议为每个运行中的 step 引入 `execution_cursor` 或 `generation` 概念，防止旧输出污染新图。

## 5.6 round 生命周期

每个 workflow execution 可以包含多轮 round，但任一时刻只能有一个 active round。

推荐生命周期：

1. execution 启动时创建 `round_1`
2. round 内 task/review/result 依图执行
3. `result` 节点完成后，execution 进入 `waiting_user_acceptance`
4. 用户接受 lead 交付：当前 round 标记 `accepted`，execution 进入 `completing -> completed`
5. 用户拒绝当前结果：当前 round 标记 `rejected`，随后 `archived`，execution 显式进入 `paused`
6. lead 在 `paused` 状态下生成新的 JSON revision；若 replan 失败，execution 保持 `paused` 等待人工处理
7. compiler 基于新 revision 执行 `recompiling`，创建下一轮 `round_n+1`
8. execution 经过 `resuming -> running` 回到新一轮执行

这保证了“拒绝结果 != 整个 workflow 失败”，而是进入可追踪的新一轮执行。

## 5.4 Orchestrator 内部架构

orchestrator 是 workflow mode 的核心组件，MVP 不建议设计成独立进程集群，而是先作为 `crates/services` 中的新服务模块落地，由现有服务进程托管。

建议命名：

- `workflow_orchestrator.rs`

### 5.4.1 组件职责拆分

orchestrator 内部建议拆成四层：

1. `command handler`
   - 接收 API 命令：start、pause all、interrupt、resume、retry、approve、submit input
   - 做权限校验和幂等校验
2. `state reducer`
   - 负责 execution/step/agent session 状态迁移
   - 所有状态改变都必须经过 reducer
3. `scheduler loop`
   - 找到当前所有 `ready` step
   - 检查 execution 是否允许调度
   - 触发对应 agent run
4. `event projector`
   - 写入 `chat_workflow_events`
   - 推送 WebSocket 事件
   - 更新 workflow card 投影

### 5.4.2 事件源与驱动方式

MVP 采用“数据库持久化 + 事件驱动唤醒 + 容错轮询补偿”的简单模型：

- 真相源：`chat_workflow_executions`、`chat_workflow_steps`、`chat_workflow_agent_sessions`
- 审计流：`chat_workflow_events`
- 实时触发：API 命令、agent run 完成回调、step 协议消息、审批结果
- 补偿机制：定时扫描 `running/interrupting/pausing/recompiling` execution，处理遗漏事件和超时

也就是说，不做纯轮询，也不做重型事件总线；先做“写库成功后立即唤醒 orchestrator，再用定时任务兜底”。

### 5.4.3 调度循环

建议每次被唤醒时执行以下流程：

1. 读取 execution 当前状态和 active revision
2. 如果 execution 不在可调度状态，直接退出
3. 收集已完成/失败/中断的 step 状态
4. 计算 DAG 中满足依赖的 `ready` step
5. 过滤掉 agent session 忙碌、execution 正在 `pausing/interrupting/recompiling` 的 step
6. 为可运行 step 创建 run，并把状态置为 `running`
7. 监听 run 结果并回写 reducer
8. 如果发现 execution 已无未终态 step，则进入 `completing`

### 5.4.4 容错与恢复

需要覆盖三类故障：

- orchestrator 进程崩溃
- DB 写成功但 WebSocket 推送失败
- run 已结束但回调丢失

MVP 恢复策略：

- 服务启动时扫描所有非终态 execution，重新投递给 orchestrator
- WebSocket 只做投影，推送失败不影响真相源
- 定时任务扫描 `running` step 的 `latest_run_id`，发现 run 已结束但 step 未收敛时，触发补偿收敛

### 5.4.5 与 `chat_runner` 的关系

- `chat_runner` 继续负责单次 agent run 的执行、日志、stdout/stderr 捕获、run 生命周期
- `workflow_orchestrator` 负责何时启动哪个 run、如何解释 step 协议、如何推进工作流状态机
- 二者关系是“orchestrator 编排 chat_runner”，不是替代关系

## 5.5 MVP 范围收敛

根据复杂度评估，MVP 增加两条硬限制：

- 只允许在 `paused` 状态下修改 workflow JSON，不支持 `running` 时热修改
- Phase 1 不支持 `approval` 作为独立 step type，只支持 transcript 内的审批卡交互

这样可以显著降低 reconcile 和三层状态机的组合复杂度。

## 6. 内部通信协议修订

## 6.1 lead 对用户

保持现有 structured JSON 输出协议，仅用于群聊对用户的最终交付和必要外显消息。

### 6.1.1 新增 `workflow_generate` 外显消息类型

- 在现有 session agent 回复消息数组中新增 `type: "workflow_generate"`，与 `send`、`artifact` 等消息并列
- `workflow_generate` 本身不是 plan JSON；它只是告诉系统“请对当前 agent 发起第二段 plan generation follow-up”
- 该项允许 `content` 为空字符串；真正的 plan 结构由后续 follow-up prompt 约束生成
- 如果同一轮 agent 回复同时包含 `send`、`artifact` 与 `workflow_generate`，前两者照常写入群聊/工件流，`workflow_generate` 只进入 workflow 计划生成管线

### 6.1.2 `workflow_generate` 二段式计划生成链路

建议固定为以下步骤：

1. session agent 完成常规 chat reply run，并返回结构化消息数组
2. 解析该数组；若发现 `type === "workflow_generate"`，则保留同轮的 `send` / `artifact` 输出，同时进入第二段 plan generation
3. 系统向同一个 session agent 发送 follow-up 消息，消息中必须内嵌当前版本 plan JSON schema 的具体定义，并要求 agent 只返回 schema 合法的 `plan_json`
4. 将该 session agent 返回的 `plan_json` 写入 `chat_workflow_plans` 与 `chat_workflow_plan_revisions`
5. 执行 schema 校验、语义校验和 compile；若失败，则保留 `status = draft`、写入 `validation_status = invalid`，并把错误回写到 plan/card 上
6. 校验通过后，生成 workflow card 与 workflow window 的预览态

这里要明确区分三类 run：

- `chat_reply_run`：session agent 的第一段常规回复，可同时产出 `send` / `artifact` / `workflow_generate`
- `plan_generation_run`：检测到 `workflow_generate` 后，对同一 session agent 发起的第二段 schema-guided 生成，只负责输出 `plan_json`
- `execution_run`：只有用户点击执行后才允许启动，负责真正进入 workflow 执行态

### 6.1.3 用户显式执行门控

- workflow card 和 workflow window 必须共用同一条执行入口，推荐定义为 `POST /workflow-plans/:plan_id/execute`
- 只有用户点击 card 或 workflow window 中的“执行”按钮后，系统才创建 `workflow_execution`
- 只有 `workflow_execution` 创建成功后，系统才允许给 workflow lead 发送 execution kickoff 消息，并交由 orchestrator 继续调度 worker step
- 这条执行入口必须具备幂等保护，避免用户双击或双端操作导致同一 plan 被重复启动

## 6.2 lead 与子 agent

前期不引入 A2A、Agent SDK 这类额外协议层，先做最小可运行版本。

MVP 建议：

- 继续复用 OpenTeams 现有 agent run/executor 能力
- 由 orchestrator 直接给目标 workflow agent session 下发 step 指令
- agent 的过程输出写入 `chat_workflow_transcripts`
- 中断、恢复、补充输入先通过服务端命令和 session 状态控制实现

也就是说，第一版先采用“平台内直连调度”模型，而不是设计独立的 agent-to-agent transport。

这样做的好处：

- 改动面更小
- 更容易复用现有 `chat_runner` 和 executor 生命周期管理
- 可以先验证 workflow window、JSON 编译、打断/暂停是否好用
- 未来如果确实需要，再把这一层抽象成独立 transport

## 6.3 子 agent 内部 step 协议

你已同意这部分，建议定义为轻量、确定性的 workflow step 协议，而非全文自由文本。

至少包括：

- `status_update`
- `partial_result`
- `final_result`
- `request_input`
- `approval_request`
- `permission_request`
- `error`

这套协议的目标不是展示给用户，而是让 orchestrator 能稳定理解 agent 当前意图。

### 6.3.1 建议消息格式

MVP 直接使用 JSON 文本消息，不引入 protobuf 或额外传输协议。

固定结构建议为：

```json
{
  "type": "final_result",
  "step_key": "task_3",
  "execution_id": "<uuid>",
  "summary": "merged task 1 and task 2 outputs",
  "content": "detailed result text",
  "outputs": ["src/foo.ts", "src/bar.ts"]
}
```

注入给 agent 的上下文至少包含：

- `execution_id`
- `step_key`
- `step_type`
- `instructions`
- `acceptance`
- `allowed_output_types`

这样 agent 永远知道自己在执行哪个 step，orchestrator 也能把输出确定性绑定回 step。

## 7. workflow JSON 可变更执行模型

这是最容易失控的一块，必须明确“改 JSON revision 不等于直接改数据库步骤”。

### 7.1 推荐机制：revision + compile + reconcile

流程建议：

1. 用户提出 workflow JSON 调整请求，或 lead 主动决定修订计划
2. lead 生成新的 JSON revision
3. 创建 `chat_workflow_plan_revisions`
4. schema 校验 + 语义校验
5. 编译生成新 graph
6. 进入 reconcile：比较旧 graph 与新 graph
7. 对未开始节点进行替换，对运行中节点要求先 interrupt/pause
8. 更新 execution 的 `active_revision_id`
9. 推送新的 graph 给前端

MVP 进一步限制为：只有满足以下两个条件之一，且 revision 由 lead 产生，才允许创建可生效的 revision 并执行 reconcile：

- execution 已进入 `paused`
- execution 处于异常失败处理阶段，且所有 `workflow_agent_session` 都已收敛到 `idle`

换句话说，只要流程还在运行、还有 agent 未收敛，workflow JSON 就绝对不可修改。

### 7.2 reconcile 规则

reconcile 必须基于 `step_key` 做 diff，并明确 key 相同但内容变化时的语义。

MVP 规则：

- `step_key` 相同且 `type` 不变：视为“同一 step 被更新”
- `step_key` 相同但 `type` 改变：视为“删旧增新”
- `step_key` 不存在于新 revision：视为删除
- `step_key` 只存在于新 revision：视为新增

### 7.2.1 分类表

| 旧状态 | 变更类型 | 动作 |
|---|---|---|
| `pending` / `blocked` | 内容更新 | 原地更新 step 定义，重新计算依赖 |
| `pending` / `blocked` | 删除 | 标记 `cancelled` |
| `pending` / `blocked` | 新增后继/前驱 | 重新计算 readiness |
| `ready` | 内容更新 | 回退为 `pending`，重新检查是否仍满足 ready |
| `ready` | 删除 | 标记 `cancelled` |
| `running` | 任意结构变化 | MVP 不允许；必须先 `pause all` 并等待 step 收敛 |
| `interrupted` | 内容更新 | 原地更新，可等待后续 resume |
| `completed` | instructions/acceptance 更新 | 保持 `completed`，但记录 `semantic_drift` 事件，不自动重跑 |
| `completed` | agent 变更 | 保持历史 transcript 归原 agent；只影响未来 revision 的重新执行 |
| `completed` | 删除 | 保持 `completed`，但从新 graph 投影中移除，记录 `orphaned_completed_step` 事件 |
| `failed` | 内容更新 | 允许保留失败历史并创建可重试的新定义 |
| 任意状态 | `type` 变化 | 视为删旧增新 |

### 7.2.2 特殊边界说明

- 删除 `running` step 的后继节点：MVP 不允许在该 step 运行时生效，必须先 `pause all`
- 改变已完成 step 的 `acceptance`：不回滚已完成状态，只记录语义漂移并要求用户知情
- 已完成 step 更换 agent：不迁移旧 transcript 归属，历史事实不改写
- key 相同但 instructions 完全不同：仍按“原地更新”处理，但如果 step 已完成，仅记录漂移；如果未完成，则按新定义继续

### 7.2.3 round 归档规则

当用户拒绝本轮结果时：

- 当前 round 下的 steps/transcripts/events 保留，不删除、不覆盖
- round 状态更新为 `rejected`，随后写入 `archived_at`
- workflow card 的主视图切换到下一轮 active round，但允许查看历史 round
- `chat_work_items` 仍然不在此时生成，只有整个 execution 最终被用户接受后才统一生成

### 7.3 workflow JSON 准确性保障

必须做三层校验：

#### 结构校验

- schema version
- 必填字段
- 字段类型
- 唯一 step key

#### 语义校验

- agent 是否存在于当前团队
- lead 是否唯一
- edge 是否引用存在节点
- DAG 是否无环
- review/result 是否满足最小约束

#### 执行校验

- 修改后是否会破坏当前已完成节点语义
- 修改后是否存在不可恢复状态冲突
- 修改是否需要用户确认或强制中断

只有全部通过，才允许切换 active revision。

## 8. 全局停止按钮

你要求任务流有全局停止按钮，这里建议实现为 execution 级控制命令。

### 控制语义

- 前端按钮：`停止全部`
- 后端命令：`pause_all`

### 后端行为

- execution 进入 `pausing`
- orchestrator 停止下发新 step
- 对所有 `running` 的 workflow agent session 发暂停/中断请求
- 全部收敛后，execution 进入 `paused`
- 前端显示“已暂停，可恢复/修改计划”

### 为什么默认做 pause 而不是 cancel

- 你希望用户能中断后修改 workflow JSON
- pause 更适合作为计划编辑前置状态
- cancel 适合不可恢复终止，后续可单独增加

## 9. API 与事件契约修订

### REST API

- `POST /workflow-plans`
- `GET /workflow-plans/:plan_id`
- `POST /workflow-plans/:plan_id/revisions`
- `POST /workflow-plans/:plan_id/validate`
- `POST /workflow-plans/:plan_id/compile`
- `GET /workflow-plans/:plan_id/graph`
- `POST /workflow-plans/:plan_id/execute`
- `POST /workflow-executions`
- `GET /workflow-executions/:execution_id`
- `GET /workflow-executions/:execution_id/graph`
- `GET /workflow-executions/:execution_id/transcripts`
- `POST /workflow-executions/:execution_id/input`
- `POST /workflow-executions/:execution_id/interrupt`
- `POST /workflow-executions/:execution_id/pause-all`
- `POST /workflow-executions/:execution_id/resume`
- `POST /workflow-executions/:execution_id/stop`
- `POST /workflow-executions/:execution_id/approve`
- `POST /workflow-executions/:execution_id/resolve-permission`
- `POST /workflow-steps/:step_id/retry`

### WebSocket 事件

- `workflow_execution_updated`
- `workflow_graph_updated`
- `workflow_step_updated`
- `workflow_transcript_appended`
- `workflow_event_new`
- `workflow_approval_requested`
- `workflow_permission_requested`
- `workflow_interrupt_requested`
- `workflow_paused`
- `workflow_resumed`

其中 `workflow_graph_updated` 很关键，它用于 JSON revision 生效后让前端立即刷新节点图。

## 10. 状态机修订

## 10.1 Execution 状态机

```text
pending -> bootstrapping -> running
bootstrapping -> failed
running -> interrupting -> waiting_user
running -> waiting_user_acceptance
running -> pausing -> paused
waiting_user -> running
paused -> recompiling -> resuming -> running
waiting_user_acceptance -> completing -> completed
waiting_user_acceptance -> paused -> recompiling -> resuming -> running
running -> completing -> completed
running -> failed
paused -> cancelled
waiting_user -> cancelled
```

守卫条件：

- `interrupting` 优先级高于单个 step 完成事件；进入该态后，新完成事件只允许收敛当前 step，不允许推进后继
- `waiting_user_acceptance` 下禁止调度任何新 step
- `recompiling` 只能从 `paused` 进入，禁止和 `interrupting` 并发发生
- 当用户拒绝结果并要求重规划时，必须先让 execution 从 `waiting_user_acceptance` 进入 `paused`，再走 `recompiling -> resuming` 路径创建新 round
- `resuming` 期间如果再次收到 `pause all`，允许直接回到 `pausing`
- `completed` 仅当不存在 `pending/ready/running/blocked/waiting_*` step 时可进入

## 10.2 Step 状态机

```text
pending -> ready -> running
running -> waiting_input -> ready
running -> waiting_review -> ready
running -> interrupt_requested -> interrupted
running -> completed
running -> failed
pending -> blocked -> ready
pending -> cancelled
blocked -> cancelled
failed -> ready (retry only)
```

## 10.3 Agent Session 状态机

```text
idle -> running
running -> waiting_input
running -> waiting_approval
running -> interrupt_requested -> interrupted
running -> paused
waiting_input -> running
waiting_approval -> running
paused -> idle
running -> completed
running -> failed
```

## 10.4 三层组合约束

为避免状态爆炸，MVP 定义以下硬约束：

| Execution 状态 | 合法 Step 状态集合 | 合法 Agent Session 状态集合 |
|---|---|---|
| `running` | `pending`, `ready`, `running`, `blocked`, `waiting_input`, `waiting_review`, `completed`, `failed` | `idle`, `running`, `waiting_input`, `completed`, `failed` |
| `interrupting` | `running`, `interrupt_requested`, `interrupted`, `completed`, `failed` | `running`, `interrupt_requested`, `interrupted`, `idle` |
| `waiting_user_acceptance` | `completed`, `failed`, `interrupted`, `cancelled` | `idle`, `completed`, `failed`, `paused` |
| `pausing` | `running`, `interrupt_requested`, `completed`, `failed`, `blocked` | `running`, `interrupt_requested`, `paused`, `idle` |
| `paused` | `pending`, `blocked`, `interrupted`, `completed`, `failed`, `cancelled` | `paused`, `idle`, `completed`, `failed` |
| `recompiling` | `pending`, `blocked`, `interrupted`, `completed`, `failed`, `cancelled` | `paused`, `idle`, `completed`, `failed` |
| `waiting_user` | `waiting_input`, `interrupted`, `completed`, `failed`, `blocked` | `waiting_input`, `interrupted`, `idle`, `completed`, `failed` |
| `completed` | 仅 `completed`, `skipped`, `cancelled`, `failed` | 仅 `idle`, `completed`, `failed`, `expired` |

如果 reducer 发现组合不在表内，必须拒绝写入并记录 `workflow_state_transition_invalid_total`。

## 11. 可观测性要求

新增重点指标：

- `workflow_plan_validation_total{status}`
- `workflow_plan_compile_duration_ms`
- `workflow_plan_revision_total`
- `workflow_reconcile_total{result}`
- `workflow_interrupt_total{scope}`
- `workflow_interrupt_duration_ms`
- `workflow_pause_all_total`
- `workflow_approval_request_total{type}`
- `workflow_permission_request_total{type}`
- `workflow_graph_update_push_total`
- `workflow_late_output_dropped_total`
- `workflow_card_state_transition_total{state}`

结构化日志至少包含：

- `session_id`
- `workflow_execution_id`
- `active_revision_id`
- `compiled_graph_hash`
- `workflow_step_id`
- `workflow_agent_session_id`
- `run_id`
- `interrupt_scope`
- `approval_type`
- `permission_scope`
- `status_before`
- `status_after`

## 12. 推荐落地顺序

### Phase 1a（已完成）

- workflow JSON schema 定义
- compiler + DAG 校验
- workflow 基础表迁移
- reducer / orchestrator 骨架

### Phase 1b

- 基于已存在 `plan_id` 的 workflow execution 基本流程：创建 -> 调度 -> 完成
- execution 运行态下的单 workflow card -> work item card 切换
- step 协议最小实现
- graph 只读渲染

### Phase 1c

- 群聊 structured output 扩展：在现有 agent 回复协议中新增 `type: "workflow_generate"`，并保证与 `send` 等消息并行解析时不破坏现有行为
- `workflow_generate` 解析器与路由：识别 agent 回复数组中的触发项，保留同轮 `send` / `artifact` 输出，并对同一 session agent 发起第二段 plan generation run
- schema follow-up prompt：在第二段消息里注入 plan JSON schema 的具体定义、session 上下文和团队信息，强制 agent 只返回合法 `plan_json`
- plan 生成落库链路：写入 `chat_workflow_plans` / `chat_workflow_plan_revisions`，完成 validate + compile，并把 validation 错误结构化回写
- workflow card 预览态：在 plan `ready` 后立即生成唯一 card，card meta 绑定 `workflow_plan_id`、`active_revision_id` 和可空 `workflow_execution_id`
- workflow window 预览态：基于 `plan_json` 渲染 graph、summary 与 validation 信息；执行前隐藏运行态 transcript 输入，只保留查看与执行入口
- 执行门控：card 与 workflow window 共用 `execute` API，点击后才创建 execution、发送 workflow lead kickoff，并要求后端具备幂等保护
- workflow window transcript：execution 启动后按 selected agent / selected step 展示 transcript，未启动时显示 preview 占位态
- agent selector：展示当前 plan 中可分配 agent、节点负责人和当前选中 transcript 视图，支持在 lead / worker 间切换
- `pause all` / `interrupt step`：补齐按钮状态、接口调用、执行中禁用条件和迟到输出隔离规则
- 审批和权限 transcript card：把 approval / permission request 渲染为结构化卡片，并把用户决策统一回写 execution/step 状态机

### Phase 2

- lead agent 主导的 plan revision + reconcile
- workflow window 前端页面与交互设计落地，UI 框架图见 `docs/architecture/workflow_window.png`
- graph 增量刷新与 revision 对比态展示
- late-output 防污染机制与恢复策略

### Phase 3

- 权限申请与审批流扩展：将工具审批、权限申请、用户决策统一收敛到 workflow window 中
- 计划修订建议与自动修复：由 lead agent 基于失败原因、用户拒绝原因、运行结果生成修订建议，并支持系统侧自动补齐可修复字段
- workflow diff 可视化：对 round 间 plan 变化、step 变化、依赖边变化提供结构化对比视图
- 用户可手工编辑 workflow JSON 编辑页面
- 稳定性增强：补偿扫描、异常恢复、迟到消息隔离、重放与审计查询能力

## 最终结论

修订后，workflow mode 的正确形态是：

- 群聊中只有一张 workflow card 贯穿计划预览与执行投影
- React Flow workflow JSON 是计划真相源，step/edge/state 是编译后的执行产物
- workflow window 承载内部执行、打断、审批、权限申请和计划修改
- `workflow_generate` 负责触发 plan generation，真正的 execution 必须等用户点击执行后才启动
- lead 对用户继续使用现有 structured output；lead 与子 agent 切换到高效内部通信协议；子 agent 内部使用 workflow step 协议
- 全局停止按钮本质上是 `pause all`，为后续修改 workflow JSON 和恢复执行提供稳定入口

一句话概括：

“workflow card 负责对外投影计划与执行，workflow JSON 负责定义真相，compiler 负责生成可执行图，workflow window 负责执行中的交互与控制。”
