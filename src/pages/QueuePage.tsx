import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/context'
import { ContactDialog, ConversationDialog } from '../components/LeadActionDialogs'
import { LeadFilters } from '../components/LeadFilters'
import { Loading } from '../components/Loading'
import { useToast } from '../components/Toast'
import { listLeadTypes, type ListItem } from '../lib/leads'
import {
  QUEUE_STATUSES,
  NO_FILTERS,
  QUEUE_TABS,
  applyFilters,
  countByTab,
  listQueue,
  listUsers,
  rowsForTab,
  setOwner,
  setQueueStatus,
  type AppUser,
  type QueueFilters,
  type QueueRow,
  type QueueStatus,
  type QueueTab,
} from '../lib/queue'

const quickAction =
  'inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-center text-xs font-medium leading-tight disabled:opacity-50 sm:text-sm sm:whitespace-nowrap'

const selectClass =
  'min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink focus:border-action focus:outline-none'

// Minha fila (BU-08): abas por situação, Atrasados pela data do próximo passo,
// mudar situação e atribuir responsável direto na linha.
export function QueuePage() {
  const { t, i18n } = useTranslation()
  const { session } = useAuth()
  const me = session?.user.id ?? ''
  const [rows, setRows] = useState<QueueRow[] | null>(null)
  const [users, setUsers] = useState<AppUser[]>([])
  const [types, setTypes] = useState<ListItem[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [tab, setTab] = useState<QueueTab>('NEW')
  const [filters, setFilters] = useState<QueueFilters>(NO_FILTERS)
  const [action, setAction] = useState<{ kind: 'conversation' | 'contact'; row: QueueRow } | null>(null)

  const fetchAll = useCallback(
    () =>
      Promise.all([listQueue(), listUsers(), listLeadTypes()])
        .then(([queue, appUsers, leadTypes]) => {
          setRows(queue)
          setUsers(appUsers)
          setTypes(leadTypes)
          setLoadFailed(false)
        })
        .catch(() => setLoadFailed(true)),
    [],
  )

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  const filtered = useMemo(() => applyFilters(rows ?? [], filters), [rows, filters])
  const counts = useMemo(() => countByTab(filtered), [filtered])
  const visible = useMemo(() => rowsForTab(filtered, tab), [filtered, tab])
  const dateTime = new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const date = new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: '2-digit', year: 'numeric' })

  const toast = useToast()

  async function change(action: () => Promise<void>, successKey: string) {
    setSaveFailed(false)
    try {
      await action()
      toast.show(t(successKey))
      await fetchAll()
    } catch {
      setSaveFailed(true)
    }
  }

  return (
    <section>
      <h1 className="mb-4 text-2xl font-semibold">{t('pages.queue.title')}</h1>

      <div role="tablist" aria-label={t('pages.queue.title')} className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
        {QUEUE_TABS.map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap ${
              tab === key ? 'bg-selected text-action' : 'text-ink-soft hover:bg-card'
            }`}
          >
            {t(`pages.queue.tabs.${key}`)}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                key === 'OVERDUE' && counts.OVERDUE > 0 ? 'bg-risk-bg text-risk' : 'bg-card text-muted'
              }`}
            >
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      <LeadFilters filters={filters} onChange={setFilters} users={users} types={types} />

      {loadFailed && (
        <div role="alert" className="mb-4 rounded-lg bg-risk-bg p-3 text-sm text-risk">
          {t('common.loadError')}{' '}
          <button type="button" onClick={() => void fetchAll()} className="min-h-11 font-semibold underline">
            {t('common.retry')}
          </button>
        </div>
      )}
      {saveFailed && (
        <p role="alert" className="mb-4 rounded-lg bg-risk-bg p-3 text-sm text-risk">
          {t('pages.queue.saveError')}
        </p>
      )}

      {!rows && !loadFailed && <Loading />}

      {rows && visible.length === 0 && (
        <div className="rounded-card border border-line bg-card p-6 text-muted">{t('pages.queue.emptyTab')}</div>
      )}

      {visible.length > 0 && (
        <ul className="space-y-3" role="tabpanel">
          {visible.map((row) => (
            <li
              key={row.id}
              className={`rounded-card border bg-card p-4 ${row.owner_id === null ? 'border-warning' : 'border-line'}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link to={`/leads/${row.id}`} state={{ from: '/' }} className="block truncate font-medium text-action underline-offset-2 hover:underline">
                    {row.full_name}
                  </Link>
                  <p className="truncate text-sm text-muted">
                    {[row.company_name, row.lead_type_name, row.country && t(`codes.country.${row.country}`), t(`codes.leadStage.${row.stage}`)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 text-xs">
                  {row.owner_id === null && (
                    <span className="rounded-full bg-warning-bg px-2 py-1 text-warning">{t('pages.queue.unassigned')}</span>
                  )}
                  {row.is_overdue && <span className="rounded-full bg-risk-bg px-2 py-1 text-risk">{t('pages.queue.overdue')}</span>}
                  {row.queue_status === 'IN_PROGRESS' && row.missing_next_step && (
                    <span className="rounded-full bg-warning-bg px-2 py-1 text-warning">{t('pages.queue.missingNextStep')}</span>
                  )}
                  {row.pending_delivery_confirmation && (
                    <span className="rounded-full bg-warning-bg px-2 py-1 text-warning">{t('pages.queue.pendingDelivery')}</span>
                  )}
                  {row.whatsapp_status === 'INVALID' && (
                    <span className="rounded-full bg-risk-bg px-2 py-1 text-risk">{t('pages.queue.whatsappInvalid')}</span>
                  )}
                  {row.needs_completion && (
                    <span className="rounded-full bg-warning-bg px-2 py-1 text-warning">{t('pages.queue.needsCompletion')}</span>
                  )}
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                <div className="flex gap-1">
                  <dt className="text-muted">{t('pages.queue.lastContact')}:</dt>
                  <dd>{row.last_contact_at ? date.format(new Date(row.last_contact_at)) : t('pages.queue.never')}</dd>
                </div>
                <div className="flex min-w-0 gap-1">
                  <dt className="shrink-0 text-muted">{t('pages.queue.nextStep')}:</dt>
                  <dd className={`truncate ${row.is_overdue ? 'text-risk' : ''}`}>
                    {row.next_step_at
                      ? `${dateTime.format(new Date(row.next_step_at))}${row.next_step ? ` · ${row.next_step}` : ''}`
                      : t('pages.queue.none')}
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-1">
                <select
                  aria-label={t('pages.queue.changeStatus', { name: row.full_name })}
                  value={row.queue_status}
                  onChange={(e) => void change(() => setQueueStatus(row.id, e.target.value as QueueStatus), 'toast.statusChanged')}
                  className={`${selectClass} sm:max-w-56`}
                >
                  {QUEUE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {t(`codes.queueStatus.${status}`)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t('pages.queue.assign', { name: row.full_name })}
                  value={row.owner_id ?? ''}
                  onChange={(e) => void change(() => setOwner(row.id, e.target.value || null), 'toast.ownerChanged')}
                  className={`${selectClass} sm:max-w-56`}
                >
                  <option value="">{t('pages.queue.unassigned')}</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.id === me ? `${user.full_name} (${t('pages.queue.me')})` : user.full_name}
                    </option>
                  ))}
                </select>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:ml-auto sm:flex">
                  <button
                    type="button"
                    onClick={() => setAction({ kind: 'conversation', row })}
                    disabled={!row.whatsapp || row.whatsapp_status === 'INVALID'}
                    aria-label={t('pages.queue.startConversationOf', { name: row.full_name })}
                    className={`${quickAction} border-action bg-action text-white`}
                  >
                    {t('leadDetail.actions.startConversation')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAction({ kind: 'contact', row })}
                    aria-label={t('pages.queue.registerContactOf', { name: row.full_name })}
                    className={`${quickAction} border-action text-action hover:bg-selected`}
                  >
                    {t('leadDetail.actions.registerContact')}
                  </button>
                  <Link
                    to={`/leads/${row.id}`}
                    state={{ from: '/' }}
                    aria-label={t('pages.queue.openLeadOf', { name: row.full_name })}
                    className={`${quickAction} border-line text-ink-soft hover:bg-page`}
                  >
                    {t('pages.queue.openLead')}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {action?.kind === 'conversation' && (
        <ConversationDialog
          lead={action.row}
          ownerName={users.find((user) => user.id === action.row.owner_id)?.full_name ?? ''}
          onClose={() => setAction(null)}
          onDone={async () => {
            await fetchAll()
          }}
        />
      )}
      {action?.kind === 'contact' && (
        <ContactDialog
          leadId={action.row.id}
          onClose={() => setAction(null)}
          onDone={async () => {
            await fetchAll()
          }}
        />
      )}
    </section>
  )
}
