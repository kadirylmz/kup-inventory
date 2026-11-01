import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, CheckCircle2, DatabaseBackup, Hash, Save, ShieldCheck, Sliders } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'
import { saveFormatConfigLocal } from '@/lib/format'

interface SystemSettings {
  company_name: string
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

  const runBackup = useMutation({
    mutationFn: () => api<{ backup_no: string }>('/backups/run', { method: 'POST' }),
    onSuccess: res => {
      toast.success(`${res.backup_no} numaralı tam yedek (Veritabanı + Görseller) oluşturuldu.`)
      qc.invalidateQueries({ queryKey: ['backups'] })
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

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
              <div>
                <label className="mb-1 block text-xs font-medium">Kurum / Şirket Ünvanı</label>
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
            <button
              onClick={() => runBackup.mutate()}
              disabled={runBackup.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Archive className="h-4 w-4" /> Şimdi Manuel Yedek Al
            </button>
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
                        <button
                          onClick={() => verifyBackup.mutate(b.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> SHA-256 Doğrula
                        </button>
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
