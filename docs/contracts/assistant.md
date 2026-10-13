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


## 2026-10-13 IM 对话优化增量

唯一维护的前端为 MinoWorkbench。`/assistant` 默认进入“请求与任务”，可查看独立请求、当前焦点和关联任务；补充参数通过 POST `/assistant/requests/{id}/respond`（revision + values），撤销仅作用于待执行请求，已提交任务跳转任务页管理。

卡片增加 card_type：clarification / notification / dialogue；状态增加 submitted / blocked / uncertain。先展示结果，再问题与下一步，trace 折叠放在最后。redacted 审计卡片不伪造正文，实际卡片通过 Scout-local messages 获取。

对话设置使用 `/assistant/preferences`、`/assistant/capabilities`、`/assistant/group-policies`、`/assistant/media-settings`。偏好可撤销且不保存默认执行设备；群策略需已验证绑定和明确项目范围，@ 不构成授权；语音模型使用账号已有服务，不接收密钥。未实现的原生按钮显示编号/名称降级。经当前节点验证的飞书实例可以声明卡片、线程与草稿更新能力；实际平台显示与回执需要部署联调，不能由能力字段代替验收。

所有查询/突变缓存继续绑定 user_id，账号切换沿用全局取消请求、清缓存和重挂敏感界面的流程。错误和 409 必须可见并刷新请求版本，不能用旧候选重发。

### 范围、焦点与结果持久化

| 操作 | API 与语义 |
| --- | --- |
| 加载待执行请求/任务 | GET `/assistant/requests`：items、focuses；args 为已保存的规范参数，task_status 来自真实任务 |
| 补充候选 | POST `/assistant/requests/{id}/respond`：revision + values，只消费保存候选一次 |
| 撤销请求 | POST `/assistant/requests/{id}/cancel`：revision；不停止已提交任务 |
| 查项目模块 | GET `/assistant/requests/{id}/modules`：items、selected；应用共享项目用例库 |
| 调整模块并继续 | POST `/assistant/requests/{id}/scope`：revision + modules，并集去重、冻结完整 case_ids 与内容版本，使旧候选失效 |
| 切换关注任务 | POST `/assistant/requests/{id}/focus`：验证任务归属，只改变 lane 的 task 焦点，保留待执行请求，不取消任务 |

ordinal 在首次解析后转成稳定 case_ids；设备追问续接不会第二次应用“第几条”。空范围、删除或内容变化均返回明确阻塞，不扩大成全部。请求失败保存人话 problem/next_steps，刷新后仍可查看，不保存原始聊天正文为新的长期真源。

界面使用“当前请求 / 等待补充 / 全部记录”，单独显示“会话当前请求”和“会话当前任务”。已关注按钮禁用；任务结果链接继续使用 `/testing/:appId?tab=tasks&run=:taskId`。卡片结果、问题、接下来分行，过程按偏好显示并可折叠。群策略项目选择兼容项目接口的裸数组返回，不因错误解包显示空选项。

### 流式和运行结束说明

流式内容由 Nexus 的真实模型 SSE observer 产生，经 Scout 更新一条消息；工具参数不流出，草稿清楚标注尚未执行。usage 未报告时明确不可得，不显示虚构的零用量。最终回复依据正式工具结果。

助手移除固定 4/12 轮工具上限，按路由总处理时间与重复无进展控制。时间预算仅约束新一轮模型/工具/任务提交，不是测试任务执行时长。失败与追问优先保留；超时或无进展显示实际原因及已查询结果，不回复“步骤太多”，不推断现有任务已经停止。

2026-10-13 最新生产构建、相关 eslint 和隔离后端配合的 Chromium HTTP 验收通过：66 份实际资源响应、零远程请求、零页面错误，追问/撤销/多模块/双任务焦点/偏好撤销/群策略/所有助手页签/390px 窄屏均已操作。未使用真实 IM、设备或模型账号做正向联调。


## 2026-10-13 用例结果通知与报告入口

通知支持 `case_results` 块：每项包含 number、case_id、name、status、status_label、summary、advice。通过/跳过项简短显示，未通过项突出具体摘要；建议只在非空时出现。URL actions 提供“查看测试报告”。

单条结果通知将用例结果作为首个块；多条先显示统计并列出各条结果，未通过超过5条时限量摘要与完整报告入口。详情链接使用 `/testing/:appId?tab=tasks&run=:taskId`，单条再带 `tcase=:caseId`，沿用登录门禁与归属校验。

“我的助手 → 对话设置 → 测试报告链接”读写 `/assistant/report-settings`，保存 workbench_url，展示 effective_url/source/available。使用 Workbench 内网IP和实际端口，不使用 localhost 或 Nexus API 入口；同机默认IP/5273，分机/反代显式配置。此设置与AI模型服务地址独立。
