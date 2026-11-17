import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listMetaEvents, retryMetaEvent, type MetaEvent } from '../lib/leadDetail'
import { useToast } from './Toast'

const STATUS_STYLE: Record<MetaEvent['status'], string> = {
  PENDING: 'bg-page text-muted',
  SENDING: 'bg-page text-muted',
  SENT: 'bg-healthy/10 text-healthy',
  FAILED: 'bg-risk/10 text-risk',
  EXPIRED: 'bg-risk/10 text-risk',
}

// BU-18: o que foi enviado à Meta para este lead, com a resposta e o reenvio de falhas
export function MetaEventsCard({ leadId, formatDate }: { leadId: string; formatDate: (value: string | null) => string | null }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [events, setEvents] = useState<MetaEvent[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    listMetaEvents(leadId)
      .then(setEvents)
      .catch(() => setFailed(true))
  }, [leadId])

  useEffect(() => {
    load()
  }, [load])

  async function retry(id: string) {
    const result = await retryMetaEvent(id)
    toast.show(t(`metaEvents.retry.${result}`))
    load()
  }

  return (
    <div className="rounded-card border border-line bg-card p-4">
      <h2 className="mb-3 font-semibold">{t('metaEvents.title')}</h2>
      {failed && <p className="text-sm text-risk">{t('common.loadError')}</p>}
      {events && events.length === 0 && <p className="text-sm text-muted">{t('metaEvents.empty')}</p>}
      {events && events.length > 0 && (
        <ul className="divide-y divide-line">
          {events.map((event) => (
            <li key={event.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="font-medium">{t(`metaEvents.names.${event.event_name}`, { defaultValue: event.event_name })}</span>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[event.status]}`}>
                {t(`metaEvents.status.${event.status}`)}
              </span>
              <span className="text-xs text-muted">{formatDate(event.sent_at ?? event.event_time)}</span>
              {event.status === 'FAILED' && (
                <button type="button" onClick={() => void retry(event.id)} className="min-h-9 text-xs font-semibold text-action underline">
                  {t('metaEvents.retryButton')}
                </button>
              )}
              {event.last_error && event.status !== 'SENT' && (
                <span className="w-full break-words text-xs text-muted">{event.last_error}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
