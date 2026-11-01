import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Archive,
  Boxes,
  CheckCircle2,
  Cpu,
  FolderKanban,
  Loader2,
  Package,
  TrendingUp,
  UserCheck,
  Wallet,
  Wrench,
} from 'lucide-react'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '@/lib/api'

interface SummaryData {
  total_product_cards: number
  total_serial_assets: number
  total_physical_units: number
  purchase_cost_by_currency: Record<string, number>
  market_value_by_currency: Record<string, number>
  status_counts: Record<string, number>
  active_software_licenses: number
  upcoming_license_renewals: number
  category_distribution: { name: string; value: number }[]
  brand_distribution: { name: string; value: number }[]
}

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e']

function fmtCurrencyMap(map: Record<string, number> | undefined) {
  if (!map) return '0 ₺'
  const parts: string[] = []
  if (map.TRY) parts.push(`${map.TRY.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺`)
  if (map.EUR) parts.push(`${map.EUR.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} €`)
  if (map.USD) parts.push(`${map.USD.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} $`)
  return parts.length ? parts.join(' + ') : '0 ₺'
}

export default function DashboardPage() {
  const nav = useNavigate()
  const { data, isLoading, error } = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: () => api<SummaryData>('/inventory/summary'),
  })

  if (isLoading) {
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
      </div>
    )
  }
  if (error) {
    return <p className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{(error as Error).message}</p>
  }

  const sc = data?.status_counts || {}

  const kpis = [
    {
      label: 'Toplam Envanter Kalemi (Katalog)',
      value: data?.total_product_cards ?? 0,
      sub: `${data?.total_serial_assets ?? 0} tekil seri numaralı cihaz`,
      icon: Package,
      color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
      onClick: () => nav('/envanter'),
    },
    {
      label: 'Toplam Fiziksel Ürün Adedi',
      value: (data?.total_physical_units ?? 0).toLocaleString('tr-TR'),
      sub: 'Seri cihazlar + sarf/kablo miktarları',
      icon: Boxes,
      color: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
      onClick: () => nav('/envanter'),
    },
    {
      label: 'Toplam Alış Maliyeti',
      value: fmtCurrencyMap(data?.purchase_cost_by_currency),
      sub: 'Kayıtlı fatura alış maliyetleri toplamı',
      icon: Wallet,
      color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      onClick: () => nav('/envanter'),
    },
    {
      label: 'Güncel İkinci El Piyasa Değeri',
      value: fmtCurrencyMap(data?.market_value_by_currency),
      sub: 'Onaylı piyasa değerlemeleri toplamı',
      icon: TrendingUp,
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      onClick: () => nav('/envanter'),
    },
  ]

  const statusCards = [
    { label: 'Depoda Bulunan', count: sc.in_warehouse ?? 0, status: 'in_warehouse', icon: Archive, cls: 'text-emerald-600' },
    { label: 'Aktif Kullanımda', count: sc.active ?? 0, status: 'active', icon: CheckCircle2, cls: 'text-blue-600' },
    { label: 'Projelerde', count: sc.in_project ?? 0, status: 'in_project', icon: FolderKanban, cls: 'text-indigo-600' },
    { label: 'Personel Zimmetinde', count: sc.assigned ?? 0, status: 'assigned', icon: UserCheck, cls: 'text-purple-600' },
    { label: 'Arızalı Ürünler', count: sc.faulty ?? 0, status: 'faulty', icon: AlertTriangle, cls: 'text-amber-600' },
    { label: 'Teknik Serviste', count: sc.in_service ?? 0, status: 'in_service', icon: Wrench, cls: 'text-orange-600' },
    { label: 'Hurda Ürünler', count: sc.scrapped ?? 0, status: 'scrapped', icon: Cpu, cls: 'text-rose-600' },
    {
      label: 'Aktif Lisanslar',
      count: data?.active_software_licenses ?? 0,
      status: 'licenses',
      icon: CheckCircle2,
      cls: 'text-teal-600',
    },
    {
      label: 'Yaklaşan Yenileme',
      count: data?.upcoming_license_renewals ?? 0,
      status: 'renewals',
      icon: AlertTriangle,
      cls: 'text-rose-600',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Genel Bakış</h1>
          <p className="text-sm text-slate-500">
            KÜP Prodüksiyon merkezi varlık ve envanter durumu (yalnızca gerçek veritabanı kayıtları)
          </p>
        </div>
        <button
          onClick={() => nav('/envanter')}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
        >
          Envanter Yönetimine Git
        </button>
      </div>

      {/* Ana KPI Kartları */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(k => (
          <button
            key={k.label}
            onClick={k.onClick}
            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left shadow-xs transition hover:border-brand-500 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{k.label}</span>
              <span className={`rounded-lg p-2 ${k.color}`}>
                <k.icon className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-4">
              <div className="text-xl font-bold tracking-tight">{k.value}</div>
              <div className="mt-1 text-xs text-slate-500">{k.sub}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Durum Kırılım Kartları */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-9">
        {statusCards.map(s => (
          <button
            key={s.status}
            onClick={() =>
              s.status === 'licenses' || s.status === 'renewals'
                ? nav('/lisanslar')
                : nav(`/envanter?status=${s.status}`)
            }
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-brand-500 dark:border-slate-800 dark:bg-slate-900"
          >
            <s.icon className={`h-5 w-5 shrink-0 ${s.cls}`} />
            <div>
              <div className="text-lg font-bold leading-none">{s.count}</div>
              <div className="mt-1 text-xs text-slate-500">{s.label}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Grafikler */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold">Kategori Bazlı Ürün Dağılımı</h2>
          {!data?.category_distribution.length ? (
            <div className="grid h-64 place-items-center text-sm text-slate-400">
              Henüz kayıtlı ürün bulunmuyor.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.category_distribution}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                  >
                    {data.category_distribution.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold">Marka Bazlı Envanter Dağılımı</h2>
          {!data?.brand_distribution.length ? (
            <div className="grid h-64 place-items-center text-sm text-slate-400">
              Henüz marka atanmış ürün bulunmuyor.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.brand_distribution}>
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
