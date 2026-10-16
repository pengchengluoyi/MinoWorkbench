/** 使用明确的运行状态调度详情刷新，终态和未知态不能按通过推断。 */
const activeStatuses = new Set(['running', 'pending', 'queued', 'queue', 'in_progress', 'executing', 'created', 'submitted', 'started', 'initializing', 'init'])
const terminalStatuses = new Set(['pass', 'passed', 'success', 'succeeded', 'fail', 'failed', 'error', 'exception', 'blocked', 'cancel', 'cancelled', 'canceled', 'aborted', 'skip', 'skipped', 'done', 'completed', 'finished', 'stopped', 'give_up', 'declined'])
const normalized = (status: unknown) => String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
export const isExecutionActive = (status: unknown) => activeStatuses.has(normalized(status))
export const isExecutionTerminal = (status: unknown) => terminalStatuses.has(normalized(status))
export const liveRefreshDelay = (failures = 0) => Math.min(40_000, 5_000 * 2 ** Math.min(failures, 3))
