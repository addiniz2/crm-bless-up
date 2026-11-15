import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/context'
import {
  COUNTRIES,
  MAIN_GOALS,
  MANUAL_CHANNELS,
  createLead,
  findDuplicates,
  listLeadSources,
  listLeadTypes,
  type Duplicate,
  type LeadDraft,
  type ListItem,
  type SaveError,
} from '../lib/leads'

const EMPTY: LeadDraft = {
  fullName: '',
  whatsapp: '',
  email: '',
  country: '',
  companyName: '',
  leadTypeId: '',
  revenueBand: '',
  mainGoal: '',
  leadSourceId: '',
  captureChannel: 'WHATSAPP',
  howFound: '',
  notes: '',
  assignToMe: true,
}

const STEPS = ['contact', 'business', 'source'] as const
const inputClass =
  'mt-1 block min-h-11 w-full rounded-lg border border-line bg-card px-3 text-base text-ink focus:border-action focus:outline-none'

function Field({ label, optional, hint, children }: { label: string; optional?: boolean; hint?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-ink-soft">
        {label}
        {optional && <span className="font-normal text-muted"> ({t('common.optional')})</span>}
        {children}
      </label>
      {hint}
    </div>
  )
}

// Cadastro em 3 passos (contato, negócio, origem). As regras valem no banco:
// a tela só ajuda a preencher e mostra o erro que o banco devolve.
export function NewLeadPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { session } = useAuth()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<LeadDraft>(EMPTY)
  const [types, setTypes] = useState<ListItem[]>([])
  const [sources, setSources] = useState<ListItem[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<SaveError | null>(null)

  useEffect(() => {
    Promise.all([listLeadTypes(), listLeadSources()])
      .then(([leadTypes, leadSources]) => {
        setTypes(leadTypes)
        setSources(leadSources)
      })
      .catch(() => setLoadFailed(true))
  }, [])

  function set<K extends keyof LeadDraft>(key: K, value: LeadDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    if (key === 'whatsapp' || key === 'email') setDuplicates(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (step === 0 && duplicates === null) {
      setBusy(true)
      try {
        const found = await findDuplicates(draft.whatsapp, draft.email)
        setDuplicates(found)
        if (found.length > 0) return
      } catch {
        setError('UNKNOWN')
        return
      } finally {
        setBusy(false)
      }
    }

    if (step < STEPS.length - 1) {
      setStep(step + 1)
      return
    }

    setBusy(true)
    const result = await createLead(draft, session?.user.id ?? '')
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    navigate('/leads', { replace: true, state: { created: result.id } })
  }

  const showDuplicates = step === 0 && duplicates !== null && duplicates.length > 0

  return (
    <section className="mx-auto max-w-xl">
      <h1 className="mb-1 text-2xl font-semibold">{t('newLead.title')}</h1>
      <p className="mb-4 text-sm text-muted">
        {t('newLead.step', { current: step + 1, total: STEPS.length })} · {t(`newLead.steps.${STEPS[step]}`)}
      </p>

      <ol className="mb-6 flex gap-2" aria-hidden="true">
        {STEPS.map((name, index) => (
          <li key={name} className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-action' : 'bg-line'}`} />
        ))}
      </ol>

      {loadFailed && (
        <p role="alert" className="mb-4 rounded-lg bg-risk-bg p-3 text-sm text-risk">
          {t('common.loadError')}
        </p>
      )}

      <form onSubmit={handleSubmit} className="rounded-card border border-line bg-card p-5">
        {step === 0 && (
          <>
            <Field label={t('newLead.fullName')}>
              <input required autoComplete="off" value={draft.fullName} onChange={(e) => set('fullName', e.target.value)} className={inputClass} />
            </Field>
            <Field
              label={t('newLead.whatsapp')}
              hint={
                <span id="whatsapp-hint" className="mt-1 block text-xs text-muted">
                  {t('newLead.whatsappHint')}
                </span>
              }
            >
              <input
                required
                inputMode="tel"
                autoComplete="off"
                value={draft.whatsapp}
                onChange={(e) => set('whatsapp', e.target.value)}
                className={inputClass}
                aria-describedby="whatsapp-hint"
              />
            </Field>
            <Field label={t('newLead.email')} optional>
              <input type="email" autoComplete="off" value={draft.email} onChange={(e) => set('email', e.target.value)} className={inputClass} />
            </Field>
            <Field label={t('newLead.country')}>
              <select required value={draft.country} onChange={(e) => set('country', e.target.value as LeadDraft['country'])} className={inputClass}>
                <option value="">{t('common.select')}</option>
                {COUNTRIES.map((code) => (
                  <option key={code} value={code}>
                    {t(`codes.country.${code}`)}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field label={t('newLead.companyName')} optional>
              <input autoComplete="off" value={draft.companyName} onChange={(e) => set('companyName', e.target.value)} className={inputClass} />
            </Field>
            <Field
              label={t('newLead.leadType')}
              hint={
                types.length === 0 &&
                !loadFailed && (
                  <span role="status" className="mt-1 block text-xs text-warning">
                    {t('newLead.noLeadTypes')}
                  </span>
                )
              }
            >
              <select required value={draft.leadTypeId} onChange={(e) => set('leadTypeId', e.target.value)} className={inputClass}>
                <option value="">{t('common.select')}</option>
                {types.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('newLead.revenueBand')} optional>
              <input autoComplete="off" value={draft.revenueBand} onChange={(e) => set('revenueBand', e.target.value)} className={inputClass} />
            </Field>
            <Field label={t('newLead.mainGoal')} optional>
              <select value={draft.mainGoal} onChange={(e) => set('mainGoal', e.target.value)} className={inputClass}>
                <option value="">{t('common.select')}</option>
                {MAIN_GOALS.map((code) => (
                  <option key={code} value={code}>
                    {t(`codes.mainGoal.${code}`)}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Field label={t('newLead.leadSource')} optional>
              <select value={draft.leadSourceId} onChange={(e) => set('leadSourceId', e.target.value)} className={inputClass}>
                <option value="">{t('common.select')}</option>
                {sources.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('newLead.captureChannel')}>
              <select required value={draft.captureChannel} onChange={(e) => set('captureChannel', e.target.value)} className={inputClass}>
                {MANUAL_CHANNELS.map((code) => (
                  <option key={code} value={code}>
                    {t(`codes.channel.${code}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('newLead.howFound')} optional>
              <input autoComplete="off" value={draft.howFound} onChange={(e) => set('howFound', e.target.value)} className={inputClass} />
            </Field>
            <Field label={t('newLead.notes')} optional>
              <textarea rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} className={`${inputClass} py-2`} />
            </Field>
            <label className="mb-4 flex min-h-11 items-center gap-3 text-sm text-ink-soft">
              <input type="checkbox" checked={draft.assignToMe} onChange={(e) => set('assignToMe', e.target.checked)} className="size-5 accent-action" />
              {t('newLead.assignToMe')}
            </label>
          </>
        )}

        {showDuplicates && (
          <div role="alert" className="mb-4 rounded-lg bg-warning-bg p-3 text-sm text-warning">
            <p className="font-semibold">{t('newLead.duplicateTitle')}</p>
            <ul className="my-2 list-disc pl-5">
              {duplicates.map((lead) => (
                <li key={lead.id}>
                  {lead.full_name}
                  {lead.company_name ? ` · ${lead.company_name}` : ''} · {t(`codes.leadStage.${lead.stage}`)}
                </li>
              ))}
            </ul>
            <p>{t('newLead.duplicateHint')}</p>
            <button type="button" onClick={() => setStep(1)} className="mt-2 min-h-11 font-semibold underline">
              {t('newLead.duplicateContinue')}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mb-4 text-sm text-risk">
            {t(`newLead.errors.${error}`)}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {step === 0 ? (
            <Link to="/leads" className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm text-muted">
              {t('common.cancel')}
            </Link>
          ) : (
            <button type="button" onClick={() => setStep(step - 1)} className="min-h-11 rounded-lg px-4 text-sm text-muted">
              {t('common.back')}
            </button>
          )}
          {!showDuplicates && (
            <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-action px-6 font-medium text-white disabled:opacity-60">
              {step === STEPS.length - 1 ? (busy ? t('common.saving') : t('common.save')) : t('common.next')}
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
