import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import * as api from './api'
import {
  DIAL_CODES,
  EVENTS,
  composePhone,
  dialOf,
  isContactComplete,
  newEventId,
  readTracking,
  saveConsent,
  savedConsent,
  visibleSteps,
  type Answers,
  type FormField,
  type PublicForm,
} from './logic'
import { loadPixel, trackEvent } from './pixel'

type Screen = 'loading' | 'notFound' | 'intro' | 'steps' | 'thanks'

const inputClass =
  'mt-2 w-full border-0 border-b-2 border-ink/70 bg-transparent px-0 py-2 text-lg outline-none focus:border-action'

export default function FormApp({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const [form, setForm] = useState<PublicForm | null>(null)
  const [screen, setScreen] = useState<Screen>('loading')
  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [dial, setDial] = useState('34')
  const [national, setNational] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consent, setConsent] = useState<boolean | null>(() => savedConsent())
  const formViewSent = useRef(false)
  const events = useRef<Record<string, string>>({})

  useEffect(() => {
    api
      .getForm(slug)
      .then((data) => {
        setForm(data)
        setDial(dialOf(data.defaultCountry))
        setScreen(data.definition.intro ? 'intro' : 'steps')
      })
      .catch(() => setScreen('notFound'))
  }, [slug])

  // Pixel e FormView só depois do aceite
  useEffect(() => {
    if (!form?.metaPixelId || consent !== true || formViewSent.current) return
    formViewSent.current = true
    loadPixel(form.metaPixelId)
    const id = newEventId()
    events.current[EVENTS.formView] = id
    trackEvent(EVENTS.formView, id)
  }, [form, consent])

  const steps = useMemo(() => (form ? visibleSteps(form.definition, answers) : []), [form, answers])
  const step = steps[stepIndex]

  function choose(value: boolean) {
    saveConsent(value)
    setConsent(value)
  }

  function setAnswer(key: string, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }))
    setError(null)
  }

  async function submitContact(event: FormEvent) {
    event.preventDefault()
    if (!form || !step) return
    const contact: Answers = { ...answers, whatsapp: composePhone(dial, national) }
    if (!isContactComplete(step, contact)) {
      setError('REQUIRED')
      return
    }
    setBusy(true)
    setError(null)
    const eventId = newEventId()
    try {
      const tracking = readTracking(window.location.href, document.cookie, consent === true)
      tracking.events = { ...events.current, [EVENTS.firstInteraction]: eventId }
      const fields = Object.fromEntries(step.fields.map((field) => [field.key, contact[field.key] ?? '']))
      const result = await api.startSubmission(form.slug, fields, tracking, honeypot)
      setSubmissionId(result.submissionId)
      events.current[EVENTS.firstInteraction] = eventId
      trackEvent(EVENTS.firstInteraction, eventId)
      setStepIndex(1)
    } catch (caught) {
      setError(caught instanceof api.FormApiError ? caught.message : 'UNKNOWN')
    } finally {
      setBusy(false)
    }
  }

  async function chooseOption(field: FormField, code: string) {
    if (!form || !submissionId || busy) return
    const next = { ...answers, [field.key]: code }
    setAnswers(next)
    setError(null)
    const nextSteps = visibleSteps(form.definition, next)
    if (stepIndex + 1 < nextSteps.length) {
      setStepIndex(stepIndex + 1)
      return
    }
    // Última etapa: envia as respostas de escolha (as de contato já foram gravadas)
    const contactKeys = new Set(nextSteps[0].fields.map((item) => item.key))
    const choices = Object.fromEntries(Object.entries(next).filter(([key]) => !contactKeys.has(key)))
    const submitId = newEventId()
    const mqlId = newEventId()
    setBusy(true)
    try {
      const result = await api.finishSubmission(submissionId, choices, {
        [EVENTS.submit]: submitId,
        ...(form.definition.mql ? { [EVENTS.mql]: mqlId } : {}),
      })
      trackEvent(EVENTS.submit, submitId)
      if (result.isMql) trackEvent(EVENTS.mql, mqlId)
      setScreen('thanks')
    } catch (caught) {
      setError(caught instanceof api.FormApiError ? caught.message : 'UNKNOWN')
    } finally {
      setBusy(false)
    }
  }

  if (screen === 'loading') {
    return <Shell><p className="text-muted">{t('form.loading')}</p></Shell>
  }
  if (screen === 'notFound' || !form) {
    return <Shell><p className="text-muted">{t('form.notFound')}</p></Shell>
  }

  const intro = form.definition.intro

  return (
    <Shell>
      {screen === 'intro' && intro && (
        <section>
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{intro.title}</h1>
          {intro.bullets && (
            <ul className="mt-5 space-y-1 text-ink-soft">
              {intro.bullets.map((bullet) => (
                <li key={bullet}>• {bullet}</li>
              ))}
            </ul>
          )}
          {intro.note && <p className="mt-5 text-ink-soft">→ {intro.note}</p>}
          <button type="button" onClick={() => setScreen('steps')} className={primaryButton}>
            {t('form.start')}
          </button>
        </section>
      )}

      {screen === 'steps' && step && (
        <section>
          <p className="mb-4 text-xs text-muted">{t('form.progress', { current: stepIndex + 1, total: steps.length })}</p>
          <div className="mb-6 h-1 w-full rounded bg-line">
            <div className="h-1 rounded bg-ink" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
          </div>

          {stepIndex === 0 ? (
            <form onSubmit={submitContact} noValidate className="space-y-7">
              {step.fields.map((field) => (
                <label key={field.key} className="block">
                  <span className="text-xl">
                    {field.label}
                    {field.required && <span className="text-risk"> *</span>}
                  </span>
                  {field.type === 'phone' ? (
                    <span className="mt-2 flex gap-2">
                      <select
                        aria-label={t('form.dialCode')}
                        value={dial}
                        onChange={(e) => setDial(e.target.value)}
                        className="border-0 border-b-2 border-ink/70 bg-transparent py-2 text-lg outline-none focus:border-action"
                      >
                        {DIAL_CODES.map((item) => (
                          <option key={item.country} value={item.dial}>
                            {t(`codes.country.${item.country}`)} (+{item.dial})
                          </option>
                        ))}
                      </select>
                      <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel-national"
                        value={national}
                        onChange={(e) => setNational(e.target.value)}
                        placeholder={t('form.phonePlaceholder')}
                        className={inputClass.replace('mt-2 ', '')}
                      />
                    </span>
                  ) : (
                    <input
                      type="text"
                      autoComplete={field.type === 'text' ? 'name' : 'off'}
                      value={answers[field.key] ?? ''}
                      onChange={(e) => setAnswer(field.key, e.target.value)}
                      placeholder={t(field.type === 'instagram' ? 'form.instagramPlaceholder' : 'form.textPlaceholder')}
                      className={inputClass}
                    />
                  )}
                </label>
              ))}
              {/* Campo anti-robô: invisível para pessoas */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
              />
              {error && <p role="alert" className="text-sm text-risk">{t(`form.errors.${error}`, { defaultValue: t('form.errors.UNKNOWN') })}</p>}
              <button type="submit" disabled={busy} className={primaryButton}>
                {busy ? t('form.sending') : t('form.continue')}
              </button>
            </form>
          ) : (
            step.fields.map((field) => (
              <fieldset key={field.key}>
                {field.description && <p className="mb-4 text-xl">{field.description}</p>}
                <legend className="mb-5 text-xl font-semibold">{field.label}</legend>
                <div className="space-y-3">
                  {field.options?.map((option, index) => (
                    <button
                      key={option.code}
                      type="button"
                      disabled={busy}
                      onClick={() => void chooseOption(field, option.code)}
                      aria-pressed={answers[field.key] === option.code}
                      className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
                        answers[field.key] === option.code ? 'border-action bg-selected' : 'border-line bg-card hover:border-ink/40'
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-line text-sm text-muted">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
                {busy && <p className="mt-4 text-sm text-muted">{t('form.sending')}</p>}
                {error && <p role="alert" className="mt-4 text-sm text-risk">{t(`form.errors.${error}`, { defaultValue: t('form.errors.UNKNOWN') })}</p>}
                {stepIndex > 1 && !busy && (
                  <button type="button" onClick={() => setStepIndex(stepIndex - 1)} className="mt-6 text-sm text-muted underline">
                    {t('form.back')}
                  </button>
                )}
              </fieldset>
            ))
          )}
        </section>
      )}

      {screen === 'thanks' && (
        <section>
          <h1 className="text-2xl font-bold">{form.definition.thanks.title}</h1>
          <p className="mt-4 whitespace-pre-line text-ink-soft">{form.definition.thanks.body}</p>
        </section>
      )}

      {consent === null && form.metaPixelId && (
        <div role="dialog" aria-label={t('form.consent.title')} className="fixed inset-x-0 bottom-0 border-t border-line bg-card p-4 shadow-lg">
          <div className="mx-auto flex max-w-xl flex-col gap-3 sm:flex-row sm:items-center">
            <p className="text-sm text-ink-soft">
              {t('form.consent.text')}{' '}
              {form.definition.privacyUrl && (
                <a href={form.definition.privacyUrl} target="_blank" rel="noreferrer" className="text-action underline">
                  {t('form.consent.policy')}
                </a>
              )}
            </p>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => choose(false)} className="rounded-lg border border-line px-4 py-2 text-sm">
                {t('form.consent.reject')}
              </button>
              <button type="button" onClick={() => choose(true)} className="rounded-lg bg-ink px-4 py-2 text-sm text-white">
                {t('form.consent.accept')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}

const primaryButton = 'mt-8 rounded-lg bg-ink px-6 py-3 font-medium text-white disabled:opacity-60'

function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <main className="min-h-screen bg-page px-4 pb-40 pt-8">
      <div className="mx-auto max-w-xl rounded-card border border-line bg-card p-6 sm:p-10">
        <p className="mb-8 text-center text-xl font-bold tracking-tight">
          {t('form.brand')}
          <span className="text-brand">.</span>
        </p>
        {children}
      </div>
    </main>
  )
}
