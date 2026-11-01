import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
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
  const { me, loading, can } = useAuth()
  if (loading) return <div className="grid h-screen place-items-center"><Loader2 className="animate-spin" /></div>
  if (!me) return <Login />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={can('dashboard.view') ? <DashboardPage /> : <Navigate to="/envanter" replace />} />
        <Route path="/envanter" element={<InventoryPage />} />
        <Route path="/kategoriler" element={can('category.view') ? <CategoriesPage /> : <Navigate to="/envanter" replace />} />
        <Route path="/markalar" element={can('brand.view') ? <BrandsModelsPage /> : <Navigate to="/envanter" replace />} />
        <Route path="/depolar" element={can('warehouse.view') ? <WarehousesPage /> : <Navigate to="/envanter" replace />} />
        <Route path="/hareketler" element={can('movement.view') ? <MovementsPage /> : <Navigate to="/envanter" replace />} />
        <Route path="/projeler" element={can('project.view') ? <ProjectsPage /> : <Navigate to="/envanter" replace />} />
        <Route path="/personel" element={can('employee.view') ? <EmployeesPage /> : <Navigate to="/envanter" replace />} />
        <Route path="/zimmetler" element={can('assignment.view') ? <AssignmentsPage /> : <Navigate to="/envanter" replace />} />
        <Route path="/lisanslar" element={can('license.view') ? <LicensesPage /> : <Navigate to="/envanter" replace />} />
        <Route path="/bakim" element={can('maintenance.view') ? <MaintenancePage /> : <Navigate to="/envanter" replace />} />
        <Route path="/sayim" element={can('stocktake.view') ? <StocktakePage /> : <Navigate to="/envanter" replace />} />
        <Route path="/degerleme" element={can('valuation.view') ? <ValuationsPage /> : <Navigate to="/envanter" replace />} />
        <Route path="/raporlar" element={can('report.view') ? <ReportsPage /> : <Navigate to="/envanter" replace />} />
        <Route path="/bildirimler" element={can('notification.view') ? <NotificationsPage /> : <Navigate to="/envanter" replace />} />
        <Route path="/islem-gecmisi" element={can('audit.view') ? <AuditLogsPage /> : <Navigate to="/envanter" replace />} />
        <Route path="/kullanicilar" element={can('user.view') ? <UsersPage /> : <Navigate to="/envanter" replace />} />
        <Route path="/ayarlar" element={can('setting.view') ? <SettingsBackupsPage /> : <Navigate to="/envanter" replace />} />
        <Route path="/sistem-lisansi" element={can('app_license.view') ? <SystemLicensePage /> : <Navigate to="/envanter" replace />} />
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
