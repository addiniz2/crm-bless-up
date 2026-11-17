import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import './index.css'
import './i18n'

// Uma página só, dois aplicativos: /f/<slug> é o formulário público do site (BU-19), o resto é o CRM.
// Cada um é carregado à parte, então quem abre o formulário pelo anúncio não baixa o CRM.
const root = document.getElementById('root')!
if (window.location.pathname.startsWith('/f/')) {
  void import('./form/mount').then(({ mountForm }) => mountForm(root))
} else {
  void import('./mountApp').then(({ mountApp }) => mountApp(root))
}
