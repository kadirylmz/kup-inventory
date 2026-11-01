import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Briefcase,
  Camera,
  Cpu,
  Download,
  Edit3,
  Eye,
  FileText,
  Image as ImageIcon,
  Layers,
  Loader2,
  Package,
  Plus,
  QrCode,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cleanNumInput, fmtMoney, fmtQty } from '@/lib/format'
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
  active_projects_summary?: string | null
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
  assigned_project_name?: string | null
  assigned_employee_name?: string | null
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

interface ProjectSummary {
  id: string
  code: string
  name: string
  customer: string | null
  status: string
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
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null)
  const [bulkSerialText, setBulkSerialText] = useState('')
  const [qrModalAsset, setQrModalAsset] = useState<AssetItem | null>(null)

  // Cihaz Düzenleme Modalı
  const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null)
  const [aSerial, setASerial] = useState('')
  const [aWarehouse, setAWarehouse] = useState('')
  const [aShelf, setAShelf] = useState('')
  const [aStatus, setAStatus] = useState('in_warehouse')
  const [aPurchasePrice, setAPurchasePrice] = useState('')
  const [aMarketVal, setAMarketVal] = useState('')
  const [aMarketCurr, setAMarketCurr] = useState<'TRY' | 'EUR' | 'USD'>('TRY')
  const [aNotes, setANotes] = useState('')

  // Projeye Kaydır (Hızlı Gönderim) Modalı
  const [shiftModal, setShiftModal] = useState<{
    product?: ProductItem
    asset?: AssetItem
  } | null>(null)
  const [shiftProjectId, setShiftProjectId] = useState('')
  const [shiftAssetId, setShiftAssetId] = useState('')
  const [shiftQty, setShiftQty] = useState('1')
  const [shiftNote, setShiftNote] = useState('')

  // Fotoğraf ve Belge Önizleme Modalı
  const [previewMedia, setPreviewMedia] = useState<{
    url: string
    title: string
    isImage: boolean
    downloadName?: string
  } | null>(null)

  // Ürün Oluşturma / Düzenleme Form State
  const [fName, setFName] = useState('')
  const [fCode, setFCode] = useState('')
  const [fCatId, setFCatId] = useState('')
  const [fSubCatId, setFSubCatId] = useState('')
  const [fBrandName, setFBrandName] = useState('')
  const [fModelName, setFModelName] = useState('')
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
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<ProjectSummary[]>('/projects'),
    enabled: can('project.view'),
  })

  const prodParams = new URLSearchParams()
  if (q) prodParams.set('q', q)
  if (catFilter) prodParams.set('category_id', catFilter)
  if (brandFilter) prodParams.set('brand_id', brandFilter)
  if (trackFilter) prodParams.set('tracking_type', trackFilter)
  if (statusFilter && statusFilter !== 'has_project') prodParams.set('status', statusFilter)

  const { data: rawProducts = [], isLoading: pLoading } = useQuery({
    queryKey: ['products', prodParams.toString()],
    queryFn: () => api<ProductItem[]>(`/products?${prodParams.toString()}`),
  })

  const products =
    statusFilter === 'has_project'
      ? rawProducts.filter(p => p.status === 'in_project' || !!p.active_projects_summary)
      : rawProducts

  const assetParams = new URLSearchParams()
  if (q) assetParams.set('q', q)
  if (statusFilter && statusFilter !== 'has_project') assetParams.set('status', statusFilter)
  if (statusFilter === 'has_project') assetParams.set('status', 'in_project')

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

  // Projeye kaydırma için seçili ürünün depodaki seri cihazları
  const { data: shiftProdAssets = [] } = useQuery({
    queryKey: ['shift-product-assets', shiftModal?.product?.id],
    queryFn: () => api<AssetItem[]>(`/assets?product_id=${shiftModal!.product!.id}`),
    enabled: !!shiftModal?.product && shiftModal.product.tracking_type === 'serial',
  })

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['products'] })
    qc.invalidateQueries({ queryKey: ['assets'] })
    qc.invalidateQueries({ queryKey: ['brands'] })
    qc.invalidateQueries({ queryKey: ['models'] })
    qc.invalidateQueries({ queryKey: ['projects'] })
    qc.invalidateQueries({ queryKey: ['inventory-summary'] })
    if (selectedProduct) {
      qc.invalidateQueries({ queryKey: ['product-assets', selectedProduct.id] })
    }
  }

  const openNewModal = () => {
    const firstCat = categories[0]
    setEditingProduct(null)
    setFName('')
    setFCode('')
    setFCatId(firstCat?.id || '')
    setFSubCatId('')
    setFBrandName('')
    setFModelName('')
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

  const openEditModal = (p: ProductItem) => {
    setEditingProduct(p)
    setFName(p.name)
    setFCode(p.inventory_code)
    setFCatId(p.category_id)
    setFSubCatId(p.subcategory_id || '')
    setFBrandName(p.brand_name || '')
    setFModelName(p.model_name || '')
    setFTracking(p.tracking_type)
    setFUnit(p.unit || 'Adet')
    setFBarcode(p.barcode || '')
    setFQty(cleanNumInput(p.quantity ?? '0'))
    setFMinStock(cleanNumInput(p.min_stock ?? '0'))
    setFPurchaseDate(p.purchase_date || '')
    setFPurchasePrice(cleanNumInput(p.purchase_price))
    setFPurchaseCurr(p.purchase_currency || 'TRY')
    setFVat(cleanNumInput(p.vat_rate ?? '20'))
    setFSupplierId(p.supplier_id || '')
    setFInvoice(p.invoice_no || '')
    setFWarStart(p.warranty_start || '')
    setFWarEnd(p.warranty_end || '')
    setFMarketVal(cleanNumInput(p.current_market_value))
    setFMarketCurr(p.market_value_currency || 'TRY')
    setFStatus(p.status || 'in_warehouse')
    setFWarehouse(p.warehouse_name || 'Merkez Depo')
    setFShelf(p.shelf_section || '')
    setFLocation(p.location_detail || '')
    setFDesc(p.description || '')
    setFNotes(p.internal_notes || '')
    setFAttrs(p.attributes && p.attributes.length > 0 ? p.attributes : [{ key: '', value: '' }])
    setFSerialsText('')
    setOpenCreate(true)
  }

  const fetchSuggestedMarketValue = async () => {
    if (editingProduct) {
      try {
        const res = await api<{
          found_reliable_source: boolean
          suggested_value: number | null
          currency: 'TRY' | 'EUR' | 'USD' | null
          message: string
        }>(`/valuations/research?product_id=${editingProduct.id}`)
        if (res.found_reliable_source && res.suggested_value !== null) {
          setFMarketVal(String(res.suggested_value))
          if (res.currency) setFMarketCurr(res.currency)
          toast.success(res.message)
          return
        }
      } catch {
        // Fallback below
      }
    }

    // Aynı marka/model başka bir üründe piyasa değeri varsa veya alış fiyatından referans
    const matchProd = rawProducts.find(
      x =>
        (fModelName && x.model_name?.toLowerCase() === fModelName.trim().toLowerCase() && x.current_market_value) ||
        (fBrandName && x.brand_name?.toLowerCase() === fBrandName.trim().toLowerCase() && x.current_market_value),
    )
    if (matchProd && matchProd.current_market_value) {
      setFMarketVal(String(matchProd.current_market_value))
      setFMarketCurr(matchProd.market_value_currency)
      toast.success(`Aynı marka/model kaydından (${matchProd.name}) güncel piyasa değeri çekildi.`)
      return
    }

    if (fPurchasePrice && Number(fPurchasePrice) > 0) {
      const est = (Number(fPurchasePrice) * 0.75).toFixed(2)
      setFMarketVal(est)
      setFMarketCurr(fPurchaseCurr)
      toast.info(`Alış fiyatı üzerinden %75 ikinci el başlangıç referans değeri (${est} ${fPurchaseCurr}) hesaplandı.`)
      return
    }

    toast.warning('Önce alış fiyatı girin veya doğrudan ikinci el piyasa değerini yazın.')
  }

  const submitProduct = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const cleanAttrs = fAttrs.filter(a => a.key.trim() && a.value.trim())

      if (editingProduct) {
        const updated = await api<ProductItem>(`/products/${editingProduct.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: fName.trim(),
            category_id: fCatId,
            subcategory_id: fSubCatId || null,
            brand_name: fBrandName.trim(),
            model_name: fModelName.trim(),
            unit: fUnit,
            barcode: fBarcode || null,
            description: fDesc || null,
            attributes: cleanAttrs,
            min_stock: fMinStock || '0',
            quantity: fQty || '0',
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
          }),
        })
        toast.success('Ürün kartı ve bağlı varlık bilgileri güncellendi.')
        if (selectedProduct && selectedProduct.id === updated.id) {
          setSelectedProduct(updated)
        }
      } else {
        const serials =
          fTracking === 'serial'
            ? fSerialsText
                .split(/[\n,;]+/)
                .map(s => s.trim())
                .filter(Boolean)
            : []

        await api('/products', {
          method: 'POST',
          body: JSON.stringify({
            inventory_code: fCode.trim() || null,
            name: fName.trim(),
            category_id: fCatId,
            subcategory_id: fSubCatId || null,
            brand_name: fBrandName.trim() || null,
            model_name: fModelName.trim() || null,
            tracking_type: fTracking,
            unit: fUnit,
            barcode: fBarcode || null,
            description: fDesc || null,
            attributes: cleanAttrs,
            min_stock: fMinStock || '0',
            quantity:
              fTracking === 'serial' && serials.length > 0
                ? String(serials.length)
                : fQty || '0',
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
      }

      refreshAll()
      setOpenCreate(false)
      setEditingProduct(null)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteProduct = async (p: ProductItem) => {
    if (!window.confirm(`"${p.name}" (${p.inventory_code}) ürün kartını ve bağlı cihazlarını silmek istediğinize emin misiniz?`)) {
      return
    }
    try {
      await api(`/products/${p.id}`, { method: 'DELETE' })
      toast.success('Ürün kaydı silindi.')
      if (selectedProduct?.id === p.id) setSelectedProduct(null)
      refreshAll()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const openAssetEditModal = (a: AssetItem) => {
    setEditingAsset(a)
    setASerial(a.serial_number)
    setAWarehouse(a.warehouse_name || 'Merkez Depo')
    setAShelf(a.shelf_section || '')
    setAStatus(a.status)
    setAPurchasePrice(cleanNumInput(a.purchase_price))
    setAMarketVal(cleanNumInput(a.current_market_value))
    setAMarketCurr((a.market_value_currency as 'TRY' | 'EUR' | 'USD') || 'TRY')
    setANotes(a.notes || '')
  }

  const submitAssetEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingAsset) return
    try {
      await api(`/assets/${editingAsset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          serial_number: aSerial.trim(),
          warehouse_name: aWarehouse || null,
          shelf_section: aShelf || null,
          status: aStatus,
          purchase_price: aPurchasePrice ? aPurchasePrice : null,
          current_market_value: aMarketVal ? aMarketVal : null,
          market_value_currency: aMarketCurr,
          notes: aNotes || null,
        }),
      })
      toast.success(`${aSerial} cihaz bilgileri güncellendi.`)
      setEditingAsset(null)
      refreshAll()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleDeleteAsset = async (a: AssetItem) => {
    if (!window.confirm(`${a.serial_number} (${a.inventory_code}) seri numaralı cihazı silmek istediğinize emin misiniz?`)) {
      return
    }
    try {
      await api(`/assets/${a.id}`, { method: 'DELETE' })
      toast.success('Seri numaralı cihaz silindi.')
      refreshAll()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const openShiftToProjectModal = (opts: { product?: ProductItem; asset?: AssetItem }) => {
    setShiftModal(opts)
    setShiftProjectId(projects[0]?.id || '')
    setShiftAssetId(opts.asset?.id || '')
    setShiftQty('1')
    setShiftNote('')
  }

  const submitShiftToProject = async (e: FormEvent) => {
    e.preventDefault()
    if (!shiftModal || !shiftProjectId) {
      toast.error('Lütfen hedef projeyi seçin.')
      return
    }
    try {
      const prodId = shiftModal.asset ? shiftModal.asset.product_id : shiftModal.product!.id
      const chosenAssetId = shiftModal.asset ? shiftModal.asset.id : (shiftAssetId || null)
      const hasChosenAsset = !!chosenAssetId

      await api(`/projects/${shiftProjectId}/send`, {
        method: 'POST',
        body: JSON.stringify({
          note: shiftNote || 'Envanter ekranından projeye kaydırıldı',
          items: [
            {
              product_id: prodId,
              asset_id: chosenAssetId,
              quantity: hasChosenAsset ? '1' : (shiftQty || '1'),
              note: shiftNote || null,
            },
          ],
        }),
      })
      toast.success('Malzeme seçilen projeye başarıyla kaydırıldı.')
      setShiftModal(null)
      refreshAll()
    } catch (err) {
      toast.error((err as Error).message)
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
      refreshAll()
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
      refreshAll()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800'

  const matchedBrand = brands.find(b => b.name.toLowerCase() === fBrandName.trim().toLowerCase())
  const suggestedModels = matchedBrand ? models.filter(m => m.brand_id === matchedBrand.id) : models

  return (
    <div className="space-y-5">
      {/* Üst Başlık */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Envanter ve Varlık Yönetimi</h1>
          <p className="text-sm text-slate-500">
            Ürün katalog kartları, adet bazlı sarf malzemeleri, seri numaralı cihazlar ve projedeki ekipman takibi
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
          <option value="has_project">Projeye Kaydırılanlar (Aktif Projede)</option>
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
                    <th className="p-3.5">Konum & Proje</th>
                    <th className="p-3.5">Durum</th>
                    <th className="p-3.5 text-right">İşlemler</th>
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
                              onClick={e => {
                                e.stopPropagation()
                                setPreviewMedia({
                                  url: p.primary_image_url!,
                                  title: p.name,
                                  isImage: true,
                                  downloadName: `${p.inventory_code}_foto.jpg`,
                                })
                              }}
                              title="Fotoğrafı büyüt / incele"
                              className="h-10 w-10 cursor-zoom-in rounded-lg object-cover ring-1 ring-slate-200 hover:ring-2 hover:ring-brand-500 dark:ring-slate-700"
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
                              {fmtQty(p.quantity)} {p.unit}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 font-medium">
                          {p.purchase_price
                            ? `${fmtMoney(p.purchase_price)} ${SYM[p.purchase_currency] || p.purchase_currency}`
                            : '—'}
                        </td>
                        <td className="p-3.5 font-medium text-emerald-600 dark:text-emerald-400">
                          {p.current_market_value
                            ? `${fmtMoney(p.current_market_value)} ${SYM[p.market_value_currency] || p.market_value_currency}`
                            : '—'}
                        </td>
                        <td className="p-3.5 text-xs">
                          <div className="text-slate-600 dark:text-slate-300">
                            {[p.warehouse_name, p.shelf_section].filter(Boolean).join(' / ') || '—'}
                          </div>
                          {p.active_projects_summary && (
                            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                              <Briefcase className="h-3 w-3" /> Projede: {p.active_projects_summary}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="p-3.5 text-right" onClick={e => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1">
                            {can('project.manage') && (
                              <button
                                onClick={() => openShiftToProjectModal({ product: p })}
                                title="Projeye Kaydır / Gönder"
                                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/60 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
                              >
                                <Send className="h-3 w-3" /> Projeye
                              </button>
                            )}
                            {can('product.update') && (
                              <button
                                onClick={() => openEditModal(p)}
                                title="Düzenle"
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                              >
                                <Edit3 className="h-3.5 w-3.5" /> Düzenle
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedProduct(p)}
                              title="Detay İncele"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            {can('product.delete') && (
                              <button
                                onClick={() => handleDeleteProduct(p)}
                                title="Sil"
                                className="inline-flex items-center rounded-lg border border-rose-200 p-1 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
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
                    <th className="p-3.5">Depo / Proje / Zimmet</th>
                    <th className="p-3.5">Alış Maliyeti</th>
                    <th className="p-3.5">Piyasa Değeri</th>
                    <th className="p-3.5">Durum</th>
                    <th className="p-3.5 text-right">İşlemler</th>
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
                        <td className="p-3.5 text-xs">
                          <div className="text-slate-600 dark:text-slate-300">
                            {[a.warehouse_name, a.shelf_section].filter(Boolean).join(' / ') || '—'}
                          </div>
                          {a.assigned_project_name && (
                            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                              <Briefcase className="h-3 w-3" /> Proje: {a.assigned_project_name}
                            </div>
                          )}
                          {a.assigned_employee_name && (
                            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
                              Zimmet: {a.assigned_employee_name}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5">
                          {a.purchase_price
                            ? `${fmtMoney(a.purchase_price)} ${SYM[a.purchase_currency] || a.purchase_currency}`
                            : '—'}
                        </td>
                        <td className="p-3.5 text-emerald-600 dark:text-emerald-400">
                          {a.current_market_value
                            ? `${fmtMoney(a.current_market_value)} ${SYM[a.market_value_currency] || a.market_value_currency}`
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
                          <div className="inline-flex items-center gap-1">
                            {can('project.manage') && a.status !== 'in_project' && (
                              <button
                                onClick={() => openShiftToProjectModal({ asset: a })}
                                title="Projeye Kaydır"
                                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/60 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
                              >
                                <Send className="h-3 w-3" /> Projeye
                              </button>
                            )}
                            {can('product.update') && (
                              <button
                                onClick={() => openAssetEditModal(a)}
                                title="Cihazı Düzenle"
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                              >
                                <Edit3 className="h-3.5 w-3.5" /> Düzenle
                              </button>
                            )}
                            <button
                              onClick={() => setQrModalAsset(a)}
                              title="QR Kod"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                            >
                              <QrCode className="h-3.5 w-3.5" /> QR
                            </button>
                            {can('product.delete') && (
                              <button
                                onClick={() => handleDeleteAsset(a)}
                                title="Cihazı Sil"
                                className="inline-flex items-center rounded-lg border border-rose-200 p-1 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
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

      {/* YENİ ÜRÜN EKLEME / DÜZENLEME MODALI */}
      {openCreate && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <div className="mx-auto my-6 max-w-4xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-bold">
                  {editingProduct ? `Ürün Kartını Düzenle (${editingProduct.inventory_code})` : 'Yeni Ürün / Envanter Kartı Oluştur'}
                </h2>
                <p className="text-xs text-slate-500">
                  Marka ve modeli doğrudan yazabilir, alış maliyetini ve güncel piyasa değerini tanımlayabilirsiniz
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpenCreate(false)
                  setEditingProduct(null)
                }}
              >
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={submitProduct} className="mt-5 space-y-6">
              {/* Bölüm 1: Temel Kimlik, Kategori ve Doğrudan Yazılabilir Marka/Model */}
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
                  Envanter Kodu {editingProduct ? '' : '(Boşsa otomatik)'}
                  <input
                    value={fCode}
                    disabled={!!editingProduct}
                    onChange={e => setFCode(e.target.value.toUpperCase())}
                    className={inputCls + ' mt-1 font-mono uppercase disabled:opacity-60'}
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
                      if (c && !editingProduct) {
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
                  Marka (Doğrudan yazabilir veya seçebilirsiniz)
                  <input
                    list="brands-datalist"
                    value={fBrandName}
                    onChange={e => setFBrandName(e.target.value)}
                    className={inputCls + ' mt-1'}
                    placeholder="Örn: Panasonic, Sony, Apple..."
                  />
                  <datalist id="brands-datalist">
                    {brands.map(b => (
                      <option key={b.id} value={b.name} />
                    ))}
                  </datalist>
                </label>

                <label className="block text-sm font-medium">
                  Model (Doğrudan yazabilir veya seçebilirsiniz)
                  <input
                    list="models-datalist"
                    value={fModelName}
                    onChange={e => setFModelName(e.target.value)}
                    className={inputCls + ' mt-1'}
                    placeholder="Örn: PT-RZ690B, Mac Studio M2..."
                  />
                  <datalist id="models-datalist">
                    {suggestedModels.map(m => (
                      <option key={m.id} value={m.name} />
                    ))}
                  </datalist>
                </label>
              </div>

              {/* Bölüm 2: Takip Modeli ve Miktar */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="grid gap-4 sm:grid-cols-4">
                  <label className="block text-sm font-medium sm:col-span-2">
                    Takip Modeli *
                    <select
                      value={fTracking}
                      disabled={!!editingProduct}
                      onChange={e => {
                        const val = e.target.value as 'serial' | 'quantity'
                        setFTracking(val)
                        if (val === 'serial') setFUnit('Adet')
                      }}
                      className={inputCls + ' mt-1 disabled:opacity-60'}
                    >
                      <option value="serial">Seri Numarası Bazlı Tekil Cihaz Takibi</option>
                      <option value="quantity">Adet / Metre / Miktar Bazlı Stok Takibi</option>
                    </select>
                  </label>

                  <label className="block text-sm font-medium">
                    Birim *
                    <select
                      value={fUnit}
                      onChange={e => setFUnit(e.target.value)}
                      className={inputCls + ' mt-1'}
                    >
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

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Mevcut Miktar ({fUnit}) *
                    <input
                      type="number"
                      step={fUnit === 'Metre' ? '0.01' : '1'}
                      min="0"
                      required
                      value={fQty}
                      onChange={e => setFQty(e.target.value)}
                      className={inputCls + ' mt-1'}
                    />
                    {fTracking === 'serial' && !editingProduct && (
                      <span className="mt-1 block text-xs text-slate-500">
                        {fSerialsText.trim()
                          ? `(Girilen seri numarası sayısı: ${
                              fSerialsText
                                .split(/[\n,;]+/)
                                .map(s => s.trim())
                                .filter(Boolean).length
                            })`
                          : 'Seri numaralarını şimdi girmeyip sadece adet belirtebilirsiniz.'}
                      </span>
                    )}
                  </label>
                  <label className="block text-sm font-medium">
                    Kritik Stok Uyarı Seviyesi
                    <input
                      type="number"
                      step={fUnit === 'Metre' ? '0.01' : '1'}
                      min="0"
                      value={fMinStock}
                      onChange={e => setFMinStock(e.target.value)}
                      className={inputCls + ' mt-1'}
                    />
                  </label>
                </div>

                {fTracking === 'serial' && (
                  !editingProduct ? (
                    <label className="mt-4 block text-sm font-medium">
                      Cihaz Seri Numaraları (İsteğe Bağlı - Her satıra veya virgülle yazabilirsiniz)
                      <textarea
                        rows={3}
                        value={fSerialsText}
                        onChange={e => {
                          const text = e.target.value
                          setFSerialsText(text)
                          const count = text
                            .split(/[\n,;]+/)
                            .map(s => s.trim())
                            .filter(Boolean).length
                          if (count > 0) {
                            setFQty(String(count))
                          }
                        }}
                        className={inputCls + ' mt-1 font-mono'}
                        placeholder={'SN001\nSN002\nSN003\n(Boş bırakırsanız sadece yukarıdaki adet kadar stok açılır)'}
                      />
                    </label>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">
                      Not: Bu ürüne ait seri numaralı cihazları ürün detay çekmecesinden veya "Seri Numaralı Cihazlar" sekmesinden ekleyip düzenleyebilirsiniz.
                    </p>
                  )
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

                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Güncel 2. El Piyasa Değeri</span>
                    <button
                      type="button"
                      onClick={fetchSuggestedMarketValue}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-indigo-400"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Referans / Piyasa Değeri Çek
                    </button>
                  </div>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={fMarketVal}
                      onChange={e => setFMarketVal(e.target.value)}
                      className={inputCls}
                      placeholder="0.00"
                    />
                    <select
                      value={fMarketCurr}
                      onChange={e => setFMarketCurr(e.target.value as 'TRY' | 'EUR' | 'USD')}
                      className="w-28 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="TRY">TL (₺)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                  </div>
                </div>

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
                  onClick={() => {
                    setOpenCreate(false)
                    setEditingProduct(null)
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
                >
                  İptal
                </button>
                <button
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingProduct ? 'Değişiklikleri Kaydet' : 'Ürünü Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SERİ NUMARALI CİHAZ DÜZENLEME MODALI */}
      {editingAsset && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <h3 className="font-bold">Seri Numaralı Cihazı Düzenle</h3>
                <p className="text-xs text-slate-500">
                  {editingAsset.product_name} ({editingAsset.inventory_code})
                </p>
              </div>
              <button onClick={() => setEditingAsset(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={submitAssetEdit} className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Seri Numarası *
                  <input
                    required
                    value={aSerial}
                    onChange={e => setASerial(e.target.value)}
                    className={inputCls + ' mt-1 font-mono'}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Durum
                  <select value={aStatus} onChange={e => setAStatus(e.target.value)} className={inputCls + ' mt-1'}>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Depo Adı
                  <input value={aWarehouse} onChange={e => setAWarehouse(e.target.value)} className={inputCls + ' mt-1'} />
                </label>
                <label className="block text-sm font-medium">
                  Raf / Bölüm
                  <input value={aShelf} onChange={e => setAShelf(e.target.value)} className={inputCls + ' mt-1'} />
                </label>
                <label className="block text-sm font-medium">
                  Alış Maliyeti
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={aPurchasePrice}
                    onChange={e => setAPurchasePrice(e.target.value)}
                    className={inputCls + ' mt-1'}
                  />
                </label>
                <div>
                  <span className="text-sm font-medium">Güncel Piyasa Değeri</span>
                  <div className="mt-1 flex gap-1.5">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={aMarketVal}
                      onChange={e => setAMarketVal(e.target.value)}
                      className={inputCls}
                    />
                    <select
                      value={aMarketCurr}
                      onChange={e => setAMarketCurr(e.target.value as 'TRY' | 'EUR' | 'USD')}
                      className="rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="TRY">TL</option>
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                </div>
              </div>
              <label className="block text-sm font-medium">
                Cihaz Notu
                <textarea rows={2} value={aNotes} onChange={e => setANotes(e.target.value)} className={inputCls + ' mt-1'} />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAsset(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
                >
                  İptal
                </button>
                <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROJEYE KAYDIR (HIZLI GÖNDERİM) MODALI */}
      {shiftModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <h3 className="font-bold">Malzemeyi Projeye Kaydır</h3>
                <p className="text-xs text-slate-500">
                  {shiftModal.asset
                    ? `${shiftModal.asset.product_name} (${shiftModal.asset.serial_number})`
                    : shiftModal.product?.name}
                </p>
              </div>
              <button onClick={() => setShiftModal(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={submitShiftToProject} className="mt-4 space-y-4">
              <label className="block text-sm font-medium">
                Hedef Proje *
                <select
                  required
                  value={shiftProjectId}
                  onChange={e => setShiftProjectId(e.target.value)}
                  className={inputCls + ' mt-1'}
                >
                  <option value="">— Proje Seçin —</option>
                  {projects.map(pr => (
                    <option key={pr.id} value={pr.id}>
                      [{pr.code}] {pr.name}
                    </option>
                  ))}
                </select>
              </label>

              {!shiftModal.asset && shiftModal.product?.tracking_type === 'serial' && (
                <>
                  <label className="block text-sm font-medium">
                    Seri Numaralı Cihaz (İsteğe Bağlı)
                    <select
                      value={shiftAssetId}
                      onChange={e => {
                        setShiftAssetId(e.target.value)
                        if (e.target.value) setShiftQty('1')
                      }}
                      className={inputCls + ' mt-1 font-mono'}
                    >
                      <option value="">— Seri Numarası Olmadan / Genel Gönder —</option>
                      {shiftProdAssets
                        .filter(x => x.status !== 'in_project')
                        .map(x => (
                          <option key={x.id} value={x.id}>
                            {x.serial_number} ({x.warehouse_name || 'Depo'})
                          </option>
                        ))}
                    </select>
                  </label>
                  {!shiftAssetId && (
                    <label className="block text-sm font-medium">
                      Gönderilecek Miktar ({shiftModal.product.unit || 'Adet'}) * (Mevcut: {fmtQty(shiftModal.product.quantity)})
                      <input
                        type="number"
                        step={shiftModal.product.unit === 'Metre' ? '0.01' : '1'}
                        min={shiftModal.product.unit === 'Metre' ? '0.01' : '1'}
                        max={Number(shiftModal.product.quantity) || undefined}
                        required
                        value={shiftQty}
                        onChange={e => setShiftQty(e.target.value)}
                        className={inputCls + ' mt-1'}
                      />
                    </label>
                  )}
                </>
              )}

              {!shiftModal.asset && shiftModal.product?.tracking_type === 'quantity' && (
                <label className="block text-sm font-medium">
                  Gönderilecek Miktar ({shiftModal.product.unit}) * (Mevcut: {fmtQty(shiftModal.product.quantity)})
                  <input
                    type="number"
                    step={shiftModal.product.unit === 'Metre' ? '0.01' : '1'}
                    min={shiftModal.product.unit === 'Metre' ? '0.01' : '1'}
                    max={Number(shiftModal.product.quantity) || undefined}
                    required
                    value={shiftQty}
                    onChange={e => setShiftQty(e.target.value)}
                    className={inputCls + ' mt-1'}
                  />
                </label>
              )}

              <label className="block text-sm font-medium">
                Gönderim Açıklaması / Not
                <input
                  value={shiftNote}
                  onChange={e => setShiftNote(e.target.value)}
                  placeholder="Örn: Sahne kurulumu için gönderildi"
                  className={inputCls + ' mt-1'}
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShiftModal(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
                >
                  İptal
                </button>
                <button className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                  <Send className="h-4 w-4" /> Projeye Gönder
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
              <div className="flex items-center gap-2">
                {can('product.update') && (
                  <button
                    onClick={() => openEditModal(selectedProduct)}
                    className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Düzenle
                  </button>
                )}
                {can('product.delete') && (
                  <button
                    onClick={() => handleDeleteProduct(selectedProduct)}
                    className="flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Sil
                  </button>
                )}
                <button onClick={() => setSelectedProduct(null)}>
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-6">
              {/* Finansal & Konum Özeti */}
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-4 dark:bg-slate-800/50">
                <div>
                  <div className="text-xs text-slate-500">Birim Alış Maliyeti</div>
                  <div className="font-bold">
                    {selectedProduct.purchase_price
                      ? `${fmtMoney(selectedProduct.purchase_price)} ${selectedProduct.purchase_currency}`
                      : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Güncel Piyasa Değeri</div>
                  <div className="font-bold text-emerald-600">
                    {selectedProduct.current_market_value
                      ? `${fmtMoney(selectedProduct.current_market_value)} ${selectedProduct.market_value_currency}`
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
                  <div className="text-xs text-slate-500">Aktif Projeler</div>
                  <div className="font-semibold text-indigo-600 dark:text-indigo-400">
                    {selectedProduct.active_projects_summary || 'Depoda'}
                  </div>
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
                      <div
                        key={img.id}
                        onClick={() =>
                          setPreviewMedia({
                            url: img.url,
                            title: img.caption || img.original_name,
                            isImage: true,
                            downloadName: img.original_name,
                          })
                        }
                        className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 transition hover:ring-2 hover:ring-brand-500 dark:border-slate-700"
                      >
                        <img src={img.url} alt={img.original_name} className="h-24 w-full object-cover transition group-hover:scale-105" />
                        {img.is_primary && (
                          <span className="absolute top-1 left-1 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            Kapak
                          </span>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                          <Eye className="h-5 w-5 text-white" />
                        </div>
                      </div>
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
                    {prodDocs.map(d => {
                      const isImg = /\.(jpg|jpeg|png|webp)$/i.test(d.original_name)
                      return (
                        <div
                          key={d.id}
                          onClick={() =>
                            setPreviewMedia({
                              url: d.url,
                              title: d.title || d.original_name,
                              isImage: isImg,
                              downloadName: d.original_name,
                            })
                          }
                          className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs transition hover:bg-slate-50 hover:border-brand-300 dark:border-slate-800 dark:hover:bg-slate-800"
                        >
                          <span className="flex items-center gap-2 font-medium">
                            <FileText className="h-4 w-4 text-brand-600" /> {d.title}
                            {d.doc_type && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 uppercase dark:bg-slate-800">
                                {d.doc_type === 'invoice' ? 'Fatura' : d.doc_type}
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">{(d.size_bytes / 1024).toFixed(1)} KB</span>
                            <span className="rounded p-1 text-slate-400 hover:text-brand-600">
                              <Eye className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Seri Numaralı Cihazlar ve Toplu Ekleme */}
              {selectedProduct.tracking_type === 'serial' && (
                <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <h3 className="text-sm font-bold">
                    Bu Modele Ait Seri Numaralı Cihazlar ({prodAssets.length})
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

                  <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-left uppercase text-slate-500 dark:bg-slate-800">
                        <tr>
                          <th className="p-2.5">Envanter Kodu</th>
                          <th className="p-2.5">Seri No</th>
                          <th className="p-2.5">Konum / Proje</th>
                          <th className="p-2.5">Durum</th>
                          <th className="p-2.5 text-right">İşlem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prodAssets.map(a => (
                          <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="p-2.5 font-mono text-brand-600">{a.inventory_code}</td>
                            <td className="p-2.5 font-mono font-bold">{a.serial_number}</td>
                            <td className="p-2.5">
                              <div>{[a.warehouse_name, a.shelf_section].filter(Boolean).join(' / ') || '—'}</div>
                              {a.assigned_project_name && (
                                <span className="text-[11px] font-semibold text-indigo-600">
                                  Proje: {a.assigned_project_name}
                                </span>
                              )}
                            </td>
                            <td className="p-2.5">
                              {STATUS_LABELS[a.status]?.label || a.status}
                            </td>
                            <td className="p-2.5 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                {can('project.manage') && a.status !== 'in_project' && (
                                  <button
                                    onClick={() => openShiftToProjectModal({ asset: a })}
                                    className="font-semibold text-indigo-600 hover:underline"
                                  >
                                    Projeye
                                  </button>
                                )}
                                {can('product.update') && (
                                  <button
                                    onClick={() => openAssetEditModal(a)}
                                    className="text-slate-600 hover:underline dark:text-slate-300"
                                  >
                                    Düzenle
                                  </button>
                                )}
                                <button
                                  onClick={() => setQrModalAsset(a)}
                                  className="text-brand-600 hover:underline"
                                >
                                  QR
                                </button>
                                {can('product.delete') && (
                                  <button
                                    onClick={() => handleDeleteAsset(a)}
                                    className="text-rose-600 hover:underline"
                                  >
                                    Sil
                                  </button>
                                )}
                              </div>
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

      {/* FOTOĞRAF VE FATURA / BELGE ÖNİZLEME & İNDİRME MODALI */}
      {previewMedia && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            {/* Modal Üst Bar */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {previewMedia.isImage ? (
                  <ImageIcon className="h-5 w-5 text-brand-600" />
                ) : (
                  <FileText className="h-5 w-5 text-brand-600" />
                )}
                <span className="font-bold text-sm truncate max-w-md">{previewMedia.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewMedia.url}
                  download={previewMedia.downloadName || 'dosya'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-700"
                  title="Dosyayı İndir"
                >
                  <Download className="h-3.5 w-3.5" /> İndir
                </a>
                <button
                  onClick={() => setPreviewMedia(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Önizleme Alanı */}
            <div className="flex flex-1 items-center justify-center overflow-auto p-4 bg-slate-100/50 dark:bg-slate-950/50">
              {previewMedia.isImage ? (
                <img
                  src={previewMedia.url}
                  alt={previewMedia.title}
                  className="max-h-[75vh] max-w-full rounded-lg object-contain shadow-md"
                />
              ) : (
                <iframe
                  src={previewMedia.url}
                  title={previewMedia.title}
                  className="h-full min-h-[75vh] w-full rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
