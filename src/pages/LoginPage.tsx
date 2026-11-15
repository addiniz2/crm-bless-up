import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/context'
import { authLinkFailed, isSupabaseConfigured } from '../lib/supabase'

export function LoginPage() {
  const { t } = useTranslation()
  const { session, signIn, requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; key: string } | null>(
    authLinkFailed ? { kind: 'error', key: 'login.linkExpired' } : null,
  )

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    const ok = await signIn(email.trim(), password)
    setSubmitting(false)
    // Mensagem única para não revelar se o e-mail existe.
    if (!ok) setMessage({ kind: 'error', key: 'login.error' })
  }

  async function handleForgot() {
    if (!email.trim()) {
      setMessage({ kind: 'info', key: 'login.emailFirst' })
      return
    }
    const ok = await requestPasswordReset(email.trim())
    setMessage(ok ? { kind: 'info', key: 'login.resetSent' } : { kind: 'error', key: 'login.resetError' })
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-card border border-line bg-card p-6">
        <h1 className="mb-6 text-xl font-semibold">{t('login.title')}</h1>

        {!isSupabaseConfigured && (
          <p role="alert" className="mb-4 rounded-lg bg-warning-bg p-3 text-sm text-warning">
            {t('login.notConfigured')}
          </p>
        )}

        <label className="mb-4 block text-sm font-medium text-ink-soft">
          {t('login.email')}
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block min-h-11 w-full rounded-lg border border-line px-3 text-base text-ink focus:border-action focus:outline-none"
          />
        </label>

        <label className="mb-6 block text-sm font-medium text-ink-soft">
          {t('login.password')}
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block min-h-11 w-full rounded-lg border border-line px-3 text-base text-ink focus:border-action focus:outline-none"
          />
        </label>

        {message && (
          <p
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={`mb-4 text-sm ${message.kind === 'error' ? 'text-risk' : 'text-healthy'}`}
          >
            {t(message.key)}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !isSupabaseConfigured}
          className="min-h-11 w-full rounded-lg bg-action font-medium text-white disabled:opacity-60"
        >
          {submitting ? t('login.submitting') : t('login.submit')}
        </button>

        <button
          type="button"
          onClick={() => void handleForgot()}
          disabled={!isSupabaseConfigured}
          className="mt-3 min-h-11 w-full text-sm text-action disabled:opacity-60"
        >
          {t('login.forgot')}
        </button>
      </form>
    </div>
  )
}
