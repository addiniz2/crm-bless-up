import { useTranslation } from 'react-i18next'

// Marcador "Importante" (17/11/2026): uma estrela que a equipe liga e desliga para destacar o registro.
export function ImportantToggle({
  value,
  name,
  onChange,
  disabled,
  size = 'sm',
}: {
  value: boolean
  name: string
  onChange: (value: boolean) => void
  disabled?: boolean
  size?: 'sm' | 'md'
}) {
  const { t } = useTranslation()
  const icon = size === 'md' ? 'h-6 w-6' : 'h-5 w-5'
  return (
    <button
      type="button"
      aria-pressed={value}
      aria-label={t(value ? 'important.unmark' : 'important.mark', { name })}
      title={t(value ? 'important.unmark' : 'important.mark', { name })}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onChange(!value)
      }}
      className={`inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-md transition hover:bg-warning-bg disabled:opacity-50 ${
        value ? 'text-warning' : 'text-muted/60 hover:text-warning'
      }`}
    >
      <svg viewBox="0 0 20 20" className={icon} aria-hidden="true" fill={value ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.6}>
        <path
          strokeLinejoin="round"
          d="M10 2.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L10 14.3l-4.6 2.5.9-5.2L2.5 8l5.2-.7L10 2.5z"
        />
      </svg>
    </button>
  )
}

// Selo de texto para quem não enxerga cor (e para leitores de tela), usado ao lado do nome
export function ImportantBadge() {
  const { t } = useTranslation()
  return <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">{t('important.badge')}</span>
}
