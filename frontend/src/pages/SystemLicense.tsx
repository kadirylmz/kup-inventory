import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'

interface AppLicenseStatus {
  is_licensed: boolean
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

export default function SystemLicensePage() {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    customer_name: 'KÜP Prodüksiyon',
    edition: 'Enterprise',
    license_key: 'KUP-ENT-2026-PROD-0001',
    max_users: 100,
    max_assets: 50000,
  })

  const { data: lic } = useQuery({
    queryKey: ['app-license'],
    queryFn: () => api<AppLicenseStatus>('/app-license'),
  })

  const activateMut = useMutation({
    mutationFn: () => api('/app-license/activate', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => {
      toast.success('Ticari ürün lisansı doğrulandı ve bu sunucu için etkinleştirildi.')
      qc.invalidateQueries({ queryKey: ['app-license'] })
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sistem Lisansı ve Ticari Paket Durumu</h1>
        <p className="text-sm text-slate-500">
          KÜP INVENTORY On-Premise / Yerel Ağ (LAN) Kurumsal Lisans Doğrulama ve Kapasite Yönetimi
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-xs lg:col-span-2 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-600 text-white">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                {lic?.is_licensed ? 'AKTİF KURUMSAL LİSANS' : 'LİSANS BEKLENİYOR'}
              </div>
              <div className="text-xl font-extrabold">{lic?.customer_name || 'KÜP Prodüksiyon'}</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-3.5 shadow-2xs dark:bg-slate-900">
              <div className="text-xs text-slate-500">Sürüm / Paket</div>
              <div className="mt-1 font-bold text-brand-600">{lic?.edition || 'Enterprise'}</div>
            </div>
            <div className="rounded-xl bg-white p-3.5 shadow-2xs dark:bg-slate-900">
              <div className="text-xs text-slate-500">Lisans Anahtarı</div>
              <div className="mt-1 font-mono text-xs font-bold">{lic?.license_key_masked || '—'}</div>
            </div>
            <div className="rounded-xl bg-white p-3.5 shadow-2xs dark:bg-slate-900">
              <div className="text-xs text-slate-500">Dijital İmza</div>
              <div className="mt-1 font-mono text-xs text-slate-600">{lic?.signature || '—'}</div>
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
              <div className="text-xs text-slate-500">Sunucu Aktivasyon Sayısı</div>
              <div className="mt-1 font-bold">{lic?.activations ?? 1} Sunucu</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2 font-bold">
            <KeyRound className="h-5 w-5 text-brand-600" /> Lisans Yenileme / Aktivasyon
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs font-medium">Müşteri / Kurum Adı</label>
              <input
                value={form.customer_name}
                onChange={e => setForm({ ...form, customer_name: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Lisans Paketi</label>
              <select
                value={form.edition}
                onChange={e => setForm({ ...form, edition: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
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
                className="w-full rounded-lg border px-3 py-2 font-mono text-xs"
              />
            </div>
            <button
              onClick={() => activateMut.mutate()}
              className="mt-2 w-full rounded-lg bg-brand-600 py-2.5 font-semibold text-white hover:bg-brand-700"
            >
              Lisansı Doğrula ve Etkinleştir
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
