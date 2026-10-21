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
import { isAuthStorageKey } from '@/lib/tokens'

export default function App() {
  // 读一次偏好并把 data-theme / data-density 打到 <html> 上
  useAppearance()
  const dark = useResolvedDark()
  const clear = useSession((s) => s.clear)
  const syncFromStorage = useSession((s) => s.syncFromStorage)

  // request.ts 在真掉线时派这个事件（它不反向依赖业务模块，避免循环引用）
  useEffect(() => {
    const onUnauthorized = () => {
      clear()
      queryClient.clear()
    }
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage && isAuthStorageKey(event.key)) syncFromStorage()
    }
    window.addEventListener('mino:unauthorized', onUnauthorized)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('mino:unauthorized', onUnauthorized)
      window.removeEventListener('storage', onStorage)
    }
  }, [clear, syncFromStorage])

  return (
    <ConfigProvider locale={zhCN} button={{ autoInsertSpace: false }} theme={dark ? darkTheme : lightTheme}>
      <FeedbackProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </FeedbackProvider>
    </ConfigProvider>
  )
}
