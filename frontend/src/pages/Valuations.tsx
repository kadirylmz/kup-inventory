import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Coins, FileEdit, Plus, Search, Sparkles, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'

interface ThreeValueItem {
  product_id: string
  inventory_code: string
  name: string
  category_name: string
  quantity: number
  unit: string
  original_purchase_cost: number
  purchase_currency: string
  original_market_value: number
  market_currency: string
  purchase_cost_converted: number
  market_value_converted: number
  net_book_value_converted: number
  age_years: number
}

interface ThreeValuesResponse {
  reporting_currency: string
  exchange_rates_to_try: Record<string, number>
  totals: {
    purchase_cost: number
    market_value: number
    net_book_value: number
  }
  items: ThreeValueItem[]
}

interface ValuationRow {
  id: string
  product_id: string
  product_name: string
  inventory_code: string
  condition: string
  market_value: number
  currency: string
  valuation_source: string
  valuation_date: string
  status: string
  note?: string
}

interface ExchangeRateRow {
  id: string
  rate_date: string
  currency_code: string
  rate_to_try: number
  source: string
  note?: string
}

export default function ValuationsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'three_values' | 'valuations' | 'rates'>('three_values')
  const [currency, setCurrency] = useState<'TRY' | 'EUR' | 'USD'>('TRY')
  const [valModal, setValModal] = useState(false)
  const [corrModal, setCorrModal] = useState<ThreeValueItem | null>(null)
  const [researchResult, setResearchResult] = useState<{
    found_reliable_source: boolean
    message: string
    suggested_value: number | null
    currency?: string
    source?: string
  } | null>(null)

  const [vForm, setVForm] = useState({
    product_id: '',
    condition: 'excellent',
    market_value: '',
    currency: 'EUR',
    valuation_source: '',
    note: '',
    auto_approve: true,
  })

  const [corrForm, setCorrForm] = useState({
    purchase_date: new Date().toISOString().slice(0, 10),
    unit_price: '',
    currency: 'EUR',
    vat_rate: '20',
    invoice_no: '',
    reason: '',
  })

  const [rateForm, setRateForm] = useState({
    rate_date: new Date().toISOString().slice(0, 10),
    currency_code: 'EUR',
    rate_to_try: '38.50',
    note: 'Manuel güncel kur',
  })

  const { data: threeData } = useQuery({
    queryKey: ['three-values', currency],
    queryFn: () => api<ThreeValuesResponse>(`/finance/three-values?reporting_currency=${currency}`),
  })

  const { data: valuations = [] } = useQuery({
    queryKey: ['valuations'],
    queryFn: () => api<ValuationRow[]>('/valuations'),
  })

  const { data: rates = [] } = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: () => api<ExchangeRateRow[]>('/exchange-rates'),
  })

  const createValuation = useMutation({
    mutationFn: () => api('/valuations', { method: 'POST', body: JSON.stringify(vForm) }),
    onSuccess: () => {
      toast.success('Piyasa değerleme kaydı oluşturuldu.')
      setValModal(false)
      setResearchResult(null)
      qc.invalidateQueries({ queryKey: ['valuations'] })
      qc.invalidateQueries({ queryKey: ['three-values'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  const approveValuation = useMutation({
    mutationFn: (id: string) => api(`/valuations/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Değerleme onaylandı ve ürün güncel piyasa değerine işlendi.')
      qc.invalidateQueries({ queryKey: ['valuations'] })
      qc.invalidateQueries({ queryKey: ['three-values'] })
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  const saveCorrection = useMutation({
    mutationFn: () =>
      api('/purchase-records/correction', {
        method: 'POST',
        body: JSON.stringify({ ...corrForm, product_id: corrModal?.product_id }),
      }),
    onSuccess: () => {
      toast.success('Alış maliyeti düzeltme kaydı denetim iziyle oluşturuldu.')
      setCorrModal(null)
      qc.invalidateQueries({ queryKey: ['three-values'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  const saveRate = useMutation({
    mutationFn: () => api('/exchange-rates', { method: 'POST', body: JSON.stringify(rateForm) }),
    onSuccess: () => {
      toast.success('Döviz kuru güncellendi.')
      qc.invalidateQueries({ queryKey: ['exchange-rates'] })
      qc.invalidateQueries({ queryKey: ['three-values'] })
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  const runResearch = async () => {
    if (!vForm.product_id) {
      toast.error('Önce araştırma yapılacak ürünü seçin.')
      return
    }
    try {
      const res = await api<{
        found_reliable_source: boolean
        message: string
        suggested_value: number | null
        currency?: string
        source?: string
      }>(`/valuations/research?product_id=${vForm.product_id}&condition=${vForm.condition}`)
      setResearchResult(res)
    } catch (err) {
      toast.error((err as ApiError).message)
    }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ürün Değerleme ve Finansal Takip</h1>
          <p className="text-sm text-slate-500">
            Alış maliyeti, güncel ikinci el piyasa değeri, muhasebesel net defter değeri ve döviz kuru yönetimi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
            {(['TRY', 'EUR', 'USD'] as const).map(c => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`rounded-md px-3 py-1 text-xs font-bold ${
                  currency === c ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              if (threeData?.items[0] && !vForm.product_id) {
                setVForm(f => ({ ...f, product_id: threeData.items[0].product_id }))
              }
              setValModal(true)
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Yeni Piyasa Değerlemesi
          </button>
        </div>
      </div>

      {/* 3 Değer Özet Kartları */}
      {threeData && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs font-medium text-slate-500">1. Toplam Alış Maliyeti (Değiştirilemez Kayıt)</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
              {fmt(threeData.totals.purchase_cost)} {currency}
            </div>
            <div className="mt-1 text-xs text-slate-400">Düzeltmeler yalnızca denetim izli düzeltme fişi ile yapılır</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              2. Güncel İkinci El Piyasa Değeri
            </div>
            <div className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {fmt(threeData.totals.market_value)} {currency}
            </div>
            <div className="mt-1 text-xs text-emerald-600/80">Onaylı piyasa araştırması ve ikinci el değerlemeleri</div>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-xs dark:border-indigo-900/50 dark:bg-indigo-950/20">
            <div className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
              3. Muhasebesel Net Defter Değeri
            </div>
            <div className="mt-1 text-2xl font-bold text-indigo-700 dark:text-indigo-300">
              {fmt(threeData.totals.net_book_value)} {currency}
            </div>
            <div className="mt-1 text-xs text-indigo-600/80">Faydalı ömür amortismanı düşülmüş net muhasebe değeri</div>
          </div>
        </div>
      )}

      {/* Sekmeler */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setTab('three_values')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold ${
            tab === 'three_values' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500'
          }`}
        >
          <TrendingUp className="h-4 w-4" /> 3 Değer Karşılaştırma Tablosu
        </button>
        <button
          onClick={() => setTab('valuations')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold ${
            tab === 'valuations' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500'
          }`}
        >
          <Sparkles className="h-4 w-4" /> Değerleme Geçmişi & Onay ({valuations.length})
        </button>
        <button
          onClick={() => setTab('rates')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold ${
            tab === 'rates' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500'
          }`}
        >
          <Coins className="h-4 w-4" /> Kur Tablosu (TRY / EUR / USD)
        </button>
      </div>

      {tab === 'three_values' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3">Kod</th>
                <th className="px-4 py-3">Ürün Adı</th>
                <th className="px-4 py-3">Miktar</th>
                <th className="px-4 py-3">Orijinal Alış</th>
                <th className="px-4 py-3">1. Alış Maliyeti ({currency})</th>
                <th className="px-4 py-3">2. Piyasa Değeri ({currency})</th>
                <th className="px-4 py-3">3. Net Defter Değeri ({currency})</th>
                <th className="px-4 py-3 text-right">Düzeltme Kaydı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {threeData?.items.map(it => (
                <tr key={it.product_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-brand-600">{it.inventory_code}</td>
                  <td className="px-4 py-2.5 font-medium">{it.name}</td>
                  <td className="px-4 py-2.5">
                    {it.quantity} {it.unit}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {fmt(it.original_purchase_cost)} {it.purchase_currency}
                  </td>
                  <td className="px-4 py-2.5 font-semibold">
                    {fmt(it.purchase_cost_converted)} {currency}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-emerald-600">
                    {fmt(it.market_value_converted)} {currency}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-indigo-600">
                    {fmt(it.net_book_value_converted)} {currency}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => {
                        setCorrModal(it)
                        setCorrForm(f => ({
                          ...f,
                          unit_price: String(it.original_purchase_cost / Math.max(1, it.quantity)),
                          currency: it.purchase_currency,
                        }))
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      <FileEdit className="h-3.5 w-3.5" /> Alış Düzeltme
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'valuations' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3">Ürün</th>
                <th className="px-4 py-3">Kondisyon</th>
                <th className="px-4 py-3">İkinci El Piyasa Fiyatı</th>
                <th className="px-4 py-3">Değerleme Kaynağı</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {valuations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    Henüz piyasa değerleme kaydı bulunmuyor.
                  </td>
                </tr>
              ) : (
                valuations.map(v => (
                  <tr key={v.id}>
                    <td className="px-4 py-2.5 text-xs">{v.valuation_date}</td>
                    <td className="px-4 py-2.5 font-medium">
                      {v.product_name} <span className="text-xs text-slate-400">({v.inventory_code})</span>
                    </td>
                    <td className="px-4 py-2.5">{v.condition}</td>
                    <td className="px-4 py-2.5 font-semibold text-emerald-600">
                      {fmt(v.market_value)} {v.currency}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{v.valuation_source}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          v.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {v.status === 'approved' ? 'Onaylandı' : 'Onay Bekliyor'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {v.status !== 'approved' && (
                        <button
                          onClick={() => approveValuation.mutate(v.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Onayla ve Uygula
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'rates' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 font-semibold">Manuel Döviz Kuru Girişi (Offline LAN)</h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs font-medium">Tarih</label>
                <input
                  type="date"
                  value={rateForm.rate_date}
                  onChange={e => setRateForm({ ...rateForm, rate_date: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Döviz Türü</label>
                <select
                  value={rateForm.currency_code}
                  onChange={e => setRateForm({ ...rateForm, currency_code: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2"
                >
                  <option value="EUR">EUR - Euro</option>
                  <option value="USD">USD - Amerikan Doları</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">TL Karşılığı (1 Birim)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={rateForm.rate_to_try}
                  onChange={e => setRateForm({ ...rateForm, rate_to_try: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Not / Kaynak</label>
                <input
                  value={rateForm.note}
                  onChange={e => setRateForm({ ...rateForm, note: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>
              <button
                onClick={() => saveRate.mutate()}
                className="w-full rounded-lg bg-brand-600 py-2 font-semibold text-white hover:bg-brand-700"
              >
                Kuru Kaydet
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3">Tarih</th>
                  <th className="px-4 py-3">Döviz</th>
                  <th className="px-4 py-3">TL Karşılığı</th>
                  <th className="px-4 py-3">Kaynak</th>
                  <th className="px-4 py-3">Not</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rates.map(r => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5">{r.rate_date}</td>
                    <td className="px-4 py-2.5 font-bold">{r.currency_code}</td>
                    <td className="px-4 py-2.5 font-semibold text-brand-600">{r.rate_to_try} ₺</td>
                    <td className="px-4 py-2.5 text-xs">{r.source}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{r.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Yeni Piyasa Değerlemesi & Araştırma Modalı */}
      {valModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h2 className="mb-4 text-lg font-bold">Yeni İkinci El Piyasa Değerlemesi</h2>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs font-medium">Ürün Seçimi *</label>
                <select
                  value={vForm.product_id}
                  onChange={e => {
                    setVForm({ ...vForm, product_id: e.target.value })
                    setResearchResult(null)
                  }}
                  className="w-full rounded-lg border px-3 py-2"
                >
                  <option value="">Seçiniz...</option>
                  {threeData?.items.map(it => (
                    <option key={it.product_id} value={it.product_id}>
                      {it.inventory_code} — {it.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium">Kondisyon</label>
                  <select
                    value={vForm.condition}
                    onChange={e => setVForm({ ...vForm, condition: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2"
                  >
                    <option value="excellent">Mükemmel (Sıfır Ayarında)</option>
                    <option value="good">İyi (Aktif Kullanımda)</option>
                    <option value="fair">Orta (Kozmetik İzli)</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={runResearch}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                >
                  <Search className="h-4 w-4" /> Referans Fiyat Araştır
                </button>
              </div>

              {researchResult && (
                <div
                  className={`rounded-lg border p-3 text-xs ${
                    researchResult.found_reliable_source
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                >
                  <div className="font-semibold">{researchResult.message}</div>
                  {researchResult.found_reliable_source && researchResult.suggested_value !== null && (
                    <button
                      type="button"
                      onClick={() =>
                        setVForm({
                          ...vForm,
                          market_value: String(researchResult.suggested_value),
                          currency: researchResult.currency || 'EUR',
                          valuation_source: researchResult.source || 'Geçmiş Değerleme Referansı',
                        })
                      }
                      className="mt-2 rounded bg-emerald-600 px-2.5 py-1 text-white"
                    >
                      Önerilen Değeri Forma Aktar ({researchResult.suggested_value} {researchResult.currency})
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">İkinci El Piyasa Değeri *</label>
                  <input
                    type="number"
                    value={vForm.market_value}
                    onChange={e => setVForm({ ...vForm, market_value: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Para Birimi</label>
                  <select
                    value={vForm.currency}
                    onChange={e => setVForm({ ...vForm, currency: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2"
                  >
                    <option value="TRY">TRY</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Değerleme Kaynağı *</label>
                <input
                  placeholder="Örn: Sahibinden Kurumsal / Avrupa AV İkinci El Borsası"
                  value={vForm.valuation_source}
                  onChange={e => setVForm({ ...vForm, valuation_source: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={vForm.auto_approve}
                  onChange={e => setVForm({ ...vForm, auto_approve: e.target.checked })}
                />
                Yetkim dahilinde hemen onayla ve ürünün güncel piyasa değerine uygula
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setValModal(false)} className="rounded-lg border px-4 py-2 text-sm">
                İptal
              </button>
              <button
                onClick={() => createValuation.mutate()}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alış Maliyeti Düzeltme Fişi Modalı */}
      {corrModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h2 className="mb-1 text-lg font-bold">Alış Maliyeti Düzeltme Kaydı</h2>
            <p className="mb-4 text-xs text-slate-500">
              {corrModal.name} — İlk alış kaydı silinmez, denetim iziyle yeni düzeltme fişi eklenir.
            </p>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Yeni Birim Alış Fiyatı *</label>
                  <input
                    type="number"
                    value={corrForm.unit_price}
                    onChange={e => setCorrForm({ ...corrForm, unit_price: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Para Birimi</label>
                  <select
                    value={corrForm.currency}
                    onChange={e => setCorrForm({ ...corrForm, currency: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2"
                  >
                    <option value="TRY">TRY</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Fatura Numarası</label>
                <input
                  value={corrForm.invoice_no}
                  onChange={e => setCorrForm({ ...corrForm, invoice_no: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Düzeltme Gerekçesi (Zorunlu) *</label>
                <textarea
                  rows={2}
                  placeholder="Örn: Gümrük veya kur farkı faturası eklendi"
                  value={corrForm.reason}
                  onChange={e => setCorrForm({ ...corrForm, reason: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setCorrModal(null)} className="rounded-lg border px-4 py-2 text-sm">
                İptal
              </button>
              <button
                onClick={() => saveCorrection.mutate()}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Düzeltme Fişi Oluştur
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
