import { request } from '@/lib/request'
import type { RuntimeStatus } from '@/types/auth'

export const getRuntimeStatus = () => request<RuntimeStatus>({ url: '/sys/runtime', method: 'get' })
