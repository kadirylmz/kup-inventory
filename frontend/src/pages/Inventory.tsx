import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Camera,
  Cpu,
  Eye,
  FileText,
  Image as ImageIcon,
  Layers,
  Loader2,
  Package,
  Plus,
  QrCode,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { CategoryItem } from '@/pages/Categories'
import type { BrandItem, ModelItem, SupplierItem } from '@/pages/BrandsModels'

export interface ProductItem {
  id: string
  inventory_code: string
  name: string
  category_id: string
  category_name: string
  subcategory_id: string | null
  subcategory_name: string | null
  brand_id: string | null
  brand_name: string | null
  model_id: string | null
  model_name: string | null
  tracking_type: 'serial' | 'quantity'
  unit: string
  barcode: string | null
  description: string | null
  attributes: { key: string; value: string }[]
  min_stock: string
  quantity: string
  serial_asset_count: number
  purchase_date: string | null
  purchase_price: string | null
  purchase_currency: 'TRY' | 'EUR' | 'USD'
  vat_rate: string
  supplier_id: string | null
  supplier_name: string | null
  invoice_no: string | null
  warranty_start: string | null
  warranty_end: string | null
  current_market_value: string | null
  market_value_currency: 'TRY' | 'EUR' | 'USD'
  last_valuation_date: string | null
  status: string
  warehouse_name: string | null
  shelf_section: string | null
  location_detail: string | null
  internal_notes: string | null
  primary_image_url: string | null
  is_active: boolean
}

export interface AssetItem {
  id: string
  product_id: string
  product_name: string
  brand_name: string | null
  model_name: string | null
  category_name: string
  inventory_code: string
  serial_number: string
  barcode: string | null
  qr_token: string
  status: string
  condition: string
  warehouse_name: string | null
  shelf_section: string | null
  location_detail: string | null
  purchase_date: string | null
  purchase_price: string | null
  purchase_currency: string
  current_market_value: string | null
  market_value_currency: string
  warranty_end: string | null
  primary_image_url: string | null
  notes: string | null
}

interface ImageRecord {
  id: string
  file_id: string
  url: string
  original_name: string
  caption: string | null
  is_primary: boolean
}

interface DocumentRecord {
  id: string
  file_id: string
  url: string
  original_name: string
  doc_type: string
  title: string
  size_bytes: number
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  in_warehouse: { label: 'Depoda', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  active: { label: 'Aktif', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  in_project: { label: 'Projede', cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
  assigned: { label: 'Zimmette', cls: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300' },
  faulty: { label: 'Arızalı', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  in_service: { label: 'Serviste', cls: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  scrapped: { label: 'Hurda', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  passive: { label: 'Pasif', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
}

const SYM: Record<string, string> = { TRY: '₺', EUR: '€', USD: '$' }

export default function InventoryPage() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()

  const [tab, setTab] = useState<'products' | 'assets'>('products')
  const [q, setQ] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [trackFilter, setTrackFilter] = useState('')

  const [openCreate, setOpenCreate] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null)
  const [bulkSerialText, setBulkSerialText] = useState('')
  const [qrModalAsset, setQrModalAsset] = useState<AssetItem | null>(null)

  // Yeni Ürün Form State
  const [fName, setFName] = useState('')
  const [fCode, setFCode] = useState('')
  const [fCatId, setFCatId] = useState('')
  const [fSubCatId, setFSubCatId] = useState('')
  const [fBrandId, setFBrandId] = useState('')
  const [fModelId, setFModelId] = useState('')
  const [fTracking, setFTracking] = useState<'serial' | 'quantity'>('serial')
  const [fUnit, setFUnit] = useState('Adet')
  const [fBarcode, setFBarcode] = useState('')
  const [fQty, setFQty] = useState('1')
  const [fMinStock, setFMinStock] = useState('0')
  const [fPurchaseDate, setFPurchaseDate] = useState('')
  const [fPurchasePrice, setFPurchasePrice] = useState('')
  const [fPurchaseCurr, setFPurchaseCurr] = useState<'TRY' | 'EUR' | 'USD'>('TRY')
  const [fVat, setFVat] = useState('20')
  const [fSupplierId, setFSupplierId] = useState('')
  const [fInvoice, setFInvoice] = useState('')
  const [fWarStart, setFWarStart] = useState('')
  const [fWarEnd, setFWarEnd] = useState('')
  const [fMarketVal, setFMarketVal] = useState('')
  const [fMarketCurr, setFMarketCurr] = useState<'TRY' | 'EUR' | 'USD'>('TRY')
  const [fStatus, setFStatus] = useState('in_warehouse')
  const [fWarehouse, setFWarehouse] = useState('Merkez Depo')
  const [fShelf, setFShelf] = useState('')
  const [fLocation, setFLocation] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fNotes, setFNotes] = useState('')
  const [fAttrs, setFAttrs] = useState<{ key: string; value: string }[]>([{ key: '', value: '' }])
  const [fSerialsText, setFSerialsText] = useState('')
  const [saving, setSaving] = useState(false)

  // Veri Sorguları
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<CategoryItem[]>('/categories'),
  })
  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: () => api<BrandItem[]>('/brands'),
  })
  const { data: models = [] } = useQuery({
    queryKey: ['models'],
    queryFn: () => api<ModelItem[]>('/models'),
  })
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api<SupplierItem[]>('/suppliers'),
  })

  const prodParams = new URLSearchParams()
  if (q) prodParams.set('q', q)
  if (catFilter) prodParams.set('category_id', catFilter)
  if (brandFilter) prodParams.set('brand_id', brandFilter)
  if (trackFilter) prodParams.set('tracking_type', trackFilter)
  if (statusFilter) prodParams.set('status', statusFilter)

  const { data: products = [], isLoading: pLoading } = useQuery({
    queryKey: ['products', prodParams.toString()],
    queryFn: () => api<ProductItem[]>(`/products?${prodParams.toString()}`),
  })

  const assetParams = new URLSearchParams()
  if (q) assetParams.set('q', q)
  if (statusFilter) assetParams.set('status', statusFilter)

  const { data: assets = [], isLoading: aLoading } = useQuery({
    queryKey: ['assets', assetParams.toString()],
    queryFn: () => api<AssetItem[]>(`/assets?${assetParams.toString()}`),
  })

  // Seçili ürün detay sorguları
  const { data: prodAssets = [] } = useQuery({
    queryKey: ['product-assets', selectedProduct?.id],
    queryFn: () => api<AssetItem[]>(`/assets?product_id=${selectedProduct!.id}`),
    enabled: !!selectedProduct,
  })
  const { data: prodImages = [] } = useQuery({
    queryKey: ['product-images', selectedProduct?.id],
    queryFn: () => api<ImageRecord[]>(`/products/${selectedProduct!.id}/images`),
    enabled: !!selectedProduct,
  })
  const { data: prodDocs = [] } = useQuery({
    queryKey: ['product-docs', selectedProduct?.id],
    queryFn: () => api<DocumentRecord[]>(`/products/${selectedProduct!.id}/documents`),
    enabled: !!selectedProduct,
  })

  const openNewModal = () => {
    const firstCat = categories[0]
    setFName('')
    setFCode('')
    setFCatId(firstCat?.id || '')
    setFSubCatId('')
    setFBrandId('')
    setFModelId('')
    setFTracking(firstCat?.tracking_type || 'serial')
    setFUnit(firstCat?.tracking_type === 'quantity' ? 'Metre' : 'Adet')
    setFBarcode('')
    setFQty('1')
    setFMinStock('0')
    setFPurchaseDate('')
    setFPurchasePrice('')
    setFPurchaseCurr('TRY')
    setFVat('20')
    setFSupplierId('')
    setFInvoice('')
    setFWarStart('')
    setFWarEnd('')
    setFMarketVal('')
    setFMarketCurr('TRY')
    setFStatus('in_warehouse')
    setFWarehouse('Merkez Depo')
    setFShelf('')
    setFLocation('')
    setFDesc('')
    setFNotes('')
    setFAttrs([{ key: '', value: '' }])
    setFSerialsText('')
    setOpenCreate(true)
  }

  const submitProduct = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const serials =
        fTracking === 'serial'
          ? fSerialsText
              .split(/[\n,;]+/)
              .map(s => s.trim())
              .filter(Boolean)
          : []

      const cleanAttrs = fAttrs.filter(a => a.key.trim() && a.value.trim())

      await api('/products', {
        method: 'POST',
        body: JSON.stringify({
          inventory_code: fCode.trim() || null,
          name: fName.trim(),
          category_id: fCatId,
          subcategory_id: fSubCatId || null,
          brand_id: fBrandId || null,
          model_id: fModelId || null,
          tracking_type: fTracking,
          unit: fUnit,
          barcode: fBarcode || null,
          description: fDesc || null,
          attributes: cleanAttrs,
          min_stock: fMinStock || '0',
          quantity: fTracking === 'quantity' ? fQty || '0' : String(serials.length),
          purchase_date: fPurchaseDate || null,
          purchase_price: fPurchasePrice ? fPurchasePrice : null,
          purchase_currency: fPurchaseCurr,
          vat_rate: fVat || '20',
          supplier_id: fSupplierId || null,
          invoice_no: fInvoice || null,
          warranty_start: fWarStart || null,
          warranty_end: fWarEnd || null,
          current_market_value: fMarketVal ? fMarketVal : null,
          market_value_currency: fMarketCurr,
          status: fStatus,
          warehouse_name: fWarehouse || null,
          shelf_section: fShelf || null,
          location_detail: fLocation || null,
          internal_notes: fNotes || null,
          initial_serial_numbers: serials,
        }),
      })
      toast.success('Ürün ve varlık kayıtları oluşturuldu.')
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['inventory-summary'] })
      setOpenCreate(false)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleUploadImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedProduct) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('is_primary', prodImages.length === 0 ? 'true' : 'false')
    try {
      await api(`/products/${selectedProduct.id}/images`, { method: 'POST', body: fd })
      toast.success('Ürün fotoğrafı yüklendi.')
      qc.invalidateQueries({ queryKey: ['product-images', selectedProduct.id] })
      qc.invalidateQueries({ queryKey: ['products'] })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      e.target.value = ''
    }
  }

  const handleUploadDoc = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedProduct) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('title', file.name)
    fd.append('doc_type', 'invoice')
    try {
      await api(`/products/${selectedProduct.id}/documents`, { method: 'POST', body: fd })
      toast.success('Belge yüklendi.')
      qc.invalidateQueries({ queryKey: ['product-docs', selectedProduct.id] })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      e.target.value = ''
    }
  }

  const handleBulkAddSerials = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedProduct) return
    const serials = bulkSerialText
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(Boolean)
    if (!serials.length) {
      toast.error('En az bir seri numarası girin.')
      return
    }
    try {
      await api('/assets/bulk', {
        method: 'POST',
        body: JSON.stringify({
          product_id: selectedProduct.id,
          serial_numbers: serials,
          warehouse_name: selectedProduct.warehouse_name,
          shelf_section: selectedProduct.shelf_section,
        }),
      })
      toast.success(`${serials.length} adet seri numaralı cihaz eklendi.`)
      setBulkSerialText('')
      qc.invalidateQueries({ queryKey: ['product-assets', selectedProduct.id] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['inventory-summary'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const updateAssetStatus = async (asset: AssetItem, newStatus: string) => {
    try {
      await api(`/assets/${asset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      toast.success(`${asset.serial_number} durumu güncellendi.`)
      qc.invalidateQueries({ queryKey: ['assets'] })
      if (selectedProduct) qc.invalidateQueries({ queryKey: ['product-assets', selectedProduct.id] })
      qc.invalidateQueries({ queryKey: ['inventory-summary'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800'

  const filteredModels = fBrandId ? models.filter(m => m.brand_id === fBrandId) : models

  return (
    <div className="space-y-5">
      {/* Üst Başlık */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Envanter ve Varlık Yönetimi</h1>
          <p className="text-sm text-slate-500">
            Ürün katalog kartları, adet bazlı sarf malzemeleri ve seri numarası bazlı tekil cihazlar
          </p>
        </div>
        {can('product.create') && (
          <button
            onClick={openNewModal}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Yeni Ürün / Cihaz Kaydı
          </button>
        )}
      </div>

      {/* Sekmeler */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setTab('products')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            tab === 'products'
              ? 'border-brand-600 text-brand-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Package className="h-4 w-4" /> Ürün Kataloğu & Miktarlar ({products.length})
        </button>
        <button
          onClick={() => setTab('assets')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            tab === 'assets'
              ? 'border-brand-600 text-brand-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Cpu className="h-4 w-4" /> Seri Numaralı Cihazlar ({assets.length})
        </button>
      </div>

      {/* Gelişmiş Filtre Çubuğu */}
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:grid-cols-2 lg:grid-cols-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 lg:col-span-2 dark:border-slate-700">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Envanter kodu, ürün adı, seri no veya barkod ara..."
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        {tab === 'products' && (
          <>
            <select
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
              className={inputCls}
            >
              <option value="">Tüm Kategoriler</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={brandFilter}
              onChange={e => setBrandFilter(e.target.value)}
              className={inputCls}
            >
              <option value="">Tüm Markalar</option>
              {brands.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select
              value={trackFilter}
              onChange={e => setTrackFilter(e.target.value)}
              className={inputCls}
            >
              <option value="">Tüm Takip Modelleri</option>
              <option value="serial">Seri Numarası Bazlı</option>
              <option value="quantity">Adet / Miktar Bazlı</option>
            </select>
          </>
        )}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className={inputCls}
        >
          <option value="">Tüm Durumlar</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* TAB 1: ÜRÜNLER TABLOSU */}
      {tab === 'products' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {pLoading ? (
            <div className="grid place-items-center p-12">
              <Loader2 className="animate-spin text-brand-600" />
            </div>
          ) : !products.length ? (
            <div className="p-14 text-center text-slate-500">
              <Package className="mx-auto mb-3 h-10 w-10 text-slate-400" />
              <p className="font-medium">Kayıtlı ürün bulunamadı.</p>
              <p className="mt-1 text-xs">Sağ üstteki "Yeni Ürün / Cihaz Kaydı" butonundan ilk ürününüzü ekleyebilirsiniz.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                  <tr>
                    <th className="p-3.5">Görsel</th>
                    <th className="p-3.5">Envanter Kodu</th>
                    <th className="p-3.5">Ürün Adı / Marka-Model</th>
                    <th className="p-3.5">Kategori</th>
                    <th className="p-3.5">Takip / Miktar</th>
                    <th className="p-3.5">Birim Alış</th>
                    <th className="p-3.5">Piyasa Değeri</th>
                    <th className="p-3.5">Konum</th>
                    <th className="p-3.5">Durum</th>
                    <th className="p-3.5 text-right">Detay</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => {
                    const st = STATUS_LABELS[p.status] || { label: p.status, cls: 'bg-slate-100' }
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedProduct(p)}
                        className="cursor-pointer border-t border-slate-100 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/40"
                      >
                        <td className="p-3.5">
                          {p.primary_image_url ? (
                            <img
                              src={p.primary_image_url}
                              alt={p.name}
                              className="h-10 w-10 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                            />
                          ) : (
                            <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800">
                              <ImageIcon className="h-4 w-4" />
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 font-mono text-xs font-semibold text-brand-600 dark:text-indigo-400">
                          {p.inventory_code}
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold">{p.name}</div>
                          <div className="text-xs text-slate-500">
                            {[p.brand_name, p.model_name].filter(Boolean).join(' • ') || '—'}
                          </div>
                        </td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-300">{p.category_name}</td>
                        <td className="p-3.5">
                          {p.tracking_type === 'serial' ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                              <Layers className="h-3 w-3" /> {p.serial_asset_count} Seri Cihaz
                            </span>
                          ) : (
                            <span className="font-semibold">
                              {Number(p.quantity).toLocaleString('tr-TR')} {p.unit}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 font-medium">
                          {p.purchase_price
                            ? `${Number(p.purchase_price).toLocaleString('tr-TR')} ${SYM[p.purchase_currency] || p.purchase_currency}`
                            : '—'}
                        </td>
                        <td className="p-3.5 font-medium text-emerald-600 dark:text-emerald-400">
                          {p.current_market_value
                            ? `${Number(p.current_market_value).toLocaleString('tr-TR')} ${SYM[p.market_value_currency] || p.market_value_currency}`
                            : '—'}
                        </td>
                        <td className="p-3.5 text-xs text-slate-500">
                          {[p.warehouse_name, p.shelf_section].filter(Boolean).join(' / ') || '—'}
                        </td>
                        <td className="p-3.5">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              setSelectedProduct(p)
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                          >
                            <Eye className="h-3.5 w-3.5" /> İncele
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SERİ NUMARALI TEKİL VARLIKLAR (ASSETS) */}
      {tab === 'assets' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {aLoading ? (
            <div className="grid place-items-center p-12">
              <Loader2 className="animate-spin text-brand-600" />
            </div>
          ) : !assets.length ? (
            <div className="p-14 text-center text-slate-500">
              <Cpu className="mx-auto mb-3 h-10 w-10 text-slate-400" />
              Henüz seri numaralı fiziksel varlık kaydı bulunmuyor.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                  <tr>
                    <th className="p-3.5">Envanter Kodu</th>
                    <th className="p-3.5">Seri Numarası</th>
                    <th className="p-3.5">Ürün / Marka-Model</th>
                    <th className="p-3.5">Depo / Raf</th>
                    <th className="p-3.5">Alış Maliyeti</th>
                    <th className="p-3.5">Piyasa Değeri</th>
                    <th className="p-3.5">Durum</th>
                    <th className="p-3.5 text-right">QR Etiket</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map(a => {
                    const st = STATUS_LABELS[a.status] || { label: a.status, cls: 'bg-slate-100' }
                    return (
                      <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="p-3.5 font-mono text-xs font-semibold text-brand-600 dark:text-indigo-400">
                          {a.inventory_code}
                        </td>
                        <td className="p-3.5 font-mono font-bold">{a.serial_number}</td>
                        <td className="p-3.5">
                          <div className="font-medium">{a.product_name}</div>
                          <div className="text-xs text-slate-500">
                            {[a.brand_name, a.model_name].filter(Boolean).join(' • ') || a.category_name}
                          </div>
                        </td>
                        <td className="p-3.5 text-xs text-slate-500">
                          {[a.warehouse_name, a.shelf_section].filter(Boolean).join(' / ') || '—'}
                        </td>
                        <td className="p-3.5">
                          {a.purchase_price
                            ? `${Number(a.purchase_price).toLocaleString('tr-TR')} ${SYM[a.purchase_currency] || a.purchase_currency}`
                            : '—'}
                        </td>
                        <td className="p-3.5 text-emerald-600 dark:text-emerald-400">
                          {a.current_market_value
                            ? `${Number(a.current_market_value).toLocaleString('tr-TR')} ${SYM[a.market_value_currency] || a.market_value_currency}`
                            : '—'}
                        </td>
                        <td className="p-3.5">
                          {can('product.update') ? (
                            <select
                              value={a.status}
                              onChange={e => updateAssetStatus(a, e.target.value)}
                              className={`rounded-full px-2.5 py-1 text-xs font-medium outline-none ${st.cls}`}
                            >
                              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>
                              {st.label}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right">
                          <button
                            onClick={() => setQrModalAsset(a)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                          >
                            <QrCode className="h-3.5 w-3.5" /> QR Kod
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* YENİ ÜRÜN EKLEME MODALI */}
      {openCreate && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <div className="mx-auto my-6 max-w-4xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-bold">Yeni Ürün / Envanter Kartı Oluştur</h2>
                <p className="text-xs text-slate-500">
                  Ürün katalog bilgilerini, alış maliyetini, piyasa değerini ve seri numaralarını tanımlayın
                </p>
              </div>
              <button type="button" onClick={() => setOpenCreate(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={submitProduct} className="mt-5 space-y-6">
              {/* Bölüm 1: Temel Kimlik ve Kategori */}
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-sm font-medium sm:col-span-2">
                  Ürün Adı *
                  <input
                    required
                    value={fName}
                    onChange={e => setFName(e.target.value)}
                    className={inputCls + ' mt-1'}
                    placeholder="Örn: Panasonic PT-RZ690B Lazer Projektör veya CAT6 S/FTP Kablo"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Envanter Kodu (Boşsa otomatik)
                  <input
                    value={fCode}
                    onChange={e => setFCode(e.target.value.toUpperCase())}
                    className={inputCls + ' mt-1 font-mono uppercase'}
                    placeholder="Otomatik: KUP-PRJ-0001"
                  />
                </label>

                <label className="block text-sm font-medium">
                  Ana Kategori *
                  <select
                    required
                    value={fCatId}
                    onChange={e => {
                      const cid = e.target.value
                      setFCatId(cid)
                      const c = categories.find(x => x.id === cid)
                      if (c) {
                        setFTracking(c.tracking_type)
                        setFUnit(c.tracking_type === 'quantity' ? 'Metre' : 'Adet')
                      }
                    }}
                    className={inputCls + ' mt-1'}
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium">
                  Marka
                  <select
                    value={fBrandId}
                    onChange={e => {
                      setFBrandId(e.target.value)
                      setFModelId('')
                    }}
                    className={inputCls + ' mt-1'}
                  >
                    <option value="">— Marka Seçin —</option>
                    {brands.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium">
                  Model
                  <select
                    value={fModelId}
                    onChange={e => setFModelId(e.target.value)}
                    className={inputCls + ' mt-1'}
                  >
                    <option value="">— Model Seçin —</option>
                    {filteredModels.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.brand_name ? `${m.brand_name} - ${m.name}` : m.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Bölüm 2: Takip Modeli ve Miktar */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="grid gap-4 sm:grid-cols-4">
                  <label className="block text-sm font-medium sm:col-span-2">
                    Takip Modeli *
                    <select
                      value={fTracking}
                      onChange={e => setFTracking(e.target.value as 'serial' | 'quantity')}
                      className={inputCls + ' mt-1'}
                    >
                      <option value="serial">Seri Numarası Bazlı Tekil Cihaz Takibi</option>
                      <option value="quantity">Adet / Metre / Miktar Bazlı Stok Takibi</option>
                    </select>
                  </label>

                  <label className="block text-sm font-medium">
                    Birim *
                    <select value={fUnit} onChange={e => setFUnit(e.target.value)} className={inputCls + ' mt-1'}>
                      <option value="Adet">Adet</option>
                      <option value="Metre">Metre</option>
                      <option value="Set">Set</option>
                      <option value="Paket">Paket</option>
                      <option value="Kutu">Kutu</option>
                    </select>
                  </label>

                  <label className="block text-sm font-medium">
                    Barkod
                    <input
                      value={fBarcode}
                      onChange={e => setFBarcode(e.target.value)}
                      className={inputCls + ' mt-1'}
                      placeholder="EAN / Barkod"
                    />
                  </label>
                </div>

                {fTracking === 'quantity' ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-medium">
                      Başlangıç Miktarı ({fUnit}) *
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={fQty}
                        onChange={e => setFQty(e.target.value)}
                        className={inputCls + ' mt-1'}
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      Kritik Stok Uyarı Seviyesi
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={fMinStock}
                        onChange={e => setFMinStock(e.target.value)}
                        className={inputCls + ' mt-1'}
                      />
                    </label>
                  </div>
                ) : (
                  <label className="mt-4 block text-sm font-medium">
                    Cihaz Seri Numaraları (Her satıra veya virgülle ayırarak birden fazla seri no girebilirsiniz)
                    <textarea
                      rows={3}
                      value={fSerialsText}
                      onChange={e => setFSerialsText(e.target.value)}
                      className={inputCls + ' mt-1 font-mono'}
                      placeholder={'SN001\nSN002\nSN003'}
                    />
                  </label>
                )}
              </div>

              {/* Bölüm 3: Alış Maliyeti, Garanti ve Piyasa Değerlemesi */}
              <div className="grid gap-4 sm:grid-cols-4">
                <label className="block text-sm font-medium">
                  Birim Alış Fiyatı
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={fPurchasePrice}
                    onChange={e => setFPurchasePrice(e.target.value)}
                    className={inputCls + ' mt-1'}
                    placeholder="0.00"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Alış Para Birimi
                  <select
                    value={fPurchaseCurr}
                    onChange={e => setFPurchaseCurr(e.target.value as 'TRY' | 'EUR' | 'USD')}
                    className={inputCls + ' mt-1'}
                  >
                    <option value="TRY">TL (₺)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  KDV Oranı (%)
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={fVat}
                    onChange={e => setFVat(e.target.value)}
                    className={inputCls + ' mt-1'}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Alış Tarihi
                  <input
                    type="date"
                    value={fPurchaseDate}
                    onChange={e => setFPurchaseDate(e.target.value)}
                    className={inputCls + ' mt-1'}
                  />
                </label>

                <label className="block text-sm font-medium">
                  Güncel 2. El Piyasa Değeri
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={fMarketVal}
                    onChange={e => setFMarketVal(e.target.value)}
                    className={inputCls + ' mt-1'}
                    placeholder="0.00"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Piyasa Değeri Para Birimi
                  <select
                    value={fMarketCurr}
                    onChange={e => setFMarketCurr(e.target.value as 'TRY' | 'EUR' | 'USD')}
                    className={inputCls + ' mt-1'}
                  >
                    <option value="TRY">TL (₺)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Tedarikçi Firma
                  <select
                    value={fSupplierId}
                    onChange={e => setFSupplierId(e.target.value)}
                    className={inputCls + ' mt-1'}
                  >
                    <option value="">— Seçin —</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Fatura Numarası
                  <input
                    value={fInvoice}
                    onChange={e => setFInvoice(e.target.value)}
                    className={inputCls + ' mt-1'}
                  />
                </label>

                <label className="block text-sm font-medium">
                  Garanti Başlangıcı
                  <input
                    type="date"
                    value={fWarStart}
                    onChange={e => setFWarStart(e.target.value)}
                    className={inputCls + ' mt-1'}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Garanti Bitişi
                  <input
                    type="date"
                    value={fWarEnd}
                    onChange={e => setFWarEnd(e.target.value)}
                    className={inputCls + ' mt-1'}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Depo Adı
                  <input
                    value={fWarehouse}
                    onChange={e => setFWarehouse(e.target.value)}
                    className={inputCls + ' mt-1'}
                    placeholder="Merkez Depo"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Raf / Bölüm
                  <input
                    value={fShelf}
                    onChange={e => setFShelf(e.target.value)}
                    className={inputCls + ' mt-1'}
                    placeholder="Raf A-1"
                  />
                </label>
              </div>

              {/* Bölüm 4: Teknik Özellikler */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>Teknik Özellikler (Örn: Çözünürlük, Lümen, Lens, Giriş Portları)</span>
                  <button
                    type="button"
                    onClick={() => setFAttrs([...fAttrs, { key: '', value: '' }])}
                    className="text-xs font-semibold text-brand-600 hover:underline"
                  >
                    + Özellik Ekle
                  </button>
                </div>
                {fAttrs.map((at, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      placeholder="Özellik Adı"
                      value={at.key}
                      onChange={e => {
                        const next = [...fAttrs]
                        next[idx].key = e.target.value
                        setFAttrs(next)
                      }}
                      className={inputCls}
                    />
                    <input
                      placeholder="Değer"
                      value={at.value}
                      onChange={e => {
                        const next = [...fAttrs]
                        next[idx].value = e.target.value
                        setFAttrs(next)
                      }}
                      className={inputCls}
                    />
                    {fAttrs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setFAttrs(fAttrs.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Bölüm 5: Açıklama & Dahili Notlar */}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Ürün Açıklaması
                  <textarea
                    rows={2}
                    value={fDesc}
                    onChange={e => setFDesc(e.target.value)}
                    className={inputCls + ' mt-1'}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Dahili Teknik Notlar
                  <textarea
                    rows={2}
                    value={fNotes}
                    onChange={e => setFNotes(e.target.value)}
                    className={inputCls + ' mt-1'}
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setOpenCreate(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
                >
                  İptal
                </button>
                <button
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} Ürünü Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ÜRÜN DETAY VE FOTOĞRAF / BELGE / SERİ CİHAZ DRAWER */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
          <div className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <div className="font-mono text-xs font-semibold text-brand-600 dark:text-indigo-400">
                  {selectedProduct.inventory_code}
                </div>
                <h2 className="text-xl font-bold">{selectedProduct.name}</h2>
                <p className="text-xs text-slate-500">
                  {[selectedProduct.category_name, selectedProduct.brand_name, selectedProduct.model_name]
                    .filter(Boolean)
                    .join(' • ')}
                </p>
              </div>
              <button onClick={() => setSelectedProduct(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="mt-5 space-y-6">
              {/* Finansal & Konum Özeti */}
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-4 dark:bg-slate-800/50">
                <div>
                  <div className="text-xs text-slate-500">Birim Alış Maliyeti</div>
                  <div className="font-bold">
                    {selectedProduct.purchase_price
                      ? `${Number(selectedProduct.purchase_price).toLocaleString('tr-TR')} ${selectedProduct.purchase_currency}`
                      : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Güncel Piyasa Değeri</div>
                  <div className="font-bold text-emerald-600">
                    {selectedProduct.current_market_value
                      ? `${Number(selectedProduct.current_market_value).toLocaleString('tr-TR')} ${selectedProduct.market_value_currency}`
                      : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Depo / Raf</div>
                  <div className="font-semibold">
                    {[selectedProduct.warehouse_name, selectedProduct.shelf_section].filter(Boolean).join(' / ') || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Garanti Bitişi</div>
                  <div className="font-semibold">{selectedProduct.warranty_end || '—'}</div>
                </div>
              </div>

              {/* Teknik Özellikler */}
              {selectedProduct.attributes.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-bold">Teknik Özellikler</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedProduct.attributes.map((a, i) => (
                      <span
                        key={i}
                        className="rounded-lg border border-slate-200 px-3 py-1 text-xs dark:border-slate-700"
                      >
                        <strong>{a.key}:</strong> {a.value}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Ürün Fotoğrafları */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold">Ürün Fotoğrafları ({prodImages.length})</h3>
                  {can('product.update') && (
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
                      <Camera className="h-3.5 w-3.5" /> Fotoğraf Yükle
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleUploadImage}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                {!prodImages.length ? (
                  <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400 dark:border-slate-700">
                    Henüz ürün fotoğrafı yüklenmemiş.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {prodImages.map(img => (
                      <a
                        key={img.id}
                        href={img.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
                      >
                        <img src={img.url} alt={img.original_name} className="h-24 w-full object-cover" />
                        {img.is_primary && (
                          <span className="absolute top-1 left-1 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            Kapak
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Ürün Belgeleri (Fatura, Garanti, Kılavuz) */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold">Belgeler ve Faturalar ({prodDocs.length})</h3>
                  {can('product.update') && (
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
                      <Upload className="h-3.5 w-3.5" /> PDF / Görsel Belge Ekle
                      <input
                        type="file"
                        accept="application/pdf,image/png,image/jpeg"
                        onChange={handleUploadDoc}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                {prodDocs.length > 0 && (
                  <div className="space-y-1.5">
                    {prodDocs.map(d => (
                      <a
                        key={d.id}
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <FileText className="h-4 w-4 text-brand-600" /> {d.title}
                        </span>
                        <span className="text-slate-400">{(d.size_bytes / 1024).toFixed(1)} KB</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Seri Numaralı Cihazlar ve Toplu Ekleme */}
              {selectedProduct.tracking_type === 'serial' && (
                <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <h3 className="text-sm font-bold">
                    BuModele Ait Seri Numaralı Cihazlar ({prodAssets.length})
                  </h3>

                  {can('product.create') && (
                    <form onSubmit={handleBulkAddSerials} className="flex gap-2">
                      <input
                        value={bulkSerialText}
                        onChange={e => setBulkSerialText(e.target.value)}
                        placeholder="Yeni seri numaraları (virgülle ayırın: SN005, SN006)"
                        className={inputCls + ' font-mono'}
                      />
                      <button className="shrink-0 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-700">
                        + Toplu Cihaz Ekle
                      </button>
                    </form>
                  )}

                  <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-left uppercase text-slate-500 dark:bg-slate-800">
                        <tr>
                          <th className="p-2.5">Envanter Kodu</th>
                          <th className="p-2.5">Seri No</th>
                          <th className="p-2.5">Konum</th>
                          <th className="p-2.5">Durum</th>
                          <th className="p-2.5 text-right">QR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prodAssets.map(a => (
                          <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="p-2.5 font-mono text-brand-600">{a.inventory_code}</td>
                            <td className="p-2.5 font-mono font-bold">{a.serial_number}</td>
                            <td className="p-2.5">
                              {[a.warehouse_name, a.shelf_section].filter(Boolean).join(' / ') || '—'}
                            </td>
                            <td className="p-2.5">
                              {STATUS_LABELS[a.status]?.label || a.status}
                            </td>
                            <td className="p-2.5 text-right">
                              <button
                                onClick={() => setQrModalAsset(a)}
                                className="text-brand-600 hover:underline"
                              >
                                Göster
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR KOD ETİKET ÖNİZLEME MODALI */}
      {qrModalAsset && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">Varlık QR Kimlik Kartı</span>
              <button onClick={() => setQrModalAsset(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="text-xs font-bold tracking-wider text-brand-600">KÜP INVENTORY</div>
              <div className="mt-1 font-bold">{qrModalAsset.product_name}</div>
              <div className="mt-1 font-mono text-xs text-slate-500">
                Kod: {qrModalAsset.inventory_code} | SN: {qrModalAsset.serial_number}
              </div>
              <div className="mt-3 rounded-lg bg-slate-100 p-2 font-mono text-xs break-all dark:bg-slate-800">
                /api/v1/q/{qrModalAsset.qr_token}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                QR içerisinde fiyat/fatura gibi hassas veriler yer almaz.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
