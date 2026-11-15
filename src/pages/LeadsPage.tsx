import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { listLeads, type LeadRow } from '../lib/leads'

// Lista simples de leads. O kanban por etapa entra no BU-09.
export function LeadsPage() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const justCreated = Boolean((location.state as { created?: string } | null)?.created)
  const [leads, setLeads] = useState<LeadRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  const fetchLeads = useCallback(
    () =>
      listLeads()
        .then((rows) => {
          setLeads(rows)
          setFailed(false)
        })
        .catch(() => setFailed(true)),
    [],
  )

  useEffect(() => {
    void fetchLeads()
  }, [fetchLeads])

  const dateFormat = new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('pages.leads.title')}</h1>
        <Link to="/leads/novo" className="inline-flex min-h-11 items-center rounded-lg bg-action px-4 text-sm font-medium text-white">
          {t('pages.leads.new')}
        </Link>
      </div>

      {justCreated && (
        <p role="status" className="mb-4 rounded-lg bg-healthy-bg p-3 text-sm text-healthy">
          {t('pages.leads.created')}
        </p>
      )}

      {failed && (
        <div role="alert" className="mb-4 rounded-lg bg-risk-bg p-3 text-sm text-risk">
          {t('common.loadError')}{' '}
          <button type="button" onClick={() => void fetchLeads()} className="min-h-11 font-semibold underline">
            {t('common.retry')}
          </button>
        </div>
      )}

      {leads && leads.length === 0 && (
        <div className="rounded-card border border-line bg-card p-6 text-muted">{t('pages.leads.empty')}</div>
      )}

      {leads && leads.length > 0 && (
        <ul className="divide-y divide-line rounded-card border border-line bg-card">
          {leads.map((lead) => (
            <li key={lead.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium">{lead.full_name}</p>
                <p className="truncate text-sm text-muted">
                  {[lead.company_name, lead.lead_type?.name, lead.country && t(`codes.country.${lead.country}`)]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <span className="rounded-full bg-selected px-2.5 py-1 text-action">{t(`codes.leadStage.${lead.stage}`)}</span>
                <span className="text-muted">{dateFormat.format(new Date(lead.created_at))}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
