import { useTranslation } from 'react-i18next'
import { COUNTRIES, type ListItem } from '../lib/leads'
import type { AppUser, QueueFilters } from '../lib/queue'

const selectClass =
  'mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink focus:border-action focus:outline-none'

// Filtros de leads (Minha fila e Leads): responsável (todos, sem responsável ou a usuária), país e tipo.
// No celular ficam recolhidos para a lista aparecer logo; no computador, abertos.
export function LeadFilters({
  filters,
  onChange,
  users,
  types,
}: {
  filters: QueueFilters
  onChange: (filters: QueueFilters) => void
  users: AppUser[]
  types: ListItem[]
}) {
  const { t } = useTranslation()
  const active = Number(filters.owner !== 'ALL') + Number(filters.country !== '') + Number(filters.leadTypeId !== '')

  return (
    <details
      open={typeof window !== 'undefined' && window.matchMedia?.('(min-width: 768px)').matches}
      className="mb-4 rounded-card border border-line bg-card"
    >
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium text-ink-soft">
        {t('pages.queue.filters')}
        {active > 0 && <span className="ml-2 rounded-full bg-selected px-2 py-0.5 text-xs text-action">{active}</span>}
      </summary>
      <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-3">
        <label className="text-sm text-ink-soft">
          {t('pages.queue.owner')}
          <select value={filters.owner} onChange={(e) => onChange({ ...filters, owner: e.target.value })} className={selectClass}>
            <option value="ALL">{t('pages.queue.ownerAll')}</option>
            <option value="NONE">{t('pages.queue.unassigned')}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-soft">
          {t('pages.queue.country')}
          <select
            value={filters.country}
            onChange={(e) => onChange({ ...filters, country: e.target.value as QueueFilters['country'] })}
            className={selectClass}
          >
            <option value="">{t('pages.queue.all')}</option>
            {COUNTRIES.map((code) => (
              <option key={code} value={code}>
                {t(`codes.country.${code}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-soft">
          {t('pages.queue.leadType')}
          <select value={filters.leadTypeId} onChange={(e) => onChange({ ...filters, leadTypeId: e.target.value })} className={selectClass}>
            <option value="">{t('pages.queue.all')}</option>
            {types.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </details>
  )
}
