import { useTranslation } from 'react-i18next'

// Página provisória: cada tela do backlog substitui a sua ao longo dos Dias 1 a 7.
export function PlaceholderPage({ page }: { page: 'opportunities' | 'customers' | 'settings' }) {
  const { t } = useTranslation()
  return (
    <section>
      <h1 className="mb-4 text-2xl font-semibold">{t(`pages.${page}.title`)}</h1>
      <div className="rounded-card border border-line bg-card p-6 text-muted">{t(`pages.${page}.empty`)}</div>
    </section>
  )
}
