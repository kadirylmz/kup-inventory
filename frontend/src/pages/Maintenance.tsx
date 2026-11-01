import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Loader2, Plus, Wrench, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { AssetItem, ProductItem } from '@/pages/Inventory'

interface ServiceRecordItem {
  id: string
  service_no: string
  product_id: string
  product_name: string
  inventory_code: string
  asset_id: string | null
  serial_number: string | null
  fault_type: string
  fault_description: string
  service_company: string | null
  sent_date: string
  return_date: string | null
  labor_cost: string
  parts_cost: string
  total_cost: string
  currency: string
  warranty_covered: boolean
  service_report: string | null
  result: 'in_service' | 'repaired' | 'unrepairable' | 'replaced'
}

interface MaintenanceRecordItem {
  id: string
  product_id: string
  product_name: string
  asset_id: string | null
  serial_number: string | null
  maintenance_type: string
  description: string
  performed_date: string
  next_maintenance_date: string | null
  cost: string
  currency: string
  technician_name: string | null
}

const SRV_RESULT: Record<string, { label: string; cls: string }> = {
  in_service: { label: 'Serviste', cls: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  repaired: { label: 'Onarıldı & Döndü', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  replaced: { label: 'Değişim Yapıldı', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  unrepairable: { label: 'Onarılamaz (Hurda)', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
}

export default function MaintenancePage() {
  const { can } = useAuth()
  const qc = useQueryClient()

  const [tab, setTab] = useState<'service' | 'maintenance'>('service')
  const [openSrvModal, setOpenSrvModal] = useState(false)
  const [openMntModal, setOpenMntModal] = useState(false)

  // Servis Form State
  const [sProductId, setSProductId] = useState('')
  const [sAssetId, setSAssetId] = useState('')
  const [sFaultType, setSFaultType] = useState('')
  const [sFaultDesc, setSFaultDesc] = useState('')
  const [sCompany, setSCompany] = useState('')
  const [sSentDate, setSSentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [sReturnDate, setSReturnDate] = useState('')
  const [sLabor, setSLabor] = useState('0')
  const [sParts, setSParts] = useState('0')
  const [sCurr, setSCurr] = useState<'TRY' | 'EUR' | 'USD'>('TRY')
  const [sWarranty, setSWarranty] = useState(false)
  const [sReport, setSReport] = useState('')
  const [sResult, setSResult] = useState<'in_service' | 'repaired' | 'unrepairable' | 'replaced'>('in_service')

  // Periyodik Bakım Form State
  const [mProductId, setMProductId] = useState('')
  const [mAssetId, setMAssetId] = useState('')
  const [mType, setMType] = useState('Filtre ve Termal Bakım')
  const [mDesc, setMDesc] = useState('')
  const [mDate, setMDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [mNextDate, setMNextDate] = useState('')
  const [mCost, setMCost] = useState('0')
  const [mCurr, setMCurr] = useState<'TRY' | 'EUR' | 'USD'>('TRY')
  const [mTech, setMTech] = useState('')

  const { data: serviceRecords = [], isLoading: sLoad } = useQuery({
    queryKey: ['service-records'],
    queryFn: () => api<ServiceRecordItem[]>('/service-records'),
  })

  const { data: maintenanceRecords = [], isLoading: mLoad } = useQuery({
    queryKey: ['maintenance-records'],
    queryFn: () => api<MaintenanceRecordItem[]>('/maintenance-records'),
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api<ProductItem[]>('/products'),
  })
  const { data: assets = [] } = useQuery({
    queryKey: ['assets'],
    queryFn: () => api<AssetItem[]>('/assets'),
  })

  const submitService = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api('/service-records', {
        method: 'POST',
        body: JSON.stringify({
          product_id: sProductId,
          asset_id: sAssetId || null,
          fault_type: sFaultType,
          fault_description: sFaultDesc,
          service_company: sCompany || null,
          sent_date: sSentDate,
          return_date: sReturnDate || null,
          labor_cost: sLabor || '0',
          parts_cost: sParts || '0',
          currency: sCurr,
          warranty_covered: sWarranty,
          service_report: sReport || null,
          result: sResult,
        }),
      })
      toast.success('Teknik servis kaydı oluşturuldu.')
      qc.invalidateQueries({ queryKey: ['service-records'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['inventory-summary'] })
      setOpenSrvModal(false)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const updateServiceResult = async (sr: ServiceRecordItem, newResult: string) => {
    try {
      await api(`/service-records/${sr.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          result: newResult,
          return_date: newResult !== 'in_service' ? new Date().toISOString().slice(0, 10) : null,
        }),
      })
      toast.success('Servis durumu ve cihaz statüsü güncellendi.')
      qc.invalidateQueries({ queryKey: ['service-records'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['inventory-summary'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const submitMaintenance = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api('/maintenance-records', {
        method: 'POST',
        body: JSON.stringify({
          product_id: mProductId,
          asset_id: mAssetId || null,
          maintenance_type: mType,
          description: mDesc,
          performed_date: mDate,
          next_maintenance_date: mNextDate || null,
          cost: mCost || '0',
          currency: mCurr,
          technician_name: mTech || null,
        }),
      })
      toast.success('Periyodik bakım kaydı eklendi.')
      qc.invalidateQueries({ queryKey: ['maintenance-records'] })
      setOpenMntModal(false)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teknik Servis, Arıza ve Bakım Modülü</h1>
          <p className="text-sm text-slate-500">
            Cihaz arıza/servis geçmişi, işçilik ve parça maliyetleri, garanti durumu ve periyodik bakım takvimi
          </p>
        </div>
        {can('maintenance.manage') && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSProductId(products[0]?.id || '')
                setOpenSrvModal(true)
              }}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> Yeni Arıza / Servis Kaydı
            </button>
            <button
              onClick={() => {
                setMProductId(products[0]?.id || '')
                setOpenMntModal(true)
              }}
              className="flex items-center gap-2 rounded-lg border border-brand-600 px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50 dark:text-indigo-400 dark:hover:bg-slate-800"
            >
              <CalendarClock className="h-4 w-4" /> Periyodik Bakım Kaydı
            </button>
          </div>
        )}
      </div>

      {/* Sekmeler */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setTab('service')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold ${
            tab === 'service'
              ? 'border-brand-600 text-brand-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500'
          }`}
        >
          <Wrench className="h-4 w-4" /> Arıza ve Teknik Servis Kayıtları ({serviceRecords.length})
        </button>
        <button
          onClick={() => setTab('maintenance')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold ${
            tab === 'maintenance'
              ? 'border-brand-600 text-brand-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500'
          }`}
        >
          <CalendarClock className="h-4 w-4" /> Periyodik Bakım Geçmişi ({maintenanceRecords.length})
        </button>
      </div>

      {/* TAB 1: SERVİS KAYITLARI */}
      {tab === 'service' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {sLoad ? (
            <div className="grid place-items-center p-12">
              <Loader2 className="animate-spin text-brand-600" />
            </div>
          ) : !serviceRecords.length ? (
            <div className="p-12 text-center text-slate-500">
              <Wrench className="mx-auto mb-2 h-8 w-8 text-slate-400" />
              Henüz kayıtlı arıza veya teknik servis işlemi bulunmuyor.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                  <tr>
                    <th className="p-3.5">Servis No</th>
                    <th className="p-3.5">Ürün / Seri No</th>
                    <th className="p-3.5">Arıza Türü & Açıklama</th>
                    <th className="p-3.5">Servis Firması</th>
                    <th className="p-3.5">Gönderim / Dönüş</th>
                    <th className="p-3.5">İşçilik + Parça = Toplam</th>
                    <th className="p-3.5">Garanti</th>
                    <th className="p-3.5">Sonuç</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceRecords.map(sr => {
                    const st = SRV_RESULT[sr.result] || { label: sr.result, cls: 'bg-slate-100' }
                    return (
                      <tr key={sr.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="p-3.5 font-mono text-xs font-bold text-brand-600">{sr.service_no}</td>
                        <td className="p-3.5">
                          <div className="font-semibold">{sr.product_name}</div>
                          <div className="font-mono text-xs text-slate-500">
                            {sr.serial_number ? `SN: ${sr.serial_number}` : sr.inventory_code}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-medium">{sr.fault_type}</div>
                          <div className="text-xs text-slate-500">{sr.fault_description}</div>
                        </td>
                        <td className="p-3.5 text-xs">{sr.service_company || 'İç Teknik Servis'}</td>
                        <td className="p-3.5 text-xs">
                          <div>Gidiş: {sr.sent_date}</div>
                          <div className="text-slate-400">Dönüş: {sr.return_date || 'Serviste'}</div>
                        </td>
                        <td className="p-3.5 text-xs">
                          <div>
                            İşçilik: {Number(sr.labor_cost).toLocaleString('tr-TR')} + Parça:{' '}
                            {Number(sr.parts_cost).toLocaleString('tr-TR')}
                          </div>
                          <div className="font-bold text-rose-600 dark:text-rose-400">
                            Toplam: {Number(sr.total_cost).toLocaleString('tr-TR')} {sr.currency}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              sr.warranty_covered
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {sr.warranty_covered ? 'Garanti İçi' : 'Garanti Dışı'}
                          </span>
                        </td>
                        <td className="p-3.5">
                          {can('maintenance.manage') ? (
                            <select
                              value={sr.result}
                              onChange={e => updateServiceResult(sr, e.target.value)}
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold outline-none ${st.cls}`}
                            >
                              {Object.entries(SRV_RESULT).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>
                              {st.label}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PERİYODİK BAKIM KAYITLARI */}
      {tab === 'maintenance' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {mLoad ? (
            <div className="grid place-items-center p-12">
              <Loader2 className="animate-spin text-brand-600" />
            </div>
          ) : !maintenanceRecords.length ? (
            <div className="p-12 text-center text-slate-500">
              Henüz kayıtlı periyodik bakım işlemi bulunmuyor.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                <tr>
                  <th className="p-3.5">Ürün / Cihaz</th>
                  <th className="p-3.5">Bakım Türü</th>
                  <th className="p-3.5">Yapılan İşlem Açıklaması</th>
                  <th className="p-3.5">Bakım Tarihi</th>
                  <th className="p-3.5">Sonraki Planlı Bakım</th>
                  <th className="p-3.5">Teknisyen</th>
                  <th className="p-3.5 text-right">Maliyet</th>
                </tr>
              </thead>
              <tbody>
                {maintenanceRecords.map(m => (
                  <tr key={m.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-3.5">
                      <div className="font-semibold">{m.product_name}</div>
                      {m.serial_number && (
                        <div className="font-mono text-xs text-slate-500">SN: {m.serial_number}</div>
                      )}
                    </td>
                    <td className="p-3.5 font-medium">{m.maintenance_type}</td>
                    <td className="p-3.5 text-xs text-slate-500">{m.description}</td>
                    <td className="p-3.5 text-xs">{m.performed_date}</td>
                    <td className="p-3.5 text-xs font-semibold text-brand-600">
                      {m.next_maintenance_date || '—'}
                    </td>
                    <td className="p-3.5 text-xs">{m.technician_name || '—'}</td>
                    <td className="p-3.5 text-right font-semibold">
                      {Number(m.cost).toLocaleString('tr-TR')} {m.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* YENİ ARIZA / SERVİS MODALI */}
      {openSrvModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <form
            onSubmit={submitService}
            className="mx-auto my-6 max-w-xl space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Yeni Arıza ve Teknik Servis Kaydı</h2>
              <button type="button" onClick={() => setOpenSrvModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Ürün *
                <select
                  required
                  value={sProductId}
                  onChange={e => {
                    setSProductId(e.target.value)
                    setSAssetId('')
                  }}
                  className={inputCls + ' mt-1'}
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Seri Numaralı Cihaz
                <select
                  value={sAssetId}
                  onChange={e => setSAssetId(e.target.value)}
                  className={inputCls + ' mt-1'}
                >
                  <option value="">— Seçin —</option>
                  {assets
                    .filter(a => a.product_id === sProductId)
                    .map(a => (
                      <option key={a.id} value={a.id}>
                        {a.serial_number}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Arıza Türü *
                <input
                  required
                  value={sFaultType}
                  onChange={e => setSFaultType(e.target.value)}
                  className={inputCls + ' mt-1'}
                  placeholder="Örn: Lazer Optik Blok / Fan Arızası"
                />
              </label>
              <label className="block text-sm font-medium">
                Servis Firması
                <input
                  value={sCompany}
                  onChange={e => setSCompany(e.target.value)}
                  className={inputCls + ' mt-1'}
                  placeholder="Yetkili Teknik Servis"
                />
              </label>
            </div>

            <label className="block text-sm font-medium">
              Arıza Açıklaması *
              <textarea
                rows={2}
                required
                value={sFaultDesc}
                onChange={e => setSFaultDesc(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>

            <div className="grid grid-cols-3 gap-3">
              <label className="block text-sm font-medium">
                Servise Gönderim Tarihi *
                <input
                  type="date"
                  required
                  value={sSentDate}
                  onChange={e => setSSentDate(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
              <label className="block text-sm font-medium">
                Servisten Dönüş Tarihi
                <input
                  type="date"
                  value={sReturnDate}
                  onChange={e => setSReturnDate(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
              <label className="block text-sm font-medium">
                Servis Sonucu
                <select
                  value={sResult}
                  onChange={e =>
                    setSResult(
                      e.target.value as 'in_service' | 'repaired' | 'unrepairable' | 'replaced',
                    )
                  }
                  className={inputCls + ' mt-1'}
                >
                  {Object.entries(SRV_RESULT).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="block text-sm font-medium">
                İşçilik Maliyeti
                <input
                  type="number"
                  step="0.01"
                  value={sLabor}
                  onChange={e => setSLabor(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
              <label className="block text-sm font-medium">
                Parça Maliyeti
                <input
                  type="number"
                  step="0.01"
                  value={sParts}
                  onChange={e => setSParts(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
              <label className="block text-sm font-medium">
                Para Birimi
                <select
                  value={sCurr}
                  onChange={e => setSCurr(e.target.value as 'TRY' | 'EUR' | 'USD')}
                  className={inputCls + ' mt-1'}
                >
                  <option value="TRY">TL (₺)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={sWarranty}
                onChange={e => setSWarranty(e.target.checked)}
              />
              <span>Garanti kapsamında ücretsiz onarım</span>
            </label>

            <label className="block text-sm font-medium">
              Servis Raporu Özeti
              <input
                value={sReport}
                onChange={e => setSReport(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenSrvModal(false)}
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

      {/* PERİYODİK BAKIM MODALI */}
      {openMntModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={submitMaintenance}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Periyodik Bakım Kaydı Ekle</h2>
              <button type="button" onClick={() => setOpenMntModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <label className="block text-sm font-medium">
              Ürün *
              <select
                required
                value={mProductId}
                onChange={e => {
                  setMProductId(e.target.value)
                  setMAssetId('')
                }}
                className={inputCls + ' mt-1'}
              >
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium">
              Seri Numaralı Cihaz
              <select
                value={mAssetId}
                onChange={e => setMAssetId(e.target.value)}
                className={inputCls + ' mt-1'}
              >
                <option value="">— Seçin —</option>
                {assets
                  .filter(a => a.product_id === mProductId)
                  .map(a => (
                    <option key={a.id} value={a.id}>
                      {a.serial_number}
                    </option>
                  ))}
              </select>
            </label>

            <label className="block text-sm font-medium">
              Bakım Türü *
              <input
                required
                value={mType}
                onChange={e => setMType(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>

            <label className="block text-sm font-medium">
              Açıklama *
              <textarea
                rows={2}
                required
                value={mDesc}
                onChange={e => setMDesc(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Yapıldığı Tarih *
                <input
                  type="date"
                  required
                  value={mDate}
                  onChange={e => setMDate(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
              <label className="block text-sm font-medium">
                Sonraki Bakım Tarihi
                <input
                  type="date"
                  value={mNextDate}
                  onChange={e => setMNextDate(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="block text-sm font-medium">
                Maliyet
                <input
                  type="number"
                  step="0.01"
                  value={mCost}
                  onChange={e => setMCost(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
              <label className="block text-sm font-medium">
                Para Birimi
                <select
                  value={mCurr}
                  onChange={e => setMCurr(e.target.value as 'TRY' | 'EUR' | 'USD')}
                  className={inputCls + ' mt-1'}
                >
                  <option value="TRY">TL (₺)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </label>
              <label className="block text-sm font-medium">
                Teknisyen
                <input
                  value={mTech}
                  onChange={e => setMTech(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenMntModal(false)}
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
    </div>
  )
}
