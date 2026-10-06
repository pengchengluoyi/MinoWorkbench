# 行为契约 · Session Log

**原始实现**：`MinoStudio/src/views/Testing/SessionLogPanel.vue` 663 行
**目标路由**：`/testing/:appId?tab=session-log`
**排期**：阶段 3
**状态**：已实现（列表 + 回合 / 事件 / LLM）。Eval、回放、分叉未做。

## 数据

| 来源 | 用途 | 时机 |
|---|---|---|
| `GET /case-runner/sessions` | 最近 session 列表 | 进页、改筛选、翻页、刷新 |
| `GET /case-runner/sessions/:id/events` | 事件真源，分页 | 选中 session，以及「继续加载」 |
| `GET /case-runner/sessions/:id/turns` | 回合 | 选中 session |
| `GET /case-runner/sessions/:id/llm` | LLM 调用 | 选中 session |
| `GET /case-runner/sessions/:id/metrics` | 次数与 token | 选中 session |

## 状态

| 状态 | 挂哪 | 说明 |
|---|---|---|
| `session` | URL | 当前 session，刷新可恢复 |
| `sstatus` `spage` `sps` | URL | 列表筛选与分页 |
| 事件类型、选中事件、已加载的后续页 | 组件内 | 临时态 |

## 交互

| 操作 | 前置条件 | 成功反馈 | 失败反馈 |
|---|---|---|---|
| 点一行 / 粘贴 id 后加载 | 有 session_id | 下方展开回合、事件、LLM | 空结果或错误条 |
| 状态筛选、翻页 | — | 列表换页，URL 更新 | 表格错误态 + 可重试 |
| 跳到失败回合 | 有失败回合 | 视图切到回合并滚到该条 | — |
| 继续加载事件 | `has_more` | 追加到列表 | toast |

## 边界

- 空态：还没有 session。
- 加载态：表格骨架，详情骨架。
- 接口失败：错误文案来自 Nexus `detail`，不把空列表当成成功。

## 不做

- Eval / Audit harness、replay、fork（原 `SessionHarnessPanel`）。
- 调度记录跳转（`/settings/dispatch` 本期不做）。
- 完整轨迹调试器（工具菜单、里程碑、槽位）。这一版用回合标题 + 工具名代替。
