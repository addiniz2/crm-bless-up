import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <section>
      <h1 className="mb-4 text-2xl font-semibold">{t('pages.notFound.title')}</h1>
      <Link to="/" className="text-action">
        {t('pages.notFound.back')}
      </Link>
    </section>
  )
}
