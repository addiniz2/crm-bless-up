import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../components/Dialog'
import { Loading } from '../components/Loading'
import { StageBoard } from '../components/StageBoard'
import { useToast } from '../components/Toast'
import type { ListItem } from '../lib/leads'
import {
  OPPORTUNITY_STAGES,
  changeOpportunityStage,
  formatMoney,
  getOpportunityIndicators,
  listOpportunities,
  type CurrencyTotal,
  type OpportunityCard,
  type OpportunityError,
  type OpportunityIndicators,
  type OpportunityStage,
} from '../lib/opportunities'
import { listReasons } from '../lib/pipeline'
import { listUsers, type AppUser } from '../lib/queue'

const inputClass =
  'mt-1 block min-h-11 w-full rounded-lg border border-line bg-card px-3 text-base text-ink focus:border-action focus:outline-none'

// Oportunidades (BU-11): kanban por etapa; Perdido exige motivo; Fechado (ganho) transforma a conta em cliente.
// Valores e totais sempre por moeda.
export function OpportunitiesPage() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const highlight = (location.state as { opportunityId?: string } | null)?.opportunityId
  const [cards, setCards] = useState<OpportunityCard[] | null>(null)
  const [indicators, setIndicators] = useState<OpportunityIndicators | null>(null)
  const [users, setUsers] = useState<AppUser[]>([])
  const [failed, setFailed] = useState(false)
  const [error, setError] = useState<OpportunityError | null>(null)
  const [losing, setLosing] = useState<OpportunityCard | null>(null)

  const fetchAll = useCallback(
    () =>
      Promise.all([listOpportunities(), getOpportunityIndicators(), listUsers()])
        .then(([board, numbers, appUsers]) => {
          setCards(board)
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

  async function move(card: OpportunityCard, stage: OpportunityStage) {
    if (card.stage === stage) return
    setError(null)
    if (stage === 'LOST') {
      setLosing(card)
      return
    }
    if (stage === 'WON' && !window.confirm(t('pages.opportunities.wonConfirm', { name: card.account_name }))) return
    const result = await changeOpportunityStage(card.id, stage)
    if (result) setError(result)
    else toast.show(t('toast.opportunityStageChanged'))
    await fetchAll()
  }

  const money = (value: number | null, currency: OpportunityCard['currency']) => formatMoney(value, currency, i18n.language)
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeZone: 'UTC' })
  const ownerName = (id: string | null) => users.find((user) => user.id === id)?.full_name

  return (
    <section>
      <h1 className="mb-4 text-2xl font-semibold">{t('pages.opportunities.title')}</h1>

      {indicators && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Totals label={t('pages.opportunities.openPipeline')} totals={indicators.open} />
          <Totals label={t('pages.opportunities.wonThisMonth')} totals={indicators.won_this_month} />
        </div>
      )}

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-risk-bg p-3 text-sm text-risk">
          {t(`pages.opportunities.errors.${error}`)}
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

      {!cards && !failed && <Loading />}

      {cards && cards.length === 0 && (
        <div className="rounded-card border border-line bg-card p-6 text-muted">{t('pages.opportunities.empty')}</div>
      )}

      {cards && cards.length > 0 && (
        <StageBoard
          ariaLabel={t('pages.opportunities.title')}
          stages={OPPORTUNITY_STAGES}
          items={cards}
          stageOf={(card) => card.stage}
          stageLabel={(stage) => t(`codes.opportunityStage.${stage}`)}
          canDrag={(card) => card.stage !== 'WON' && card.stage !== 'LOST'}
          onMove={(card, stage) => void move(card, stage as OpportunityStage)}
          renderCard={(card) => {
            const closed = card.stage === 'WON' || card.stage === 'LOST'
            return (
              <div className={card.id === highlight ? 'rounded-md ring-2 ring-action ring-offset-2' : ''}>
                <p className="truncate text-sm font-medium">{card.account_name}</p>
                <p className="text-sm font-semibold text-ink-soft">{money(card.monthly_value, card.currency)}</p>
                <p className="truncate text-xs text-muted">
                  {[card.contact_name, t(`codes.country.${card.country}`), ownerName(card.owner_id)].filter(Boolean).join(' · ')}
                </p>
                {card.expected_close_date && !closed && (
                  <p className={`truncate text-xs ${card.is_late ? 'text-risk' : 'text-muted'}`}>
                    {card.is_late
                      ? t('pages.opportunities.late')
                      : t('pages.opportunities.expected', { date: date.format(new Date(card.expected_close_date)) })}
                  </p>
                )}
                {card.stage === 'LOST' && card.loss_reason_name && (
                  <p className="truncate text-xs text-muted">{t('pages.opportunities.lossReason', { reason: card.loss_reason_name })}</p>
                )}
                {card.stage === 'WON' && <p className="text-xs text-healthy">{t('pages.opportunities.customer')}</p>}
                {card.source_lead_id && (
                  <Link to={`/leads/${card.source_lead_id}`} className="mt-1 inline-flex min-h-9 items-center text-xs text-action">
                    {t('pages.opportunities.fromLead')}
                  </Link>
                )}
                {!closed && (
                  <select
                    aria-label={t('pages.opportunities.moveTo', { name: card.account_name })}
                    value={card.stage}
                    onChange={(event) => void move(card, event.target.value as OpportunityStage)}
                    className="mt-2 min-h-11 w-full rounded-lg border border-line bg-card px-2 text-sm lg:hidden"
                  >
                    {OPPORTUNITY_STAGES.map((option) => (
                      <option key={option} value={option}>
                        {t(`codes.opportunityStage.${option}`)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )
          }}
        />
      )}

      {losing && (
        <LossDialog
          card={losing}
          onClose={() => setLosing(null)}
          onDone={async () => {
            setLosing(null)
            await fetchAll()
          }}
        />
      )}
    </section>
  )
}

function Totals({ label, totals }: { label: string; totals: CurrencyTotal[] }) {
  const { t, i18n } = useTranslation()
  return (
    <div className="rounded-card border border-line bg-card p-4">
      <p className="text-sm text-muted">{label}</p>
      {totals.length === 0 ? (
        <p className="mt-1 text-lg font-semibold">{t('pages.opportunities.noneYet')}</p>
      ) : (
        totals.map((total) => (
          <p key={total.currency} className="mt-1 text-lg font-semibold">
            {t('pages.opportunities.countValue', { count: total.count, value: formatMoney(total.value, total.currency, i18n.language) })}
          </p>
        ))
      )}
    </div>
  )
}

function LossDialog({ card, onClose, onDone }: { card: OpportunityCard; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useTranslation()
  const [reasons, setReasons] = useState<ListItem[] | null>(null)
  const [reasonId, setReasonId] = useState('')
  const [error, setError] = useState<OpportunityError | null>(null)

  useEffect(() => {
    listReasons('LOSS')
      .then(setReasons)
      .catch(() => setReasons([]))
  }, [])

  const toast = useToast()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const result = await changeOpportunityStage(card.id, 'LOST', reasonId || undefined)
    if (result) {
      setError(result)
      return
    }
    toast.show(t('toast.opportunityLost'))
    await onDone()
  }

  return (
    <Dialog title={t('pages.opportunities.lossDialog.title')} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <p className="mb-3 text-sm text-muted">{card.account_name}</p>
        <label className="mb-4 block text-sm font-medium text-ink-soft">
          {t('pages.opportunities.lossDialog.reason')}
          <select required value={reasonId} onChange={(e) => setReasonId(e.target.value)} className={inputClass}>
            <option value="">{t('common.select')}</option>
            {reasons?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {reasons?.length === 0 && <p className="mb-4 text-xs text-warning">{t('pages.opportunities.lossDialog.noReasons')}</p>}
        {error && (
          <p role="alert" className="mb-4 text-sm text-risk">
            {t(`pages.opportunities.errors.${error}`)}
          </p>
        )}
        <button type="submit" className="min-h-11 w-full rounded-lg bg-risk font-medium text-white">
          {t('pages.opportunities.lossDialog.confirm')}
        </button>
      </form>
    </Dialog>
  )
}
