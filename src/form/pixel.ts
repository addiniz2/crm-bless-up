// Pixel da Meta no navegador. Só é carregado depois do aceite de cookies.
// Cada evento leva um eventID; o mesmo ID vai ao servidor para a API de Conversões não duplicar (BU-17).
type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown }

declare global {
  interface Window {
    fbq?: Fbq
    _fbq?: Fbq
  }
}

let initialized = false

export function loadPixel(pixelId: string): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  if (!window.fbq) {
    const queue: unknown[] = []
    const fbq: Fbq = (...args: unknown[]) => {
      queue.push(args)
    }
    fbq.queue = queue
    fbq.loaded = true
    fbq.version = '2.0'
    fbq.push = fbq
    window.fbq = fbq
    window._fbq = fbq
    const script = document.createElement('script')
    script.async = true
    script.src = 'https://connect.facebook.net/en_US/fbevents.js'
    document.head.appendChild(script)
  }
  window.fbq('init', pixelId)
  window.fbq('track', 'PageView')
}

export function trackEvent(name: string, eventId: string): void {
  if (!initialized || !window.fbq) return
  window.fbq('trackCustom', name, {}, { eventID: eventId })
}
