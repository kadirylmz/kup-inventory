import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  Download,
  Trash2,
  Upload,
  CheckCircle2,
  DatabaseBackup,
  DollarSign,
  Hash,
  RefreshCw,
  Save,
  ShieldCheck,
  Sliders,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, apiBlob, ApiError } from '@/lib/api'
import { saveFormatConfigLocal } from '@/lib/format'

interface SystemSettings {
  company_name: string
  logo_url?: string | null
  default_reporting_currency: string
  auto_backup_enabled: boolean
  auto_backup_time: string
  lan_domain: string
  number_decimals: number
  trim_trailing_zeros: boolean
  code_padding_digits: number
  code_prefix: string
}

interface BackupRow {
  id: string
  backup_no: string
  backup_type: string
  file_path: string
  size_bytes: number
  sha256: string
  included_uploads: boolean
  status: string
  created_at: string
}

export default function SettingsBackupsPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<SystemSettings>({
    company_name: 'KÜP Prodüksiyon',
    logo_url: null,
    default_reporting_currency: 'TRY',
    auto_backup_enabled: true,
    auto_backup_time: '02:00',
    lan_domain: 'http://inventory.local',
    number_decimals: 0,
    trim_trailing_zeros: true,
    code_padding_digits: 2,
    code_prefix: 'KUP',
  })

  const { data: settingsData } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => api<SystemSettings>('/settings'),
  })

  useEffect(() => {
    if (settingsData) {
      const merged: SystemSettings = {
        company_name: settingsData.company_name ?? 'KÜP Prodüksiyon',
        logo_url: settingsData.logo_url ?? null,
        default_reporting_currency: settingsData.default_reporting_currency ?? 'TRY',
        auto_backup_enabled: settingsData.auto_backup_enabled ?? true,
        auto_backup_time: settingsData.auto_backup_time ?? '02:00',
        lan_domain: settingsData.lan_domain ?? 'http://inventory.local',
        number_decimals: settingsData.number_decimals ?? 0,
        trim_trailing_zeros: settingsData.trim_trailing_zeros ?? true,
        code_padding_digits: settingsData.code_padding_digits ?? 2,
        code_prefix: settingsData.code_prefix ?? 'KUP',
      }
      setForm(merged)
      saveFormatConfigLocal(merged)
    }
  }, [settingsData])

  const [uploadingLogo, setUploadingLogo] = useState(false)
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      setUploadingLogo(true)
      const res = await api<{ logo_url: string }>('/settings/logo', {
        method: 'POST',
        body: fd,
      })
      setForm(prev => ({ ...prev, logo_url: res.logo_url }))
      toast.success('Şirket logosu yüklendi ve güncellendi.')
      qc.invalidateQueries({ queryKey: ['system-settings'] })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleRemoveLogo = async () => {
    setForm(prev => ({ ...prev, logo_url: null }))
    try {
      await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({ ...form, logo_url: null }),
      })
      toast.success('Logo kaldırıldı.')
      qc.invalidateQueries({ queryKey: ['system-settings'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const { data: backups = [] } = useQuery({
    queryKey: ['backups'],
    queryFn: () => api<BackupRow[]>('/backups'),
  })

  const saveSettings = useMutation({
    mutationFn: () => api<SystemSettings>('/settings', { method: 'PUT', body: JSON.stringify(form) }),
    onSuccess: res => {
      saveFormatConfigLocal(res)
      toast.success('Sistem ve sıfır/basamak görünümü ayarları kaydedildi.')
      qc.invalidateQueries({ queryKey: ['system-settings'] })
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  const [restoring, setRestoring] = useState(false)
  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!window.confirm(`DİKKAT: "${file.name}" yedeği sisteme yüklenecektir.

Mevcut veritabanı ve fotoğraflar yedek dosyasındaki verilerle güncellenecektir. Onaylıyor musunuz?`)) {
      e.target.value = ''
      return
    }
    const fd = new FormData()
    fd.append('file', file)
    try {
      setRestoring(true)
      await api('/backups/restore', {
        method: 'POST',
        body: fd,
      })
      toast.success('Yedek başarıyla geri yüklendi! Sayfa yenileniyor...')
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setRestoring(false)
      e.target.value = ''
    }
  }

  const runBackup = useMutation({
    mutationFn: () => api<{ backup_no: string }>('/backups/run', { method: 'POST' }),
    onSuccess: res => {
      toast.success(`${res.backup_no} numaralı tam yedek (Veritabanı + Görseller) oluşturuldu.`)
      qc.invalidateQueries({ queryKey: ['backups'] })
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  const deleteBackup = useMutation({
    mutationFn: (id: string) => api(`/backups/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Yedek başarıyla silindi.')
      qc.invalidateQueries({ queryKey: ['backups'] })
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  const handleDownloadBackup = async (b: BackupRow) => {
    try {
      toast.info(`${b.backup_no} hazırlanıyor ve indiriliyor...`)
      const blob = await apiBlob(`/backups/${b.id}/download`)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${b.backup_no}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast.success(`${b.backup_no} başarıyla indirildi.`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleDeleteBackup = (b: BackupRow) => {
    if (!window.confirm(`"${b.backup_no}" numaralı yedek dosyasını kalıcı olarak silmek istediğinize emin misiniz?`)) return
    deleteBackup.mutate(b.id)
  }

  const verifyBackup = useMutation({
    mutationFn: (id: string) =>
      api<{ backup_no: string; integrity_ok: boolean; sha256: string }>(`/backups/${id}/verify`, { method: 'POST' }),
    onSuccess: res => {
      if (res.integrity_ok) {
        toast.success(`${res.backup_no} arşiv bütünlüğü SHA-256 ile doğrulandı.`)
      } else {
        toast.error(`${res.backup_no} arşiv dosyasında bütünlük hatası tespit edildi!`)
      }
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  // Döviz Kurları (EUR ve USD)
  interface ExchangeRateRow {
    id: string
    rate_date: string
    currency_code: string
    rate_to_try: number
    source: string
    note?: string
    updated_at: string
  }

  const { data: exchangeRates = [] } = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: () => api<ExchangeRateRow[]>('/exchange-rates'),
  })

  const [eurRate, setEurRate] = useState('')
  const [usdRate, setUsdRate] = useState('')

  useEffect(() => {
    if (exchangeRates.length) {
      const eur = exchangeRates.find(r => r.currency_code === 'EUR')
      const usd = exchangeRates.find(r => r.currency_code === 'USD')
      if (eur) setEurRate(String(eur.rate_to_try))
      if (usd) setUsdRate(String(usd.rate_to_try))
    }
  }, [exchangeRates])

  const fetchLiveRates = useMutation({
    mutationFn: () => api<{ ok: boolean; rates: Record<string, number>; source: string }>('/exchange-rates/fetch-live', { method: 'POST' }),
    onSuccess: res => {
      toast.success(`Canlı kurlar başarıyla çekildi (USD: ${res.rates.USD} TL, EUR: ${res.rates.EUR} TL)`)
      qc.invalidateQueries({ queryKey: ['exchange-rates'] })
      qc.invalidateQueries({ queryKey: ['three-values'] })
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  const saveManualRates = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      if (eurRate) {
        await api('/exchange-rates', {
          method: 'POST',
          body: JSON.stringify({
            rate_date: today,
            currency_code: 'EUR',
            rate_to_try: Number(eurRate.replace(',', '.')),
            source: 'manual',
            note: 'Ayarlardan manuel girildi',
          }),
        })
      }
      if (usdRate) {
        await api('/exchange-rates', {
          method: 'POST',
          body: JSON.stringify({
            rate_date: today,
            currency_code: 'USD',
            rate_to_try: Number(usdRate.replace(',', '.')),
            source: 'manual',
            note: 'Ayarlardan manuel girildi',
          }),
        })
      }
    },
    onSuccess: () => {
      toast.success('Döviz kurları başarıyla güncellendi.')
      qc.invalidateQueries({ queryKey: ['exchange-rates'] })
      qc.invalidateQueries({ queryKey: ['three-values'] })
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  const previewCode = `${(form.code_prefix || 'KUP').toUpperCase()}-PRJ-${String(1).padStart(
    Math.max(1, Math.min(6, Number(form.code_padding_digits) || 1)),
    '0',
  )}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sistem Ayarları ve Yedekleme Yönetimi</h1>
        <p className="text-sm text-slate-500">
          Kurumsal yapılandırma, sayı/kod sıfır basamak formatı, yerel ağ (LAN) parametreleri ve SHA-256 doğrulamalı yedekleme
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Sol: Genel Sistem ve Sıfır/Basamak Ayarları */}
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 flex items-center gap-2 font-bold">
              <Sliders className="h-4 w-4 text-brand-600" /> Kurumsal Genel Ayarlar
            </h2>
            <div className="space-y-3 text-sm">
              {/* Şirket Logosu Yükleme */}
              <div>
                <label className="mb-1 block text-xs font-medium">Uygulama / Şirket Logosu</label>
                <div className="flex items-center gap-4 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
                  {form.logo_url ? (
                    <div className="relative flex h-14 w-28 items-center justify-center rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                      <img src={form.logo_url} alt="Logo" className="max-h-full max-w-full object-contain" />
                    </div>
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-400 dark:bg-slate-800">
                      LOGO
                    </div>
                  )}
                  <div className="space-y-1 text-xs">
                    <label className="inline-flex cursor-pointer items-center rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-700">
                      {uploadingLogo ? 'Yükleniyor...' : 'Yeni Logo Seç'}
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploadingLogo} />
                    </label>
                    {form.logo_url && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="ml-2 inline-flex items-center rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-900"
                      >
                        Logoyu Kaldır
                      </button>
                    )}
                    <p className="text-[11px] text-slate-500">PNG, JPG, SVG veya WEBP formatında önerilir.</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Uygulama / Şirket Başlığı (Sol Üstte Görünür)</label>
                <input
                  value={form.company_name}
                  onChange={e => setForm({ ...form, company_name: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Varsayılan Raporlama Para Birimi</label>
                <select
                  value={form.default_reporting_currency}
                  onChange={e => setForm({ ...form, default_reporting_currency: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="TRY">TRY - Türk Lirası</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="USD">USD - Amerikan Doları</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Yerel Ağ (LAN) Erişim Adresi</label>
                <input
                  value={form.lan_domain}
                  onChange={e => setForm({ ...form, lan_domain: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              {/* Sayı, Fiyat ve Kod Sıfır / Basamak Ayarları */}
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-indigo-400">
                  <Hash className="h-3.5 w-3.5" /> Sıfırlar, Ondalık ve Kod Basamak Ayarları
                </div>

                <div className="space-y-3">
                  <label className="flex items-start gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={form.trim_trailing_zeros}
                      onChange={e => setForm({ ...form, trim_trailing_zeros: e.target.checked })}
                      className="mt-0.5"
                    />
                    <span>
                      Tam sayılarda virgülden sonraki gereksiz sıfırları gizle
                      <span className="block text-[11px] text-slate-500">
                        Örn: <code>10,000</code> yerine <code>10</code> ve <code>9.500,00 ₺</code> yerine <code>9.500 ₺</code> gösterilir
                      </span>
                    </span>
                  </label>

                  <div>
                    <label className="mb-1 block text-xs font-medium">Fiyatlarda Ondalık Kuruş Basamağı</label>
                    <select
                      value={form.number_decimals}
                      onChange={e => setForm({ ...form, number_decimals: Number(e.target.value) })}
                      className="w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value={0}>0 Basamak — Tam Sayı (Örn: 9.500)</option>
                      <option value={2}>2 Basamak — Kuruşlu (Örn: 9.500,50)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium">Kod Ön Eki</label>
                      <input
                        value={form.code_prefix}
                        onChange={e => setForm({ ...form, code_prefix: e.target.value.toUpperCase() })}
                        className="w-full rounded-lg border bg-white px-2.5 py-1.5 font-mono text-xs uppercase dark:border-slate-700 dark:bg-slate-900"
                        placeholder="KUP"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Kod Sıfır Basamağı</label>
                      <select
                        value={form.code_padding_digits}
                        onChange={e => setForm({ ...form, code_padding_digits: Number(e.target.value) })}
                        className="w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                      >
                        <option value={1}>1 Hane (KUP-PRJ-1)</option>
                        <option value={2}>2 Hane (KUP-PRJ-01)</option>
                        <option value={3}>3 Hane (KUP-PRJ-001)</option>
                        <option value={4}>4 Hane (KUP-PRJ-0001)</option>
                      </select>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    Yeni Kod Önizlemesi: <strong className="font-mono text-brand-600">{previewCode}</strong>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={form.auto_backup_enabled}
                    onChange={e => setForm({ ...form, auto_backup_enabled: e.target.checked })}
                  />
                  Günlük Otomatik Yedek
                </label>
                <div>
                  <input
                    type="time"
                    value={form.auto_backup_time}
                    onChange={e => setForm({ ...form, auto_backup_time: e.target.value })}
                    className="w-full rounded-lg border px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
              </div>
              <button
                onClick={() => saveSettings.mutate()}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-2.5 font-semibold text-white hover:bg-brand-700"
              >
                <Save className="h-4 w-4" /> Ayarları Kaydet
              </button>
            </div>
          </div>

          {/* Döviz Kurları (Otomatik ve Manuel) */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h2 className="flex items-center gap-2 font-bold text-sm">
                  <DollarSign className="h-4 w-4 text-emerald-600" /> Güncel Döviz Kurları (Euro ve Dolar)
                </h2>
                <p className="text-xs text-slate-500">
                  Otomatik canlı piyasadan çekebilir veya kendi belirlediğiniz kuru elle girebilirsiniz
                </p>
              </div>
              <button
                type="button"
                onClick={() => fetchLiveRates.mutate()}
                disabled={fetchLiveRates.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${fetchLiveRates.isPending ? 'animate-spin' : ''}`} />
                Canlı Kurları Otomatik Çek
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  1 USD ($) Karşılığı (TL)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={usdRate}
                    onChange={e => setUsdRate(e.target.value)}
                    placeholder="Örn: 49.95"
                    className="w-full rounded-lg border px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">₺</span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  1 EUR (€) Karşılığı (TL)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={eurRate}
                    onChange={e => setEurRate(e.target.value)}
                    placeholder="Örn: 55.78"
                    className="w-full rounded-lg border px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">₺</span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
              <span>
                Son Kayıt:{' '}
                {exchangeRates[0]
                  ? `${exchangeRates[0].rate_date} (${exchangeRates[0].source === 'auto' ? 'Otomatik' : 'Manuel'})`
                  : '—'}
              </span>
              <button
                type="button"
                onClick={() => saveManualRates.mutate()}
                disabled={saveManualRates.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" /> Kurları Manuel Kaydet
              </button>
            </div>
          </div>
        </div>

        {/* Sağ: Yedekleme ve Geri Yükleme Doğrulama */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                <DatabaseBackup className="h-6 w-6" />
              </div>
              <div>
                <div className="font-bold">Veritabanı ve Dosya Arşivi Yedekleme</div>
                <div className="text-xs text-slate-500">
                  Veritabanı anlık görüntüsünü, ürün fotoğraflarını ve fatura belgelerini tek ZIP arşivinde yedekler.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">

              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">

                <Upload className="h-4 w-4 text-brand-600" /> {restoring ? 'Yükleniyor...' : 'Yedek Dosyası Yükle (.ZIP)'}

                <input type="file" accept=".zip" onChange={handleRestoreFile} className="hidden" disabled={restoring} />

              </label>

              <button

                onClick={() => runBackup.mutate()}

                disabled={runBackup.isPending}

                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"

              >

                <Archive className="h-4 w-4" /> Şimdi Manuel Yedek Al

              </button>

            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3">Yedek No</th>
                  <th className="px-4 py-3">Tarih</th>
                  <th className="px-4 py-3">Boyut</th>
                  <th className="px-4 py-3">SHA-256 Özeti</th>
                  <th className="px-4 py-3">Durum</th>
                  <th className="px-4 py-3 text-right">Bütünlük Testi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {backups.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      Henüz oluşturulmuş bir yedek kaydı bulunmuyor.
                    </td>
                  </tr>
                ) : (
                  backups.map(b => (
                    <tr key={b.id}>
                      <td className="px-4 py-2.5 font-mono text-xs font-bold text-brand-600">{b.backup_no}</td>
                      <td className="px-4 py-2.5 text-xs">{new Date(b.created_at).toLocaleString('tr-TR')}</td>
                      <td className="px-4 py-2.5 text-xs">{(b.size_bytes / 1024).toFixed(1)} KB</td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">{b.sha256.slice(0, 16)}...</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> Tamamlandı
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownloadBackup(b)}
                            className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300"
                            title="Yedek Arşivini Bilgisayara İndir (.ZIP)"
                          >
                            <Download className="h-3.5 w-3.5" /> İndir
                          </button>
                          <button
                            onClick={() => verifyBackup.mutate(b.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                            title="Yedek dosyasının bozulup bozulmadığını kontrol et"
                          >
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Doğrula
                          </button>
                          <button
                            onClick={() => handleDeleteBackup(b)}
                            className="inline-flex items-center rounded-lg border border-rose-200 p-1 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:hover:bg-rose-950/40"
                            title="Yedeği Sil"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
