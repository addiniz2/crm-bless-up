import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatStoredWhatsapp } from '../lib/phone'
import { searchLeads, type SearchResult } from '../lib/search'

// Busca rápida: encontra o lead pelo nome, empresa, e-mail ou WhatsApp (ex.: quando ele responde no WhatsApp).
export function SearchPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const term = params.get('q') ?? ''
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (term.trim().length < 2) return
    // Espera a pessoa parar de digitar antes de consultar.
    const timer = setTimeout(() => {
      searchLeads(term)
        .then((rows) => {
          setResults(rows)
          setFailed(false)
        })
        .catch(() => setFailed(true))
    }, 250)
    return () => clearTimeout(timer)
  }, [term])

  const tooShort = term.trim().length < 2

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-semibold">{t('search.title')}</h1>
      <label className="mb-4 block text-sm font-medium text-ink-soft">
        {t('search.label')}
        <input
          type="search"
          autoFocus
          value={term}
          onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
          placeholder={t('search.placeholder')}
          className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-card px-3 text-base text-ink focus:border-action focus:outline-none"
        />
      </label>

      {failed && (
        <p role="alert" className="mb-4 rounded-lg bg-risk-bg p-3 text-sm text-risk">
          {t('common.loadError')}
        </p>
      )}
      {tooShort && <p className="text-sm text-muted">{t('search.hint')}</p>}
      {!tooShort && results && results.length === 0 && <p className="text-sm text-muted">{t('search.empty')}</p>}

      {!tooShort && results && results.length > 0 && (
        <ul className="divide-y divide-line rounded-card border border-line bg-card" aria-live="polite">
          {results.map((row) => (
            <li key={row.id}>
              <Link to={`/leads/${row.id}`} className="flex flex-col gap-1 p-4 hover:bg-page sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{row.full_name}</span>
                  <span className="block truncate text-sm text-muted">
                    {[row.company_name, formatStoredWhatsapp(row.whatsapp), row.email].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-selected px-2.5 py-1 text-sm text-action">{t(`codes.leadStage.${row.stage}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
