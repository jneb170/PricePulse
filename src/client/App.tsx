import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { DashboardScreen } from './screens/Dashboard'
import { RulesScreen } from './screens/Rules'
import { AuditScreen } from './screens/Audit'
import { SettingsScreen } from './screens/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardScreen />} />
        <Route path="/rules" element={<RulesScreen />} />
        <Route path="/audit" element={<AuditScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
