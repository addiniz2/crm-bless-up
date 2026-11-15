import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from './auth/AuthProvider'
import { AppRoutes } from './App'

function renderAt(path: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('rotas', () => {
  it('sem sessão, qualquer tela leva ao login', () => {
    renderAt('/clientes')
    expect(screen.getByRole('heading', { name: 'Entrar no CRM' })).toBeInTheDocument()
  })

  it('sem banco configurado, o login avisa e não deixa enviar', () => {
    renderAt('/entrar')
    expect(screen.getByRole('alert')).toHaveTextContent('ainda não está ligado')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled()
  })
})
