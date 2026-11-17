import { peekSnapshot, saveSnapshot } from '../lib/cache'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BOARD_STAGES, changeLeadStage, getIndicators, type BoardStage, type Indicators, type StageError } from '../lib/pipeline'
import { LeadFilters } from '../components/LeadFilters'
import { Loading } from '../components/Loading'
import { StageBoard } from '../components/StageBoard'
import { ImportantBadge, ImportantToggle } from '../components/ImportantToggle'
import { useToast } from '../components/Toast'
import { listLeadTypes, type ListItem } from '../lib/leads'
import { NO_FILTERS, applyFilters, listQueue, listUsers, setLeadImportant, type AppUser, type QueueFilters, type QueueRow } from '../lib/queue'

type View = 'board' | 'list'

// Leads (BU-09): indicadores, kanban por etapa com arrastar (computador) e seletor de etapa (celular e teclado).
// A mudança de etapa passa pela função do banco, que grava o histórico.
export function LeadsPage() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const justCreated = Boolean((location.state as { created?: string } | null)?.created)
  const [rows, setRows] = useState<QueueRow[] | null>(() => peekSnapshot<QueueRow[]>('queue'))
  const [users, setUsers] = useState<AppUser[]>([])
  const [indicators, setIndicators] = useState<Indicators | null>(() => peekSnapshot<Indicators>('leadIndicators'))
  const [failed, setFailed] = useState(false)
  const [stageError, setStageError] = useState<StageError | null>(null)
  const [view, setView] = useState<View>('board')
  const [types, setTypes] = useState<ListItem[]>([])
  const [filters, setFilters] = useState<QueueFilters>(NO_FILTERS)

  const fetchAll = useCallback(
    () =>
      Promise.all([listQueue(), getIndicators(), listUsers(), listLeadTypes()])
        .then(([leads, numbers, appUsers, leadTypes]) => {
          setRows(leads)
          saveSnapshot('queue', leads)
          saveSnapshot('leadIndicators', numbers)
          setTypes(leadTypes)
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

  const toast = useToast()
  const shortDate = new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: '2-digit' })

  // Marcador Importante: muda na tela na hora e grava; se falhar, volta e avisa
  async function toggleImportant(id: string, value: boolean) {
    const flip = (list: QueueRow[] | null) => list?.map((row) => (row.id === id ? { ...row, is_important: value } : row)) ?? list
    setRows(flip)
    try {
      await setLeadImportant(id, value)
    } catch {
      setRows((list) => list?.map((row) => (row.id === id ? { ...row, is_important: !value } : row)) ?? list)
      toast.show(t('important.error'))
    }
  }

  async function move(leadId: string, stage: BoardStage) {
    const current = rows?.find((row) => row.id === leadId)
    if (!current || current.stage === stage) return
    setStageError(null)
    // Mostra a mudança na hora; se o banco recusar, recarrega o estado real.
    setRows((previous) => previous?.map((row) => (row.id === leadId ? { ...row, stage } : row)) ?? null)
    const error = await changeLeadStage(leadId, stage)
    if (error) setStageError(error)
    else toast.show(t('toast.stageChanged'))
    await fetchAll()
  }

  const visible = useMemo(() => (rows ? applyFilters(rows, filters) : null), [rows, filters])
  const ownerName = (id: string | null) => users.find((user) => user.id === id)?.full_name

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('pages.leads.title')}</h1>
        <Link to="/leads/novo" className="inline-flex min-h-11 items-center rounded-lg bg-action px-4 text-sm font-medium text-white">
          {t('pages.leads.new')}
        </Link>
      </div>

      {indicators && (
        <dl className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {(['in_funnel', 'new_this_week', 'meetings_scheduled', 'converted_this_month'] as const).map((key) => (
            <div key={key} className="rounded-card border border-line bg-card p-4">
              <dt className="text-sm text-muted">{t(`pages.leads.indicators.${key}`)}</dt>
              <dd className="mt-1 text-2xl font-semibold">{indicators[key]}</dd>
            </div>
          ))}
        </dl>
      )}

      {justCreated && (
        <p role="status" className="mb-4 rounded-lg bg-healthy-bg p-3 text-sm text-healthy">
          {t('pages.leads.created')}
        </p>
      )}
      {stageError && (
        <p role="alert" className="mb-4 rounded-lg bg-risk-bg p-3 text-sm text-risk">
          {t(`pages.leads.stageError.${stageError}`)}
        </p>
      )}
      {failed && (
        <div role="alert" className="mb-4 rounded-lg bg-risk-bg p-3 text-sm text-risk">
          {t('common.loadError')}{' '}
          <button type="button" onClick={() => void fetchAll()} className="min-h-11 font-semibold underline">
            {t('common.retry')}
          </button>
        </div>
      )}

      <div role="group" aria-label={t('pages.leads.view')} className="mb-4 inline-flex rounded-lg border border-line bg-card p-1">
        {(['board', 'list'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            onClick={() => setView(option)}
            className={`min-h-9 rounded-md px-4 text-sm font-medium ${view === option ? 'bg-selected text-action' : 'text-ink-soft'}`}
          >
            {t(option === 'board' ? 'pages.leads.viewBoard' : 'pages.leads.viewList')}
          </button>
        ))}
      </div>

      <LeadFilters filters={filters} onChange={setFilters} users={users} types={types} />

      {!rows && !failed && <Loading />}

      {visible && visible.length === 0 && (
        <div className="rounded-card border border-line bg-card p-6 text-muted">
          {t(rows && rows.length > 0 ? 'pages.leads.emptyFiltered' : 'pages.leads.empty')}
        </div>
      )}

      {visible && visible.length > 0 && view === 'board' && (
        <StageBoard
          ariaLabel={t('pages.leads.title')}
          stages={BOARD_STAGES}
          items={visible}
          stageOf={(row) => row.stage}
          stageLabel={(stage) => t(`codes.leadStage.${stage}`)}
          onMove={(row, stage) => void move(row.id, stage as BoardStage)}
          cardClassName={(row) => (row.is_important ? 'border-l-4 border-l-warning' : '')}
          renderCard={(row) => (
            <div>
              <div className="flex items-start gap-1">
                <Link to={`/leads/${row.id}`} className="block min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-action">
                  {row.full_name}
                </Link>
                <ImportantToggle value={row.is_important} name={row.full_name} onChange={(value) => void toggleImportant(row.id, value)} />
              </div>
              <p className="truncate text-xs text-muted">
                {[row.company_name, row.lead_type_name, row.country && t(`codes.country.${row.country}`)].filter(Boolean).join(' · ')}
              </p>
              <p className={`mt-1 truncate text-xs ${row.owner_id ? 'text-ink-soft' : 'text-warning'}`}>
                {ownerName(row.owner_id) ?? t('pages.queue.unassigned')}
                {row.is_overdue && <span className="ml-1 text-risk">· {t('pages.queue.overdue')}</span>}
              </p>
              <p className="truncate text-xs text-muted">{t('pages.leads.createdAt', { date: shortDate.format(new Date(row.created_at)) })}</p>
              <select
                aria-label={t('pages.leads.moveTo', { name: row.full_name })}
                value={row.stage}
                onChange={(event) => void move(row.id, event.target.value as BoardStage)}
                className="mt-2 min-h-11 w-full rounded-lg border border-line bg-card px-2 text-sm lg:hidden"
              >
                {BOARD_STAGES.map((option) => (
                  <option key={option} value={option}>
                    {t(`codes.leadStage.${option}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
        />
      )}

      {visible && visible.length > 0 && view === 'list' && (
        <ul className="divide-y divide-line rounded-card border border-line bg-card">
          {visible.map((row) => (
            <li key={row.id}>
              <Link to={`/leads/${row.id}`} className="flex flex-col gap-1 p-4 hover:bg-page sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{row.full_name}</span>
                    {row.is_important && <ImportantBadge />}
                  </span>
                  <span className="block truncate text-sm text-muted">
                    {[row.company_name, row.lead_type_name, row.country && t(`codes.country.${row.country}`)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-sm">
                  <span className="rounded-full bg-selected px-2.5 py-1 text-action">{t(`codes.leadStage.${row.stage}`)}</span>
                  <span className={row.owner_id ? 'text-muted' : 'text-warning'}>{ownerName(row.owner_id) ?? t('pages.queue.unassigned')}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
