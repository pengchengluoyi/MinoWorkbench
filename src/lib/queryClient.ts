import { QueryClient } from '@tanstack/react-query'

/**
 * 全局默认（开发手册 §8）。
 * refetchOnWindowFocus 关掉：这是个长时间开着的工作台，
 * 切回窗口就全量重取会让人以为页面自己动了。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
