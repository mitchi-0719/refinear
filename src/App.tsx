import { Route, Routes } from 'react-router-dom'

import { LandingPage } from './pages/LandingPage'
import { LicensesPage } from './pages/LicensesPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlayerPage } from './pages/PlayerPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { TermsPage } from './pages/TermsPage'

export const App = () => {
  return (
    <Routes>
      <Route path="/" element={<PlayerPage />} />
      <Route path="/lp" element={<LandingPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/licenses" element={<LicensesPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
