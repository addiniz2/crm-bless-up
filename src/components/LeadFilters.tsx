import { useTranslation } from 'react-i18next'
import { COUNTRIES, type ListItem } from '../lib/leads'
import { FilterPanel } from './FilterPanel'
import type { AppUser, QueueFilters } from '../lib/queue'

const selectClass =
  'mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink focus:border-action focus:outline-none'

// Filtros de leads (Minha fila e Leads): responsável (todos, sem responsável ou a usuária), país e tipo.
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
  const active =
    Number(filters.owner !== 'ALL') + Number(filters.country !== '') + Number(filters.leadTypeId !== '') + Number(filters.importantOnly)

  return (
    <FilterPanel active={active}>
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
        <label className="text-sm text-ink-soft">
          {t('important.filter')}
          <select
            value={filters.importantOnly ? 'YES' : ''}
            onChange={(e) => onChange({ ...filters, importantOnly: e.target.value === 'YES' })}
            className={selectClass}
          >
            <option value="">{t('pages.queue.all')}</option>
            <option value="YES">{t('important.onlyImportant')}</option>
          </select>
        </label>
    </FilterPanel>
  )
}
