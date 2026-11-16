import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/context'

const NAV_ITEMS = [
  { to: '/', key: 'nav.queue', end: true },
  { to: '/leads', key: 'nav.leads', end: false },
  { to: '/oportunidades', key: 'nav.opportunities', end: false },
  { to: '/clientes', key: 'nav.customers', end: false },
  { to: '/configuracoes', key: 'nav.settings', end: false },
] as const

// Celular primeiro: no celular o menu vira uma faixa rolável no topo;
// a partir de 768 px ele vira o menu lateral do protótipo.
export function Layout() {
  const { t } = useTranslation()
  const { signOut } = useAuth()

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="border-line bg-card md:w-60 md:shrink-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-3 md:block md:px-5 md:py-6">
          <span className="text-lg font-semibold">
            {t('app.name')}
            <span className="text-brand">.</span>
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="min-h-11 rounded-lg px-3 text-sm text-muted hover:bg-page md:hidden"
          >
            {t('nav.signOut')}
          </button>
        </div>
        <nav aria-label={t('nav.main')} className="overflow-x-auto px-2 pb-2 md:px-3">
          <ul className="flex gap-1 md:flex-col">
            {NAV_ITEMS.map((item) => (
              <li key={item.to} className="shrink-0">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap ${
                      isActive ? 'bg-selected text-action' : 'text-ink-soft hover:bg-page'
                    }`
                  }
                >
                  {t(item.key)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden px-3 pt-6 md:block">
          <button
            type="button"
            onClick={() => void signOut()}
            className="min-h-11 w-full rounded-lg px-3 text-left text-sm text-muted hover:bg-page"
          >
            {t('nav.signOut')}
          </button>
        </div>
      </aside>
      <main className="mx-auto w-full min-w-0 max-w-[1180px] flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}
