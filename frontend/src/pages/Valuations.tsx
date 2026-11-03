import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight, Plus, Search, Sparkles, Armchair, Package } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'
import { fmtMoney, fmtQty } from '@/lib/format'

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
  is_fixture?: boolean
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

export default function ValuationsPage() {
  const qc = useQueryClient()
  const [scope, setScope] = useState<'all' | 'inventory' | 'fixture'>('all')
  const [currency, setCurrency] = useState<'TRY' | 'EUR' | 'USD'>('TRY')
  const [valModal, setValModal] = useState(false)
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
    valuation_source: 'Doğrudan Piyasa Güncellemesi',
    note: '',
    auto_approve: true,
  })

  const { data: threeData, isLoading } = useQuery({
    queryKey: ['three-values', currency, scope],
    queryFn: () => api<ThreeValuesResponse>(`/finance/three-values?reporting_currency=${currency}&scope=${scope}`),
  })

  const createValuation = useMutation({
    mutationFn: () => api('/valuations', { method: 'POST', body: JSON.stringify(vForm) }),
    onSuccess: () => {
      toast.success('Piyasa değeri güncellendi.')
      setValModal(false)
      setResearchResult(null)
      qc.invalidateQueries({ queryKey: ['three-values'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
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

  const fmt = (n: number) => fmtMoney(n)

  // Toplam kar/zarar hesabı
  const totalCost = threeData?.totals.purchase_cost ?? 0
  const totalMarket = threeData?.totals.market_value ?? 0
  const totalDiff = totalMarket - totalCost
  const totalDiffPercent = totalCost > 0 ? (totalDiff / totalCost) * 100 : 0

  return (
    <div className="space-y-5">
      {/* Üst Başlık & Kontroller */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Envanter ve Demirbaş Değerleme</h1>
          <p className="text-sm text-slate-500">
            Alınan fiyat (alış maliyeti) ile şu anki piyasa değeri karşılaştırması ve net kâr / zarar tablosu
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Kapsam Filtresi: Tümü / Teknik Envanter / Şirket Demirbaşları */}
          <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-xs font-medium dark:border-slate-800 dark:bg-slate-900">
            <button
              onClick={() => setScope('all')}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                scope === 'all'
                  ? 'bg-brand-600 text-white font-bold'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              Tümü
            </button>
            <button
              onClick={() => setScope('inventory')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                scope === 'inventory'
                  ? 'bg-brand-600 text-white font-bold'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Package className="h-3.5 w-3.5" /> Envanter
            </button>
            <button
              onClick={() => setScope('fixture')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                scope === 'fixture'
                  ? 'bg-purple-600 text-white font-bold'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Armchair className="h-3.5 w-3.5" /> Demirbaş
            </button>
          </div>

          {/* Para Birimi */}
          <div className="flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
            {(['TRY', 'EUR', 'USD'] as const).map(c => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${
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
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Piyasa Değeri Belirle
          </button>
        </div>
      </div>

      {/* Karşılaştırma Özet Kartları: Alınan Fiyat - Şuanki Değer - Kâr/Zarar */}
      {threeData && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs font-medium text-slate-500">Toplam Alınan Fiyat (Alış Maliyeti)</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
              {fmt(totalCost)} {currency}
            </div>
            <div className="mt-1 text-xs text-slate-400">Tüm ürünlerin fatura / giriş maliyet toplamı</div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 shadow-xs dark:border-blue-900/40 dark:bg-blue-950/20">
            <div className="text-xs font-medium text-blue-700 dark:text-blue-300">
              Şuanki Güncel Piyasa Değeri
            </div>
            <div className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-300">
              {fmt(totalMarket)} {currency}
            </div>
            <div className="mt-1 text-xs text-blue-600/80">Güncel piyasa birim fiyatları x mevcut stok miktarları</div>
          </div>

          <div
            className={`rounded-xl border p-4 shadow-xs ${
              totalDiff >= 0
                ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                : 'border-rose-200 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/20'
            }`}
          >
            <div
              className={`text-xs font-medium ${
                totalDiff >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'
              }`}
            >
              Net Kâr / Zarar (Değer Farkı)
            </div>
            <div
              className={`mt-1 flex items-baseline gap-2 text-2xl font-bold ${
                totalDiff >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'
              }`}
            >
              <span>
                {totalDiff >= 0 ? '+' : ''}
                {fmt(totalDiff)} {currency}
              </span>
              <span className="flex items-center text-sm font-semibold">
                {totalDiff >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                %{Math.abs(totalDiffPercent).toFixed(1)}
              </span>
            </div>
            <div
              className={`mt-1 text-xs ${
                totalDiff >= 0 ? 'text-emerald-600/80' : 'text-rose-600/80'
              }`}
            >
              {totalDiff >= 0 ? 'Piyasa değeri alış maliyetinin üzerinde' : 'Piyasa değeri alış maliyetinin altında'}
            </div>
          </div>
        </div>
      )}

      {/* Karşılaştırma Tablosu */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="px-4 py-3">Kod</th>
              <th className="px-4 py-3">Ürün Adı</th>
              <th className="px-4 py-3">Tür</th>
              <th className="px-4 py-3">Miktar</th>
              <th className="px-4 py-3">Alınan Fiyat ({currency})</th>
              <th className="px-4 py-3">Şuanki Değer ({currency})</th>
              <th className="px-4 py-3">Kâr / Zarar ({currency})</th>
              <th className="px-4 py-3 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-400">
                  Değerleme verileri yükleniyor...
                </td>
              </tr>
            ) : !threeData?.items.length ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-400">
                  Kayıtlı ürün bulunamadı.
                </td>
              </tr>
            ) : (
              threeData.items.map(it => {
                const diff = it.market_value_converted - it.purchase_cost_converted
                const pct = it.purchase_cost_converted > 0 ? (diff / it.purchase_cost_converted) * 100 : 0
                const isFixture = !!it.is_fixture

                return (
                  <tr key={it.product_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-brand-600">
                      {it.inventory_code}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">{it.name}</div>
                      <div className="text-xs text-slate-400">{it.category_name || 'Kategorisiz'}</div>
                    </td>
                    <td className="px-4 py-3">
                      {isFixture ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                          <Armchair className="h-3 w-3" /> Demirbaş
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                          <Package className="h-3 w-3" /> Envanter
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {fmtQty(it.quantity)} <span className="text-xs text-slate-400">{it.unit}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {fmt(it.purchase_cost_converted)} {currency}
                      </div>
                      <div className="text-xs text-slate-400">
                        Birim: {fmt(it.original_purchase_cost / Math.max(1, it.quantity))} {it.purchase_currency}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-blue-600 dark:text-blue-400">
                        {fmt(it.market_value_converted)} {currency}
                      </div>
                      <div className="text-xs text-slate-400">
                        Birim: {fmt(it.original_market_value / Math.max(1, it.quantity))} {it.market_currency || currency}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className={`inline-flex items-center gap-1 font-semibold ${
                          diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {diff >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                        <span>
                          {diff >= 0 ? '+' : ''}
                          {fmt(diff)} {currency}
                        </span>
                      </div>
                      <div
                        className={`text-xs ${
                          diff >= 0 ? 'text-emerald-600/80' : 'text-rose-600/80'
                        }`}
                      >
                        %{Math.abs(pct).toFixed(1)} {diff >= 0 ? 'kâr' : 'zarar'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setVForm({
                            product_id: it.product_id,
                            condition: 'excellent',
                            market_value: String(
                              it.original_market_value
                                ? it.original_market_value / Math.max(1, it.quantity)
                                : it.original_purchase_cost / Math.max(1, it.quantity) || ''
                            ),
                            currency: it.market_currency || 'EUR',
                            valuation_source: 'Güncel Piyasa Değerlemesi',
                            note: '',
                            auto_approve: true,
                          })
                          setResearchResult(null)
                          setValModal(true)
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-brand-600" /> Fiyat Güncelle
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Piyasa Değeri Güncelleme Modalı */}
      {valModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h2 className="mb-1 text-lg font-bold">Şuanki Piyasa Değerini Güncelle</h2>
            <p className="mb-4 text-xs text-slate-500">
              Ürünün güncel piyasa birim fiyatını güncelleyerek kâr/zarar durumunu anlık takip edin.
            </p>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs font-medium">Ürün Seçimi *</label>
                <select
                  value={vForm.product_id}
                  onChange={e => {
                    setVForm({ ...vForm, product_id: e.target.value })
                    setResearchResult(null)
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">Seçiniz...</option>
                  {threeData?.items.map(it => (
                    <option key={it.product_id} value={it.product_id}>
                      {it.is_fixture ? '[Demirbaş]' : '[Envanter]'} {it.inventory_code} — {it.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium">Kondisyon / Durum</label>
                  <select
                    value={vForm.condition}
                    onChange={e => setVForm({ ...vForm, condition: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="excellent">Sıfır / Mükemmel</option>
                    <option value="good">İyi (Aktif Kullanımda)</option>
                    <option value="fair">Orta (Kozmetik İzli)</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={runResearch}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300"
                >
                  <Search className="h-4 w-4" /> Referans Araştır
                </button>
              </div>

              {researchResult && (
                <div
                  className={`rounded-lg border p-3 text-xs ${
                    researchResult.found_reliable_source
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
                      : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300'
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
                      className="mt-2 rounded bg-emerald-600 px-2.5 py-1 text-white hover:bg-emerald-700"
                    >
                      Önerilen Değeri Forma Aktar ({researchResult.suggested_value} {researchResult.currency})
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Birim Piyasa Değeri *</label>
                  <input
                    type="number"
                    step="any"
                    value={vForm.market_value}
                    onChange={e => setVForm({ ...vForm, market_value: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Para Birimi</label>
                  <select
                    value={vForm.currency}
                    onChange={e => setVForm({ ...vForm, currency: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="TRY">TRY (₺)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">Değerleme Notu / Açıklama</label>
                <input
                  placeholder="Örn: Güncel piyasa araştırması yapıldı"
                  value={vForm.note}
                  onChange={e => setVForm({ ...vForm, note: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setValModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                İptal
              </button>
              <button
                onClick={() => createValuation.mutate()}
                disabled={createValuation.isPending}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {createValuation.isPending ? 'Kaydediliyor...' : 'Kaydet ve Güncelle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
