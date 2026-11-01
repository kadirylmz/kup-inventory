import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Toaster } from 'sonner'
import './index.css'
import { AuthProvider, useAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import DashboardPage from '@/pages/Dashboard'
import InventoryPage from '@/pages/Inventory'
import CategoriesPage from '@/pages/Categories'
import BrandsModelsPage from '@/pages/BrandsModels'
import WarehousesPage from '@/pages/Warehouses'
import MovementsPage from '@/pages/Movements'
import ProjectsPage from '@/pages/Projects'
import EmployeesPage from '@/pages/Employees'
import AssignmentsPage from '@/pages/Assignments'
import LicensesPage from '@/pages/Licenses'
import MaintenancePage from '@/pages/Maintenance'
import StocktakePage from '@/pages/Stocktake'
import ValuationsPage from '@/pages/Valuations'
import ReportsPage from '@/pages/Reports'
import NotificationsPage from '@/pages/Notifications'
import UsersPage from '@/pages/Users'
import AuditLogsPage from '@/pages/AuditLogs'
import SettingsBackupsPage from '@/pages/SettingsBackups'
import SystemLicensePage from '@/pages/SystemLicense'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })

function Gate() {
  const { me, loading } = useAuth()
  if (loading) return <div className="grid h-screen place-items-center"><Loader2 className="animate-spin" /></div>
  if (!me) return <Login />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/envanter" element={<InventoryPage />} />
        <Route path="/kategoriler" element={<CategoriesPage />} />
        <Route path="/markalar" element={<BrandsModelsPage />} />
        <Route path="/depolar" element={<WarehousesPage />} />
        <Route path="/hareketler" element={<MovementsPage />} />
        <Route path="/projeler" element={<ProjectsPage />} />
        <Route path="/personel" element={<EmployeesPage />} />
        <Route path="/zimmetler" element={<AssignmentsPage />} />
        <Route path="/lisanslar" element={<LicensesPage />} />
        <Route path="/bakim" element={<MaintenancePage />} />
        <Route path="/sayim" element={<StocktakePage />} />
        <Route path="/degerleme" element={<ValuationsPage />} />
        <Route path="/raporlar" element={<ReportsPage />} />
        <Route path="/bildirimler" element={<NotificationsPage />} />
        <Route path="/islem-gecmisi" element={<AuditLogsPage />} />
        <Route path="/kullanicilar" element={<UsersPage />} />
        <Route path="/ayarlar" element={<SettingsBackupsPage />} />
        <Route path="/sistem-lisansi" element={<SystemLicensePage />} />
      </Route>
    </Routes>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <AuthProvider><BrowserRouter><Gate /></BrowserRouter></AuthProvider>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  </StrictMode>,
)
