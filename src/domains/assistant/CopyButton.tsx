import { Copy } from 'lucide-react'
import { Button, useFeedback } from '@/ui'
import { copyToClipboard } from '@/lib/clipboard'

export function CopyButton({ text, label = '复制', size = 'small' }: { text: string; label?: string; size?: 'small' | 'middle' }) {
  const fb = useFeedback()
  return (
    <Button
      size={size}
      icon={<Copy size={13} />}
      onClick={() => {
        void copyToClipboard(text).then(() => fb.ok('已复制')).catch(() => fb.fail('复制失败，请选中文本手动复制'))
      }}
    >
      {label}
    </Button>
  )
}
