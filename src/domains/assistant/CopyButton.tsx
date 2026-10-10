import { Copy } from 'lucide-react'
import { Button, useFeedback } from '@/ui'

/** 一键复制。剪贴板不可用（非 https / 无权限）时给出明确提示，不静默失败。 */
export function CopyButton({ text, label = '复制', size = 'small' }: { text: string; label?: string; size?: 'small' | 'middle' }) {
  const fb = useFeedback()
  return (
    <Button
      size={size}
      icon={<Copy size={13} />}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => fb.ok('已复制')).catch(() => fb.fail('剪贴板不可用，请手动选中复制'))
      }}
    >
      {label}
    </Button>
  )
}
