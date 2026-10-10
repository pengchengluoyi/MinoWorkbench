# 行为契约 · 我的助手

**原始实现**：无（新页面，设计见 MinoNexus `docs/架构/V4/mino接入社交软件实现24小时在线.md` §0/§5/§8.3）
**目标路由**：`/assistant`（WorkShell 侧栏「我的助手」，登录即可）
**排期**：V4 助手
**状态**：已实现（对接 Nexus `/assistant/*`，后端同步开发中）

## 数据

| 来源 | 用途 | 时机 |
|---|---|---|
| `GET /assistant/status` | 顶部状态条：在线、持有节点、渠道连接；`mcp_url` | 进页 + 每 20 秒 |
| `GET /assistant/profile` / `PUT /assistant/profile` | 默认应用 / 设备 / 启用开关 | 进页；改完即存 |
| `POST /assistant/bind/code` | 生成 6 位绑定码（`expires_in` 秒） | 点按钮 |
| `GET /assistant/identities` / `DELETE /assistant/identities/{id}` | 已绑定渠道 / 解绑 | 进页 / 解绑后失效重取 |
| `GET /assistant/turns?limit&offset&surface`、`GET /assistant/turns/{id}`、`GET /assistant/turns/{id}/messages` | 会话列表（服务端分页）、详情、正文（节点现取） | 进「会话与轨迹」/ 开抽屉 |
| `GET/DELETE /assistant/subscriptions` | 订阅列表 / 取消 | 进「订阅」 |
| `GET/POST/DELETE /assistant/mcp-tokens` | token 列表 / 生成（明文只返回一次）/ 吊销 | 进「MCP」 |
| `GET /project/list`、`GET /device/list` | 默认应用、默认设备的候选 | 进页 |

## 状态

| 状态 | 挂哪 | 说明 |
|---|---|---|
| 当前视图 `tab=setup\|turns\|subs\|mcp` | URL | 可分享 |
| 打开的会话 `turn=<turn_id>` | URL | 抽屉，刷新可恢复 |
| 来源筛选、分页 | 组件内 | |
| 绑定码与倒计时 | 组件内 | 刷新即丢，重新生成 |
| 新建 token 的明文 | 组件内（仅弹窗） | 关闭即丢，不落任何存储 |

## 交互

| 操作 | 前置条件 | 成功反馈 | 失败反馈 |
|---|---|---|---|
| 生成绑定码 | — | 显示码 + 倒计时 + 「/绑定 码」指令，可复制；过期划线并提示重新生成 | toast |
| 解绑 | 二次确认 | toast「已解绑」，列表刷新 | toast |
| 改默认应用 / 设备 / 启用 | — | toast | toast，控件回到服务端值 |
| 打开会话 | — | 抽屉：意图、步骤、MinoCard 预览、正文；有 task id 且有应用 id 时给「在任务页查看」链接 `/testing/:appId?tab=tasks&run=<task_id>` | 抽屉内错误态 + 重试 |
| 生成 MCP token | 名称非空 | 弹窗显示一次性 token + Claude Code 命令 + JSON 配置，均可一键复制 | toast |
| 吊销 token | 二次确认 | toast，状态变「已吊销」 | toast |
| 取消订阅 | 二次确认 | toast | toast |

## 边界

- 空态：各列表都写明下一步（去 IM 说话 / 去生成 token 等）。
- 加载态：骨架 / DataTable 自带。
- 后端未就绪（404/501/502/503，或 dev 代理漏转发返回 HTML）：整页只显示一条「助手服务尚未就绪」+ 重试，不白屏、不逐块报错。
- 助手离线：状态条红色，「助手离线，请联系节点管理员」+ 持有节点名。助手停用 / 无节点持有渠道：黄色提示。
- 正文不可见：`messages.available=false` → 「节点离线，正文暂不可见」+ reason。
- 卡片 `image.ref` 不是 URL / data URI 时显示占位，不猜取图接口。
- 动作 `actions` 无 `url` 的只列出（IM 内回调触发），不可点。

## 不做

- 人设（persona）编辑：契约里有字段，本期界面未要求，不做。
- 工具表 / prompt / 卡片模板的编辑：在仓库里做，Workbench 只读。
- 跳转到任务页只在 `detail.task_id`/`detail.run_id` 或步骤参数摘要里出现 `task_id=`/`run_id=` 时提供，不臆造。

## 验收

- [x] 逐条走「交互」表（mock 后端上走过，真后端待联调）
- [x] 逐条走「边界」表（未就绪降级已走过）
- [x] 单文件均 ≤ 400 行
