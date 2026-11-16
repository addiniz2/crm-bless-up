import { useRef, useState, type DragEvent, type ReactNode, type TouchEvent } from 'react'

// Quadro por etapa (BU-32).
// Computador (a partir de 1024 px): todas as colunas cabem na largura, sem rolagem lateral; mover = arrastar.
// Celular e tablet: uma etapa por vez, com abas e contador no topo; troca de etapa tocando na aba ou deslizando.
export function StageBoard<T extends { id: string }>({
  stages,
  items,
  stageOf,
  stageLabel,
  renderCard,
  canDrag,
  onMove,
  ariaLabel,
}: {
  stages: readonly string[]
  items: T[]
  stageOf: (item: T) => string
  stageLabel: (stage: string) => string
  renderCard: (item: T) => ReactNode
  canDrag?: (item: T) => boolean
  onMove: (item: T, stage: string) => void
  ariaLabel: string
}) {
  const [active, setActive] = useState(stages[0])
  const [dragOver, setDragOver] = useState<string | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const byStage = (stage: string) => items.filter((item) => stageOf(item) === stage)

  function onDrop(event: DragEvent, stage: string) {
    event.preventDefault()
    setDragOver(null)
    const item = items.find((candidate) => candidate.id === event.dataTransfer.getData('text/plain'))
    if (item) onMove(item, stage)
  }

  // Deslizar na horizontal troca de etapa; gesto mais vertical que horizontal é rolagem e é ignorado.
  function onTouchEnd(event: TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const dx = event.changedTouches[0].clientX - start.x
    const dy = event.changedTouches[0].clientY - start.y
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    const index = stages.indexOf(active)
    const next = dx < 0 ? Math.min(index + 1, stages.length - 1) : Math.max(index - 1, 0)
    setActive(stages[next])
  }

  return (
    <div aria-label={ariaLabel}>
      {/* Celular e tablet */}
      <div className="lg:hidden">
        <div role="tablist" aria-label={ariaLabel} className="-mx-4 mb-3 flex gap-1 overflow-x-auto px-4 pb-1">
          {stages.map((stage) => (
            <button
              key={stage}
              type="button"
              role="tab"
              aria-selected={active === stage}
              onClick={() => setActive(stage)}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap ${
                active === stage ? 'bg-selected text-action' : 'text-ink-soft'
              }`}
            >
              {stageLabel(stage)}
              <span className="rounded-full bg-card px-2 py-0.5 text-xs text-muted">{byStage(stage).length}</span>
            </button>
          ))}
        </div>
        <ul
          role="tabpanel"
          aria-label={stageLabel(active)}
          className="min-h-40 space-y-2"
          onTouchStart={(event) => {
            touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }
          }}
          onTouchEnd={onTouchEnd}
        >
          {byStage(active).map((item) => (
            <li key={item.id} className="rounded-lg border border-line bg-card p-3">
              {renderCard(item)}
            </li>
          ))}
        </ul>
      </div>

      {/* Computador */}
      <div className="hidden gap-3 lg:grid" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
        {stages.map((stage) => {
          const column = byStage(stage)
          return (
            <section
              key={stage}
              aria-label={stageLabel(stage)}
              onDragOver={(event) => {
                event.preventDefault()
                setDragOver(stage)
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(event) => onDrop(event, stage)}
              className={`flex min-w-0 flex-col rounded-card border p-2 ${dragOver === stage ? 'border-action bg-selected' : 'border-line bg-page'}`}
            >
              <h2 className="mb-2 flex items-center justify-between gap-1 px-1 text-xs font-semibold">
                <span className="truncate">{stageLabel(stage)}</span>
                <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-xs text-muted">{column.length}</span>
              </h2>
              <ul className="space-y-2">
                {column.map((item) => (
                  <li
                    key={item.id}
                    draggable={canDrag ? canDrag(item) : true}
                    onDragStart={(event) => event.dataTransfer.setData('text/plain', item.id)}
                    className="cursor-grab rounded-lg border border-line bg-card p-2.5 active:cursor-grabbing"
                  >
                    {renderCard(item)}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
