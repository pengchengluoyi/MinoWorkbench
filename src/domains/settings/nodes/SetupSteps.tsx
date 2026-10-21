import { Check, LoaderCircle } from 'lucide-react'
import './SetupSurface.css'

export function SetupSteps({ steps, current, busy = false, label = '接入步骤' }: {
  steps: { title: string; description: string }[]; current: number; busy?: boolean; label?: string
}) {
  return <ol className="w-setup-steps" aria-label={label} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
    {steps.map((step, index) => {
      const done = index < current
      const selected = index === current
      return <li key={step.title} className="w-setup-step" data-state={done ? 'done' : selected ? 'current' : 'pending'} aria-current={selected ? 'step' : undefined}>
        <div className="w-setup-step-track"><span className="w-setup-step-icon">{done ? <Check size={16} strokeWidth={2.5} aria-hidden /> : selected && busy ? <LoaderCircle className="w-setup-spin" size={16} aria-hidden /> : index + 1}</span></div>
        <strong>{step.title}<span className="w-setup-sr">{done ? '，已完成' : selected ? '，当前步骤' : '，待进行'}</span></strong><small>{step.description}</small>
      </li>
    })}
  </ol>
}
