import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ClipboardCheck, Plus, QrCode, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'

interface StocktakeItem {
  id: string
  product_name: string
  inventory_code: string
  serial_number: string
  expected_warehouse_name?: string
  found_warehouse_name?: string
  result: 'found' | 'missing' | 'extra' | 'wrong_location' | 'serial_mismatch'
  note?: string
}

interface StocktakeRow {
  id: string
  stocktake_no: string
  warehouse_id: string
  warehouse_name: string
  count_date: string
  responsible_name: string
  status: string
  note?: string
  summary: {
    found: number
    missing: number
    extra: number
    wrong_location: number
    serial_mismatch: number
  }
  items: StocktakeItem[]
}

const RESULT_BADGES: Record<string, { label: string; cls: string }> = {
  found: { label: 'Bulundu (Tam)', cls: 'bg-emerald-100 text-emerald-700' },
  missing: { label: 'Eksik (Henüz Okunmadı)', cls: 'bg-rose-100 text-rose-700' },
  wrong_location: { label: 'Yanlış Lokasyonda Bulunan', cls: 'bg-amber-100 text-amber-800' },
  serial_mismatch: { label: 'Seri Numarası Uyuşmazlığı / Fazla', cls: 'bg-purple-100 text-purple-700' },
  extra: { label: 'Fazla Ürün', cls: 'bg-indigo-100 text-indigo-700' },
}

export default function StocktakePage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [scanInput, setScanInput] = useState('')
  const [form, setForm] = useState({ warehouse_id: '', note: '' })

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api<{ id: string; code: string; name: string }[]>('/warehouses'),
  })

  const { data: stocktakes = [] } = useQuery({
    queryKey: ['stocktakes'],
    queryFn: () => api<StocktakeRow[]>('/stocktakes'),
  })

  const activeStocktake = stocktakes.find(s => s.id === selectedId) || stocktakes[0] || null

  const startMut = useMutation({
    mutationFn: () => api<StocktakeRow>('/stocktakes', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: res => {
      toast.success(`${res.stocktake_no} numaralı depo sayımı başlatıldı.`)
      setModalOpen(false)
      setSelectedId(res.id)
      qc.invalidateQueries({ queryKey: ['stocktakes'] })
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  const scanMut = useMutation({
    mutationFn: (code: string) =>
      api<StocktakeRow>(`/stocktakes/${activeStocktake?.id}/scan`, {
        method: 'POST',
        body: JSON.stringify({ serial_or_qr: code }),
      }),
    onSuccess: () => {
      toast.success('Barkod / QR / Seri numarası sayım listesine işlendi.')
      setScanInput('')
      qc.invalidateQueries({ queryKey: ['stocktakes'] })
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  const approveMut = useMutation({
    mutationFn: (id: string) => api(`/stocktakes/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Sayım onaylandı ve lokasyon farkları stok hareketlerine işlendi.')
      qc.invalidateQueries({ queryKey: ['stocktakes'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Depo Sayım ve Mutabakat Modülü</h1>
          <p className="text-sm text-slate-500">
            Depo bazlı fiziksel sayım, QR / seri numarası okutma, eksik/fazla/yanlış lokasyon tespiti ve sayım onayı
          </p>
        </div>
        <button
          onClick={() => {
            if (warehouses[0] && !form.warehouse_id) setForm(f => ({ ...f, warehouse_id: warehouses[0].id }))
            setModalOpen(true)
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> Yeni Depo Sayımı Başlat
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        {/* Sol: Sayım Oturumları Listesi */}
        <div className="space-y-2 lg:col-span-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sayım Oturumları</div>
          {stocktakes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400 dark:border-slate-800">
              Henüz başlatılmış bir sayım bulunmuyor.
            </div>
          ) : (
            stocktakes.map(st => (
              <button
                key={st.id}
                onClick={() => setSelectedId(st.id)}
                className={`w-full rounded-xl border p-3.5 text-left transition ${
                  activeStocktake?.id === st.id
                    ? 'border-brand-600 bg-brand-50/50 dark:bg-indigo-950/30'
                    : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-brand-600">{st.stocktake_no}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      st.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {st.status === 'approved' ? 'Onaylandı' : 'Sayım Sürüyor'}
                  </span>
                </div>
                <div className="mt-1 font-semibold text-sm">{st.warehouse_name}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {st.count_date} • {st.responsible_name}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Sağ: Aktif Sayım Detayı, QR Tarayıcı & Mutabakat Raporu */}
        <div className="space-y-4 lg:col-span-3">
          {!activeStocktake ? (
            <div className="grid h-72 place-items-center rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
              <div>
                <ClipboardCheck className="mx-auto h-10 w-10 text-slate-300" />
                <div className="mt-2 font-semibold">Sayım Oturumu Seçilmedi</div>
                <p className="mt-1 text-xs text-slate-500">
                  Yeni bir depo sayımı başlatarak seri numarası veya QR kod okutmaya başlayabilirsiniz.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Özet Kartları */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <div className="text-xs font-medium text-emerald-700">Bulunan (Tam)</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-700">{activeStocktake.summary.found}</div>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-900/40 dark:bg-rose-950/20">
                  <div className="text-xs font-medium text-rose-700">Eksik Ürünler</div>
                  <div className="mt-1 text-2xl font-bold text-rose-700">{activeStocktake.summary.missing}</div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <div className="text-xs font-medium text-amber-800">Yanlış Lokasyonda</div>
                  <div className="mt-1 text-2xl font-bold text-amber-800">{activeStocktake.summary.wrong_location}</div>
                </div>
                <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-900/40 dark:bg-purple-950/20">
                  <div className="text-xs font-medium text-purple-700">Seri No Uyuşmazlığı / Fazla</div>
                  <div className="mt-1 text-2xl font-bold text-purple-700">
                    {activeStocktake.summary.serial_mismatch + activeStocktake.summary.extra}
                  </div>
                </div>
              </div>

              {/* Hızlı QR / Seri No Okutma Çubuğu */}
              {activeStocktake.status === 'counting' && (
                <form
                  onSubmit={e => {
                    e.preventDefault()
                    if (scanInput.trim()) scanMut.mutate(scanInput.trim())
                  }}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/40 p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <QrCode className="h-6 w-6 text-brand-600" />
                  <input
                    value={scanInput}
                    onChange={e => setScanInput(e.target.value)}
                    placeholder="Barkod okuyucu ile QR Kod, Envanter Kodu veya Seri Numarası okutun ve Enter'a basın..."
                    className="min-w-64 flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    Sayıma İşle
                  </button>
                  <button
                    type="button"
                    onClick={() => approveMut.mutate(activeStocktake.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Sayımı Tamamla ve Onayla
                  </button>
                </form>
              )}

              {/* Sayım Kalemleri Tablosu */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-3">Kod</th>
                      <th className="px-4 py-3">Ürün Adı</th>
                      <th className="px-4 py-3">Seri Numarası / QR</th>
                      <th className="px-4 py-3">Sistemdeki Lokasyon</th>
                      <th className="px-4 py-3">Bulunan Lokasyon</th>
                      <th className="px-4 py-3">Sayım Sonucu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeStocktake.items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          Bu depoda beklenen kayıtlı seri numaralı varlık yok. Yukarıdan cihaz okutabilirsiniz.
                        </td>
                      </tr>
                    ) : (
                      activeStocktake.items.map(it => {
                        const badge = RESULT_BADGES[it.result] || {
                          label: it.result,
                          cls: 'bg-slate-100 text-slate-700',
                        }
                        return (
                          <tr key={it.id}>
                            <td className="px-4 py-2.5 font-mono text-xs font-semibold text-brand-600">
                              {it.inventory_code}
                            </td>
                            <td className="px-4 py-2.5 font-medium">{it.product_name}</td>
                            <td className="px-4 py-2.5 font-mono text-xs">{it.serial_number}</td>
                            <td className="px-4 py-2.5 text-xs">{it.expected_warehouse_name || '—'}</td>
                            <td className="px-4 py-2.5 text-xs">{it.found_warehouse_name || '—'}</td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}
                              >
                                {it.result === 'wrong_location' && <AlertTriangle className="h-3 w-3" />}
                                {it.result === 'serial_mismatch' && <ShieldAlert className="h-3 w-3" />}
                                {badge.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Yeni Sayım Başlatma Modalı */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h2 className="mb-4 text-lg font-bold">Yeni Depo Sayımı Başlat</h2>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs font-medium">Sayım Yapılacak Depo *</label>
                <select
                  value={form.warehouse_id}
                  onChange={e => setForm({ ...form, warehouse_id: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2"
                >
                  <option value="">Depo seçin...</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Sayım Notu / Açıklama</label>
                <textarea
                  rows={2}
                  placeholder="Örn: 2026 4. Çeyrek Merkez Depo Fiziksel Sayımı"
                  value={form.note}
                  onChange={e => setForm({ ...form, note: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="rounded-lg border px-4 py-2 text-sm">
                İptal
              </button>
              <button
                onClick={() => startMut.mutate()}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Sayımı Başlat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
