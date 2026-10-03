/**
 * 从 Nexus 信封里取列表。
 *
 * 为什么需要这个：Nexus 各接口把数组放在不同的键下
 *   /project/:id/cases   → { data: { cases: [...] } }
 *   /case-runner/tasks   → { data: { items: [...] } } 或 { data: { tasks: [...] } }
 *   /runtime/nodes       → { data: { nodes: [...] } } 或 { data: [...] }
 *
 * 猜错一个键，结果是**静默空列表** —— 页面显示"暂无数据"，
 * 和真的没数据长得一模一样。这类 bug 极难查（用例页就踩过一次）。
 *
 * 所以这里做两件事：按候选键依次找；**找不到数组但 payload 非空时抛错**，
 * 让形状不匹配立刻变成可见的错误，而不是一个干净的空态。
 */
export interface UnwrapOptions {
  /** 候选键，按顺序尝试。例如 ['cases', 'items'] */
  keys?: string[]
  /** 出错信息里标明是哪个接口 */
  label: string
}

export function unwrapList<T = unknown>(res: unknown, { keys = [], label }: UnwrapOptions): T[] {
  if (Array.isArray(res)) return res as T[]

  const envelope = res as Record<string, unknown> | null | undefined
  const body = (envelope?.data ?? envelope) as unknown

  if (Array.isArray(body)) return body as T[]

  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>
    for (const key of [...keys, 'items', 'rows', 'list', 'results']) {
      if (Array.isArray(obj[key])) return obj[key] as T[]
    }
    // 对象里一个数组都没有：要么接口真的返回了空对象，要么键名变了。
    // 后者必须喊出来，否则就是一个假装"暂无数据"的 bug。
    const found = Object.keys(obj)
    if (found.length) {
      throw new Error(
        `${label} 的返回体里找不到列表字段。`
        + `收到的键：${found.slice(0, 8).join(', ')}；`
        + `期望其中之一：${[...keys, 'items', 'rows', 'list', 'results'].join(', ')}。`
        + '这通常是 Nexus 改了字段名，请同步 unwrapList 的候选键。',
      )
    }
  }

  return []
}

/** 取单个对象（详情类接口）。 */
export function unwrapOne<T = unknown>(res: unknown): T | undefined {
  const envelope = res as Record<string, unknown> | null | undefined
  return ((envelope?.data ?? envelope) as T) || undefined
}

/**
 * 稳定的空数组 / 空对象。
 *
 * `const rows = query.data || []` 每次渲染都造一个新数组，
 * 下游 useMemo / useEffect 的依赖就永远在变，缓存等于没做
 * （这个坑已经踩了三次）。一律改成 `query.data ?? EMPTY_ARRAY`。
 */
export const EMPTY_ARRAY: never[] = []
export const EMPTY_OBJECT: Record<string, never> = {}
