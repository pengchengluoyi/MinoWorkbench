# 行为契约 · V5 控件定位、发布与证据

**实现**：ControlRegistry.tsx、V5Publication.tsx、V5Evidence.tsx。
**目标路由**：应用工作台 config / cases / session-log。
**状态**：已实现，按本地隔离验收记录核对。唯一前端 MinoWorkbench。

## 数据

- 项目控件 GET `/project/{pid}/controls`，保存 PUT `/project/{pid}/controls/{cid}`，只读探测 POST `.../{cid}/probe`。进入和手动刷新读取；保存后失效重取，无短周期轮询。
- 用例 GET `.../cases/{cid}/v5/preview`，POST compile/publish，PUT baseline，GET `/project/{pid}/v5/metrics`。数据带真实 draft/control revision；编译仅文字入口，不接受手写计划。
- 会话页消费既有 session_events/session_meta，显示原始事实、冻结快照、verdict 和动作后脱敏截图；不根据工具 pass 计算绿色。

## 状态

- app、project、case、session 使用既有 URL 状态，可恢复。所选控件及未保存 typed 编辑、敏感复选、人工核对、探测 SN/URL 为面板临时状态。
- 切换项目清空控件选择；换控件/版本重载字段，清除旧审阅和旧探测。保存反馈保持可见。预览、基线或文字编译改变后用例人工核对失效；刷新/编译期间禁止发布。
- 原项目环境编辑保持挂载，切到控件面板不丢环境草稿。

## 交互

| 操作 | 前置与结果 |
|---|---|
| 保存控件草稿 | 本项目唯一身份，主页面 scope，合法 typed spec，expected_revision；返回新 revision 和可见保存反馈。 |
| 发布控件 | 人工核对定位/作用域/敏感属性；发布仅新版本，受影响用例标 needs_revalidate，不改冻结计划。 |
| 只读探测 | 已保存定位、无未保存修改、明确 Web 设备和 URL；独立未登录 context 导航及读取 count/visible。返回事实及 session_id，无 click/fill。 |
| 编译/预览 | 当前文字草稿，有归属与资源。列出动作/required 预期映射、来源和资格拒绝原因，不隐藏含糊描述。 |
| 基线配置 | 从本项目已发布控件选择登录标记，按草稿 revision 保存；运行时实际检查 not_visible。 |
| 冻结发布 | 结构资格通过并人工核对业务预期强度，发布事务重新查全部快照。可复位/重试是显式选择；默认无自动整案重试。 |
| 周指标/会话证据 | 显示计数及分母、已验证状态、原始事实和截图。缺人工标定/秘密哨兵报告的指标为 null。 |

## 边界

- 无项目、无控件、未编译、只有旧 `_project` 或 vlm_text：显示缺项；V5 不跨项目借定位，不自动升级旧数据。
- 加载、失败及不可达：显示 Skeleton/原因/重试，探测和发布按钮有 busy 状态，不无限加载或假成功。
- 权限由 Nexus 认证及项目权限校验，403 不转成功；版本/身份冲突由服务拒绝，保留当前编辑供人工刷新。
- 主页面以外 scope、set 写动作、未知 selector、秘密明文预期及无法满足资源：资格拒绝，不能自动 fallback。
- 长控件列表使用 Select 滚动能力，长事实以可展开、折行 JSON 呈现。异常字段不当 HTML 执行。

## 不做

不开发 Console/Studio；不加需求生成或手写计划入口；不在运行期补/猜已发布定位；不借只读探测登录、点击或填写；不把人工审阅、来源缺失或失败结果伪造为通过。

## 验收

最终 Workbench dist 在本地 HTTP 上使用真实临时 Nexus API 和新 Chromium context；检查保存/发布/只读探测、编译审阅/冻结、周指标、会话截图及所有 bundled modules/resources。受控编译缓存验证不等同真实模型文字导入验收，业务设备与凭据另按 R8 门槛验收。
