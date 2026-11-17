import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

// Painel de filtros padrão das telas: título "Filtros" com a quantidade de filtros ativos.
// No celular fica recolhido para a lista aparecer logo; no computador, aberto.
export function FilterPanel({ active, children }: { active: number; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <details
      open={typeof window !== 'undefined' && window.matchMedia?.('(min-width: 768px)').matches}
      className="mb-4 rounded-card border border-line bg-card"
    >
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium text-ink-soft">
        {t('pages.queue.filters')}
        {active > 0 && <span className="ml-2 rounded-full bg-selected px-2 py-0.5 text-xs text-action">{active}</span>}
      </summary>
      <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </details>
  )
}
