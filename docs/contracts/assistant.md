# 行为契约 · 我的助手

**原始实现**：无（新页面，设计见 MinoNexus `docs/架构/V4/mino接入社交软件实现24小时在线.md` §0/§5/§8.3）
**目标路由**：`/assistant`（WorkShell 侧栏「我的助手」，登录即可）
**排期**：V4 助手
**状态**：已实现（对接 Nexus `/assistant/*`，后端同步开发中）

## 数据

| 来源 | 用途 | 时机 |
|---|---|---|
| `GET /assistant/status` | 当前账号可访问节点的规范化渠道状态、身份绑定、独立 `mcp_available`、启用开关与 `mcp_url` | 进页 + 每 20 秒 |
| `GET /assistant/profile` / `PUT /assistant/profile` | 人设与启用开关；默认应用和设备字段不再读取或写入 | 修改后即存 |
| `POST /assistant/bind/code` | 生成 6 位绑定码（`expires_in` 秒） | 点按钮 |
| `GET /assistant/identities` / `DELETE /assistant/identities/{id}` | 已绑定渠道 / 解绑 | 进页 / 解绑后失效重取 |
| `GET /assistant/turns?limit&offset&surface`、`GET /assistant/turns/{id}`、`GET /assistant/turns/{id}/messages` | 会话列表（服务端分页）、详情、正文（节点现取） | 进「会话与轨迹」/ 开抽屉 |
| `GET/DELETE /assistant/subscriptions` | 订阅列表 / 取消 | 进「订阅」 |
| `GET/POST/DELETE /assistant/mcp-tokens` | token 列表 / 生成（明文只返回一次）/ 吊销 | 进「MCP」 |

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
| 状态区启用 / 停用助手 | — | toast；独立更新 IM 与 MCP 状态 | toast，控件保持服务端值 |
| 打开会话 | — | 抽屉：意图、步骤、MinoCard 预览、正文；有 task id 且有应用 id 时给「在任务页查看」链接 `/testing/:appId?tab=tasks&run=<task_id>` | 抽屉内错误态 + 重试 |
| 生成 MCP token | 名称非空 | 弹窗显示一次性 token + Claude Code 命令 + JSON 配置，均可一键复制 | toast |
| 吊销 token | 二次确认 | toast，状态变「已吊销」 | toast |
| 取消订阅 | 二次确认 | toast | toast |

## 边界

- 空态：各列表都写明下一步（去 IM 说话 / 去生成 token 等）。
- 加载态：骨架 / DataTable 自带。
- 后端未就绪（404/501/502/503，或 dev 代理漏转发返回 HTML）：整页只显示一条「助手服务尚未就绪」+ 重试，不白屏、不逐块报错。
- IM 与 MCP 分开显示。IM 只有节点在线、渠道真实确认连接、持有且当前用户已绑定时才在线。
- LangBot 按 `langbot:<平台>` 显示；安装、进程、连接与绑定独立呈现。未上报显示「状态未上报」，没有真实确认显示「待确认」，过期心跳显示「节点离线」。
- 普通通知机器人不计入对话入口；其他用户的节点不影响当前用户状态。
- 正文不可见：`messages.available=false` → 「节点离线，正文暂不可见」+ reason。
- 卡片 `image.ref` 不是 URL / data URI 时显示占位，不猜取图接口。
- 动作 `actions` 无 `url` 的只列出（IM 内回调触发），不可点。

## 不做

- 默认应用、默认设备及候选查询；缺参数时由本次输入或当前会话中已确认的上下文决定，仍缺失则追问。

- 人设（persona）编辑：契约里有字段，本期界面未要求，不做。
- 工具表 / prompt / 卡片模板的编辑：在仓库里做，Workbench 只读。
- 跳转到任务页只在 `detail.task_id`/`detail.run_id` 或步骤参数摘要里出现 `task_id=`/`run_id=` 时提供，不臆造。

## 验收

- [x] 逐条走「交互」表（mock 后端上走过，真后端待联调）
- [x] 逐条走「边界」表（未就绪降级已走过）
- [x] 单文件均 ≤ 400 行

## V4 绑定与上下文隔离

管理员和普通账号均仅聚合本人节点、助手档案、开关、绑定码、订阅、会话与 token。缓存键包含 uid，切账号时取消请求、清缓存、重挂载敏感组件并关闭旧实时连接。

绑定码关联当前会话账号、有效期和一次性消费；身份按渠道、机器人实例/租户与平台实际 sender 精确绑定，并校验 node owner 和持有权。群聊未绑定成员不能继承同群其他人的权限。重复回调在绑定/模型调用之前去重，不能用其他账号的绑定码覆盖映射。

助手恢复 Scout 本地同 sender、实例和租户且晚于本次绑定的最近上下文；不读旧未分域正文，不把其他群成员的对话加入上下文。模型每轮与工具每步执行前复核随机 binding_key，解绑再绑定也使旧执行失效。已提交的后台任务继续使用固化 owner，不随当前浏览器账号或新绑定变化。通知记录实际 sender 并在发送前复核绑定；解绑后旧订阅取消或失效。会话正文也复核当前绑定，失效时返回可见原因。

最终独立 HTTP、实际 WebSocket 和生产 Chromium 已验证 A/B/管理员隔离、迟到响应、旧连接、绑定码、重复回调与通知失效；真实社交平台及设备执行仍需部署联调。
