import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog } from './Dialog'
import { useToast } from './Toast'
import {
  ACTIVITY_KINDS,
  NOT_SENT_REASONS,
  confirmConversation,
  listTemplates,
  registerActivity,
  registerConversationStarted,
  renderTemplate,
  whatsappLink,
  type ActivityError,
  type ActivityKind,
  type NotSentReason,
  type Template,
} from '../lib/leadDetail'

// Ações sobre o lead usadas na ficha e na Minha fila: Iniciar conversa (com confirmação de envio) e Registrar contato.

const inputClass =
  'mt-1 block min-h-11 w-full rounded-lg border border-line bg-card px-3 text-base text-ink focus:border-action focus:outline-none'

export type ConversationLead = { id: string; full_name: string; company_name: string | null; whatsapp: string | null }

export function ConversationDialog({
  lead,
  ownerName,
  onClose,
  onDone,
}: {
  lead: ConversationLead
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

export function ContactDialog({ leadId, onClose, onDone }: { leadId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<ActivityKind>('CALL')
  const [body, setBody] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [nextStepAt, setNextStepAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ActivityError | null>(null)

  const toast = useToast()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const result = await registerActivity({ leadId, kind, body, nextStep, nextStepAt })
    setBusy(false)
    if (result) {
      setError(result)
      return
    }
    toast.show(t('toast.contactSaved'))
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

export function DeliveryConfirmation({ activityId, onDone }: { activityId: string; onDone: () => Promise<void> }) {
  const { t } = useTranslation()
  const [askReason, setAskReason] = useState(false)
  const [reason, setReason] = useState<NotSentReason>('INVALID_NUMBER')
  const [error, setError] = useState<ActivityError | null>(null)
  const [busy, setBusy] = useState(false)

  const toast = useToast()

  async function confirm(sent: boolean) {
    setBusy(true)
    const result = await confirmConversation(activityId, sent, reason)
    setBusy(false)
    if (result) {
      setError(result)
      return
    }
    toast.show(t('toast.deliveryConfirmed'))
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
