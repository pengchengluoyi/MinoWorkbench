import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Skeleton } from 'antd'
import { GuestOnly, RequireAdmin, RequireAuth } from './guards'
import { WorkShell } from '@/layouts/WorkShell'
import { AdminLayout } from '@/layouts/AdminLayout'
import { Planned } from '@/ui/Planned'

/** 页面级懒加载。新增真实页面一律走这里，不要直接 import。 */
const LoginPage = lazy(() => import('@/domains/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const HealthPage = lazy(() => import('@/domains/admin/health/HealthPage').then((m) => ({ default: m.HealthPage })))
const AuditPage = lazy(() => import('@/domains/admin/audit/AuditPage').then((m) => ({ default: m.AuditPage })))
const AppListPage = lazy(() => import('@/domains/testing/apps/AppListPage').then((m) => ({ default: m.AppListPage })))
const AppWorkbench = lazy(() => import('@/domains/testing/workbench/AppWorkbench').then((m) => ({ default: m.AppWorkbench })))

const lazyPage = (node: ReactNode) => (
  <Suspense fallback={<Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} style={{ padding: 4 }} />}>
    {node}
  </Suspense>
)

/**
 * 两套导航独立，原 URL 全部保留，不加前缀（方案 §5.1）。
 * Studio 用 /testing /settings，Console 用 /dashboard /catalog 等，实测零冲突。
 */
export const router = createBrowserRouter([
  {
    path: '/login',
    element: <GuestOnly>{lazyPage(<LoginPage />)}</GuestOnly>,
  },

  // ---------- Studio 测试工作台：登录即可 ----------
  {
    element: <RequireAuth><WorkShell /></RequireAuth>,
    children: [
      { path: '/', element: <Navigate to="/testing" replace /> },
      { path: '/testing', element: lazyPage(<AppListPage />) },
      { path: '/testing/:appId', element: lazyPage(<AppWorkbench />) },
      { path: '/settings', element: <Navigate to="/settings/runtime" replace /> },
      {
        path: '/settings/runtime',
        element: (
          <Planned
            title="Scout 节点"
            phase="阶段 3"
            note="读功能先做完整；停止 / 重启 / 日志依赖 Nexus 的 /node 下行命令通道。"
            source="Settings/ScoutNodesPage.vue 1,599 行"
          />
        ),
      },
      {
        path: '/settings/runtime/device/:sn',
        element: <Planned title="设备详情" phase="阶段 3" source="Settings/DeviceDetailPage.vue 370 行" />,
      },
      { path: '/settings/dispatch', element: <Planned title="调用记录" phase="阶段 3" source="Settings/DispatchPage.vue 249 行" /> },
      { path: '/settings/dispatch/:callId', element: <Planned title="调用详情" phase="阶段 3" source="Settings/DispatchJobPage.vue 368 行" /> },
      { path: '/settings/plugins', element: <Planned title="插件" phase="阶段 3" source="Settings/PluginsPage.vue 133 行" /> },
      { path: '/settings/plugins/:pluginId', element: <Planned title="插件详情" phase="阶段 3" source="Settings/PluginDetailPage.vue 1,725 行" /> },
      { path: '/settings/keys', element: <Planned title="模型密钥" phase="阶段 3" source="Settings/KeysPage.vue 996 行" /> },
      { path: '/settings/apps/:appId/:section', element: <Planned title="应用配置" phase="阶段 3" note="只保留环境配置一项。" source="Settings/AppConfigPage.vue 546 行" /> },
      { path: '/settings/projects/:projectId/env', element: <Planned title="项目环境" phase="阶段 3" source="Settings/ProjectEnvPage.vue 42 行" /> },

      // 已下线功能的旧 URL：不保留页面，收敛回落地页
      { path: '/dialogue', element: <Navigate to="/testing" replace /> },
      { path: '/agents', element: <Navigate to="/testing" replace /> },
      { path: '/report/*', element: <Navigate to="/testing" replace /> },
      { path: '/settings/schedule', element: <Navigate to="/testing" replace /> },
      { path: '/timeline', element: <Navigate to="/settings/runtime" replace /> },
    ],
  },

  // ---------- Console 管理后台：需 admin ----------
  {
    element: <RequireAuth><RequireAdmin><AdminLayout /></RequireAdmin></RequireAuth>,
    children: [
      { path: '/dashboard', element: <Planned title="工作台" phase="阶段 2" source="Dashboard/index.vue 195 行" /> },
      { path: '/health', element: lazyPage(<HealthPage />) },
      { path: '/audit', element: lazyPage(<AuditPage />) },
      { path: '/catalog', element: <Planned title="项目与应用" phase="阶段 2" source="Catalog/index.vue 121 行" /> },
      { path: '/catalog/:projectId', element: <Planned title="项目" phase="阶段 2" source="Catalog/ProjectPage.vue 199 行" /> },
      { path: '/catalog/:projectId/apps/:appId/*', element: <Planned title="应用" phase="阶段 2" note="4 个 tab：概览 / 知识 / 文档 / 信息基座。" source="Catalog/AppShell.vue 132 行" /> },
      { path: '/nodes', element: <Planned title="节点与设备" phase="阶段 2" source="Catalog/NodesPage.vue 171 行" /> },
      { path: '/account-pool-templates', element: <Planned title="号池模板" phase="阶段 2" source="Settings/AccountPoolTemplatesPage.vue 297 行" /> },
      { path: '/case-resource-key', element: <Planned title="用例密钥" phase="阶段 2" source="Settings/CaseResourceKeyPage.vue 187 行" /> },
      { path: '/resource-transition-rules', element: <Planned title="转移规则" phase="阶段 2" source="Settings/ResourceTransitionRulesPage.vue 132 行" /> },
      { path: '/permissions', element: <Planned title="权限配置" phase="阶段 2" source="Permissions/index.vue 194 行" /> },
      { path: '/skills', element: <Planned title="技能" phase="阶段 2" note="原 1,601 行，必须拆。" source="Settings/SkillsPage.vue" /> },
      { path: '/jobs', element: <Planned title="Jobs" phase="阶段 2" note="原 805 行，必须拆。" source="Settings/JobsPage.vue" /> },
      { path: '/roles', element: <Planned title="角色" phase="阶段 2" source="Settings/RolesPage.vue 733 行" /> },
      { path: '/stack', element: <Planned title="编排" phase="阶段 2" source="Settings/LayerStack.vue 284 行" /> },
      { path: '/packs', element: <Planned title="扩展包" phase="阶段 2" source="Settings/PacksPage + PacksPanel 等 1,123 行" /> },
      { path: '/flow-blocks', element: <Planned title="FSM 逻辑块" phase="阶段 2" source="Settings/FlowBlocksPage.vue 493 行" /> },
      { path: '/knowledge', element: <Planned title="知识审核" phase="阶段 2" source="Knowledge/index.vue + panels/KnowledgePanel 551 行" /> },
      { path: '/network', element: <Planned title="网络 / 内网域名" phase="阶段 2" source="Network/index.vue 72 行" /> },

      // Console 旧 URL 兼容
      { path: '/access', element: <Navigate to="/permissions" replace /> },
      { path: '/system', element: <Navigate to="/health" replace /> },
      { path: '/doc-library', element: <Navigate to="/catalog" replace /> },
      { path: '/app-intel', element: <Navigate to="/catalog" replace /> },
    ],
  },

  { path: '*', element: <Navigate to="/testing" replace /> },
])
