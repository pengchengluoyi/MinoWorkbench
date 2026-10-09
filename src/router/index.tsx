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
const NodesPage = lazy(() => import('@/domains/settings/nodes/NodesPage').then((m) => ({ default: m.NodesPage })))
const DeviceDetailPage = lazy(() => import('@/domains/settings/devices/DeviceDetailPage').then((m) => ({ default: m.DeviceDetailPage })))
const KeysPage = lazy(() => import('@/domains/settings/keys/KeysPage').then((m) => ({ default: m.KeysPage })))
const CaseResourcePage = lazy(() => import('@/domains/admin/resources/CaseResourcePage').then((m) => ({ default: m.CaseResourcePage })))
const SkillsPage = lazy(() => import('@/domains/admin/skills/SkillsPage').then((m) => ({ default: m.SkillsPage })))
const JobsPage = lazy(() => import('@/domains/admin/jobs/JobsPage').then((m) => ({ default: m.JobsPage })))
const RolesPage = lazy(() => import('@/domains/admin/roles/RolesPage').then((m) => ({ default: m.RolesPage })))
const StackPage = lazy(() => import('@/domains/admin/stack/StackPage').then((m) => ({ default: m.StackPage })))
const PacksPage = lazy(() => import('@/domains/admin/packs/PacksPage').then((m) => ({ default: m.PacksPage })))
const FlowBlocksPage = lazy(() => import('@/domains/admin/flow/FlowBlocksPage').then((m) => ({ default: m.FlowBlocksPage })))

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
      { path: '/settings/runtime', element: lazyPage(<NodesPage />) },
      {
        path: '/settings/runtime/device/:sn',
        element: lazyPage(<DeviceDetailPage />),
      },
      // 调用记录（原 /settings/dispatch）本期不做
      { path: '/settings/dispatch', element: <Navigate to="/testing" replace /> },
      { path: '/settings/dispatch/*', element: <Navigate to="/testing" replace /> },
      { path: '/settings/plugins', element: <Navigate to="/settings/runtime" replace /> },
      { path: '/settings/plugins/:pluginId', element: <Navigate to="/settings/runtime" replace /> },
      { path: '/settings/keys', element: lazyPage(<KeysPage />) },
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
      { path: '/case-resource', element: lazyPage(<CaseResourcePage />) },
      { path: '/case-resource-key', element: <Navigate to="/case-resource?zone=keys" replace /> },
      { path: '/resource-transition-rules', element: <Navigate to="/case-resource?zone=rules" replace /> },
      { path: '/permissions', element: <Planned title="权限配置" phase="阶段 2" source="Permissions/index.vue 194 行" /> },
      { path: '/skills', element: lazyPage(<SkillsPage />) },
      { path: '/jobs', element: lazyPage(<JobsPage />) },
      { path: '/roles', element: lazyPage(<RolesPage />) },
      { path: '/stack', element: lazyPage(<StackPage />) },
      { path: '/packs', element: lazyPage(<PacksPage />) },
      { path: '/flow-blocks', element: lazyPage(<FlowBlocksPage />) },
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
