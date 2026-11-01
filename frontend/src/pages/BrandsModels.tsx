import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, Building, Cpu, Edit3, Loader2, Plus, Trash2, X } from 'lucide-react'
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
  const [editingBrand, setEditingBrand] = useState<BrandItem | null>(null)
  const [bName, setBName] = useState('')
  const [bCountry, setBCountry] = useState('')
  const [bWeb, setBWeb] = useState('')
  const [bDesc, setBDesc] = useState('')

  const [modelModal, setModelModal] = useState(false)
  const [editingModel, setEditingModel] = useState<ModelItem | null>(null)
  const [mBrandId, setMBrandId] = useState('')
  const [mName, setMName] = useState('')
  const [mDesc, setMDesc] = useState('')
  const [mSpecs, setMSpecs] = useState<{ k: string; v: string }[]>([{ k: '', v: '' }])

  const [supModal, setSupModal] = useState(false)
  const [editingSup, setEditingSup] = useState<SupplierItem | null>(null)
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

  const openBrandCreate = () => {
    setEditingBrand(null)
    setBName('')
    setBCountry('')
    setBWeb('')
    setBDesc('')
    setBrandModal(true)
  }

  const openBrandEdit = (b: BrandItem) => {
    setEditingBrand(b)
    setBName(b.name)
    setBCountry(b.country || '')
    setBWeb(b.website || '')
    setBDesc(b.description || '')
    setBrandModal(true)
  }

  const saveBrand = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        name: bName,
        country: bCountry || null,
        website: bWeb || null,
        description: bDesc || null,
      }
      if (editingBrand) {
        await api(`/brands/${editingBrand.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        toast.success('Marka güncellendi.')
      } else {
        await api('/brands', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        toast.success('Marka eklendi.')
      }
      qc.invalidateQueries({ queryKey: ['brands'] })
      qc.invalidateQueries({ queryKey: ['models'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      setBrandModal(false)
      setEditingBrand(null)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const deleteBrand = async (b: BrandItem) => {
    if (!window.confirm(`"${b.name}" markasını silmek istediğinize emin misiniz?`)) return
    try {
      await api(`/brands/${b.id}`, { method: 'DELETE' })
      toast.success('Marka silindi.')
      qc.invalidateQueries({ queryKey: ['brands'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const openModelCreate = () => {
    if (!brands.length) {
      toast.error('Önce en az bir marka ekleyin.')
      return
    }
    setEditingModel(null)
    setMBrandId(brands[0].id)
    setMName('')
    setMDesc('')
    setMSpecs([{ k: '', v: '' }])
    setModelModal(true)
  }

  const openModelEdit = (m: ModelItem) => {
    setEditingModel(m)
    setMBrandId(m.brand_id)
    setMName(m.name)
    setMDesc(m.description || '')
    const entries = m.specs ? Object.entries(m.specs).map(([k, v]) => ({ k, v })) : []
    setMSpecs(entries.length ? entries : [{ k: '', v: '' }])
    setModelModal(true)
  }

  const saveModel = async (e: FormEvent) => {
    e.preventDefault()
    const specsObj: Record<string, string> = {}
    mSpecs.forEach(pair => {
      if (pair.k.trim() && pair.v.trim()) specsObj[pair.k.trim()] = pair.v.trim()
    })
    try {
      const payload = {
        brand_id: mBrandId,
        name: mName,
        description: mDesc || null,
        specs: Object.keys(specsObj).length ? specsObj : null,
      }
      if (editingModel) {
        await api(`/models/${editingModel.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        toast.success('Model güncellendi.')
      } else {
        await api('/models', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        toast.success('Model eklendi.')
      }
      qc.invalidateQueries({ queryKey: ['models'] })
      qc.invalidateQueries({ queryKey: ['brands'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      setModelModal(false)
      setEditingModel(null)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const deleteModel = async (m: ModelItem) => {
    if (!window.confirm(`"${m.name}" modelini silmek istediğinize emin misiniz?`)) return
    try {
      await api(`/models/${m.id}`, { method: 'DELETE' })
      toast.success('Model silindi.')
      qc.invalidateQueries({ queryKey: ['models'] })
      qc.invalidateQueries({ queryKey: ['brands'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const openSupCreate = () => {
    setEditingSup(null)
    setSName('')
    setSContact('')
    setSTax('')
    setSPhone('')
    setSEmail('')
    setSupModal(true)
  }

  const openSupEdit = (s: SupplierItem) => {
    setEditingSup(s)
    setSName(s.name)
    setSContact(s.contact_person || '')
    setSTax(s.tax_no || '')
    setSPhone(s.phone || '')
    setSEmail(s.email || '')
    setSupModal(true)
  }

  const saveSupplier = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        name: sName,
        contact_person: sContact || null,
        tax_no: sTax || null,
        phone: sPhone || null,
        email: sEmail || null,
      }
      if (editingSup) {
        await api(`/suppliers/${editingSup.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        toast.success('Tedarikçi güncellendi.')
      } else {
        await api('/suppliers', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        toast.success('Tedarikçi eklendi.')
      }
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      setSupModal(false)
      setEditingSup(null)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const deleteSupplier = async (s: SupplierItem) => {
    if (!window.confirm(`"${s.name}" tedarikçisini silmek istediğinize emin misiniz?`)) return
    try {
      await api(`/suppliers/${s.id}`, { method: 'DELETE' })
      toast.success('Tedarikçi silindi.')
      qc.invalidateQueries({ queryKey: ['suppliers'] })
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
                onClick={openBrandCreate}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Plus className="h-4 w-4" /> Yeni Marka
              </button>
              <button
                onClick={openModelCreate}
                className="flex items-center gap-1.5 rounded-lg border border-brand-600 px-3.5 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50 dark:text-indigo-400 dark:hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" /> Yeni Model
              </button>
            </>
          )}
          {can('product.create') && (
            <button
              onClick={openSupCreate}
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
                  <th className="p-3.5 text-right">İşlem</th>
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
                    <td className="p-3.5 text-right">
                      {can('brand.manage') && (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openBrandEdit(b)}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Düzenle
                          </button>
                          <button
                            onClick={() => deleteBrand(b)}
                            className="inline-flex items-center rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50 dark:border-rose-900/50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
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
                  <th className="p-3.5 text-right">İşlem</th>
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
                    <td className="p-3.5 text-right">
                      {can('brand.manage') && (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openModelEdit(m)}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Düzenle
                          </button>
                          <button
                            onClick={() => deleteModel(m)}
                            className="inline-flex items-center rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50 dark:border-rose-900/50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
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
                  <th className="p-3.5 text-right">İşlem</th>
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
                    <td className="p-3.5 text-right">
                      {can('product.update') && (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openSupEdit(s)}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Düzenle
                          </button>
                          <button
                            onClick={() => deleteSupplier(s)}
                            className="inline-flex items-center rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50 dark:border-rose-900/50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Marka Ekle / Düzenle Modalı */}
      {brandModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={saveBrand}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingBrand ? 'Markayı Düzenle' : 'Yeni Marka Ekle'}</h2>
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

      {/* Model Ekle / Düzenle Modalı */}
      {modelModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={saveModel}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingModel ? 'Modeli Düzenle' : 'Yeni Model Ekle'}</h2>
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

      {/* Tedarikçi Ekle / Düzenle Modalı */}
      {supModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={saveSupplier}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingSup ? 'Tedarikçiyi Düzenle' : 'Yeni Tedarikçi Firma Ekle'}</h2>
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
