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

// Visual de uma pergunta por tela: tipografia grande, muito respiro, barra de progresso fina no topo.
const fieldInput =
  'mt-3 w-full border-0 border-b-2 border-line bg-transparent px-0 pb-2 pt-1 text-xl text-ink placeholder:text-muted/60 outline-none transition focus:border-action sm:text-2xl'

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
  const progress =
    screen === 'thanks' ? 100 : screen === 'steps' && steps.length ? Math.round(((stepIndex + 0.5) / steps.length) * 100) : 0

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

  const errorText = error && t(`form.errors.${error}`, { defaultValue: t('form.errors.UNKNOWN') })

  if (screen === 'loading' || screen === 'notFound' || !form) {
    return (
      <Shell progress={0}>
        <div className="flex flex-1 items-center justify-center">
          {screen === 'loading' ? (
            <span role="status" aria-label={t('form.loading')} className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-action" />
          ) : (
            <p className="text-center text-lg text-muted">{t('form.notFound')}</p>
          )}
        </div>
      </Shell>
    )
  }

  const intro = form.definition.intro
  const contactCount = steps[0]?.fields.length ?? 0

  return (
    <Shell progress={progress}>
      {screen === 'intro' && intro && (
        <section key="intro" className="form-enter">
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-ink sm:text-[2.5rem]">{intro.title}</h1>
          {intro.bullets && (
            <ul className="mt-8 space-y-3">
              {intro.bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-3 text-lg text-ink-soft">
                  <CheckIcon />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
          {intro.note && (
            <p className="mt-8 rounded-xl border-l-4 border-brand bg-selected px-5 py-4 text-base leading-relaxed text-ink">{intro.note}</p>
          )}
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <button type="button" onClick={() => setScreen('steps')} className={primaryButton}>
              {t('form.start')}
              <ArrowIcon />
            </button>
            <span className="text-center text-sm text-muted sm:text-left">{t('form.duration')}</span>
          </div>
        </section>
      )}

      {screen === 'steps' && step && stepIndex === 0 && (
        <form key="contact" onSubmit={submitContact} noValidate className="form-enter space-y-10">
          {step.fields.map((field, index) => (
            <label key={field.key} className="block">
              <QuestionLabel number={index + 1} required={field.required}>
                {field.label}
              </QuestionLabel>
              {field.type === 'phone' ? (
                <span className="mt-3 flex items-end gap-3">
                  <span className="relative flex w-24 shrink-0 items-center justify-between border-b-2 border-line pb-2 pt-1 text-xl focus-within:border-action sm:w-28 sm:text-2xl">
                    <span aria-hidden="true">+{dial}</span>
                    <ChevronIcon />
                    {/* Lista nativa invisível por cima: no celular abre o seletor do sistema */}
                    <select
                      aria-label={t('form.dialCode')}
                      value={dial}
                      onChange={(e) => setDial(e.target.value)}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    >
                      {DIAL_CODES.map((item) => (
                        <option key={item.country} value={item.dial}>
                          +{item.dial} · {t(`codes.country.${item.country}`)}
                        </option>
                      ))}
                    </select>
                  </span>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    value={national}
                    onChange={(e) => {
                      setNational(e.target.value)
                      setError(null)
                    }}
                    placeholder={t('form.phonePlaceholder')}
                    className={fieldInput.replace('mt-3 ', '')}
                  />
                </span>
              ) : (
                <input
                  type="text"
                  autoComplete={field.type === 'text' ? 'name' : 'off'}
                  autoCapitalize={field.type === 'instagram' ? 'none' : 'words'}
                  value={answers[field.key] ?? ''}
                  onChange={(e) => setAnswer(field.key, e.target.value)}
                  placeholder={t(field.type === 'instagram' ? 'form.instagramPlaceholder' : 'form.textPlaceholder')}
                  className={fieldInput}
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
          {errorText && <ErrorMessage>{errorText}</ErrorMessage>}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <button type="submit" disabled={busy} className={primaryButton}>
              {busy ? t('form.sending') : t('form.continue')}
              {!busy && <ArrowIcon />}
            </button>
            <span className="flex items-center justify-center gap-2 text-sm text-muted sm:justify-start">
              <LockIcon />
              {t('form.safe')}
            </span>
          </div>
        </form>
      )}

      {screen === 'steps' &&
        step &&
        stepIndex > 0 &&
        step.fields.map((field) => (
          <fieldset key={`${step.id}-${field.key}`} className="form-enter">
            {field.description && <p className="mb-4 text-lg leading-relaxed text-ink-soft">{field.description}</p>}
            <legend className="contents">
              <QuestionLabel number={contactCount + stepIndex} required={field.required}>
                {field.label}
              </QuestionLabel>
            </legend>
            <div className="mt-8 space-y-3">
              {field.options?.map((option, index) => {
                const selected = answers[field.key] === option.code
                return (
                  <button
                    key={option.code}
                    type="button"
                    disabled={busy}
                    onClick={() => void chooseOption(field, option.code)}
                    aria-pressed={selected}
                    className={`group flex min-h-14 w-full items-center gap-4 rounded-xl border-2 px-4 py-3 text-left text-base transition sm:text-lg ${
                      selected ? 'border-action bg-selected' : 'border-line bg-card hover:border-action/40 hover:bg-page'
                    } text-ink disabled:cursor-wait`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-sm font-semibold transition ${
                        selected ? 'border-action bg-action text-white' : 'border-line bg-page text-muted group-hover:border-action/40'
                      }`}
                    >
                      {selected ? <CheckIcon small /> : String.fromCharCode(65 + index)}
                    </span>
                    <span className="leading-snug">{option.label}</span>
                  </button>
                )
              })}
            </div>
            {busy && (
              <p className="mt-6 flex items-center gap-3 text-sm text-muted">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-action" />
                {t('form.sending')}
              </p>
            )}
            {errorText && (
              <div className="mt-6">
                <ErrorMessage>{errorText}</ErrorMessage>
              </div>
            )}
            {stepIndex > 1 && !busy && (
              <button
                type="button"
                onClick={() => setStepIndex(stepIndex - 1)}
                className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-muted transition hover:text-ink"
              >
                <ArrowIcon back />
                {t('form.back')}
              </button>
            )}
          </fieldset>
        ))}

      {screen === 'thanks' && (
        <section key="thanks" className="form-enter text-center sm:text-left">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-selected text-action sm:mx-0">
            <CheckIcon large />
          </span>
          <h1 className="mt-6 text-[1.75rem] font-bold leading-tight tracking-tight sm:text-[2.5rem]">{form.definition.thanks.title}</h1>
          <p className="mt-5 whitespace-pre-line text-lg leading-relaxed text-ink-soft">{form.definition.thanks.body}</p>
        </section>
      )}

      {consent === null && form.metaPixelId && (
        <div
          role="dialog"
          aria-label={t('form.consent.title')}
          className="fixed inset-x-3 bottom-3 z-20 mx-auto max-w-xl rounded-2xl border border-line bg-card p-4 shadow-[0_8px_30px_rgba(20,22,26,0.14)] sm:bottom-6 sm:p-5"
        >
          <p className="text-sm leading-relaxed text-ink-soft">
            {t('form.consent.text')}{' '}
            {form.definition.privacyUrl && (
              <a href={form.definition.privacyUrl} target="_blank" rel="noreferrer" className="font-medium text-action underline">
                {t('form.consent.policy')}
              </a>
            )}
          </p>
          <div className="mt-3 flex gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => choose(false)}
              className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-page sm:flex-none"
            >
              {t('form.consent.reject')}
            </button>
            <button
              type="button"
              onClick={() => choose(true)}
              className="flex-1 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink-soft sm:flex-none"
            >
              {t('form.consent.accept')}
            </button>
          </div>
        </div>
      )}
    </Shell>
  )
}

const primaryButton =
  'inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-ink px-7 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-ink-soft active:scale-[0.98] disabled:opacity-60 sm:w-auto'

function QuestionLabel({ number, required, children }: { number: number; required?: boolean; children: ReactNode }) {
  return (
    <span className="flex items-start gap-3">
      <span className="mt-1 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-ink px-1.5 text-xs font-semibold text-white">
        {number}
      </span>
      <span className="text-xl font-semibold leading-snug text-ink sm:text-2xl">
        {children}
        {required && <span className="text-risk">{'\u00a0'}*</span>}
      </span>
    </span>
  )
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-risk/10 px-4 py-3 text-sm font-medium text-risk">
      {children}
    </p>
  )
}

function Shell({ progress, children }: { progress: number; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh flex-col bg-card">
      <div className="fixed inset-x-0 top-0 z-10 h-1 bg-line/60">
        <div className="h-1 bg-action transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
      </div>
      <header className="flex justify-center px-6 pb-2 pt-8">
        <span className="text-2xl font-bold tracking-tight text-ink">
          {t('form.brand')}
          <span className="text-brand">.</span>
        </span>
      </header>
      <main className="flex flex-1 flex-col px-6 pb-44 pt-8 sm:pb-28 sm:pt-12">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:justify-center">{children}</div>
      </main>
    </div>
  )
}

function CheckIcon({ small, large }: { small?: boolean; large?: boolean }) {
  const size = large ? 'h-8 w-8' : small ? 'h-4 w-4' : 'mt-1 h-5 w-5 shrink-0 text-action'
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.4} className={size} aria-hidden="true">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowIcon({ back }: { back?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={`h-4 w-4 ${back ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="M4 10h12m-5-5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 text-muted" aria-hidden="true">
      <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden="true">
      <rect x="4" y="9" width="12" height="8" rx="2" />
      <path d="M7 9V6.5a3 3 0 016 0V9" strokeLinecap="round" />
    </svg>
  )
}
