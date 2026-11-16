import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../components/Dialog'
import { currencyOf } from '../lib/leads'
import {
  ACTIVITY_KINDS,
  NOT_SENT_REASONS,
  confirmConversation,
  updateContact,
  getLead,
  getTimeline,
  listTemplates,
  registerActivity,
  registerConversationStarted,
  renderTemplate,
  whatsappLink,
  type ActivityError,
  type ActivityKind,
  type LeadDetail,
  type NotSentReason,
  type Template,
  type TimelineItem,
} from '../lib/leadDetail'
import { DIAL_CODE, PHONE_COUNTRIES, composeWhatsapp, formatNational, formatStoredWhatsapp, type PhoneCountry } from '../lib/phone'
import { changeLeadStage, listReasons, type StageError } from '../lib/pipeline'
import { listUsers, type AppUser } from '../lib/queue'
import type { ListItem, SaveError } from '../lib/leads'

type Panel = 'conversation' | 'contact' | 'disqualify' | 'editContact' | null

const inputClass =
  'mt-1 block min-h-11 w-full rounded-lg border border-line bg-card px-3 text-base text-ink focus:border-action focus:outline-none'

function Info({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  )
}

// Ficha do lead (BU-10): dados, linha do tempo, Registrar contato, Iniciar conversa e Desqualificar.
export function LeadDetailPage() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation()
  const [lead, setLead] = useState<LeadDetail | null | undefined>(undefined)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [failed, setFailed] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)

  const fetchAll = useCallback(
    () =>
      Promise.all([getLead(id), getTimeline(id), listUsers()])
        .then(([detail, items, appUsers]) => {
          setLead(detail)
          setTimeline(items)
          setUsers(appUsers)
          setFailed(false)
        })
        .catch(() => setFailed(true)),
    [id],
  )

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  const userName = (userId: string | null) => users.find((user) => user.id === userId)?.full_name
  const dateTime = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' })
  const formatDate = (value: string | null) => (value ? dateTime.format(new Date(value)) : null)

  if (failed) {
    return (
      <div role="alert" className="rounded-lg bg-risk-bg p-3 text-sm text-risk">
        {t('common.loadError')}{' '}
        <button type="button" onClick={() => void fetchAll()} className="min-h-11 font-semibold underline">
          {t('common.retry')}
        </button>
      </div>
    )
  }
  if (lead === undefined) return <p className="text-muted">{t('app.loading')}</p>
  if (lead === null) {
    return (
      <div>
        <p className="mb-4 text-muted">{t('leadDetail.notFound')}</p>
        <Link to="/leads" className="text-action">
          {t('leadDetail.back')}
        </Link>
      </div>
    )
  }

  const readOnly = lead.stage === 'CONVERTED'
  const closed = readOnly || lead.stage === 'DISQUALIFIED'
  const currency = currencyOf(lead.country)
  const utm = [lead.utm_source, lead.utm_medium, lead.utm_campaign, lead.utm_term, lead.utm_content].filter(Boolean).join(' / ')
  const clickIds = [
    lead.fbclid && `fbclid ${lead.fbclid}`,
    lead.gclid && `gclid ${lead.gclid}`,
    lead.ctwa_clid && `ctwa_clid ${lead.ctwa_clid}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const answers = lead.form_answers ? Object.entries(lead.form_answers) : []
  const actionClass = 'min-h-11 rounded-lg px-4 text-sm font-medium disabled:opacity-50'

  return (
    <section className="mx-auto max-w-4xl">
      <Link to="/leads" className="mb-3 inline-flex min-h-11 items-center text-sm text-action">
        ← {t('leadDetail.back')}
      </Link>

      <header className="mb-4">
        <h1 className="text-2xl font-semibold break-words">{lead.full_name}</h1>
        <p className="mt-1 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-selected px-2.5 py-1 text-action">{t(`codes.leadStage.${lead.stage}`)}</span>
          {!closed && <span className="rounded-full bg-card px-2.5 py-1 text-ink-soft">{t(`codes.queueStatus.${lead.queue_status}`)}</span>}
          <span className={`rounded-full px-2.5 py-1 ${lead.owner_id ? 'bg-card text-ink-soft' : 'bg-warning-bg text-warning'}`}>
            {userName(lead.owner_id) ?? t('pages.queue.unassigned')}
          </span>
        </p>
        {readOnly && <p className="mt-3 rounded-lg bg-page p-3 text-sm text-muted">{t('leadDetail.readOnly')}</p>}
        {!closed && lead.whatsapp_status === 'INVALID' && (
          <p role="alert" className="mt-3 rounded-lg bg-risk-bg p-3 text-sm text-risk">
            {t('leadDetail.whatsappInvalid')}
          </p>
        )}
        {lead.stage === 'DISQUALIFIED' && (
          <p className="mt-3 rounded-lg bg-page p-3 text-sm text-muted">
            {t('leadDetail.disqualified', { reason: lead.disqualification_reason?.name ?? '' })}
          </p>
        )}
      </header>

      {!closed && (
        <div className="mb-6 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={() => setPanel('conversation')}
            disabled={!lead.whatsapp || lead.whatsapp_status === 'INVALID'}
            className={`${actionClass} bg-action text-white`}
          >
            {t('leadDetail.actions.startConversation')}
          </button>
          <button type="button" onClick={() => setPanel('contact')} className={`${actionClass} border border-action text-action`}>
            {t('leadDetail.actions.registerContact')}
          </button>
          <button type="button" onClick={() => setPanel('editContact')} className={`${actionClass} border border-line text-ink-soft`}>
            {t('leadDetail.actions.editContact')}
          </button>
          <button type="button" onClick={() => setPanel('disqualify')} className={`${actionClass} border border-line text-ink-soft`}>
            {t('leadDetail.actions.disqualify')}
          </button>
          <button type="button" disabled title={t('leadDetail.convertSoon')} className={`${actionClass} border border-line text-ink-soft`}>
            {t('leadDetail.actions.convert')}
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <div className="rounded-card border border-line bg-card p-4">
            <h2 className="mb-3 font-semibold">{t('leadDetail.sections.contact')}</h2>
            <dl className="grid gap-3">
              <Info label={t('leadDetail.fields.whatsapp')}>
                {lead.whatsapp && (
                  <>
                    {formatStoredWhatsapp(lead.whatsapp)}
                    {lead.whatsapp_status === 'VALID' && <span className="ml-2 text-xs text-healthy">✓ {t('leadDetail.whatsappValid')}</span>}
                    {lead.whatsapp_status === 'INVALID' && <span className="ml-2 text-xs text-risk">{t('pages.queue.whatsappInvalid')}</span>}
                  </>
                )}
              </Info>
              <Info label={t('leadDetail.fields.email')}>{lead.email}</Info>
              <Info label={t('leadDetail.fields.country')}>{lead.country && t(`codes.country.${lead.country}`)}</Info>
              <Info label={t('leadDetail.fields.nextStep')}>
                {lead.next_step_at && `${formatDate(lead.next_step_at)}${lead.next_step ? ` · ${lead.next_step}` : ''}`}
              </Info>
              <Info label={t('leadDetail.fields.lastContact')}>{formatDate(lead.last_contact_at)}</Info>
            </dl>
          </div>

          <div className="rounded-card border border-line bg-card p-4">
            <h2 className="mb-3 font-semibold">{t('leadDetail.sections.business')}</h2>
            <dl className="grid gap-3">
              <Info label={t('leadDetail.fields.company')}>{lead.company_name}</Info>
              <Info label={t('leadDetail.fields.leadType')}>{lead.lead_type?.name}</Info>
              <Info label={t('leadDetail.fields.revenueBand')}>
                {lead.revenue_band && currency && t(`codes.revenueBand.${currency}.${lead.revenue_band}`)}
              </Info>
              <Info label={t('leadDetail.fields.mainGoal')}>{lead.main_goal && t(`codes.mainGoal.${lead.main_goal}`)}</Info>
              <Info label={t('leadDetail.fields.howFound')}>{lead.how_found}</Info>
              <Info label={t('leadDetail.fields.notes')}>{lead.notes}</Info>
            </dl>
          </div>

          <div className="rounded-card border border-line bg-card p-4">
            <h2 className="mb-3 font-semibold">{t('leadDetail.sections.origin')}</h2>
            <dl className="grid gap-3">
              <Info label={t('leadDetail.fields.source')}>{lead.lead_source?.name}</Info>
              <Info label={t('leadDetail.fields.channel')}>{t(`codes.channel.${lead.capture_channel}`)}</Info>
              <Info label={t('leadDetail.fields.createdAt')}>{formatDate(lead.created_at)}</Info>
              <Info label={t('leadDetail.fields.utm')}>{utm}</Info>
              <Info label={t('leadDetail.fields.clickIds')}>{clickIds}</Info>
              <Info label={t('leadDetail.fields.pageUrl')}>{lead.page_url}</Info>
            </dl>
          </div>

          {lead.meta_lead_id && (
            <div className="rounded-card border border-line bg-card p-4">
              <h2 className="mb-3 font-semibold">{t('leadDetail.sections.meta')}</h2>
              <dl className="grid gap-3">
                <Info label={t('leadDetail.fields.metaForm')}>{lead.meta_form_name}</Info>
                <Info label={t('leadDetail.fields.metaCampaign')}>{lead.meta_campaign_name}</Info>
                <Info label={t('leadDetail.fields.metaAd')}>{lead.meta_ad_name}</Info>
                <Info label={t('leadDetail.fields.metaPlatform')}>{lead.meta_platform}</Info>
                <Info label={t('leadDetail.fields.metaOrganic')}>
                  {lead.meta_is_organic === null ? null : t(lead.meta_is_organic ? 'leadDetail.yes' : 'leadDetail.no')}
                </Info>
                <Info label={t('leadDetail.fields.metaLeadId')}>{lead.meta_lead_id}</Info>
              </dl>
            </div>
          )}

          {answers.length > 0 && (
            <div className="rounded-card border border-line bg-card p-4">
              <h2 className="mb-3 font-semibold">{t('leadDetail.sections.answers')}</h2>
              <dl className="grid gap-3">
                {answers.map(([question, answer]) => (
                  <Info key={question} label={question}>
                    {Array.isArray(answer) ? answer.join(', ') : String(answer)}
                  </Info>
                ))}
              </dl>
            </div>
          )}
        </div>

        <div className="rounded-card border border-line bg-card p-4">
          <h2 className="mb-3 font-semibold">{t('leadDetail.sections.timeline')}</h2>
          <ol className="space-y-4">
            {timeline.map((item) => (
              <li key={`${item.type}-${item.id}`} className="border-l-2 border-line pl-3">
                <p className="text-xs text-muted">
                  {formatDate(item.at)} · {t('leadDetail.timeline.by', { name: userName(item.by) ?? t('leadDetail.timeline.system') })}
                </p>
                {item.type === 'activity' ? (
                  <>
                    <p className="text-sm font-medium">{t(`codes.activityKind.${item.kind}`)}</p>
                    {item.body && <p className="text-sm whitespace-pre-line break-words">{item.body}</p>}
                    {item.deliveryStatus === 'SENT' && <p className="text-xs text-healthy">{t('leadDetail.timeline.sent')}</p>}
                    {item.deliveryStatus === 'NOT_SENT' && (
                      <p className="text-xs text-risk">
                        {t('leadDetail.timeline.notSent', { reason: t(`codes.notSentReason.${item.notSentReason ?? 'OTHER'}`) })}
                      </p>
                    )}
                    {item.deliveryStatus === 'PENDING' && (
                      <div className="mt-1 rounded-lg bg-warning-bg p-2">
                        <p className="mb-1 text-xs font-medium text-warning">{t('leadDetail.timeline.pending')}</p>
                        <DeliveryConfirmation activityId={item.id} onDone={fetchAll} />
                      </div>
                    )}
                    {item.nextStepAt && (
                      <p className="text-xs text-muted">
                        {t('leadDetail.timeline.nextStep', {
                          when: formatDate(item.nextStepAt),
                          what: item.nextStep ? ` · ${item.nextStep}` : '',
                        })}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm">
                    {t(`leadDetail.timeline.${item.field}`, {
                      from: describeChange(item.field, item.from),
                      to: describeChange(item.field, item.to),
                    })}
                  </p>
                )}
              </li>
            ))}
            <li className="border-l-2 border-line pl-3">
              <p className="text-xs text-muted">
                {formatDate(lead.created_at)} · {t('leadDetail.timeline.by', { name: userName(lead.created_by) ?? t('leadDetail.timeline.system') })}
              </p>
              <p className="text-sm font-medium">{t('leadDetail.timeline.created')}</p>
            </li>
          </ol>
        </div>
      </div>

      {panel === 'conversation' && (
        <ConversationDialog lead={lead} ownerName={userName(lead.owner_id) ?? ''} onClose={() => setPanel(null)} onDone={fetchAll} />
      )}
      {panel === 'contact' && <ContactDialog leadId={lead.id} onClose={() => setPanel(null)} onDone={fetchAll} />}
      {panel === 'editContact' && <EditContactDialog lead={lead} onClose={() => setPanel(null)} onDone={fetchAll} />}
      {panel === 'disqualify' && <DisqualifyDialog leadId={lead.id} onClose={() => setPanel(null)} onDone={fetchAll} />}
    </section>
  )

  function describeChange(field: 'stage' | 'queue_status' | 'owner_id', value: string | null) {
    if (value === null) return t('leadDetail.timeline.nobody')
    if (field === 'stage') return t(`codes.leadStage.${value}`)
    if (field === 'queue_status') return t(`codes.queueStatus.${value}`)
    return userName(value) ?? t('leadDetail.timeline.nobody')
  }
}

function ConversationDialog({
  lead,
  ownerName,
  onClose,
  onDone,
}: {
  lead: LeadDetail
  ownerName: string
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [templateId, setTemplateId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<ActivityError | null>(null)

  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]))
  }, [])

  function chooseTemplate(id: string) {
    setTemplateId(id)
    const template = templates?.find((item) => item.id === id)
    setMessage(
      template
        ? renderTemplate(template.body, { firstName: lead.full_name.split(' ')[0], company: lead.company_name ?? '', owner: ownerName })
        : '',
    )
  }

  const [activityId, setActivityId] = useState<string | null>(null)

  // O link abre o WhatsApp direto do clique (sem bloqueio de janela); a tentativa é registrada como pendente.
  async function onOpen() {
    const result = await registerConversationStarted(lead.id, message)
    if (result.error) {
      setError(result.error)
      return
    }
    setActivityId(result.id ?? null)
  }

  async function finish() {
    onClose()
    await onDone()
  }

  if (activityId) {
    return (
      <Dialog title={t('leadDetail.conversation.confirmTitle')} onClose={() => void finish()}>
        <p className="mb-4 text-sm text-muted">{t('leadDetail.conversation.confirmHint')}</p>
        <DeliveryConfirmation activityId={activityId} onDone={finish} />
        <button type="button" onClick={() => void finish()} className="mt-3 min-h-11 w-full rounded-lg text-sm text-muted">
          {t('leadDetail.conversation.later')}
        </button>
      </Dialog>
    )
  }

  return (
    <Dialog title={t('leadDetail.conversation.title')} onClose={onClose}>
      {!lead.whatsapp ? (
        <p role="alert" className="text-sm text-risk">
          {t('leadDetail.conversation.noWhatsapp')}
        </p>
      ) : (
        <>
          <label className="mb-4 block text-sm font-medium text-ink-soft">
            {t('leadDetail.conversation.template')}
            <select value={templateId} onChange={(e) => chooseTemplate(e.target.value)} className={inputClass}>
              <option value="">{t('leadDetail.conversation.noTemplate')}</option>
              {templates?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.language})
                </option>
              ))}
            </select>
          </label>
          {templates?.length === 0 && <p className="mb-4 text-xs text-muted">{t('leadDetail.conversation.noTemplates')}</p>}
          <label className="mb-4 block text-sm font-medium text-ink-soft">
            {t('leadDetail.conversation.message')}
            <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} className={`${inputClass} py-2`} />
          </label>
          {error && (
            <p role="alert" className="mb-4 text-sm text-risk">
              {t(`leadDetail.activityError.${error}`)}
            </p>
          )}
          <a
            href={whatsappLink(lead.whatsapp, message)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void onOpen()}
            className="flex min-h-11 w-full items-center justify-center rounded-lg bg-action font-medium text-white"
          >
            {t('leadDetail.conversation.open')}
          </a>
        </>
      )}
    </Dialog>
  )
}

function ContactDialog({ leadId, onClose, onDone }: { leadId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<ActivityKind>('CALL')
  const [body, setBody] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [nextStepAt, setNextStepAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ActivityError | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const result = await registerActivity({ leadId, kind, body, nextStep, nextStepAt })
    setBusy(false)
    if (result) {
      setError(result)
      return
    }
    onClose()
    await onDone()
  }

  return (
    <Dialog title={t('leadDetail.contact.title')} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <label className="mb-4 block text-sm font-medium text-ink-soft">
          {t('leadDetail.contact.kind')}
          <select value={kind} onChange={(e) => setKind(e.target.value as ActivityKind)} className={inputClass}>
            {ACTIVITY_KINDS.map((code) => (
              <option key={code} value={code}>
                {t(`codes.activityKind.${code}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-4 block text-sm font-medium text-ink-soft">
          {t('leadDetail.contact.body')}
          <textarea required rows={3} value={body} onChange={(e) => setBody(e.target.value)} className={`${inputClass} py-2`} />
        </label>
        <label className="mb-4 block text-sm font-medium text-ink-soft">
          {t('leadDetail.contact.nextStep')} <span className="font-normal text-muted">({t('common.optional')})</span>
          <input value={nextStep} onChange={(e) => setNextStep(e.target.value)} className={inputClass} />
        </label>
        <label className="mb-1 block text-sm font-medium text-ink-soft">
          {t('leadDetail.contact.nextStepAt')}
          <input type="datetime-local" value={nextStepAt} onChange={(e) => setNextStepAt(e.target.value)} className={inputClass} />
        </label>
        <p className="mb-4 text-xs text-muted">{t('leadDetail.contact.nextStepHint')}</p>
        {error && (
          <p role="alert" className="mb-4 text-sm text-risk">
            {t(`leadDetail.activityError.${error}`)}
          </p>
        )}
        <button type="submit" disabled={busy} className="min-h-11 w-full rounded-lg bg-action font-medium text-white disabled:opacity-60">
          {busy ? t('common.saving') : t('leadDetail.contact.save')}
        </button>
      </form>
    </Dialog>
  )
}

function DisqualifyDialog({ leadId, onClose, onDone }: { leadId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useTranslation()
  const [reasons, setReasons] = useState<ListItem[] | null>(null)
  const [reasonId, setReasonId] = useState('')
  const [error, setError] = useState<StageError | null>(null)

  useEffect(() => {
    listReasons('DISQUALIFICATION')
      .then(setReasons)
      .catch(() => setReasons([]))
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const result = await changeLeadStage(leadId, 'DISQUALIFIED', reasonId || undefined)
    if (result) {
      setError(result)
      return
    }
    onClose()
    await onDone()
  }

  return (
    <Dialog title={t('leadDetail.disqualifyDialog.title')} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <label className="mb-4 block text-sm font-medium text-ink-soft">
          {t('leadDetail.disqualifyDialog.reason')}
          <select required value={reasonId} onChange={(e) => setReasonId(e.target.value)} className={inputClass}>
            <option value="">{t('common.select')}</option>
            {reasons?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {reasons?.length === 0 && <p className="mb-4 text-xs text-warning">{t('leadDetail.disqualifyDialog.noReasons')}</p>}
        {error && (
          <p role="alert" className="mb-4 text-sm text-risk">
            {t(`pages.leads.stageError.${error}`)}
          </p>
        )}
        <button type="submit" className="min-h-11 w-full rounded-lg bg-risk font-medium text-white">
          {t('leadDetail.disqualifyDialog.confirm')}
        </button>
      </form>
    </Dialog>
  )
}

function DeliveryConfirmation({ activityId, onDone }: { activityId: string; onDone: () => Promise<void> }) {
  const { t } = useTranslation()
  const [askReason, setAskReason] = useState(false)
  const [reason, setReason] = useState<NotSentReason>('INVALID_NUMBER')
  const [error, setError] = useState<ActivityError | null>(null)
  const [busy, setBusy] = useState(false)

  async function confirm(sent: boolean) {
    setBusy(true)
    const result = await confirmConversation(activityId, sent, reason)
    setBusy(false)
    if (result) {
      setError(result)
      return
    }
    await onDone()
  }

  return (
    <div>
      {!askReason ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" disabled={busy} onClick={() => void confirm(true)} className="min-h-11 rounded-lg bg-healthy px-3 text-sm font-medium text-white">
            {t('leadDetail.conversation.sent')}
          </button>
          <button type="button" disabled={busy} onClick={() => setAskReason(true)} className="min-h-11 rounded-lg border border-risk px-3 text-sm font-medium text-risk">
            {t('leadDetail.conversation.notSent')}
          </button>
        </div>
      ) : (
        <div className="grid gap-2">
          <label className="text-sm font-medium text-ink-soft">
            {t('leadDetail.conversation.notSentReason')}
            <select value={reason} onChange={(e) => setReason(e.target.value as NotSentReason)} className={inputClass}>
              {NOT_SENT_REASONS.map((code) => (
                <option key={code} value={code}>
                  {t(`codes.notSentReason.${code}`)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={busy} onClick={() => void confirm(false)} className="min-h-11 rounded-lg bg-risk px-3 text-sm font-medium text-white">
            {t('leadDetail.timeline.confirmNotSent')}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-risk">
          {t(`leadDetail.activityError.${error}`)}
        </p>
      )}
    </div>
  )
}

function splitStored(whatsapp: string | null): { country: PhoneCountry; national: string } {
  if (whatsapp?.startsWith(DIAL_CODE.ES)) return { country: 'ES', national: formatNational('ES', whatsapp.slice(2)) }
  if (whatsapp?.startsWith(DIAL_CODE.BR)) return { country: 'BR', national: formatNational('BR', whatsapp.slice(2)) }
  return { country: 'OTHER', national: whatsapp ?? '' }
}

function EditContactDialog({ lead, onClose, onDone }: { lead: LeadDetail; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useTranslation()
  const initial = splitStored(lead.whatsapp)
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>(initial.country)
  const [national, setNational] = useState(initial.national)
  const [email, setEmail] = useState(lead.email ?? '')
  const [error, setError] = useState<SaveError | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const result = await updateContact(lead.id, composeWhatsapp(phoneCountry, national), email.trim())
    setBusy(false)
    if (result) {
      setError(result)
      return
    }
    onClose()
    await onDone()
  }

  return (
    <Dialog title={t('leadDetail.editContact.title')} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <label className="mb-4 block text-sm font-medium text-ink-soft">
          {t('newLead.phoneCountry')}
          <select
            value={phoneCountry}
            onChange={(e) => {
              const next = e.target.value as PhoneCountry
              setPhoneCountry(next)
              setNational(formatNational(next, national))
            }}
            className={inputClass}
          >
            {PHONE_COUNTRIES.map((code) => (
              <option key={code} value={code}>
                {t(`codes.phoneCountry.${code}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-1 block text-sm font-medium text-ink-soft">
          {t('newLead.whatsapp')}
          <input
            required
            inputMode="tel"
            value={national}
            onChange={(e) => setNational(formatNational(phoneCountry, e.target.value))}
            className={inputClass}
          />
        </label>
        <p className="mb-4 text-xs text-muted">{t(`newLead.whatsappHint.${phoneCountry}`)}</p>
        <label className="mb-4 block text-sm font-medium text-ink-soft">
          {t('newLead.email')} <span className="font-normal text-muted">({t('common.optional')})</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>
        {error && (
          <p role="alert" className="mb-4 text-sm text-risk">
            {t(`newLead.errors.${error}`)}
          </p>
        )}
        <button type="submit" disabled={busy} className="min-h-11 w-full rounded-lg bg-action font-medium text-white disabled:opacity-60">
          {busy ? t('common.saving') : t('leadDetail.editContact.save')}
        </button>
      </form>
    </Dialog>
  )
}
