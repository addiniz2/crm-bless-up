import { peekSnapshot, saveSnapshot } from '../lib/cache'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FilterPanel } from '../components/FilterPanel'
import { Loading } from '../components/Loading'
import { CUSTOMER_STATUSES, getCustomerIndicators, listCustomers, type CustomerIndicators, type CustomerRow, type CustomerStatus } from '../lib/customers'
import { formatMoney } from '../lib/opportunities'
import { listUsers, type AppUser } from '../lib/queue'

const STATUS_STYLE: Record<CustomerStatus, string> = {
  ACTIVE: 'bg-healthy-bg text-healthy',
  PAUSED: 'bg-warning-bg text-warning',
  CANCELLATION_NOTICE: 'bg-risk-bg text-risk',
  CANCELLED: 'bg-page text-muted',
}

// Clientes (BU-12, versão básica): mensalidade com moeda e totais separados por moeda.
// Saúde, renovação, pausa e cancelamento completos entram no BU-21.
export function CustomersPage() {
  const { t, i18n } = useTranslation()
  const [rows, setRows] = useState<CustomerRow[] | null>(() => peekSnapshot<CustomerRow[]>('customers'))
  const [indicators, setIndicators] = useState<CustomerIndicators | null>(() => peekSnapshot<CustomerIndicators>('customerIndicators'))
  const [users, setUsers] = useState<AppUser[]>([])
  const [failed, setFailed] = useState(false)
  const [status, setStatus] = useState<CustomerStatus | ''>('')
  const [search, setSearch] = useState('')
  const [owner, setOwner] = useState<'ALL' | 'NONE' | (string & {})>('ALL')

  const fetchAll = useCallback(
    () =>
      Promise.all([listCustomers(), getCustomerIndicators(), listUsers()])
        .then(([customers, numbers, appUsers]) => {
          setRows(customers)
          saveSnapshot('customers', customers)
          saveSnapshot('customerIndicators', numbers)
          setIndicators(numbers)
          setUsers(appUsers)
          setFailed(false)
        })
        .catch(() => setFailed(true)),
    [],
  )

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  // Busca sem diferenciar maiúsculas nem acentos (ex.: "gomez" encontra "Gómez").
  const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const visible = useMemo(() => {
    const term = normalize(search.trim())
    return (rows ?? []).filter((row) => {
      if (status && row.status !== status) return false
      if (owner === 'NONE' && row.owner_id !== null) return false
      if (owner !== 'ALL' && owner !== 'NONE' && row.owner_id !== owner) return false
      if (term && !normalize(`${row.name} ${row.contact_name ?? ''}`).includes(term)) return false
      return true
    })
  }, [rows, status, owner, search])
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeZone: 'UTC' })
  const ownerName = (id: string | null) => users.find((user) => user.id === id)?.full_name

  return (
    <section>
      <h1 className="mb-4 text-2xl font-semibold">{t('pages.customers.title')}</h1>

      {indicators && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-card border border-line bg-card p-4">
            <p className="text-sm text-muted">{t('pages.customers.activeCustomers')}</p>
            <p className="mt-1 text-2xl font-semibold">{indicators.active_customers}</p>
          </div>
          <div className="rounded-card border border-line bg-card p-4">
            <p className="text-sm text-muted">{t('pages.customers.monthlyRevenue')}</p>
            {indicators.monthly_revenue.length === 0 ? (
              <p className="mt-1 text-lg font-semibold">{t('pages.customers.noneYet')}</p>
            ) : (
              indicators.monthly_revenue.map((total) => (
                <p key={total.currency} className="mt-1 text-lg font-semibold">
                  {t('pages.customers.revenueLine', { value: formatMoney(total.value, total.currency, i18n.language), count: total.count })}
                </p>
              ))
            )}
          </div>
        </div>
      )}

      {failed && (
        <div role="alert" className="mb-4 rounded-lg bg-risk-bg p-3 text-sm text-risk">
          {t('common.loadError')}{' '}
          <button type="button" onClick={() => void fetchAll()} className="min-h-11 font-semibold underline">
            {t('common.retry')}
          </button>
        </div>
      )}

      <FilterPanel active={Number(search.trim() !== '') + Number(status !== '') + Number(owner !== 'ALL')}>
        <label className="text-sm text-ink-soft">
          {t('pages.customers.search')}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('pages.customers.searchPlaceholder')}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm"
          />
        </label>
        <label className="text-sm text-ink-soft">
          {t('pages.customers.filterStatus')}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CustomerStatus | '')}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm"
          >
            <option value="">{t('pages.customers.all')}</option>
            {CUSTOMER_STATUSES.map((code) => (
              <option key={code} value={code}>
                {t(`codes.customerStatus.${code}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-soft">
          {t('pages.customers.filterOwner')}
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm">
            <option value="ALL">{t('pages.customers.ownerAll')}</option>
            <option value="NONE">{t('pages.customers.unassigned')}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name}
              </option>
            ))}
          </select>
        </label>
      </FilterPanel>

      {!rows && !failed && <Loading />}

      {rows && visible.length === 0 && (
        <div className="rounded-card border border-line bg-card p-6 text-muted">
          {t(rows.length > 0 ? 'pages.customers.emptyFiltered' : 'pages.customers.empty')}
        </div>
      )}

      {visible.length > 0 && (
        <ul className="divide-y divide-line rounded-card border border-line bg-card">
          {visible.map((row) => (
            <li key={row.account_id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium">{row.name}</p>
                <p className="truncate text-sm text-muted">
                  {[row.contact_name, t(`codes.country.${row.country}`), ownerName(row.owner_id)].filter(Boolean).join(' · ')}
                </p>
                <p className="text-xs text-muted">
                  {[
                    row.customer_since && t('pages.customers.since', { date: date.format(new Date(row.customer_since)) }),
                    row.renewal_date && t('pages.customers.renewal', { date: date.format(new Date(row.renewal_date)) }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{formatMoney(row.monthly_fee, row.currency, i18n.language)}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs ${STATUS_STYLE[row.status]}`}>{t(`codes.customerStatus.${row.status}`)}</span>
                {row.source_lead_id && (
                  <Link to={`/leads/${row.source_lead_id}`} className="inline-flex min-h-11 items-center text-action">
                    {t('pages.customers.history')}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-muted">{t('pages.customers.detailSoon')}</p>
    </section>
  )
}
