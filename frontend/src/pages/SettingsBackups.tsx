import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, CheckCircle2, DatabaseBackup, Save, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'

interface SystemSettings {
  company_name: string
  default_reporting_currency: string
  auto_backup_enabled: boolean
  auto_backup_time: string
  lan_domain: string
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
  })

  const { data: settingsData } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => api<SystemSettings>('/settings'),
  })

  useEffect(() => {
    if (settingsData) setForm(settingsData)
  }, [settingsData])

  const { data: backups = [] } = useQuery({
    queryKey: ['backups'],
    queryFn: () => api<BackupRow[]>('/backups'),
  })

  const saveSettings = useMutation({
    mutationFn: () => api('/settings', { method: 'PUT', body: JSON.stringify(form) }),
    onSuccess: () => {
      toast.success('Sistem ayarları kaydedildi.')
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sistem Ayarları ve Yedekleme Yönetimi</h1>
        <p className="text-sm text-slate-500">
          Kurumsal yapılandırma, yerel ağ (LAN) erişim parametreleri ve SHA-256 doğrulamalı tam sistem yedeklemesi
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Sol: Genel Sistem Ayarları */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 font-bold">Kurumsal Genel Ayarlar</h2>
          <div className="space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs font-medium">Kurum / Şirket Ünvanı</label>
              <input
                value={form.company_name}
                onChange={e => setForm({ ...form, company_name: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Varsayılan Raporlama Para Birimi</label>
              <select
                value={form.default_reporting_currency}
                onChange={e => setForm({ ...form, default_reporting_currency: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
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
                className="w-full rounded-lg border px-3 py-2 font-mono text-xs"
              />
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
                  className="w-full rounded-lg border px-2.5 py-1 text-xs"
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
