> 2026-10-17：全局入口已按用户要求调整为项目，应用统一在项目配置中创建。当前合同以 [项目入口与应用配置](testing-project-workbench.md) 为准；下文保留旧应用导航的历史设计。

# 行为契约 · 应用工作台（外壳）

**原始实现**：`MinoStudio/src/views/Testing/AppShell.vue` **2,387 行**
**目标路由**：`/testing/:appId`
**排期**：阶段 2a
**状态**：**已实现（外壳部分）**

## 原实现盘点

读完 2,387 行后的结论：**它不是一个外壳。** 除了 tab 导航，里面还塞着四块独立功能：

| 塞在里面的东西 | 证据 | 重建后归属 |
|---|---|---|
| **新建执行向导** | `newRunVisible` `runForm` `runEnvironments` `selectedCaseIds` `selectedDevices` `canStartRun` `runConfiguredTargets` `selectedRunTarget` `runTargetDeviceKind` `runFilteredDevices` 等 ~20 个状态 | 独立组件 + 独立契约 `testing-new-run.md` |
| **任务列表 + 筛选 + 分页** | `visibleTasks` `taskFilter` `taskDeviceFilter` `taskWhen` `taskPage` `pagedTasks` `taskListPill` | 任务 tab（阶段 3） |
| **用例加载与模块树** | `cases` `casesLoading` `caseTree` `filteredCases` `moduleTreeRef` `groupCasesByModuleTree` | 用例 tab（阶段 2b） |
| **新建项目 / 应用** | `createProjectOpen` `createProjectKind` `createProjectForm` `createAppInProject` | **已在 `/testing` 的 `CreateDialog` 实现，复用** |

外壳自己只需要：应用上下文、tab 导航、URL 状态、把主区交给面板。

**规模数据**：24 个 `route.query` 键、约 70 个 `ref`/`computed`、10 个 `watch`。

## 数据

V4 增量：用例先使用已缓存应用详情中的 `project_id`，直达链接由应用详情恢复并纠正 URL 中不匹配的项目。任务列表只依赖 `appId`，不等待任务详情。切应用重新挂载面板，切账号清缓存。

左导航悬停 / 聚焦预加载对应面板及同筛选、分页的列表查询。用例列表使用 `limit/offset/search/module/app_id/result` 分页摘要，默认每页 50 条；`case-modules`、设备及当前页的 `POST /case-runner/case-results` 独立查询。上次结果失败不显示成「未跑过」，也不拖垮主列表。详情点击后单独读取。

任务列表以 `summary=true` 读取每页 50 条摘要；详情点击后请求，只有运行中每 5 秒轮询。列表每 15 秒兜底；隐藏页面停止轮询，实时任务事件只更新 / 失效当前应用相关查询。轨迹按需加载。

`casePage/caseSize/caseSearch/caseModule/caseResult` 与 `taskPage/taskSize` 挂 URL。分页与筛选纳入缓存键，缓存切回先显示缓存再刷新。

性能采样从左导航点击开始，以真实列表（包含真实空态）绘制后两帧为完成点。事件 `mino:list-performance`、浏览器控制台 `window.minoListPerformance()` 提供总耗时、路由、JS 加载、接口跨度、渲染、缓存命中及失败样本。阶段可能重叠，不能相加或用骨架屏当完成。

| 来源 | 用途 | 时机 |
|---|---|---|
| `GET /project/app/:appId` | 应用名、说明、覆盖端、所属项目 | 进页 / `appId` 变化 |

**外壳只拉这一个接口。** 原实现在 `onMounted` 里并行拉了 6 份（cases / projects / providers / suites / devices / tasks）——那些是各面板自己的数据，由面板的 Query 负责，外壳不代劳。这是外壳从 2,387 行瘦下来的主要原因。

### 修掉一处真实缺陷

原实现 `appName` / `projectName` / `projectId` **只从 URL query 读**：

```js
const appName = computed(() => String(route.query.appName || '应用'))
```

后果：不带 query 的 `/testing/:appId` 链接（手敲、书签、别人转发的裁剪链接）打开后标题是"应用"，项目名空白。

**重建改为按 `appId` 拉 `getAppDetail`**，query 里的值只作为乐观初值（有就先渲染，避免首屏闪烁），接口回来后以接口为准。

## 状态

| 状态 | URL 键 | 取值 | 默认 |
|---|---|---|---|
| 当前 tab | `tab` | `cases` `tasks` `session-log` `navigation` `assets` `config` | **`cases`** |
| 用例子视图 | `view` | `library` | `library` |
| 导航子视图 | `nview` | `arch` | `arch` |
| 资源子视图 | `section` | `accounts` `logs` `device-apps` | `accounts` |
| 配置子视图 | `configSection` | `env` | `env` |
| 应用上下文（乐观初值） | `appName` `projectName` `projectId` | — | 由接口兜底 |
| 侧栏收起 | `localStorage` | — | 展开 |

**`VALID_TABS` 从 11 项减到 6 项**（调用记录 `dispatch` 本期也不做）。 原默认值是 `process`，该 tab 已砍 —— **默认改为 `cases`**，否则进页白屏。

## 信息架构（手册 §7.3 的落地）

原实现是「11 个 tab 平铺 + 每个 tab 下二级 board」两层。重建改为：

**全局只有一条左侧导航。** 应用内导航嵌在 `WorkShell` 的那条左栏里，
不由本组件再画一条——上一版两条左栏并排，是明确的设计错误。

```
┌──────────────┬───────────────────────────────────────────┐
│ WorkShell    │ 应用上下文条：返回 / 应用名 / 覆盖端        │
│ 唯一左栏     ├────────────────────────────┬──────────────┤
│  应用        │                            │              │
│   ├ 用例     │  主工作区                  │ 上下文侧栏   │
│   ├ 任务     │  （面板自己管）            │ （可收起）   │
│   ├ 导航     │                            │              │
│   ├ 测试资源 │                            │              │
│   └ 配置     │                            │              │
│  ─────       │                            │              │
│  Scout 节点  │                            │              │
│  插件        │                            │              │
│  模型密钥    │                            │              │
│  ─────       │                            │              │
│  [头像] ↑    │                            │              │
└──────────────┴────────────────────────────┴──────────────┘
```

整条左栏可折叠（折叠后只剩图标 + 悬浮提示），状态持久化。

| 导航项 | tab | 子项 |
|---|---|---|
| 用例 | `cases` | — |
| 任务 | `tasks` | 执行批次 / Session Log `session-log` |
| 导航 | `navigation` | 架构 |
| 测试资源 | `assets` | 账号管理 / 资源日志 / 机态 App |
| 配置 | `config` | 环境配置 |

子项是独立 tab 值（`session-log`）还是子视图参数（`section`、`nview`），沿用原实现的划分，避免旧链接失效。

## 交互

执行设备按稳定的 `node_id` 分组，同一节点的在线和历史离线设备共用节点名称。不同 ID 即使主机名相同也不合并。选择器展示可执行数量、设备类型和完整阻塞原因，保留不可选设备；可搜索和手动刷新。节点在线而手机断开时显示设备未连接，不显示节点离线。

Desktop 工具按当前 Scout 设备上报的能力自动生成，不要求管理员手工配置执行路径。设备选择区不显示 Desktop 配置按钮；普通账号可选择自己所属的已就绪 PC。节点管理在新标签页打开，保留当前已勾选用例；设备归属、桌面会话、权限、应用目标与独占租约继续由服务端校验。

| 操作 | 前置条件 | 成功反馈 | 失败反馈 |
|---|---|---|---|
| 切 tab | — | 主区换面板，URL 更新，**不丢其他面板的状态** | — |
| 切子项 | — | 子视图参数更新 | — |
| 返回应用列表 | — | 回 `/testing` | — |
| 收起 / 展开上下文侧栏 | — | 即时，且持久化 | — |
| 带完整 query 的链接打开 | — | 直达对应 tab 和子视图 | 非法 tab 值回落到 `cases` |
| **不带 query 的链接打开** | — | **接口拉到应用名后正确显示** | 应用不存在时整页错误态 + 返回入口 |

## 边界

- **`appId` 不存在 / 无权限**：整页错误态，给「返回应用列表」。原实现只会显示"应用"二字，看不出是哪里错了。
- 加载态：上下文条骨架 + 导航可用（导航不依赖接口）。
- **非法 `tab` 值**：回落 `cases`，不白屏。
- **旧 URL**（`tab=process` / `knowledge` / `docs` / `intel` / `dispatch` / `board=*` / `kview=*`）：这些功能已砍 → **重定向到 `tab=cases`**，不保留空页面。
- 窄屏：上下文侧栏自动收起；导航退为顶部横向。
- 面板自身出错：面板级 `ErrorBoundary` 兜住，外壳和导航仍可用。

## 不做

- `onMounted` 里并行拉 6 份数据 → 不做，各面板自己拉。
- 外壳内嵌新建项目 / 新建应用 → 不做，复用 `/testing` 的 `CreateDialog`。
- 原实现的应用内搜索（`searchOpen` `searchQ` `searchHits`）→ **本期不做**，等命令面板统一处理（命令面板本期也不做）。
- `nextTick` 对齐滚动 → 不做。
- 旧 query 迁移逻辑（`configSection` 的 regression/icons/cases、`process`+`board=flow`）→ 不做逐条迁移，统一重定向到默认 tab。

## 验收

- [x] 6 个 tab 全部可达，默认落地 `cases`
- [x] 全局只有一条左侧导航，且可折叠、状态持久化
- [x] 子项参数正确读写 URL
- [x] 不带 query 的 `/testing/:appId` 能正确显示应用名和覆盖端
- [x] 非法 tab 回落 `cases`
- [x] 已砍功能的旧 tab 值重定向到 `cases`
- [x] 侧栏收起状态持久化
- [x] `appId` 不存在时整页错误态 + 返回入口
- [x] 切 tab 不丢其他面板状态（面板各自 Query 缓存）
- [x] 外壳单文件 ≤ 400 行（原 2,387 行 → 125 行，导航移入 WorkShell）


## V4 PC 任务选择

用例运行栏和新建任务弹窗共用 `DeviceSelect` 与按任务上下文查询的设备数据：`app_id/env_surface/env_profile/action_scheme`。默认取账号内全部设备，按宿主节点分组，区分 PC 桌面（含 OS）、Web 浏览器与移动设备。不可用目标保持可见并 disabled，显示服务端 `blocked_reason`。

用户明确选择执行设备；切换渠道、环境或执行方案后保留原选中目标。原目标不兼容/离线/繁忙时禁止启动并解释原因，不自动改派另一台设备。原生 macOS/Windows/Linux 应用只匹配同系统 Desktop，网站继续使用 Web 槽；Desktop 首版仅 visual。运行栏提供应用渠道选择，不依赖上传的 platform 授权或路由。

设备查询加载、失败和重试独立处理；失败即阻止提交，不把错误显示成零设备或可执行。设备查询及用例/结果缓存包含账号 ID，切账号不复用他人目标。最终准入由服务端在提交时重新检查并原子获取共享桌面资源锁。
