import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

// Janela modal simples: no celular ocupa a base da tela; no computador fica centralizada.
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-card bg-card p-5 sm:max-w-md sm:rounded-card"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-3 text-sm text-muted">
            {t('common.cancel')}
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
