import { useTranslation } from 'react-i18next'

// Indicação de carregamento: blocos cinza no formato da lista, em vez de tela em branco.
export function Loading({ rows = 3 }: { rows?: number }) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-label={t('app.loading')} className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="animate-pulse rounded-card border border-line bg-card p-4">
          <div className="mb-2 h-4 w-1/3 rounded bg-line" />
          <div className="h-3 w-2/3 rounded bg-line" />
        </div>
      ))}
    </div>
  )
}
