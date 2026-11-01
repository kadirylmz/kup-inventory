import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Printer, QrCode, Scale } from 'lucide-react'
import { api } from '@/lib/api'
import { fmtMoney, fmtQty } from '@/lib/format'

interface ReportType {
  id: string
  title: string
}

interface ReportData {
  report_id: string
  title: string
  generated_at: string
  reporting_currency: string
  exchange_rate_snapshot: Record<string, number>
  columns: string[]
  rows: string[][]
  total_quantity: number
  total_value: number
}

interface AssetRow {
  id: string
  inventory_code: string
  serial_number: string
  qr_token: string
  warehouse_name?: string
}

export default function ReportsPage() {
  const [selectedReportId, setSelectedReportId] = useState('1_general_inventory')
  const [currency, setCurrency] = useState<'TRY' | 'EUR' | 'USD'>('TRY')
  const [mode, setMode] = useState<'reports' | 'qr_labels'>('reports')

  const { data: reportTypes = [] } = useQuery({
    queryKey: ['report-types'],
    queryFn: () => api<ReportType[]>('/reports/types'),
  })

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['report-data', selectedReportId, currency],
    queryFn: () => api<ReportData>(`/reports/${selectedReportId}?currency=${currency}`),
    enabled: mode === 'reports',
  })

  const { data: assets = [] } = useQuery({
    queryKey: ['assets'],
    queryFn: () => api<AssetRow[]>('/assets'),
    enabled: mode === 'qr_labels',
  })

  return (
    <div className="space-y-5">
      {/* Üst Kontrol Paneli (Yazdırma/PDF sırasında gizlenir) */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Profesyonel Raporlama ve QR Etiket Merkezi</h1>
          <p className="text-sm text-slate-500">
            18 kurumsal rapor türü için web önizleme, yüksek kaliteli kurumsal PDF çıktı ve basılabilir QR etiketler
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
            <button
              onClick={() => setMode('reports')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
                mode === 'reports' ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <FileText className="h-3.5 w-3.5" /> 18 Kurumsal Rapor
            </button>
            <button
              onClick={() => setMode('qr_labels')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
                mode === 'qr_labels' ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <QrCode className="h-3.5 w-3.5" /> Basılabilir QR Etiket Sayfası
            </button>
          </div>

          {mode === 'reports' && (
            <div className="flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
              {(['TRY', 'EUR', 'USD'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                    currency === c ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Printer className="h-4 w-4" /> PDF İndir / Yazdır
          </button>
        </div>
      </div>

      {mode === 'reports' ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
          {/* Sol: 18 Rapor Türü Seçimi (Yazdırma sırasında gizlenir) */}
          <div className="max-h-[75vh] space-y-1.5 overflow-y-auto pr-1 print:hidden lg:col-span-1">
            {reportTypes.map(rt => (
              <button
                key={rt.id}
                onClick={() => setSelectedReportId(rt.id)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition ${
                  selectedReportId === rt.id
                    ? 'border-brand-600 bg-brand-600 text-white shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {rt.title}
              </button>
            ))}
          </div>

          {/* Sağ: Kurumsal Rapor Önizleme ve PDF Sayfa Düzeni */}
          <div className="lg:col-span-3 print:col-span-4">
            <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-xs dark:border-slate-800 dark:bg-slate-900 print:border-0 print:p-0 print:shadow-none">
              {/* Kurumsal Rapor Başlığı */}
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-white">
                    <Scale className="h-7 w-7" />
                  </div>
                  <div>
                    <div className="text-lg font-extrabold tracking-tight">KÜP PRODÜKSİYON</div>
                    <div className="text-xs text-slate-500">
                      KÜP INVENTORY • Kurumsal Varlık ve Envanter Yönetim Sistemi
                    </div>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-600 dark:text-slate-300">
                  <div className="font-bold text-sm text-slate-900 dark:text-white">{reportData?.title}</div>
                  <div>
                    Rapor Tarihi:{' '}
                    {reportData?.generated_at ? new Date(reportData.generated_at).toLocaleString('tr-TR') : '—'}
                  </div>
                  <div>
                    Raporlama Para Birimi: <span className="font-semibold">{currency}</span> (EUR:{' '}
                    {reportData?.exchange_rate_snapshot?.EUR != null
                      ? fmtMoney(reportData.exchange_rate_snapshot.EUR)
                      : '—'}{' '}
                    ₺ | USD:{' '}
                    {reportData?.exchange_rate_snapshot?.USD != null
                      ? fmtMoney(reportData.exchange_rate_snapshot.USD)
                      : '—'}{' '}
                    ₺)
                  </div>
                </div>
              </div>

              {/* Rapor Tablosu */}
              {isLoading ? (
                <div className="py-16 text-center text-sm text-slate-400">Rapor verileri hazırlanıyor...</div>
              ) : (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b-2 border-slate-300 bg-slate-100 uppercase text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {reportData?.columns.map((col, idx) => (
                          <th key={idx} className="px-3 py-2.5 font-bold">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {reportData?.rows.length === 0 ? (
                        <tr>
                          <td colSpan={reportData.columns.length || 1} className="py-10 text-center text-slate-400">
                            Bu rapor kriterine uygun kayıt bulunmuyor.
                          </td>
                        </tr>
                      ) : (
                        reportData?.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="even:bg-slate-50/60 dark:even:bg-slate-800/30">
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="px-3 py-2">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Rapor Alt Toplam ve İmza Alanı */}
              <div className="mt-6 flex flex-wrap items-center justify-between border-t-2 border-slate-900 pt-4 text-xs dark:border-slate-700">
                <div className="space-y-0.5 text-slate-500">
                  <div>Sayfa 1 / 1 • Resmi Kurumsal Sistem Çıktısı</div>
                  <div>Excel/CSV dışa aktarımı kapalıdır; veriler merkezi PostgreSQL veritabanından doğrulanmıştır.</div>
                </div>
                <div className="flex gap-6 text-right">
                  <div>
                    <div className="text-slate-500">Toplam Kayıt / Miktar</div>
                    <div className="text-base font-bold">{fmtQty(reportData?.total_quantity ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Toplam Finansal Değer ({currency})</div>
                    <div className="text-base font-extrabold text-brand-600">
                      {fmtMoney(reportData?.total_value ?? 0)} {currency}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Basılabilir QR Etiket Sayfası */
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 print:border-0 print:p-0">
          <div className="mb-4 flex items-center justify-between print:hidden">
            <h2 className="font-bold">Seri Numaralı Cihazlar İçin Basılabilir QR Etiket Şablonu</h2>
            <span className="text-xs text-slate-500">Toplam {assets.length} adet etiket hazır</span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {assets.map(a => (
              <div
                key={a.id}
                className="flex flex-col items-center rounded-xl border-2 border-slate-800 p-3 text-center"
              >
                <div className="text-[11px] font-extrabold tracking-wider">KÜP PRODÜKSİYON</div>
                <img
                  src={`/api/v1/qr/${a.qr_token}.png`}
                  alt={a.inventory_code}
                  className="my-2 h-28 w-28 object-contain"
                />
                <div className="font-mono text-xs font-bold text-brand-700">{a.inventory_code}</div>
                <div className="font-mono text-[11px] text-slate-600">SN: {a.serial_number}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">{a.warehouse_name || 'Merkez Depo'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
