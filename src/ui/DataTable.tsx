import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Dropdown, Checkbox, Pagination, Table, Skeleton, Tooltip } from 'antd'
import type { TableProps } from 'antd'
import { Columns3, RotateCcw } from 'lucide-react'
import { EmptyState } from './EmptyState'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import { errText } from './feedback'

/** 列必须带稳定的 key —— 列配置持久化靠它认人。 */
export type DataColumn<T> = NonNullable<TableProps<T>['columns']>[number] & {
  key: string
  title: ReactNode
  /** 设为 true 则不允许用户隐藏（如主键列、操作列） */
  alwaysVisible?: boolean
}

export interface DataTableProps<T> {
  /** 列配置持久化的标识，全局唯一且稳定，例如 "admin.audit" */
  viewId: string
  columns: DataColumn<T>[]
  dataSource: T[] | undefined
  rowKey: keyof T | ((row: T) => string)
  loading?: boolean
  error?: unknown

  /** 表格上方工具条（筛选、搜索、新建） */
  toolbar?: ReactNode

  /** 服务端分页。不传则不分页 */
  pagination?: {
    page: number
    pageSize: number
    total: number
    onChange: (page: number, pageSize: number) => void
  }

  /** 批量选择 + 浮动操作条 */
  selection?: {
    selectedKeys: React.Key[]
    onChange: (keys: React.Key[]) => void
    actions: ReactNode
  }

  emptyTitle?: ReactNode
  emptyHint?: ReactNode
  /** 占满父级剩余高度，表体在里面滚，分页贴在底部 */
  fill?: boolean
  /** 虚拟滚动需要固定高度；不传则不开虚拟滚动 */
  scrollY?: number | string
  /** 超过这个行数才开虚拟滚动，默认 100 */
  virtualThreshold?: number
  /** 可用宽度不足时使用摘要卡片；选择和分页保持一致。 */
  renderCard?: (row: T) => ReactNode
  rowLabel?: (row: T) => string
  onRowClick?: (row: T) => void
  activeRowKey?: React.Key
  onRetry?: () => void
}

/**
 * 表格范式（开发手册 §7.1）。
 *
 * 原项目 402 处 `el-table-column` 是声明式子组件 + 作用域插槽，
 * 每个表格各写一套列宽、空态、分页。这里统一成：
 * 配置化 columns + 列显隐持久化 + 虚拟滚动 + 批量浮动操作条。
 *
 * 不要绕过它直接用 antd Table。
 */
export function DataTable<T extends object>({
  viewId,
  columns,
  dataSource,
  rowKey,
  loading,
  error,
  toolbar,
  pagination,
  selection,
  emptyTitle,
  emptyHint,
  fill,
  scrollY,
  virtualThreshold = 100,
  onRowClick, activeRowKey, onRetry, renderCard, rowLabel,
}: DataTableProps<T>) {
  const { isHidden, toggle, reset, hiddenCount } = useColumnConfig(viewId)

  const visibleColumns = useMemo(
    () => columns.filter((c) => c.alwaysVisible || !isHidden(c.key)),
    [columns, isHidden],
  )

  const columnMenu = useMemo(() => ({
    items: [
      ...columns
        .filter((c) => !c.alwaysVisible)
        .map((c) => ({
          key: c.key,
          label: (
            <Checkbox checked={!isHidden(c.key)} onClick={(e) => e.stopPropagation()}>
              {typeof c.title === 'string' ? c.title : c.key}
            </Checkbox>
          ),
        })),
      { type: 'divider' as const },
      {
        key: '__reset',
        label: (
          <span className="flex items-center gap-2">
            <RotateCcw size={13} /> 恢复默认
          </span>
        ),
      },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === '__reset') reset()
      else toggle(key)
    },
  }), [columns, isHidden, toggle, reset])

  const rows = dataSource ?? []
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(pagination?.pageSize || 20)
  const client = !pagination
  const safePage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)))
  useEffect(() => { if (client && page !== safePage) setPage(safePage) }, [client, page, safePage])
  const pageRows = client ? rows.slice((safePage - 1) * pageSize, safePage * pageSize) : rows
  const total = client ? rows.length : pagination.total
  const current = client ? safePage : Number.isFinite(pagination.page) ? Math.max(1, Math.trunc(pagination.page) || 1) : 1
  const size = client ? pageSize : pagination.pageSize

  const hostRef = useRef<HTMLDivElement>(null)
  const [bodyH, setBodyH] = useState(320)
  const [narrow, setNarrow] = useState(false)
  const cards = Boolean(renderCard && narrow)
  const keyOf = (row: T) => (typeof rowKey === 'function' ? rowKey(row) : row[rowKey]) as React.Key
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    let frame = 0
    const measure = () => {
      setNarrow(el.clientWidth < 720)
      if (!fill) return
      const head = el.querySelector('.ant-table-header') || el.querySelector('thead')
      const headHeight = head?.getBoundingClientRect().height || 0
      // Keep room for borders and a horizontal scrollbar without forcing a minimum body height.
      setBodyH(Math.max(1, Math.floor(el.clientHeight - headHeight - 18)))
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    const head = el.querySelector('.ant-table-header') || el.querySelector('thead')
    if (head) ro.observe(head)
    schedule()
    return () => { cancelAnimationFrame(frame); ro.disconnect() }
  }, [fill, cards, loading, pageRows.length, visibleColumns])

  const y = fill ? bodyH : scrollY
  const useVirtual = !!y && pageRows.length > virtualThreshold


  return (
    <div className={`w-data-table${fill ? ' is-fill' : ''}${cards ? ' is-cards' : ''}`}>
      {(toolbar || (cards && selection) || (!cards && columns.some((c) => !c.alwaysVisible))) && (
        <div className="w-table-toolbar">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">{toolbar}</div>
          {cards && selection && <Checkbox disabled={!pageRows.length} checked={pageRows.length > 0 && pageRows.every(row => selection.selectedKeys.includes(keyOf(row)))} indeterminate={pageRows.some(row => selection.selectedKeys.includes(keyOf(row))) && !pageRows.every(row => selection.selectedKeys.includes(keyOf(row)))} onChange={event => {
            const keys = pageRows.map(keyOf)
            selection.onChange(event.target.checked ? [...new Set([...selection.selectedKeys, ...keys])] : selection.selectedKeys.filter(key => !keys.includes(key)))
          }}>本页全选</Checkbox>}
          {!cards && <Dropdown menu={columnMenu} trigger={['click']} placement="bottomRight">
            <Tooltip title={hiddenCount ? `已隐藏 ${hiddenCount} 列` : '列显示'}>
              <Button size="small" icon={<Columns3 size={14} />}>
                {hiddenCount ? `列 (${hiddenCount})` : '列'}
              </Button>
            </Tooltip>
          </Dropdown>}
        </div>
      )}

      {error ? <div role="alert" style={{ ...card, padding: 12 }}><span>{errText(error, '读取失败')}</span>{rows.length ? <span> · 以下保留上次读取内容</span> : null}{onRetry ? <Button size="small" onClick={onRetry}>重试读取</Button> : null}</div> : null}
      <div ref={hostRef} className={`w-table-card${fill ? ' is-fill' : ''}${cards ? ' is-cards' : ''}`} style={card}>
        {loading && !rows.length ? (
          <div style={{ padding: 'var(--w-card-padding)' }}>
            <Skeleton active paragraph={{ rows: 6 }} title={false} />
          </div>
        ) : cards && renderCard ? (
          <div className="w-record-list" role="list" aria-busy={loading || undefined}>
            {!pageRows.length && <EmptyState title={emptyTitle} hint={emptyHint} />}
            {pageRows.map(row => {
              const key = keyOf(row)
              const selected = selection?.selectedKeys.includes(key)
              const content = renderCard(row)
              return <div role="listitem" key={key} className={`w-record-item${selected ? ' is-selected' : ''}${activeRowKey === key ? ' is-active' : ''}`}>
                {selection && <Checkbox aria-label={`选择${rowLabel?.(row) || '此项'}`} checked={selected} onChange={event => selection.onChange(event.target.checked ? [...selection.selectedKeys, key] : selection.selectedKeys.filter(value => value !== key))} />}
                {onRowClick ? <button type="button" className="w-record-open" aria-current={activeRowKey === key ? true : undefined} aria-label={`查看${rowLabel?.(row) || '详情'}`} onClick={() => onRowClick(row)}>{content}</button> : <div className="w-record-content">{content}</div>}
              </div>
            })}
          </div>
        ) : (
          <Table<T>
            size="small"
            columns={visibleColumns}
            dataSource={pageRows}
            rowKey={rowKey as any}
            loading={loading && !!rows.length}
            virtual={useVirtual}
            scroll={y ? { y, x: 'max-content' } : { x: 'max-content' }}
            pagination={false}
            rowSelection={
              selection
                ? {
                    selectedRowKeys: selection.selectedKeys,
                    onChange: selection.onChange,
                    preserveSelectedRowKeys: true,
                  }
                : undefined
            }
            rowClassName={row => activeRowKey != null && (typeof rowKey === 'function' ? rowKey(row) : row[rowKey]) === activeRowKey ? 'w-detail-row-active' : ''}
            onRow={onRowClick ? (row) => ({
              onClick: (event) => {
                const target = event.target as HTMLElement | null
                if (target?.closest('button, a, input, label, .ant-checkbox, .ant-dropdown')) return
                onRowClick(row)
              },
              tabIndex: 0,
              'aria-label': `查看${rowLabel?.(row) || '详情'}`,
              onKeyDown: (event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onRowClick(row) } },
              style: { cursor: 'pointer' },
            }) : undefined}
            locale={{
              emptyText: <EmptyState title={emptyTitle} hint={emptyHint} />,
            }}
          />
        )}
      </div>

      {total > 0 && (
        <div className="w-table-pagination">
          <Pagination
            size="small"
            current={current}
            pageSize={size}
            total={total}
            showSizeChanger
            pageSizeOptions={[20, 50, 100, 200]}
            showTotal={(t) => `共 ${t} 条`}
            onChange={(next, nextSize) => {
              if (client) {
                setPage(next)
                setPageSize(nextSize)
              } else {
                pagination.onChange(next, nextSize)
              }
            }}
          />
        </div>
      )}

      {selection && selection.actions != null && selection.selectedKeys.length > 0 && (
        <FloatingActions count={selection.selectedKeys.length} onClear={() => selection.onChange([])}>
          {selection.actions}
        </FloatingActions>
      )}
    </div>
  )
}

const card: React.CSSProperties = {
  background: 'var(--w-surface)',
  border: '1px solid var(--w-border)',
  borderRadius: 'var(--w-radius-lg)',
  overflow: 'hidden',
  minHeight: 0,
}

/** 批量操作浮动条。替掉原来"每行堆一排按钮"的做法。 */
function FloatingActions({
  count,
  onClear,
  children,
}: {
  count: number
  onClear: () => void
  children: ReactNode
}) {
  return (
    <div
      className="flex items-center gap-3"
      style={{
        position: 'sticky',
        bottom: 'var(--w-space-3)',
        alignSelf: 'center',
        padding: '8px 12px 8px 16px',
        borderRadius: 'var(--w-radius-pill)',
        background: 'var(--w-text)',
        color: 'var(--w-text-inverse)',
        boxShadow: 'var(--w-shadow-lg)',
        zIndex: 10,
      }}
    >
      <span style={{ fontSize: 'var(--w-font-sm)', fontWeight: 650 }}>已选 {count} 项</span>
      <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.25)' }} />
      {children}
      <Button type="text" size="small" onClick={onClear} style={{ color: 'rgba(255,255,255,0.7)' }}>
        取消
      </Button>
    </div>
  )
}
