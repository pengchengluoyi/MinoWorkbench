import type { ThemeConfig } from 'antd'

/**
 * 把 tokens.css 的值喂给 antd。
 * 这里是唯一允许出现字面量色值的地方——因为 antd 的 ConfigProvider
 * 只吃具体值，不认 CSS 变量。改色请改 tokens.css 并同步此处。
 */
const shared = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  fontSize: 13,
  fontSizeSM: 12,
  fontSizeLG: 14,
  borderRadius: 10,
  borderRadiusSM: 8,
  borderRadiusLG: 12,
  wireframe: false,
}

export const lightTheme: ThemeConfig = {
  token: {
    ...shared,
    colorPrimary: '#4f46e5',
    colorSuccess: '#059669',
    colorError: '#dc2626',
    colorWarning: '#d97706',
    colorInfo: '#4f46e5',
    colorBgLayout: '#f6f8fa',
    colorBgContainer: '#ffffff',
    colorBorder: '#e2e8f0',
    colorBorderSecondary: '#eef2f7',
    colorText: '#111827',
    colorTextSecondary: '#475569',
    colorTextTertiary: '#64748b',
    colorTextQuaternary: '#94a3b8',
    colorFillTertiary: '#f1f5f9',
  },
  components: {
    Table: {
      headerBg: '#f8fafc',
      headerColor: '#111827',
      headerSplitColor: '#eef2f7',
      rowHoverBg: '#f8fafc',
      borderColor: '#eef2f7',
      headerBorderRadius: 0,
    },
    Button: { fontWeight: 600, controlHeight: 32 },
    Input: { controlHeight: 32 },
    Select: { controlHeight: 32 },
    Modal: { borderRadiusLG: 14 },
    Drawer: { paddingLG: 20 },
    Tabs: { horizontalItemPadding: '10px 14px', titleFontSize: 13 },
  },
}

export const darkTheme: ThemeConfig = {
  token: {
    ...shared,
    colorPrimary: '#8b84f8',
    colorSuccess: '#34d399',
    colorError: '#f87171',
    colorWarning: '#fbbf24',
    colorInfo: '#8b84f8',
    colorBgLayout: '#0b0f16',
    colorBgContainer: '#141a23',
    colorBgElevated: '#1b2230',
    colorBorder: '#2e3a4b',
    colorBorderSecondary: '#222b38',
    colorText: '#e8edf4',
    colorTextSecondary: '#b2becd',
    colorTextTertiary: '#8995a6',
    colorTextQuaternary: '#6b7889',
    colorFillTertiary: '#1b2230',
  },
  components: {
    Table: {
      headerBg: '#111720',
      headerColor: '#e8edf4',
      headerSplitColor: '#222b38',
      rowHoverBg: '#1b2230',
      borderColor: '#222b38',
      headerBorderRadius: 0,
    },
    Button: { fontWeight: 600, controlHeight: 32 },
    Input: { controlHeight: 32 },
    Select: { controlHeight: 32 },
    Modal: { borderRadiusLG: 14 },
    Drawer: { paddingLG: 20 },
    Tabs: { horizontalItemPadding: '10px 14px', titleFontSize: 13 },
  },
}
