# D3 现有实现审查与修复（2026-10-17）

> 本文为上一轮首批审查快照。后续升级/回退/恢复实现与验收以 [D3 安装升级合同](mino-workbench-updates.md) 为准。

结论：沿用仓库现有的 PyInstaller 独立安装基线，不引入另一套启动器。基线可继续使用，但不能据此宣布 D3 安装升级全部完成。

## 本轮合并修复

- 生产前端缺少运行配置时，拒绝回退到编译时地址或默认 Nexus；启动失败可见并支持重新加载。
- 先验证地址并处理目标登录状态，再加载 API/会话模块。切换目标要求重新登录，遗留无作用域 token 不迁移；WS 凭据变化也触发会话同步。
- `/index.html` 和版本化 HTML 入口统一注入运行配置、禁缓存并归一为应用根路由；版本化 HTML 使用对应版本资源基址。
- 只有浏览器文档导航允许 SPA fallback；缺资源、JSON 请求返回 404。补充 HEAD、路径和 build ID 边界校验。
- 首次安装在创建目录前检查 Nexus origin、服务 label 和显式数据根，避免无效配置留下半安装目录。

## 验证

- TypeScript、仓库规则、lint 通过。原有 DevelopmentPanel 留有 1 条 Hook 依赖 warning，无 error；未修改该面板。
- 真实 Vite 生产构建、PyInstaller macOS arm64 原生静态服务成功。
- 最终前端通过原生服务的 `--web-root` 加载。Chromium 禁缓存/禁 Service Worker：82 个资源全部通过真实 HTTP 加载，所有 JS 导入解析、CSS 装载，0 pageerror、0 requestfailed。
- 根入口、index.html、版本化 index.html、登录必填校验与注册导航通过；没有登录真实账号，不能视为全部业务功能验收。
- 同来源切换 Nexus 后旧目标会话不复用，无作用域 token 不发送；部署配置缺失显示错误，不向 Nexus 发请求。
- 缺资源/API 请求 404；HTML/配置 no-store；无效安装配置在创建安装根前拒绝。

## 尚未完成的 D3 范围

现有 `packaging/maintain.py` 明确是 fresh-install baseline，没有 update/rollback/recover 操作。

- 固定版本升级、持久 operation、幂等请求、独立更新助手、原子切换及恢复仍需实现。
- 当前服务启动时固定 web 根，尚不能仅切 current 指针完成静态热升级。
- 运行时升级、正式服务停启/助手中断恢复、跨主机 HTTP/WS Origin 集成、真实 Release 发布安装仍需验收。

本轮没有替换正式服务，没有发布 Release，也没有提交或覆盖其他开发中的改动。先前隔离方案的升级/回退实验没有合并，不能作为当前仓库已经具备升级能力的证据。
