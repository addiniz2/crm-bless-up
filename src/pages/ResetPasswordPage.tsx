import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/context'

// Página aberta pelo link do e-mail de recuperação. O Supabase cria a sessão a partir do link;
// sem sessão, o link é inválido ou expirou.
export function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { session, loading, updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  if (loading) {
    return <p className="p-6 text-muted">{t('app.loading')}</p>
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (password !== confirm) {
      setErrorKey('resetPassword.mismatch')
      return
    }
    setSubmitting(true)
    setErrorKey(null)
    const ok = await updatePassword(password)
    setSubmitting(false)
    if (ok) navigate('/', { replace: true })
    else setErrorKey('resetPassword.error')
  }

  const inputClass =
    'mt-1 block min-h-11 w-full rounded-lg border border-line px-3 text-base text-ink focus:border-action focus:outline-none'

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-6">
        <h1 className="mb-6 text-xl font-semibold">{t('resetPassword.title')}</h1>

        {!session ? (
          <>
            <p role="alert" className="mb-4 rounded-lg bg-warning-bg p-3 text-sm text-warning">
              {t('resetPassword.invalidLink')}
            </p>
            <Link to="/entrar" className="inline-flex min-h-11 items-center text-sm text-action">
              {t('resetPassword.backToLogin')}
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="mb-4 block text-sm font-medium text-ink-soft">
              {t('resetPassword.password')}
              <input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="mb-6 block text-sm font-medium text-ink-soft">
              {t('resetPassword.confirm')}
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
              />
            </label>

            {errorKey && (
              <p role="alert" className="mb-4 text-sm text-risk">
                {t(errorKey)}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="min-h-11 w-full rounded-lg bg-action font-medium text-white disabled:opacity-60"
            >
              {submitting ? t('resetPassword.submitting') : t('resetPassword.submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
