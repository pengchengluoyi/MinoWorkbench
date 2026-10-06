import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Dropdown, Checkbox, Pagination, Table, Skeleton, Tooltip } from 'antd'
import type { TableProps } from 'antd'
import { Columns3, RotateCcw, TriangleAlert } from 'lucide-react'
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
  onRowClick?: (row: T) => void
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
  onRowClick,
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
  const pageRows = client ? rows.slice((page - 1) * pageSize, page * pageSize) : rows
  const total = client ? rows.length : pagination.total
  const current = client ? page : pagination.page
  const size = client ? pageSize : pagination.pageSize

  const hostRef = useRef<HTMLDivElement>(null)
  const [bodyH, setBodyH] = useState(320)
  useEffect(() => {
    if (!fill || !hostRef.current) return
    const el = hostRef.current
    const measure = () => setBodyH(Math.max(120, el.clientHeight - 40))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fill, pageRows.length])

  const y = fill ? bodyH : scrollY
  const useVirtual = !!y && pageRows.length > virtualThreshold

  if (error) {
    return (
      <div style={card}>
        <EmptyState
          icon={<TriangleAlert size={30} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />}
          title="读取失败"
          hint={errText(error, '接口没有返回数据。确认 Nexus 是否已启动。')}
        />
      </div>
    )
  }

  return (
    <div className={fill ? 'flex h-full min-h-0 flex-1 flex-col' : 'flex flex-col'} style={{ minHeight: 0, gap: 'var(--w-space-2)' }}>
      {(toolbar || columns.some((c) => !c.alwaysVisible)) && (
        <div className="flex flex-wrap items-center gap-2" style={{ minHeight: 32 }}>
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">{toolbar}</div>
          <Dropdown menu={columnMenu} trigger={['click']} placement="bottomRight">
            <Tooltip title={hiddenCount ? `已隐藏 ${hiddenCount} 列` : '列显示'}>
              <Button size="small" icon={<Columns3 size={14} />}>
                {hiddenCount ? `列 (${hiddenCount})` : '列'}
              </Button>
            </Tooltip>
          </Dropdown>
        </div>
      )}

      <div ref={hostRef} className={fill ? 'min-h-0 flex-1' : undefined} style={card}>
        {loading && !rows.length ? (
          <div style={{ padding: 'var(--w-card-padding)' }}>
            <Skeleton active paragraph={{ rows: 6 }} title={false} />
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
            onRow={onRowClick ? (row) => ({
              onClick: (event) => {
                const target = event.target as HTMLElement | null
                if (target?.closest('button, a, input, label, .ant-checkbox, .ant-dropdown')) return
                onRowClick(row)
              },
              style: { cursor: 'pointer' },
            }) : undefined}
            locale={{
              emptyText: <EmptyState title={emptyTitle} hint={emptyHint} />,
            }}
          />
        )}
      </div>

      {total > 0 && (
        <div className="flex shrink-0 justify-end">
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

      {selection && selection.selectedKeys.length > 0 && (
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
