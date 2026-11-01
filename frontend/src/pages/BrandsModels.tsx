import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, Building, Cpu, Loader2, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export interface BrandItem {
  id: string
  name: string
  country: string | null
  website: string | null
  description: string | null
  is_active: boolean
  model_count: number
}

export interface ModelItem {
  id: string
  brand_id: string
  brand_name: string
  name: string
  specs: Record<string, string> | null
  description: string | null
  is_active: boolean
}

export interface SupplierItem {
  id: string
  name: string
  contact_person: string | null
  tax_no: string | null
  phone: string | null
  email: string | null
  address: string | null
  is_active: boolean
}

export default function BrandsModelsPage() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'brands' | 'models' | 'suppliers'>('brands')

  const [brandModal, setBrandModal] = useState(false)
  const [bName, setBName] = useState('')
  const [bCountry, setBCountry] = useState('')
  const [bWeb, setBWeb] = useState('')
  const [bDesc, setBDesc] = useState('')

  const [modelModal, setModelModal] = useState(false)
  const [mBrandId, setMBrandId] = useState('')
  const [mName, setMName] = useState('')
  const [mDesc, setMDesc] = useState('')
  const [mSpecs, setMSpecs] = useState<{ k: string; v: string }[]>([{ k: '', v: '' }])

  const [supModal, setSupModal] = useState(false)
  const [sName, setSName] = useState('')
  const [sContact, setSContact] = useState('')
  const [sTax, setSTax] = useState('')
  const [sPhone, setSPhone] = useState('')
  const [sEmail, setSEmail] = useState('')

  const { data: brands = [], isLoading: bLoad } = useQuery({
    queryKey: ['brands'],
    queryFn: () => api<BrandItem[]>('/brands'),
  })
  const { data: models = [], isLoading: mLoad } = useQuery({
    queryKey: ['models'],
    queryFn: () => api<ModelItem[]>('/models'),
  })
  const { data: suppliers = [], isLoading: sLoad } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api<SupplierItem[]>('/suppliers'),
  })

  const createBrand = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api('/brands', {
        method: 'POST',
        body: JSON.stringify({
          name: bName,
          country: bCountry || null,
          website: bWeb || null,
          description: bDesc || null,
        }),
      })
      toast.success('Marka eklendi.')
      qc.invalidateQueries({ queryKey: ['brands'] })
      setBrandModal(false)
      setBName('')
      setBCountry('')
      setBWeb('')
      setBDesc('')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const createModel = async (e: FormEvent) => {
    e.preventDefault()
    const specsObj: Record<string, string> = {}
    mSpecs.forEach(pair => {
      if (pair.k.trim() && pair.v.trim()) specsObj[pair.k.trim()] = pair.v.trim()
    })
    try {
      await api('/models', {
        method: 'POST',
        body: JSON.stringify({
          brand_id: mBrandId,
          name: mName,
          description: mDesc || null,
          specs: Object.keys(specsObj).length ? specsObj : null,
        }),
      })
      toast.success('Model eklendi.')
      qc.invalidateQueries({ queryKey: ['models'] })
      qc.invalidateQueries({ queryKey: ['brands'] })
      setModelModal(false)
      setMName('')
      setMDesc('')
      setMSpecs([{ k: '', v: '' }])
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const createSupplier = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api('/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          name: sName,
          contact_person: sContact || null,
          tax_no: sTax || null,
          phone: sPhone || null,
          email: sEmail || null,
        }),
      })
      toast.success('Tedarikçi eklendi.')
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      setSupModal(false)
      setSName('')
      setSContact('')
      setSTax('')
      setSPhone('')
      setSEmail('')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Markalar, Modeller ve Tedarikçiler</h1>
          <p className="text-sm text-slate-500">
            Üretici marka kataloğu, cihaz modelleri ve satın alma tedarikçileri
          </p>
        </div>

        <div className="flex gap-2">
          {can('brand.manage') && (
            <>
              <button
                onClick={() => setBrandModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Plus className="h-4 w-4" /> Yeni Marka
              </button>
              <button
                onClick={() => {
                  if (!brands.length) {
                    toast.error('Önce en az bir marka ekleyin.')
                    return
                  }
                  setMBrandId(brands[0].id)
                  setModelModal(true)
                }}
                className="flex items-center gap-1.5 rounded-lg border border-brand-600 px-3.5 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50 dark:text-indigo-400 dark:hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" /> Yeni Model
              </button>
            </>
          )}
          {can('product.create') && (
            <button
              onClick={() => setSupModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" /> Yeni Tedarikçi
            </button>
          )}
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        {[
          { id: 'brands', label: `Markalar (${brands.length})`, icon: Boxes },
          { id: 'models', label: `Modeller (${models.length})`, icon: Cpu },
          { id: 'suppliers', label: `Tedarikçiler (${suppliers.length})`, icon: Building },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as 'brands' | 'models' | 'suppliers')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              tab === t.id
                ? 'border-brand-600 text-brand-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Markalar Tablosu */}
      {tab === 'brands' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {bLoad ? (
            <div className="grid place-items-center p-12">
              <Loader2 className="animate-spin text-brand-600" />
            </div>
          ) : !brands.length ? (
            <div className="p-12 text-center text-slate-500">Henüz kayıtlı marka yok.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                <tr>
                  <th className="p-3.5">Marka Adı</th>
                  <th className="p-3.5">Ülke</th>
                  <th className="p-3.5">Web Sitesi</th>
                  <th className="p-3.5">Kayıtlı Model</th>
                  <th className="p-3.5">Açıklama</th>
                </tr>
              </thead>
              <tbody>
                {brands.map(b => (
                  <tr key={b.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-3.5 font-semibold">{b.name}</td>
                    <td className="p-3.5 text-slate-500">{b.country || '—'}</td>
                    <td className="p-3.5 text-brand-600">{b.website || '—'}</td>
                    <td className="p-3.5 font-semibold">{b.model_count}</td>
                    <td className="p-3.5 text-slate-500">{b.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modeller Tablosu */}
      {tab === 'models' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {mLoad ? (
            <div className="grid place-items-center p-12">
              <Loader2 className="animate-spin text-brand-600" />
            </div>
          ) : !models.length ? (
            <div className="p-12 text-center text-slate-500">Henüz kayıtlı model yok.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                <tr>
                  <th className="p-3.5">Marka</th>
                  <th className="p-3.5">Model Adı</th>
                  <th className="p-3.5">Teknik Özellikler</th>
                  <th className="p-3.5">Açıklama</th>
                </tr>
              </thead>
              <tbody>
                {models.map(m => (
                  <tr key={m.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-3.5 font-medium text-brand-600 dark:text-indigo-400">{m.brand_name}</td>
                    <td className="p-3.5 font-semibold">{m.name}</td>
                    <td className="p-3.5">
                      {m.specs ? (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(m.specs).map(([k, v]) => (
                            <span
                              key={k}
                              className="rounded bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800"
                            >
                              <strong>{k}:</strong> {v}
                            </span>
                          ))}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3.5 text-slate-500">{m.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tedarikçiler Tablosu */}
      {tab === 'suppliers' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {sLoad ? (
            <div className="grid place-items-center p-12">
              <Loader2 className="animate-spin text-brand-600" />
            </div>
          ) : !suppliers.length ? (
            <div className="p-12 text-center text-slate-500">Henüz kayıtlı tedarikçi yok.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                <tr>
                  <th className="p-3.5">Firma Adı</th>
                  <th className="p-3.5">İlgili Kişi</th>
                  <th className="p-3.5">Vergi No</th>
                  <th className="p-3.5">Telefon</th>
                  <th className="p-3.5">E-posta</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map(s => (
                  <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-3.5 font-semibold">{s.name}</td>
                    <td className="p-3.5">{s.contact_person || '—'}</td>
                    <td className="p-3.5">{s.tax_no || '—'}</td>
                    <td className="p-3.5">{s.phone || '—'}</td>
                    <td className="p-3.5">{s.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Marka Ekle Modalı */}
      {brandModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={createBrand}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Yeni Marka Ekle</h2>
              <button type="button" onClick={() => setBrandModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <label className="block text-sm font-medium">
              Marka Adı *
              <input
                required
                value={bName}
                onChange={e => setBName(e.target.value)}
                className={inputCls + ' mt-1'}
                placeholder="Örn: Panasonic, Blackmagic Design, Samsung"
              />
            </label>
            <label className="block text-sm font-medium">
              Ülke
              <input
                value={bCountry}
                onChange={e => setBCountry(e.target.value)}
                className={inputCls + ' mt-1'}
                placeholder="Japonya"
              />
            </label>
            <label className="block text-sm font-medium">
              Web Sitesi
              <input
                value={bWeb}
                onChange={e => setBWeb(e.target.value)}
                className={inputCls + ' mt-1'}
                placeholder="https://..."
              />
            </label>
            <label className="block text-sm font-medium">
              Açıklama
              <textarea
                rows={2}
                value={bDesc}
                onChange={e => setBDesc(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBrandModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                İptal
              </button>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                Kaydet
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Model Ekle Modalı */}
      {modelModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={createModel}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Yeni Model Ekle</h2>
              <button type="button" onClick={() => setModelModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <label className="block text-sm font-medium">
              Marka *
              <select
                required
                value={mBrandId}
                onChange={e => setMBrandId(e.target.value)}
                className={inputCls + ' mt-1'}
              >
                {brands.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Model Adı / Kodu *
              <input
                required
                value={mName}
                onChange={e => setMName(e.target.value)}
                className={inputCls + ' mt-1'}
                placeholder="Örn: PT-RZ690B"
              />
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>Model Teknik Özellikleri</span>
                <button
                  type="button"
                  onClick={() => setMSpecs([...mSpecs, { k: '', v: '' }])}
                  className="text-xs text-brand-600 hover:underline"
                >
                  + Özellik Satırı Ekle
                </button>
              </div>
              {mSpecs.map((sp, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    placeholder="Özellik (Örn: Lümen)"
                    value={sp.k}
                    onChange={e => {
                      const next = [...mSpecs]
                      next[idx].k = e.target.value
                      setMSpecs(next)
                    }}
                    className={inputCls}
                  />
                  <input
                    placeholder="Değer (Örn: 6500 ANSI)"
                    value={sp.v}
                    onChange={e => {
                      const next = [...mSpecs]
                      next[idx].v = e.target.value
                      setMSpecs(next)
                    }}
                    className={inputCls}
                  />
                  {mSpecs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setMSpecs(mSpecs.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <label className="block text-sm font-medium">
              Açıklama
              <textarea
                rows={2}
                value={mDesc}
                onChange={e => setMDesc(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModelModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                İptal
              </button>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                Kaydet
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tedarikçi Ekle Modalı */}
      {supModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={createSupplier}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Yeni Tedarikçi Firma Ekle</h2>
              <button type="button" onClick={() => setSupModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <label className="block text-sm font-medium">
              Firma Adı *
              <input
                required
                value={sName}
                onChange={e => setSName(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>
            <label className="block text-sm font-medium">
              İlgili Kişi
              <input
                value={sContact}
                onChange={e => setSContact(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Vergi No
                <input value={sTax} onChange={e => setSTax(e.target.value)} className={inputCls + ' mt-1'} />
              </label>
              <label className="block text-sm font-medium">
                Telefon
                <input
                  value={sPhone}
                  onChange={e => setSPhone(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
            </div>
            <label className="block text-sm font-medium">
              E-posta
              <input
                type="email"
                value={sEmail}
                onChange={e => setSEmail(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSupModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                İptal
              </button>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                Kaydet
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
