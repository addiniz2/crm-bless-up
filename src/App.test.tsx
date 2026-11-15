import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from './auth/AuthProvider'
import { AuthContext, type AuthState } from './auth/context'
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

  it('link de nova senha sem sessão avisa que é inválido', () => {
    renderAt('/nova-senha')
    expect(screen.getByRole('heading', { name: 'Criar nova senha' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('inválido ou expirou')
    expect(screen.getByRole('link', { name: 'Voltar para a entrada' })).toHaveAttribute('href', '/entrar')
  })

  it('sem banco configurado, o login avisa e não deixa enviar', () => {
    renderAt('/entrar')
    expect(screen.getByRole('alert')).toHaveTextContent('ainda não está ligado')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled()
  })

  it('quem chega pelo link de recuperação vai para a nova senha, mesmo caindo na página inicial', () => {
    const recovering: AuthState = {
      session: { user: { id: 'u1' } } as AuthState['session'],
      loading: false,
      recovering: true,
      signIn: async () => true,
      signOut: async () => {},
      requestPasswordReset: async () => true,
      updatePassword: async () => true,
    }
    render(
      <AuthContext.Provider value={recovering}>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    expect(screen.getByRole('heading', { name: 'Criar nova senha' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nova senha')).toBeInTheDocument()
  })
})
