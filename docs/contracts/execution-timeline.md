# 行为契约 · 执行时间线

**原始实现**：`MinoStudio/src/components/ExecutionTimeline.vue` **2,196 行**
（+ `ExecutionStepDetailDrawer.vue` 951 ・`CaseExecutionRecord.vue` 560）
**目标位置**：`/testing/:appId?tab=tasks` 内的执行详情区
**排期**：阶段 4b（单独占 2 周）
**状态**：**草稿，待评审**

> 这是全项目最复杂的一块，也是重建的主要价值所在。契约先行不是流程形式——
> 这个文件有 11 个 prop、7 个 `watch`、约 50 个响应式状态，不先列清楚必然漏东西。

## 原实现盘点（从代码里抽，不靠记忆）

**对外接口**

| 类别 | 内容 |
|---|---|
| props（11 个） | `runId` `live` `caseSummary` `caseGoal` `caseSpec` `caseCoverage` `envProfile` `envLabel` `envAlign` `platform` `layout`（`stack` \| `case` 两套布局） |
| emits | `select-step` |
| defineExpose | `goal` `overall` `finished` —— 父组件直接读子状态 |

**`defineExpose` 要在重建时消掉。** 父组件读子状态是 Vue 时代的权宜写法，React 下改成状态上提：`runId` 对应的执行摘要由父层的 Query 持有，时间线只消费不反向暴露。

**7 个 watch 分别在做什么**

| watch | 作用 | 重建后 |
|---|---|---|
| `props.runId` | 换批次 → `reset()` + `backfill()` | Query key 带 `runId`，自动重取，不需要手写 reset |
| `liveTaskId` | 实时任务 id 变化 → 订阅 | WebSocket 订阅 effect |
| `failTaskId` | 失败任务 id 变化 → 拉失败详情 | 独立 Query |
| `isCaseLayout` | 布局切换 → 重算滚动 | 布局由 CSS 决定，不需要 JS 介入 |
| `drawerThumbSrc` | 缩略图变化 → 预加载 | 图片组件内部处理 |
| `activeStep` | 当前步骤 → 滚动定位 | 保留，用 `useLayoutEffect` |
| （第 7 处，911 行） | 滚动同步 | 评审时确认是否仍需要 |

## 数据

| 来源 | 用途 | 时机 |
|---|---|---|
| `getAgentSteps(runId)` | Agent 引擎的步骤列表 | 进页 / `runId` 变化 |
| `getCaseRunnerTraceDetail(runId)` | 用例执行轨迹（步骤、截图、手势） | 同上 |
| `getSessionTrajectory(sessionId)` | 会话级轨迹（跨批次） | 按需 |
| WebSocket（`mWebSocket`） | 执行中实时追加步骤 | `live=true` 时订阅，批次结束退订 |
| `getBaseUrl()` 拼截图 URL | 步骤截图、前后对比图 | 渲染时 |

**重建要求**：三个 HTTP 源各自一个 Query；WebSocket 消息到达后用 `queryClient.setQueryData` 追加到步骤列表，**不维护组件内的镜像数组**（原实现 `steps = ref([])` 就是镜像，导致实时和回填两条路径要各写一套合并逻辑）。

## 状态

| 状态 | 挂哪 | 说明 |
|---|---|---|
| `runId` | URL（父级已有） | 可分享 |
| **当前选中步骤** | **URL query `step=`** | 原实现在组件内，导致刷新丢失、没法把"第 7 步失败"的链接发给同事。**改为挂 URL** |
| 抽屉开合 + 抽屉内 tab | URL query | 同上 |
| 步骤类型筛选 | URL query | 新增，见「交互」 |
| 时间轴缩放档位 | 组件内 | 纯视觉，不值得进 URL |
| 灯箱（放大看图） | 组件内 | 临时态 |
| 胶片条展开 | 组件内 | 临时态 |

## 职责拆分（手册 §7.2 的修正）

手册里写"拆成时间轴轨道 / 步骤详情抽屉 / 截图对比器三个组件"——**读完代码后这个估计偏粗**。实际有 7 块独立职责：

| 组件 | 职责 | 预估行数 |
|---|---|---|
| `RunVerdictHeader` | 批次判定头：结论、失败分类、失败截图、前后对比 | ≤ 200 |
| `StepTimeline` | 步骤轨道：列表、状态、选中、滚动定位 | ≤ 350 |
| `StepWaterfall` | 瀑布图：`totalMs` / `scaleMs` / `nodeCols` / `waterfallBars` / `axisMarks` | ≤ 250 |
| `StepFilmStrip` | 截图胶片条 + 灯箱 | ≤ 200 |
| `StepDetailDrawer` | 步骤详情抽屉（原 951 行独立文件） | ≤ 350 |
| `ScreenshotCompare` | 前后截图并排 + 差异高亮（新设计） | ≤ 200 |
| `RunTree` | 三列运行树（`runGroups` / `showThreeColumn` / `treeTitle`） | ≤ 250 |
| `useRunTrace(runId)` | 数据层：3 个 Query + WebSocket 合流 | ≤ 200 |

合计约 2,000 行，与原 2,196 行相当——**重建的收益不在少写代码，在于 8 个可独立读懂、独立改动的单元替代 1 个谁也不敢碰的文件。**

## 交互

| 操作 | 前置条件 | 成功反馈 | 失败反馈 |
|---|---|---|---|
| 选中步骤 | 有步骤 | 轨道高亮 + 右侧详情更新 + URL 带上 `step=` | — |
| 打开步骤详情抽屉 | 选中了步骤 | 抽屉滑出，URL 记录 | — |
| **跳到第一个失败步骤** | 批次有失败 | 轨道滚到该步并选中 | 无失败步骤时按钮禁用 |
| **按步骤类型筛选** | 有步骤 | 轨道过滤，计数更新 | 筛完为空时给空态而非白屏 |
| **时间轴缩放** | 有耗时数据 | 瀑布图横轴重算 | — |
| 放大看截图 | 该步有截图 | 灯箱打开 | 图加载失败显示占位而非破图 |
| 实时追加（执行中） | `live=true` | 新步骤追加到轨道，若用户未手动滚动则自动跟随 | 断线显示「实时中断」并提供手动刷新 |

**加粗三项是新增**，对应手册 §7.2 的交互升级：失败步骤快速跳转、步骤类型筛选、时间轴缩放。

## 边界

- **空态**：批次无步骤（刚下发、或执行器没上报）→ 区分「等待执行器上报」和「确实没有步骤」两种文案。
- **加载态**：骨架屏按轨道形状出，不要整块转圈。
- **批次仍在执行**：轨道底部要有"执行中"指示；用户手动向上滚动后**停止自动跟随**（原实现无条件 `scrollTo`，正在看前面的步骤会被强行拽到底部）。
- **截图缺失 / 加载失败**：占位块 + 尺寸预留，避免布局跳动。
- **步骤数极多**：长批次可能上千步 → 轨道用 `@tanstack/react-virtual` 虚拟滚动。
- **超长文本**：步骤描述、断言失败信息可能很长 → 折叠 + 展开，不截断到看不懂。
- **WebSocket 断线**：标明实时已中断，提供手动刷新；不静默停更。
- **两套布局**（原 `layout: stack | case`）：评审时确认是否还需要两套，或统一成一套响应式。
- **`envAlign` / `caseCoverage` 为 null**：原实现大量 `?.` 兜底，重建时在数据层归一，不让 null 渗到渲染层。

## 不做

- `defineExpose({goal, overall, finished})` → 不做，改状态上提。
- `nextTick` 对齐滚动（原实现多处）→ 不做，用 `useLayoutEffect` + 由布局保证，不靠时序。
- `layout` prop 的两套 CSS 分支 → **待评审**，倾向合成一套响应式布局。
- 组件内 `steps` 镜像数组 → 不做，数据只有一份在 Query 缓存里。

## 验收

- [ ] 用真机跑完一次**成功**用例，轨道、瀑布图、胶片条、详情抽屉全部正确
- [ ] 用真机跑完一次**失败**用例，判定头、失败分类、失败截图对比正确，「跳到失败步骤」可用
- [ ] 执行中实时追加可见；手动上滚后不被拽回底部；断线有提示
- [ ] 带 `step=` 的 URL 刷新后能恢复到同一步骤
- [ ] 上千步的批次滚动不卡
- [ ] 逐条走「边界」表
- [ ] 8 个单元均 ≤ 350 行
