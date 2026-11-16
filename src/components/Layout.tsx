import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/context'

// Ícones simples desenhados aqui (traço de 1.8 px, 24×24), sem biblioteca externa.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

const ICONS = {
  queue: (
    <Icon>
      <path d="M4 13h4l2 3h4l2-3h4" />
      <path d="M5 13 7 5h10l2 8v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
    </Icon>
  ),
  leads: (
    <Icon>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.5M17.5 14a5 5 0 0 1 3 5" />
    </Icon>
  ),
  opportunities: (
    <Icon>
      <rect x="3.5" y="7" width="17" height="12" rx="2" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12h17" />
    </Icon>
  ),
  customers: (
    <Icon>
      <path d="m12 4 2.3 4.7 5.2.8-3.8 3.6.9 5.1L12 15.8l-4.6 2.4.9-5.1-3.8-3.6 5.2-.8z" />
    </Icon>
  ),
  settings: (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </Icon>
  ),
}

const NAV_ITEMS = [
  { to: '/', key: 'queue', end: true },
  { to: '/leads', key: 'leads', end: false },
  { to: '/oportunidades', key: 'opportunities', end: false },
  { to: '/clientes', key: 'customers', end: false },
  { to: '/configuracoes', key: 'settings', end: false },
] as const

// Celular: cabeçalho simples no topo e barra de navegação fixa embaixo, com ícone e nome curto.
// Computador (a partir de 768 px): menu lateral fixo. O conteúdo usa a largura disponível até 1600 px.
export function Layout() {
  const { t } = useTranslation()
  const { signOut } = useAuth()

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="hidden border-r border-line bg-card md:sticky md:top-0 md:flex md:h-screen md:w-56 md:shrink-0 md:flex-col">
        <div className="px-5 py-6 text-lg font-semibold">
          {t('app.name')}
          <span className="text-brand">.</span>
        </div>
        <nav aria-label={t('nav.main')} className="px-3">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                      isActive ? 'bg-selected text-action' : 'text-ink-soft hover:bg-page'
                    }`
                  }
                >
                  {ICONS[item.key]}
                  {t(`nav.${item.key}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto px-3 pb-6">
          <button
            type="button"
            onClick={() => void signOut()}
            className="min-h-11 w-full rounded-lg px-3 text-left text-sm text-muted hover:bg-page"
          >
            {t('nav.signOut')}
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-card px-4 py-2 md:hidden">
        <span className="text-lg font-semibold">
          {t('app.name')}
          <span className="text-brand">.</span>
        </span>
        <button type="button" onClick={() => void signOut()} className="min-h-11 rounded-lg px-3 text-sm text-muted">
          {t('nav.signOut')}
        </button>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 px-4 pt-4 pb-24 md:px-6 md:py-6 lg:px-8">
        <Outlet />
      </main>

      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-5">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                    isActive ? 'text-action' : 'text-muted'
                  }`
                }
              >
                {ICONS[item.key]}
                {t(`nav.short.${item.key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
