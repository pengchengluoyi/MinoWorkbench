# 行为契约 · 模型密钥

**原始实现**：`MinoStudio/src/views/Settings/KeysPage.vue` 996 行（页面上实际只露出「大模型」一档）
**目标路由**：`/settings/keys`
**排期**：阶段 4
**状态**：已实现（供应商与用例执行开关）

## 数据

| 来源 | 用途 | 时机 |
|---|---|---|
| `GET /settings/ai/providers` | 供应商、默认项、usage | 进页、每次保存后 |
| `PUT /settings/ai/providers/:id` | 保存 Key、模型、压缩比例、可用 / 用例开关 | 保存、开关、清除 Key |
| `PUT /settings/ai/usage` | 用例执行是否启用大模型 | 总开关 |
| `DELETE /settings/ai/providers/:id` | 删除自定义供应商 | 确认后 |

保存开关时 `api_key` 传空且 `clear_key: false`，避免把已有 Key 清掉。

## 状态

| 状态 | 挂哪 | 说明 |
|---|---|---|
| 展开的供应商、表单草稿 | 组件内 | 保存成功后用接口结果覆盖 |

## 交互

| 操作 | 前置条件 | 成功反馈 | 失败反馈 |
|---|---|---|---|
| 打开可用 | 已配置或草稿里有 Key | toast，列表刷新 | 没 Key 时 warning，开关不动 |
| 标为用例 | 该供应商可用，且全局只留一个 | 其它供应商的「用例」关掉并保存 | 没 Key 时 warning |
| 清除 Key | 已配置 | Key 清空、可用关掉 | toast |
| 删除 | 非预置 id | 确认框后删除 | toast |

预置 id：`openai` `anthropic` `umodelverse` `google` `deepseek` `qwen` `volcengine`。

## 边界

- 空列表：说明 Nexus 没返回供应商。
- Key 不明文回显，已配置只显示掩码。

## 不做

- 发信配置（原 tab 已不在 `KEY_TABS` 里）。
- 知识沉淀 / 知识机审（Studio 知识能力已砍）。
