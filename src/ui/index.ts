/**
 * UI 适配层统一出口。
 * 业务代码只 import '@/ui'，不直接 import 'antd'（开发手册 §11）。
 */
export { DataTable, type DataColumn, type DataTableProps } from './DataTable'
export { PageHeader } from './PageHeader'
export { Planned } from './Planned'
export { EmptyState } from './EmptyState'
export { ErrorBoundary } from './ErrorBoundary'
export { StatusPill, toStatusKind, type StatusKind } from './StatusPill'
export { FeedbackProvider, useFeedback, errText } from './feedback'
export { AppearanceMenu } from './AppearanceMenu'
export { UserMenu } from './UserMenu'
export { Fold } from './Fold'
export { lightTheme, darkTheme } from './theme'

// 直接转出的 antd 原件：只做收口，不做包装。
//
// 这里只放"当前真的用到"的组件 —— barrel 转出什么就会被打进包里，
// 把 antd 整个镜像一遍会白付 100KB+。需要新组件时在这里加一行，
// 不要在业务代码里绕过去直接 import 'antd'。
export {
  Button, Input, InputNumber, Select, Switch, Checkbox, Radio, Form,
  Modal, Drawer, Tabs, Tag, Tooltip, Dropdown, Space, Divider, Spin,
  Alert, Skeleton, Empty, Popconfirm, Segmented, Badge, QRCode,
} from 'antd'
