import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Link, NavLink, Outlet } from 'react-router-dom'
import defaultLogoImg from '@/assets/logo.jpg'
import {
  Bell,
  Boxes,
  Building2,
  ClipboardCheck,
  FileText,
  FolderKanban,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  Repeat,
  Settings,
  ShieldCheck,
  Sun,
  Tags,
  TrendingUp,
  Truck,
  Users,
  UserSquare,
  Wrench,
  Armchair,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/api'

export const NAV = [
  { to: '/', label: 'Genel Bakış', icon: LayoutDashboard, perm: 'dashboard.view' },
  { to: '/envanter', label: 'Envanter', icon: Package, perm: 'product.view' },
  { to: '/demirbaslar', label: 'Demirbaşlar', icon: Armchair, perm: 'fixture.view' },
  { to: '/kategoriler', label: 'Kategoriler', icon: Tags, perm: 'category.view' },
  { to: '/markalar', label: 'Markalar ve Modeller', icon: Boxes, perm: 'brand.view' },
  { to: '/depolar', label: 'Depolar', icon: Building2, perm: 'warehouse.view' },
  { to: '/hareketler', label: 'Stok Hareketleri', icon: Repeat, perm: 'movement.view' },
  { to: '/projeler', label: 'Projeler', icon: FolderKanban, perm: 'project.view' },
  { to: '/personel', label: 'Personel', icon: UserSquare, perm: 'employee.view' },
  { to: '/zimmetler', label: 'Zimmetler', icon: Truck, perm: 'assignment.view' },
  { to: '/lisanslar', label: 'Yazılım Lisansları', icon: KeyRound, perm: 'license.view' },
  { to: '/bakim', label: 'Bakım ve Servis', icon: Wrench, perm: 'maintenance.view' },
  { to: '/sayim', label: 'Sayım', icon: ClipboardCheck, perm: 'stocktake.view' },
  { to: '/degerleme', label: 'Değerleme', icon: TrendingUp, perm: 'valuation.view' },
  { to: '/raporlar', label: 'Raporlar', icon: FileText, perm: 'report.view' },
  { to: '/bildirimler', label: 'Bildirimler', icon: Bell, perm: 'notification.view' },
  { to: '/islem-gecmisi', label: 'İşlem Geçmişi', icon: History, perm: 'audit.view' },
  { to: '/kullanicilar', label: 'Kullanıcılar', icon: Users, perm: 'user.view' },
  { to: '/ayarlar', label: 'Ayarlar', icon: Settings, perm: 'setting.view' },
  { to: '/sistem-lisansi', label: 'Sistem Lisansı', icon: ShieldCheck, perm: 'app_license.view' },
]

export default function Layout() {
  const { me, logout, can } = useAuth()
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  const { data: appSettings } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => api<{ company_name?: string; logo_url?: string | null }>('/settings'),
    staleTime: 1000 * 60 * 5,
  })

  const [imgError, setImgError] = useState(false)
  const displayLogo = (!imgError && appSettings?.logo_url) ? appSettings.logo_url : defaultLogoImg

  const visibleNav = NAV.filter(n => !n.perm || can(n.perm))

  return (
    <div className="flex h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex dark:border-slate-800 dark:bg-slate-900 print:hidden">
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-100 dark:border-slate-800/60">
          <img
            src={displayLogo}
            alt="Logo"
            className="h-9 max-w-[120px] object-contain rounded"
            onError={() => setImgError(true)}
          />
          <span className="font-bold tracking-tight text-sm truncate text-slate-800 dark:text-slate-100" title={appSettings?.company_name || 'KÜP INVENTORY'}>
            {appSettings?.company_name || 'KÜP INVENTORY'}
          </span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {visibleNav.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                  isActive && 'bg-brand-50 text-brand-700 dark:bg-indigo-500/15 dark:text-indigo-300',
                )
              }
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-2 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 print:hidden">
          {can('notification.view') && (
            <Link
              to="/bildirimler"
              title="Bildirimler"
              className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Bell className="h-5 w-5" />
            </Link>
          )}
          <button
            title="Tema"
            onClick={() => setDark(!dark)}
            className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <div className="px-2 text-right text-sm leading-tight">
            <div className="font-medium">{me?.full_name}</div>
            <div className="text-xs text-slate-500">{me?.roles.map(r => r.name).join(', ')}</div>
          </div>
          <button
            title="Çıkış"
            onClick={logout}
            className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
