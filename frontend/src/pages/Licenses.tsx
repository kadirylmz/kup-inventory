import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Eye, KeyRound, Loader2, Plus, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { AssetItem } from '@/pages/Inventory'
import type { EmployeeItem } from '@/pages/Employees'

interface LicenseRecord {
  id: string
  software_name: string
  vendor: string
  version: string | null
  license_type: string
  key_masked: string
  license_no: string | null
  purchase_date: string | null
  start_date: string | null
  end_date: string | null
  days_remaining: number | null
  expiry_alert_level: '7_days' | '15_days' | '30_days' | 'expired' | 'ok' | null
  seats_total: number
  seats_used: number
  assigned_asset_id: string | null
  assigned_asset_name: string | null
  assigned_employee_id: string | null
  assigned_employee_name: string | null
  cost: string
  currency: 'TRY' | 'EUR' | 'USD'
  invoice_no: string | null
  contract_no: string | null
  notes: string | null
  status: string
}

const LIC_TYPES: Record<string, string> = {
  perpetual: 'Süresiz Lisans',
  annual: 'Yıllık Lisans',
  monthly: 'Aylık Abonelik',
  per_user: 'Kullanıcı Bazlı Lisans',
  per_device: 'Cihaz Bazlı Lisans',
  per_server: 'Sunucu Bazlı Lisans',
  per_project: 'Proje Bazlı Lisans',
}

export default function LicensesPage() {
  const { can } = useAuth()
  const qc = useQueryClient()

  const [openCreate, setOpenCreate] = useState(false)
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({})
  const [renewTarget, setRenewTarget] = useState<LicenseRecord | null>(null)

  // Yeni Lisans State
  const [swName, setSwName] = useState('')
  const [vendor, setVendor] = useState('')
  const [version, setVersion] = useState('')
  const [licType, setLicType] = useState('annual')
  const [licKey, setLicKey] = useState('')
  const [licNo, setLicNo] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [seatsTotal, setSeatsTotal] = useState('1')
  const [seatsUsed, setSeatsUsed] = useState('1')
  const [assetId, setAssetId] = useState('')
  const [empId, setEmpId] = useState('')
  const [cost, setCost] = useState('0')
  const [currency, setCurrency] = useState<'TRY' | 'EUR' | 'USD'>('USD')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [notes, setNotes] = useState('')

  // Yenileme State
  const [newEndDate, setNewEndDate] = useState('')
  const [renewCost, setRenewCost] = useState('0')
  const [renewCurr, setRenewCurr] = useState<'TRY' | 'EUR' | 'USD'>('USD')

  const { data: licenses = [], isLoading } = useQuery({
    queryKey: ['licenses'],
    queryFn: () => api<LicenseRecord[]>('/licenses'),
  })

  const { data: assets = [] } = useQuery({
    queryKey: ['assets'],
    queryFn: () => api<AssetItem[]>('/assets'),
  })
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<EmployeeItem[]>('/employees'),
  })

  const createLicense = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api('/licenses', {
        method: 'POST',
        body: JSON.stringify({
          software_name: swName,
          vendor,
          version: version || null,
          license_type: licType,
          license_key: licKey,
          license_no: licNo || null,
          start_date: startDate || null,
          end_date: endDate || null,
          seats_total: Number(seatsTotal) || 1,
          seats_used: Number(seatsUsed) || 0,
          assigned_asset_id: assetId || null,
          assigned_employee_id: empId || null,
          cost: cost || '0',
          currency,
          invoice_no: invoiceNo || null,
          notes: notes || null,
        }),
      })
      toast.success('Yazılım lisansı şifrelenerek kaydedildi.')
      qc.invalidateQueries({ queryKey: ['licenses'] })
      setOpenCreate(false)
      setSwName('')
      setVendor('')
      setVersion('')
      setLicKey('')
      setLicNo('')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const revealKey = async (id: string) => {
    try {
      const res = await api<{ id: string; license_key: string }>(`/licenses/${id}/key`)
      setRevealedKeys(prev => ({ ...prev, [id]: res.license_key }))
      toast.info('Lisans anahtarı görüntülendi (Denetim kaydına işlendi).')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const submitRenew = async (e: FormEvent) => {
    e.preventDefault()
    if (!renewTarget) return
    try {
      await api(`/licenses/${renewTarget.id}/renew`, {
        method: 'POST',
        body: JSON.stringify({
          new_end_date: newEndDate,
          cost: renewCost || '0',
          currency: renewCurr,
        }),
      })
      toast.success('Lisans yenilendi.')
      qc.invalidateQueries({ queryKey: ['licenses'] })
      setRenewTarget(null)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800'

  const expiringCount = licenses.filter(
    l => l.expiry_alert_level && l.expiry_alert_level !== 'ok',
  ).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Yazılım Lisans Yönetimi</h1>
          <p className="text-sm text-slate-500">
            AES/Fernet şifreli yazılım anahtarları, cihaz/personel atamaları ve 30/15/7 gün yenileme uyarıları
          </p>
        </div>
        {can('license.manage') && (
          <button
            onClick={() => setOpenCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Yeni Lisans Ekle
          </button>
        )}
      </div>

      {expiringCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>
            <strong>Yenileme Uyarısı:</strong> Toplam {expiringCount} yazılım lisansının bitiş tarihine 30 günden az kaldı veya süresi doldu.
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {isLoading ? (
          <div className="grid place-items-center p-12">
            <Loader2 className="animate-spin text-brand-600" />
          </div>
        ) : !licenses.length ? (
          <div className="p-12 text-center text-slate-500">
            <KeyRound className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            Henüz kayıtlı yazılım lisansı bulunmuyor.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                <tr>
                  <th className="p-3.5">Yazılım / Üretici</th>
                  <th className="p-3.5">Lisans Türü</th>
                  <th className="p-3.5">Şifreli Lisans Anahtarı</th>
                  <th className="p-3.5">Kullanıcı (Aktif/Toplam)</th>
                  <th className="p-3.5">Atanan Cihaz / Personel</th>
                  <th className="p-3.5">Bitiş Tarihi & Uyarı</th>
                  <th className="p-3.5">Maliyet</th>
                  <th className="p-3.5 text-right">Yenileme</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map(lic => {
                  const fullKey = revealedKeys[lic.id]
                  return (
                    <tr key={lic.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="p-3.5">
                        <div className="font-bold">
                          {lic.software_name} {lic.version && <span className="text-xs font-normal">v{lic.version}</span>}
                        </div>
                        <div className="text-xs text-slate-500">{lic.vendor}</div>
                      </td>
                      <td className="p-3.5 text-xs font-medium">
                        {LIC_TYPES[lic.license_type] || lic.license_type}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs dark:bg-slate-800">
                            {fullKey || lic.key_masked}
                          </code>
                          {!fullKey && can('license.view_key') && (
                            <button
                              onClick={() => revealKey(lic.id)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                              title="Şifreyi Çöz ve Göster"
                            >
                              <Eye className="h-3.5 w-3.5" /> Göster
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5 font-semibold">
                        {lic.seats_used} / {lic.seats_total}
                      </td>
                      <td className="p-3.5 text-xs text-slate-500">
                        {[lic.assigned_asset_name, lic.assigned_employee_name].filter(Boolean).join(' • ') || '—'}
                      </td>
                      <td className="p-3.5">
                        {lic.end_date ? (
                          <div>
                            <div className="text-xs font-medium">{lic.end_date}</div>
                            {lic.expiry_alert_level === 'expired' && (
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                                SÜRESİ DOLDU
                              </span>
                            )}
                            {lic.expiry_alert_level === '7_days' && (
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                                {lic.days_remaining} GÜN KALDI (KRİTİK)
                              </span>
                            )}
                            {lic.expiry_alert_level === '15_days' && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                {lic.days_remaining} GÜN KALDI
                              </span>
                            )}
                            {lic.expiry_alert_level === '30_days' && (
                              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                                {lic.days_remaining} GÜN KALDI
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-emerald-600">Süresiz</span>
                        )}
                      </td>
                      <td className="p-3.5 font-medium">
                        {Number(lic.cost).toLocaleString('tr-TR')} {lic.currency}
                      </td>
                      <td className="p-3.5 text-right">
                        {can('license.manage') && (
                          <button
                            onClick={() => {
                              setNewEndDate(lic.end_date || '')
                              setRenewCost(lic.cost)
                              setRenewCurr(lic.currency)
                              setRenewTarget(lic)
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Yenile
                          </button>
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

      {/* Yeni Lisans Modalı */}
      {openCreate && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <form
            onSubmit={createLicense}
            className="mx-auto my-6 max-w-2xl space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Yeni Yazılım Lisansı Ekle</h2>
              <button type="button" onClick={() => setOpenCreate(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-medium">
                Yazılım Adı *
                <input
                  required
                  value={swName}
                  onChange={e => setSwName(e.target.value)}
                  className={inputCls + ' mt-1'}
                  placeholder="Resolume Arena"
                />
              </label>
              <label className="block text-sm font-medium">
                Üretici Firma *
                <input
                  required
                  value={vendor}
                  onChange={e => setVendor(e.target.value)}
                  className={inputCls + ' mt-1'}
                  placeholder="Resolume BV"
                />
              </label>
              <label className="block text-sm font-medium">
                Sürüm
                <input
                  value={version}
                  onChange={e => setVersion(e.target.value)}
                  className={inputCls + ' mt-1'}
                  placeholder="7.21"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Lisans Türü *
                <select
                  value={licType}
                  onChange={e => setLicType(e.target.value)}
                  className={inputCls + ' mt-1'}
                >
                  {Object.entries(LIC_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Lisans / Sözleşme Numarası
                <input
                  value={licNo}
                  onChange={e => setLicNo(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
            </div>

            <label className="block text-sm font-medium">
              Lisans Anahtarı (Veritabanında AES/Fernet ile şifrelenir) *
              <input
                required
                value={licKey}
                onChange={e => setLicKey(e.target.value)}
                className={inputCls + ' mt-1 font-mono'}
                placeholder="XXXX-YYYY-ZZZZ-1234"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-4">
              <label className="block text-sm font-medium">
                Başlangıç Tarihi
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
              <label className="block text-sm font-medium">
                Bitiş Tarihi
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
              <label className="block text-sm font-medium">
                Satın Alınan Kullanıcı
                <input
                  type="number"
                  min="1"
                  value={seatsTotal}
                  onChange={e => setSeatsTotal(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
              <label className="block text-sm font-medium">
                Aktif Kullanıcı
                <input
                  type="number"
                  min="0"
                  value={seatsUsed}
                  onChange={e => setSeatsUsed(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Atandığı Bilgisayar / Medya Sunucusu
                <select
                  value={assetId}
                  onChange={e => setAssetId(e.target.value)}
                  className={inputCls + ' mt-1'}
                >
                  <option value="">— Seçilmedi —</option>
                  {assets.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.product_name} ({a.serial_number})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Atandığı Personel
                <select
                  value={empId}
                  onChange={e => setEmpId(e.target.value)}
                  className={inputCls + ' mt-1'}
                >
                  <option value="">— Seçilmedi —</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-medium">
                Maliyet
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cost}
                  onChange={e => setCost(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
              <label className="block text-sm font-medium">
                Para Birimi
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value as 'TRY' | 'EUR' | 'USD')}
                  className={inputCls + ' mt-1'}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="TRY">TL (₺)</option>
                </select>
              </label>
              <label className="block text-sm font-medium">
                Fatura No
                <input
                  value={invoiceNo}
                  onChange={e => setInvoiceNo(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
            </div>

            <label className="block text-sm font-medium">
              Açıklama
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenCreate(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                İptal
              </button>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                Lisansı Kaydet
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lisans Yenileme Modalı */}
      {renewTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={submitRenew}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{renewTarget.software_name} — Lisans Yenile</h2>
              <button type="button" onClick={() => setRenewTarget(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <label className="block text-sm font-medium">
              Yeni Bitiş Tarihi *
              <input
                type="date"
                required
                value={newEndDate}
                onChange={e => setNewEndDate(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Yenileme Maliyeti
                <input
                  type="number"
                  step="0.01"
                  value={renewCost}
                  onChange={e => setRenewCost(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
              <label className="block text-sm font-medium">
                Para Birimi
                <select
                  value={renewCurr}
                  onChange={e => setRenewCurr(e.target.value as 'TRY' | 'EUR' | 'USD')}
                  className={inputCls + ' mt-1'}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="TRY">TL (₺)</option>
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRenewTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                İptal
              </button>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                Yenilemeyi Kaydet
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
