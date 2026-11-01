import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Layers, Loader2, MapPin, Package, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export interface LocationItem {
  id: string
  warehouse_id: string
  parent_id: string | null
  code: string
  name: string
  kind: 'shelf' | 'section' | 'area'
  description: string | null
  is_active: boolean
}

export interface WarehouseItem {
  id: string
  code: string
  name: string
  warehouse_type: 'central' | 'workshop' | 'office' | 'project' | 'service'
  address: string | null
  manager_name: string | null
  phone: string | null
  description: string | null
  is_active: boolean
  locations: LocationItem[]
}

export interface StockBalanceItem {
  id: string
  product_id: string
  product_name: string
  inventory_code: string
  unit: string
  warehouse_id: string
  warehouse_name: string
  location_id: string | null
  location_name: string | null
  quantity: string
}

const WH_TYPES: Record<string, string> = {
  central: 'Merkez Depo',
  workshop: 'Teknik Atölye',
  office: 'Ofis',
  project: 'Proje Deposu',
  service: 'Servis Alanı',
}

const LOC_KINDS: Record<string, string> = {
  shelf: 'Raf',
  section: 'Bölüm',
  area: 'Alan / Koridor',
}

export default function WarehousesPage() {
  const { can } = useAuth()
  const qc = useQueryClient()

  const [selectedWhId, setSelectedWhId] = useState<string>('')
  const [openWhModal, setOpenWhModal] = useState(false)
  const [openLocModal, setOpenLocModal] = useState(false)

  // Yeni Depo Form State
  const [wCode, setWCode] = useState('')
  const [wName, setWName] = useState('')
  const [wType, setWType] = useState<'central' | 'workshop' | 'office' | 'project' | 'service'>('central')
  const [wManager, setWManager] = useState('')
  const [wPhone, setWPhone] = useState('')
  const [wAddress, setWAddress] = useState('')

  // Yeni Raf/Bölüm Form State
  const [lCode, setLCode] = useState('')
  const [lName, setLName] = useState('')
  const [lKind, setLKind] = useState<'shelf' | 'section' | 'area'>('shelf')
  const [lDesc, setLDesc] = useState('')

  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api<WarehouseItem[]>('/warehouses'),
  })

  const activeWh = warehouses.find(w => w.id === selectedWhId) || warehouses[0]

  const { data: balances = [], isLoading: bLoad } = useQuery({
    queryKey: ['warehouse-stock', activeWh?.id],
    queryFn: () =>
      api<StockBalanceItem[]>(`/warehouses/stock${activeWh ? `?warehouse_id=${activeWh.id}` : ''}`),
    enabled: !!activeWh,
  })

  const createWarehouse = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api('/warehouses', {
        method: 'POST',
        body: JSON.stringify({
          code: wCode.toUpperCase(),
          name: wName,
          warehouse_type: wType,
          manager_name: wManager || null,
          phone: wPhone || null,
          address: wAddress || null,
        }),
      })
      toast.success('Depo oluşturuldu.')
      qc.invalidateQueries({ queryKey: ['warehouses'] })
      setOpenWhModal(false)
      setWCode('')
      setWName('')
      setWManager('')
      setWPhone('')
      setWAddress('')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const createLocation = async (e: FormEvent) => {
    e.preventDefault()
    if (!activeWh) return
    try {
      await api(`/warehouses/${activeWh.id}/locations`, {
        method: 'POST',
        body: JSON.stringify({
          code: lCode.toUpperCase(),
          name: lName,
          kind: lKind,
          description: lDesc || null,
        }),
      })
      toast.success(`${activeWh.name} içerisine raf/bölüm eklendi.`)
      qc.invalidateQueries({ queryKey: ['warehouses'] })
      setOpenLocModal(false)
      setLCode('')
      setLName('')
      setLDesc('')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Depo ve Lokasyon Yönetimi</h1>
          <p className="text-sm text-slate-500">
            Şirket depoları, atölyeler, raf/bölüm hiyerarşisi ve depo bazlı stok bakiyeleri
          </p>
        </div>
        {can('warehouse.manage') && (
          <div className="flex gap-2">
            <button
              onClick={() => setOpenWhModal(true)}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> Yeni Depo Tanımla
            </button>
            {activeWh && (
              <button
                onClick={() => setOpenLocModal(true)}
                className="flex items-center gap-2 rounded-lg border border-brand-600 px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50 dark:text-indigo-400 dark:hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" /> Raf / Bölüm Ekle
              </button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid place-items-center p-12">
          <Loader2 className="animate-spin text-brand-600" />
        </div>
      ) : (
        <>
          {/* Depo Seçim Kartları */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {warehouses.map(w => {
              const isSelected = activeWh?.id === w.id
              return (
                <button
                  key={w.id}
                  onClick={() => setSelectedWhId(w.id)}
                  className={`flex flex-col justify-between rounded-xl border p-4 text-left transition ${
                    isSelected
                      ? 'border-brand-600 bg-brand-50/50 ring-2 ring-brand-500/20 dark:border-indigo-500 dark:bg-indigo-950/30'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-brand-600 dark:text-indigo-400">
                      {w.code}
                    </span>
                    <Building2 className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="mt-2">
                    <div className="font-bold">{w.name}</div>
                    <div className="text-xs text-slate-500">{WH_TYPES[w.warehouse_type] || w.warehouse_type}</div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800">
                    <span>{w.locations.length} Raf / Bölüm</span>
                    {w.manager_name && <span>{w.manager_name}</span>}
                  </div>
                </button>
              )
            })}
          </div>

          {activeWh && (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Sol: Seçili Depodaki Raf ve Bölümler */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold">{activeWh.name} — Raf & Bölümler</h2>
                    <p className="text-xs text-slate-500">Depo içi fiziksel yerleşim birimleri</p>
                  </div>
                  <Layers className="h-5 w-5 text-brand-600" />
                </div>

                {!activeWh.locations.length ? (
                  <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-xs text-slate-400 dark:border-slate-700">
                    Bu depoda henüz raf veya bölüm tanımlanmamış.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeWh.locations.map(loc => (
                      <div
                        key={loc.id}
                        className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/40"
                      >
                        <div className="flex items-center gap-2.5">
                          <MapPin className="h-4 w-4 text-brand-600" />
                          <div>
                            <div className="text-sm font-semibold">{loc.name}</div>
                            <div className="font-mono text-xs text-slate-500">{loc.code}</div>
                          </div>
                        </div>
                        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                          {LOC_KINDS[loc.kind] || loc.kind}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sağ (2 Kolon): Seçili Depodaki Stok Bakiyeleri */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold">{activeWh.name} — Mevcut Stok Bakiyeleri</h2>
                    <p className="text-xs text-slate-500">
                      Adet/miktar bazlı ürünlerin bu depodaki ve raflardaki anlık miktarı
                    </p>
                  </div>
                  <Package className="h-5 w-5 text-emerald-600" />
                </div>

                {bLoad ? (
                  <div className="grid place-items-center p-8">
                    <Loader2 className="animate-spin text-brand-600" />
                  </div>
                ) : !balances.length ? (
                  <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400 dark:border-slate-700">
                    Bu depoda henüz stok hareketiyle girişi yapılmış bakiye bulunmuyor.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                      <tr>
                        <th className="p-3">Envanter Kodu</th>
                        <th className="p-3">Ürün Adı</th>
                        <th className="p-3">Raf / Bölüm</th>
                        <th className="p-3 text-right">Mevcut Miktar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {balances.map(b => (
                        <tr key={b.id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="p-3 font-mono text-xs font-semibold text-brand-600 dark:text-indigo-400">
                            {b.inventory_code}
                          </td>
                          <td className="p-3 font-medium">{b.product_name}</td>
                          <td className="p-3 text-slate-500">{b.location_name || 'Genel Depo Alanı'}</td>
                          <td className="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                            {Number(b.quantity).toLocaleString('tr-TR')} {b.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Yeni Depo Modalı */}
      {openWhModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={createWarehouse}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Yeni Depo Tanımla</h2>
              <button type="button" onClick={() => setOpenWhModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Depo Kodu *
                <input
                  required
                  value={wCode}
                  onChange={e => setWCode(e.target.value.toUpperCase())}
                  className={inputCls + ' mt-1 font-mono uppercase'}
                  placeholder="WH-ANKARA"
                />
              </label>
              <label className="block text-sm font-medium">
                Depo Türü *
                <select
                  value={wType}
                  onChange={e => setWType(e.target.value as WarehouseItem['warehouse_type'])}
                  className={inputCls + ' mt-1'}
                >
                  {Object.entries(WH_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm font-medium">
              Depo Adı *
              <input
                required
                value={wName}
                onChange={e => setWName(e.target.value)}
                className={inputCls + ' mt-1'}
                placeholder="Ankara Saha Deposu"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Depo Sorumlusu
                <input
                  value={wManager}
                  onChange={e => setWManager(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
              <label className="block text-sm font-medium">
                Telefon
                <input
                  value={wPhone}
                  onChange={e => setWPhone(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
            </div>
            <label className="block text-sm font-medium">
              Adres
              <textarea
                rows={2}
                value={wAddress}
                onChange={e => setWAddress(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenWhModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                İptal
              </button>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                Kaydet
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Yeni Raf / Bölüm Modalı */}
      {openLocModal && activeWh && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={createLocation}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{activeWh.name} — Yeni Raf / Bölüm</h2>
              <button type="button" onClick={() => setOpenLocModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Raf / Bölüm Kodu *
                <input
                  required
                  value={lCode}
                  onChange={e => setLCode(e.target.value.toUpperCase())}
                  className={inputCls + ' mt-1 font-mono uppercase'}
                  placeholder="RAF-A1"
                />
              </label>
              <label className="block text-sm font-medium">
                Birim Türü *
                <select
                  value={lKind}
                  onChange={e => setLKind(e.target.value as 'shelf' | 'section' | 'area')}
                  className={inputCls + ' mt-1'}
                >
                  {Object.entries(LOC_KINDS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm font-medium">
              Raf / Bölüm Adı *
              <input
                required
                value={lName}
                onChange={e => setLName(e.target.value)}
                className={inputCls + ' mt-1'}
                placeholder="Projektör Rafı A-1"
              />
            </label>
            <label className="block text-sm font-medium">
              Açıklama
              <input
                value={lDesc}
                onChange={e => setLDesc(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenLocModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                İptal
              </button>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                Ekle
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
