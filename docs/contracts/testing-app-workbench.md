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
