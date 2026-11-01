import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  Bell, Boxes, Building2, ClipboardCheck, FileText, FolderKanban, History, KeyRound, LayoutDashboard,
  LogOut, Moon, Package, Scale, Settings, ShieldCheck, Sun, Tags, TrendingUp, Truck, Users, UserSquare, Wrench, Repeat,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/api'

export const NAV = [
  { to: '/', label: 'Genel Bakış', icon: LayoutDashboard },
  { to: '/envanter', label: 'Envanter', icon: Package },
  { to: '/kategoriler', label: 'Kategoriler', icon: Tags },
  { to: '/markalar', label: 'Markalar ve Modeller', icon: Boxes },
  { to: '/depolar', label: 'Depolar', icon: Building2 },
  { to: '/hareketler', label: 'Stok Hareketleri', icon: Repeat },
  { to: '/projeler', label: 'Projeler', icon: FolderKanban },
  { to: '/personel', label: 'Personel', icon: UserSquare },
  { to: '/zimmetler', label: 'Zimmetler', icon: Truck },
  { to: '/lisanslar', label: 'Yazılım Lisansları', icon: KeyRound },
  { to: '/bakim', label: 'Bakım ve Servis', icon: Wrench },
  { to: '/sayim', label: 'Sayım', icon: ClipboardCheck },
  { to: '/degerleme', label: 'Değerleme', icon: TrendingUp },
  { to: '/raporlar', label: 'Raporlar', icon: FileText },
  { to: '/bildirimler', label: 'Bildirimler', icon: Bell },
  { to: '/islem-gecmisi', label: 'İşlem Geçmişi', icon: History },
  { to: '/kullanicilar', label: 'Kullanıcılar', icon: Users },
  { to: '/ayarlar', label: 'Ayarlar', icon: Settings },
  { to: '/sistem-lisansi', label: 'Sistem Lisansı', icon: ShieldCheck },
]

export default function Layout() {
  const { me, logout } = useAuth()
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <div className="flex h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex dark:border-slate-800 dark:bg-slate-900 print:hidden">
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white"><Scale className="h-5 w-5" /></div>
          <span className="font-bold tracking-tight">KÜP INVENTORY</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              isActive && 'bg-brand-50 text-brand-700 dark:bg-indigo-500/15 dark:text-indigo-300')}>
              <n.icon className="h-4 w-4" />{n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-2 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 print:hidden">
          <Link to="/bildirimler" title="Bildirimler" className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><Bell className="h-5 w-5" /></Link>
          <button title="Tema" onClick={() => setDark(!dark)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
          <div className="px-2 text-right text-sm leading-tight">
            <div className="font-medium">{me?.full_name}</div>
            <div className="text-xs text-slate-500">{me?.roles.map(r => r.name).join(', ')}</div>
          </div>
          <button title="Çıkış" onClick={logout} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><LogOut className="h-5 w-5" /></button>
        </header>
        <main className="flex-1 overflow-y-auto p-6"><Outlet /></main>
      </div>
    </div>
  )
}
