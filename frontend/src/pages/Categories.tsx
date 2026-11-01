import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit2, Loader2, Plus, Search, Tags, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export interface CategoryItem {
  id: string
  name: string
  code: string
  parent_id: string | null
  tracking_type: 'serial' | 'quantity'
  description: string | null
  is_active: boolean
  product_count: number
}

export default function CategoriesPage() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [openModal, setOpenModal] = useState(false)
  const [editing, setEditing] = useState<CategoryItem | null>(null)

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [parentId, setParentId] = useState('')
  const [trackingType, setTrackingType] = useState<'serial' | 'quantity'>('serial')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: () => api<CategoryItem[]>('/categories?include_inactive=true'),
  })

  const openCreate = () => {
    setEditing(null)
    setName('')
    setCode('')
    setParentId('')
    setTrackingType('serial')
    setDescription('')
    setOpenModal(true)
  }

  const openEdit = (c: CategoryItem) => {
    setEditing(c)
    setName(c.name)
    setCode(c.code)
    setParentId(c.parent_id || '')
    setTrackingType(c.tracking_type)
    setDescription(c.description || '')
    setOpenModal(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (editing) {
        await api(`/categories/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name,
            parent_id: parentId || null,
            tracking_type: trackingType,
            description: description || null,
          }),
        })
        toast.success('Kategori güncellendi.')
      } else {
        await api('/categories', {
          method: 'POST',
          body: JSON.stringify({
            name,
            code: code.toUpperCase(),
            parent_id: parentId || null,
            tracking_type: trackingType,
            description: description || null,
          }),
        })
        toast.success('Yeni kategori oluşturuldu.')
      }
      qc.invalidateQueries({ queryKey: ['categories'] })
      setOpenModal(false)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (c: CategoryItem) => {
    try {
      await api(`/categories/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !c.is_active }),
      })
      qc.invalidateQueries({ queryKey: ['categories'] })
      toast.success('Kategori durumu güncellendi.')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const filtered = categories.filter(
    c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase()),
  )

  const parentName = (pid: string | null) =>
    pid ? categories.find(x => x.id === pid)?.name || '—' : 'Ana Kategori'

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kategoriler</h1>
          <p className="text-sm text-slate-500">
            Ekipman, sarf malzemesi ve teknik varlık kategorileri ({categories.length} kayıt)
          </p>
        </div>
        {can('category.manage') && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Yeni Kategori
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Kategori adı veya kodu ile ara..."
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {isLoading ? (
          <div className="grid place-items-center p-12">
            <Loader2 className="animate-spin text-brand-600" />
          </div>
        ) : !filtered.length ? (
          <div className="p-12 text-center text-slate-500">
            <Tags className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            Kategori bulunamadı.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
              <tr>
                <th className="p-3.5">Kod</th>
                <th className="p-3.5">Kategori Adı</th>
                <th className="p-3.5">Üst Kategori</th>
                <th className="p-3.5">Varsayılan Takip Modeli</th>
                <th className="p-3.5">Ürün Sayısı</th>
                <th className="p-3.5">Durum</th>
                <th className="p-3.5 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/40">
                  <td className="p-3.5 font-mono text-xs font-semibold text-brand-600 dark:text-indigo-400">
                    {c.code}
                  </td>
                  <td className="p-3.5 font-medium">{c.name}</td>
                  <td className="p-3.5 text-slate-500">{parentName(c.parent_id)}</td>
                  <td className="p-3.5">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        c.tracking_type === 'serial'
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      }`}
                    >
                      {c.tracking_type === 'serial' ? 'Seri Numarası Bazlı' : 'Adet / Miktar Bazlı'}
                    </span>
                  </td>
                  <td className="p-3.5 font-semibold">{c.product_count}</td>
                  <td className="p-3.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                        c.is_active
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                      }`}
                    >
                      {c.is_active ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    {can('category.manage') && (
                      <div className="inline-flex items-center gap-3">
                        <button
                          onClick={() => openEdit(c)}
                          className="text-slate-500 hover:text-brand-600"
                          title="Düzenle"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleActive(c)}
                          className="text-xs font-medium text-brand-600 hover:underline"
                        >
                          {c.is_active ? 'Pasifleştir' : 'Aktifleştir'}
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

      {/* Modal */}
      {openModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {editing ? 'Kategoriyi Düzenle' : 'Yeni Kategori Oluştur'}
              </h2>
              <button type="button" onClick={() => setOpenModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {!editing && (
              <label className="block text-sm font-medium">
                Kategori Kodu (Örn: PRJ, LED, CBL)
                <input
                  required
                  pattern="^[A-Za-z0-9_-]{2,50}$"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  className={inputCls + ' mt-1 uppercase'}
                  placeholder="PRJ"
                />
              </label>
            )}

            <label className="block text-sm font-medium">
              Kategori Adı
              <input
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className={inputCls + ' mt-1'}
                placeholder="Projeksiyon Cihazları"
              />
            </label>

            <label className="block text-sm font-medium">
              Üst Kategori (Alt kategori ise seçin)
              <select
                value={parentId}
                onChange={e => setParentId(e.target.value)}
                className={inputCls + ' mt-1'}
              >
                <option value="">— Ana Kategori —</option>
                {categories
                  .filter(x => !editing || x.id !== editing.id)
                  .map(x => (
                    <option key={x.id} value={x.id}>
                      {x.name} ({x.code})
                    </option>
                  ))}
              </select>
            </label>

            <label className="block text-sm font-medium">
              Varsayılan Takip Modeli
              <select
                value={trackingType}
                onChange={e => setTrackingType(e.target.value as 'serial' | 'quantity')}
                className={inputCls + ' mt-1'}
              >
                <option value="serial">Seri Numarası Bazlı Varlık (Projektör, PC, Medya Sunucusu)</option>
                <option value="quantity">Adet / Metre Bazlı Ürün (Kablo, Adaptör, Sarf)</option>
              </select>
            </label>

            <label className="block text-sm font-medium">
              Açıklama
              <textarea
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                İptal
              </button>
              <button
                disabled={busy}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                Kaydet
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
