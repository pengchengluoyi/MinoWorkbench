import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { QueryClientProvider } from '@tanstack/react-query'
import { router } from '@/router'
import { queryClient } from '@/lib/queryClient'
import { darkTheme, FeedbackProvider, lightTheme } from '@/ui'
import { useAppearance, useResolvedDark } from '@/hooks/useAppearance'
import { useSession } from '@/lib/session'

export default function App() {
  // 读一次偏好并把 data-theme / data-density 打到 <html> 上
  useAppearance()
  const dark = useResolvedDark()
  const clear = useSession((s) => s.clear)

  // request.ts 在真掉线时派这个事件（它不反向依赖业务模块，避免循环引用）
  useEffect(() => {
    const onUnauthorized = () => {
      clear()
      queryClient.clear()
    }
    window.addEventListener('mino:unauthorized', onUnauthorized)
    return () => window.removeEventListener('mino:unauthorized', onUnauthorized)
  }, [clear])

  return (
    <ConfigProvider locale={zhCN} theme={dark ? darkTheme : lightTheme}>
      <FeedbackProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </FeedbackProvider>
    </ConfigProvider>
  )
}
