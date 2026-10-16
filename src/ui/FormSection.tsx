import { useId, type ReactNode } from 'react'

/** 同一业务分组中的字段共享标题、说明与响应式栅格。 */
export function FormSection({ title, description, children, extra, className = '' }: {
  title: string; description?: ReactNode; children: ReactNode; extra?: ReactNode; className?: string
}) {
  const id = useId()
  return <section className={`w-form-section ${className}`} aria-labelledby={id}>
    <header className="w-section-heading">
      <div><h3 id={id}>{title}</h3>{description && <p>{description}</p>}</div>
      {extra}
    </header>
    {children}
  </section>
}

export function FormField({ label, hint, children, wide = false }: {
  label: string; hint?: ReactNode; children: ReactNode; wide?: boolean
}) {
  return <div className={`w-form-field${wide ? ' w-form-field-wide' : ''}`}>
    <div className="w-form-label">{label}</div>
    {children}
    {hint && <div className="w-form-hint">{hint}</div>}
  </div>
}
