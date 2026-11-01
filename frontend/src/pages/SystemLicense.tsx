import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Clock,
  Copy,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'

interface AppLicenseStatus {
  is_licensed: boolean
  is_expired?: boolean
  customer_name?: string
  edition?: string
  license_key_masked?: string
  max_users?: number
  current_users: number
  max_assets?: number
  current_assets: number
  issued_at?: string
  expires_at?: string | null
  signature?: string
  activations?: number
}

interface GeneratedLicense {
  license_key: string
  customer_name: string
  edition: string
  duration_years: number
  expires_at: string | null
  signature: string
  max_users: number
  max_assets: number
}

export default function SystemLicensePage() {
  const qc = useQueryClient()

  // Aktivasyon Formu
  const [form, setForm] = useState({
    customer_name: 'KÜP Prodüksiyon',
    edition: 'Enterprise',
    license_key: 'KUP-ENT-2026-PROD-MASTER',
    duration_years: 1,
    max_users: 100,
    max_assets: 50000,
  })

  // Lisans Anahtarı Üretici (Generator) Formu
  const [genForm, setGenForm] = useState({
    customer_name: 'Müşteri Firma Ltd.',
    edition: 'Enterprise',
    duration_years: 1, // 1 yıl, 2 yıl, vb.
    max_users: 100,
    max_assets: 50000,
  })

  const [generatedResult, setGeneratedResult] = useState<GeneratedLicense | null>(null)

  const { data: lic } = useQuery({
    queryKey: ['app-license'],
    queryFn: () => api<AppLicenseStatus>('/app-license'),
  })

  const activateMut = useMutation({
    mutationFn: () =>
      api('/app-license/activate', {
        method: 'POST',
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      toast.success('Lisans doğrulandı ve bu sistem için başarıyla etkinleştirildi.')
      qc.invalidateQueries({ queryKey: ['app-license'] })
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  const generateMut = useMutation({
    mutationFn: () =>
      api<GeneratedLicense>('/app-license/generate', {
        method: 'POST',
        body: JSON.stringify(genForm),
      }),
    onSuccess: data => {
      setGeneratedResult(data)
      toast.success('Yeni ticari lisans anahtarı üretildi!')
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Lisans anahtarı panoya kopyalandı.')
  }

  const applyGeneratedKeyToActivation = (gen: GeneratedLicense) => {
    setForm({
      customer_name: gen.customer_name,
      edition: gen.edition,
      license_key: gen.license_key,
      duration_years: gen.duration_years,
      max_users: gen.max_users,
      max_assets: gen.max_assets,
    })
    toast.info('Üretilen lisans bilgileri aktivasyon kutusuna aktarıldı.')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sistem Lisansı ve Lisanslama Merkezi</h1>
        <p className="text-sm text-slate-500">
          KÜP INVENTORY kurumsal lisans durumu, 1 Yıl / 2 Yıl veya Süresiz yeni lisans anahtarı oluşturma ve aktivasyon yönetimi
        </p>
      </div>

      {/* 1. MEVCUT LİSANS DURUM KARTI */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div
          className={`rounded-2xl border p-6 shadow-xs lg:col-span-2 ${
            lic?.is_licensed && !lic.is_expired
              ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20'
              : 'border-rose-200 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/20'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`grid h-12 w-12 place-items-center rounded-xl text-white ${
                lic?.is_licensed && !lic.is_expired ? 'bg-emerald-600' : 'bg-rose-600'
              }`}
            >
              {lic?.is_licensed && !lic.is_expired ? (
                <ShieldCheck className="h-7 w-7" />
              ) : (
                <ShieldAlert className="h-7 w-7" />
              )}
            </div>
            <div>
              <div
                className={`text-xs font-bold uppercase tracking-wider ${
                  lic?.is_licensed && !lic.is_expired
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-rose-700 dark:text-rose-300'
                }`}
              >
                {lic?.is_licensed && !lic.is_expired
                  ? 'AKTİF KURUMSAL LİSANS'
                  : lic?.is_expired
                  ? 'LİSANS SÜRESİ DOLMUŞTUR'
                  : 'LİSANS BEKLENİYOR'}
              </div>
              <div className="text-xl font-extrabold">{lic?.customer_name || 'KÜP Prodüksiyon'}</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-3.5 shadow-2xs dark:bg-slate-900">
              <div className="text-xs text-slate-500">Sürüm / Paket</div>
              <div className="mt-1 font-bold text-brand-600">{lic?.edition || 'Enterprise'}</div>
            </div>
            <div className="rounded-xl bg-white p-3.5 shadow-2xs dark:bg-slate-900">
              <div className="text-xs text-slate-500">Lisans Anahtarı</div>
              <div className="mt-1 font-mono text-xs font-bold">{lic?.license_key_masked || '—'}</div>
            </div>
            <div className="rounded-xl bg-white p-3.5 shadow-2xs dark:bg-slate-900">
              <div className="text-xs text-slate-500">Lisans Bitiş Tarihi</div>
              <div className="mt-1 font-bold">
                {lic?.expires_at ? (
                  <span
                    className={`inline-flex items-center gap-1 ${
                      lic.is_expired ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(lic.expires_at).toLocaleDateString('tr-TR')}
                  </span>
                ) : (
                  <span className="text-emerald-600">Süresiz (Ömür Boyu)</span>
                )}
              </div>
            </div>
            <div className="rounded-xl bg-white p-3.5 shadow-2xs dark:bg-slate-900">
              <div className="text-xs text-slate-500">Kullanıcı Kotası</div>
              <div className="mt-1 font-bold">
                {lic?.current_users ?? 0} / {lic?.max_users ?? 100}
              </div>
            </div>
            <div className="rounded-xl bg-white p-3.5 shadow-2xs dark:bg-slate-900">
              <div className="text-xs text-slate-500">Fiziksel Varlık Kotası</div>
              <div className="mt-1 font-bold">
                {lic?.current_assets ?? 0} / {lic?.max_assets ?? 50000}
              </div>
            </div>
            <div className="rounded-xl bg-white p-3.5 shadow-2xs dark:bg-slate-900">
              <div className="text-xs text-slate-500">Sunucu Aktivasyon</div>
              <div className="mt-1 font-bold">{lic?.activations ?? 1} Sunucu</div>
            </div>
          </div>
        </div>

        {/* 2. AKTİVASYON KUTUSU */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2 font-bold">
            <KeyRound className="h-5 w-5 text-brand-600" /> Lisansı Etkinleştir / Yenile
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs font-medium">Müşteri / Kurum Adı</label>
              <input
                value={form.customer_name}
                onChange={e => setForm({ ...form, customer_name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Lisans Süresi</label>
              <select
                value={form.duration_years}
                onChange={e => setForm({ ...form, duration_years: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800"
              >
                <option value={1}>1 Yıl Geçerli</option>
                <option value={2}>2 Yıl Geçerli</option>
                <option value={3}>3 Yıl Geçerli</option>
                <option value={5}>5 Yıl Geçerli</option>
                <option value={0}>Süresiz (Ömür Boyu)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Lisans Paketi</label>
              <select
                value={form.edition}
                onChange={e => setForm({ ...form, edition: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="Enterprise">Enterprise (Sınırsız Modül + Offline LAN)</option>
                <option value="Professional">Professional</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Ürün Lisans Anahtarı</label>
              <input
                value={form.license_key}
                onChange={e => setForm({ ...form, license_key: e.target.value })}
                placeholder="Örn: KUP-ENT-2026-1Y-XXXXXX"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <button
              onClick={() => activateMut.mutate()}
              disabled={activateMut.isPending}
              className="mt-2 w-full rounded-lg bg-brand-600 py-2.5 font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
            >
              {activateMut.isPending ? 'Doğrulanıyor...' : 'Lisansı Doğrula ve Etkinleştir'}
            </button>
          </div>
        </div>
      </div>

      {/* 3. LİSANS ÜRETİCİSİ (YENİ LİSANS OLUŞTURMA BÖLÜMÜ) */}
      <div className="rounded-2xl border border-indigo-200 bg-white p-6 shadow-sm dark:border-indigo-900/50 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-bold">Yeni Lisans Oluşturucu (1 Yıl, 2 Yıl veya Süresiz)</h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Bu bölümden yeni bir müşteri veya proje için resmi dijital imzalı lisans anahtarı üretebilir, süresini belirleyebilirsiniz.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Üretim Parametreleri */}
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Lisans Sahibi / Müşteri Adı
              </label>
              <input
                value={genForm.customer_name}
                onChange={e => setGenForm({ ...genForm, customer_name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                placeholder="Örn: X Müzesi Genel Müdürlüğü"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Lisans Süresi
                </label>
                <select
                  value={genForm.duration_years}
                  onChange={e => setGenForm({ ...genForm, duration_years: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value={1}>1 Yıl Lisans</option>
                  <option value={2}>2 Yıl Lisans</option>
                  <option value={3}>3 Yıl Lisans</option>
                  <option value={5}>5 Yıl Lisans</option>
                  <option value={0}>Süresiz (Ömür Boyu)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Paket Sürümü
                </label>
                <select
                  value={genForm.edition}
                  onChange={e => setGenForm({ ...genForm, edition: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="Enterprise">Enterprise (Tüm Modüller)</option>
                  <option value="Professional">Professional (Standart)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Maks. Kullanıcı Sayısı
                </label>
                <input
                  type="number"
                  min="1"
                  value={genForm.max_users}
                  onChange={e => setGenForm({ ...genForm, max_users: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Maks. Fiziksel Cihaz / Varlık
                </label>
                <input
                  type="number"
                  min="100"
                  step="500"
                  value={genForm.max_assets}
                  onChange={e => setGenForm({ ...genForm, max_assets: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>

            <button
              onClick={() => generateMut.mutate()}
              disabled={generateMut.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-md transition hover:bg-indigo-700 disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              {generateMut.isPending ? 'Oluşturuluyor...' : 'Yeni Lisans Anahtarı Oluştur'}
            </button>
          </div>

          {/* Üretilen Lisansın Sonuç Kartı */}
          <div className="flex flex-col justify-between rounded-xl border border-indigo-100 bg-indigo-50/50 p-5 dark:border-indigo-900/40 dark:bg-slate-800/50">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                Üretilen Lisans Özeti
              </div>
              {generatedResult ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <div className="text-xs text-slate-500">Üretilen Lisans Anahtarı:</div>
                    <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-white p-2.5 font-mono text-sm font-bold text-indigo-700 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300">
                      <span>{generatedResult.license_key}</span>
                      <button
                        onClick={() => copyToClipboard(generatedResult.license_key)}
                        title="Kopyala"
                        className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Copy className="h-4 w-4 text-slate-500" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-white p-2 dark:bg-slate-900">
                      <span className="text-slate-400">Müşteri:</span>
                      <div className="font-semibold">{generatedResult.customer_name}</div>
                    </div>
                    <div className="rounded-lg bg-white p-2 dark:bg-slate-900">
                      <span className="text-slate-400">Süre:</span>
                      <div className="font-semibold">
                        {generatedResult.duration_years > 0
                          ? `${generatedResult.duration_years} Yıl`
                          : 'Süresiz'}
                      </div>
                    </div>
                    <div className="rounded-lg bg-white p-2 dark:bg-slate-900">
                      <span className="text-slate-400">Son Geçerlilik:</span>
                      <div className="font-semibold">
                        {generatedResult.expires_at
                          ? new Date(generatedResult.expires_at).toLocaleDateString('tr-TR')
                          : 'Süresiz'}
                      </div>
                    </div>
                    <div className="rounded-lg bg-white p-2 dark:bg-slate-900">
                      <span className="text-slate-400">Kapasite:</span>
                      <div className="font-semibold">
                        {generatedResult.max_users} Kullanıcı / {generatedResult.max_assets} Cihaz
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-400">SHA256 Dijital Doğrulama İmzası:</span>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
                      {generatedResult.signature}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid h-48 place-items-center text-center text-xs text-slate-400">
                  Sol taraftaki parametreleri doldurup "Yeni Lisans Anahtarı Oluştur" butonuna basarak 1 yıl, 2 yıl veya süresiz resmi anahtar üretebilirsiniz.
                </div>
              )}
            </div>

            {generatedResult && (
              <div className="mt-4 pt-3 border-t border-indigo-100 dark:border-slate-700">
                <button
                  onClick={() => applyGeneratedKeyToActivation(generatedResult)}
                  className="w-full rounded-lg border border-indigo-300 bg-white py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:bg-slate-900 dark:text-indigo-300"
                >
                  Bu Anahtarı Yukarıdaki Aktivasyon Kutusuna Aktar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
