import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRightLeft,
  CheckCircle2,
  Loader2,
  Plus,
  Repeat,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { fmtQty } from '@/lib/format'
import type { WarehouseItem } from '@/pages/Warehouses'
import type { AssetItem, ProductItem } from '@/pages/Inventory'

interface MovementItem {
  id: string
  product_id: string
  product_name: string
  inventory_code: string
  asset_id: string | null
  serial_number: string | null
  quantity: string
  previous_location_text: string | null
  new_location_text: string | null
}

interface MovementRecord {
  id: string
  movement_no: string
  movement_type: string
  from_warehouse_name: string | null
  to_warehouse_name: string | null
  employee_name: string | null
  project_name: string | null
  performed_by_name: string
  occurred_at: string
  note: string | null
  reverses_id: string | null
  is_reversed: boolean
  items: MovementItem[]
}

interface TransferRecord {
  id: string
  transfer_no: string
  status: 'pending' | 'approved' | 'rejected'
  from_warehouse_id: string
  from_warehouse_name: string
  from_location_name: string | null
  to_warehouse_id: string
  to_warehouse_name: string
  to_location_name: string | null
  product_id: string
  product_name: string
  asset_id: string | null
  serial_number: string | null
  quantity: string
  requested_by_name: string
  approved_by_name: string | null
  created_at: string
  approved_at: string | null
  note: string | null
}

const MOV_LABELS: Record<string, { label: string; cls: string }> = {
  initial: { label: 'İlk Ürün Girişi', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  purchase: { label: 'Satın Alma Girişi', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  manual_in: { label: 'Manuel Giriş', cls: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300' },
  out: { label: 'Depodan Çıkış', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  to_project: { label: 'Projeye Gönderim', cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
  from_project: { label: 'Projeden Dönüş', cls: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  transfer: { label: 'Depolar Arası Transfer', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  assign: { label: 'Personel Zimmeti', cls: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300' },
  unassign: { label: 'Zimmet İadesi', cls: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300' },
  to_service: { label: 'Servise Gönderim', cls: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  from_service: { label: 'Servisten Dönüş', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  scrap: { label: 'Hurdaya Ayırma', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  count_diff: { label: 'Sayım Farkı', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  adjustment: { label: 'Stok Düzeltmesi', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  reversal: { label: 'Ters İşlem (İptal)', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300' },
}

export default function MovementsPage() {
  const { can } = useAuth()
  const qc = useQueryClient()

  const [tab, setTab] = useState<'movements' | 'transfers'>('movements')
  const [typeFilter, setTypeFilter] = useState('')
  const [openMovModal, setOpenMovModal] = useState(false)
  const [openTrfModal, setOpenTrfModal] = useState(false)

  // Yeni Hareket State
  const [mType, setMType] = useState('purchase')
  const [mProductId, setMProductId] = useState('')
  const [mAssetId, setMAssetId] = useState('')
  const [mQty, setMQty] = useState('1')
  const [mFromWh, setMFromWh] = useState('')
  const [mToWh, setMToWh] = useState('')
  const [mProject, setMProject] = useState('')
  const [mNote, setMNote] = useState('')

  // Yeni Transfer State
  const [tProductId, setTProductId] = useState('')
  const [tAssetId, setTAssetId] = useState('')
  const [tQty, setTQty] = useState('1')
  const [tFromWh, setTFromWh] = useState('')
  const [tToWh, setTToWh] = useState('')
  const [tNote, setTNote] = useState('')

  const { data: movements = [], isLoading: mLoad } = useQuery({
    queryKey: ['movements', typeFilter],
    queryFn: () =>
      api<MovementRecord[]>(`/movements${typeFilter ? `?movement_type=${typeFilter}` : ''}`),
  })

  const { data: transfers = [], isLoading: tLoad } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => api<TransferRecord[]>('/transfers'),
  })

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api<WarehouseItem[]>('/warehouses'),
  })
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api<ProductItem[]>('/products'),
  })
  const { data: assets = [] } = useQuery({
    queryKey: ['assets'],
    queryFn: () => api<AssetItem[]>('/assets'),
  })

  const submitMovement = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api('/movements', {
        method: 'POST',
        body: JSON.stringify({
          movement_type: mType,
          product_id: mProductId,
          asset_id: mAssetId || null,
          quantity: mQty,
          from_warehouse_id: mFromWh || null,
          to_warehouse_id: mToWh || null,
          project_name: mProject || null,
          note: mNote || null,
        }),
      })
      toast.success('Stok hareketi kaydedildi.')
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['warehouse-stock'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      setOpenMovModal(false)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const submitTransfer = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api('/transfers', {
        method: 'POST',
        body: JSON.stringify({
          from_warehouse_id: tFromWh,
          to_warehouse_id: tToWh,
          product_id: tProductId,
          asset_id: tAssetId || null,
          quantity: tQty,
          note: tNote || null,
        }),
      })
      toast.success('Transfer talebi oluşturuldu. Onaylandığında lokasyon güncellenecektir.')
      qc.invalidateQueries({ queryKey: ['transfers'] })
      setOpenTrfModal(false)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleReverse = async (m: MovementRecord) => {
    const reason = window.prompt(
      `${m.movement_no} numaralı hareketi ters işlemle iptal etme sebebinizi girin:`,
      'Hatalı stok hareketi düzeltmesi',
    )
    if (!reason) return
    try {
      await api(`/movements/${m.id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      toast.success('Ters işlem (düzeltme) kaydı oluşturuldu.')
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['warehouse-stock'] })
      qc.invalidateQueries({ queryKey: ['products'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleApproveTransfer = async (id: string) => {
    try {
      await api(`/transfers/${id}/approve`, { method: 'POST' })
      toast.success('Transfer onaylandı ve ürün lokasyonu güncellendi.')
      qc.invalidateQueries({ queryKey: ['transfers'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['warehouse-stock'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleRejectTransfer = async (id: string) => {
    try {
      await api(`/transfers/${id}/reject`, { method: 'POST' })
      toast.success('Transfer talebi reddedildi.')
      qc.invalidateQueries({ queryKey: ['transfers'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleDeleteMovement = async (m: MovementRecord) => {
    if (
      !window.confirm(
        `${m.movement_no} numaralı stok hareket kaydını geçmişten silmek istediğinize emin misiniz?\n\n(Not: Bu işlem sadece kayıt defterini temizler, depodaki ve projelerdeki mevcut stoklarınıza dokunmaz.)`,
      )
    )
      return
    try {
      await api(`/movements/${m.id}`, { method: 'DELETE' })
      toast.success('Stok hareket kaydı silindi.')
      qc.invalidateQueries({ queryKey: ['movements'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const [selectedMovIds, setSelectedMovIds] = useState<string[]>([])

  const handleToggleSelectAll = () => {
    if (selectedMovIds.length === movements.length) {
      setSelectedMovIds([])
    } else {
      setSelectedMovIds(movements.map(m => m.id))
    }
  }

  const handleToggleSelectOne = (id: string) => {
    setSelectedMovIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const handleBulkDeleteMovements = async () => {
    if (!selectedMovIds.length) return
    if (!window.confirm(`Seçili ${selectedMovIds.length} adet stok hareket kaydını kalıcı olarak silmek istediğinize emin misiniz?`)) return
    try {
      await api('/movements/bulk-delete', {
        method: 'DELETE',
        body: JSON.stringify(selectedMovIds),
      })
      toast.success(`${selectedMovIds.length} adet stok hareketi silindi.`)
      setSelectedMovIds([])
      qc.invalidateQueries({ queryKey: ['movements'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleClearAllMovements = async () => {
    if (!movements.length) return
    if (!window.confirm(`DİKKAT: Listedeki tüm (${movements.length}) hareket kaydını toplu olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return
    try {
      await api('/movements/bulk-delete?all_clear=true', {
        method: 'DELETE',
      })
      toast.success('Tüm hareket geçmişi başarıyla temizlendi.')
      setSelectedMovIds([])
      qc.invalidateQueries({ queryKey: ['movements'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleDeleteTransfer = async (t: TransferRecord) => {
    if (!window.confirm(`${t.transfer_no} numaralı transfer kaydını silmek istediğinize emin misiniz?`)) return
    try {
      await api(`/transfers/${t.id}`, { method: 'DELETE' })
      toast.success('Transfer kaydı silindi.')
      qc.invalidateQueries({ queryKey: ['transfers'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800'

  const pendingTransfersCount = transfers.filter(t => t.status === 'pending').length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stok Hareketleri ve Transferler</h1>
          <p className="text-sm text-slate-500">
            Silinemez stok hareket defteri, ters işlem düzeltmeleri ve onaylı depolar arası transferler
          </p>
        </div>
        {can('movement.create') && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setMProductId(products[0]?.id || '')
                setMToWh(warehouses[0]?.id || '')
                setOpenMovModal(true)
              }}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> Yeni Stok Hareketi
            </button>
            <button
              onClick={() => {
                setTProductId(products[0]?.id || '')
                setTFromWh(warehouses[0]?.id || '')
                setTToWh(warehouses[1]?.id || '')
                setOpenTrfModal(true)
              }}
              className="flex items-center gap-2 rounded-lg border border-brand-600 px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50 dark:text-indigo-400 dark:hover:bg-slate-800"
            >
              <ArrowRightLeft className="h-4 w-4" /> Depolar Arası Transfer
            </button>
          </div>
        )}
      </div>

      {/* Sekmeler */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setTab('movements')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold ${
            tab === 'movements'
              ? 'border-brand-600 text-brand-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500'
          }`}
        >
          <Repeat className="h-4 w-4" /> Stok Hareket Geçmişi ({movements.length})
        </button>
        <button
          onClick={() => setTab('transfers')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold ${
            tab === 'transfers'
              ? 'border-brand-600 text-brand-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500'
          }`}
        >
          <ArrowRightLeft className="h-4 w-4" /> Depolar Arası Transfer Onayları ({transfers.length})
          {pendingTransfersCount > 0 && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white">
              {pendingTransfersCount} Bekleyen
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: STOK HAREKETLERİ */}
      {tab === 'movements' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Tüm Hareket Türleri</option>
                {Object.entries(MOV_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            {can('movement.approve') && (
              <div className="flex items-center gap-2">
                {selectedMovIds.length > 0 && (
                  <button
                    onClick={handleBulkDeleteMovements}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Seçilenleri Sil ({selectedMovIds.length})
                  </button>
                )}
                <button
                  onClick={handleClearAllMovements}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Tüm Geçmişi Temizle
                </button>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {mLoad ? (
              <div className="grid place-items-center p-12">
                <Loader2 className="animate-spin text-brand-600" />
              </div>
            ) : !movements.length ? (
              <div className="p-12 text-center text-slate-500">Stok hareketi bulunamadı.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                    <tr>
                      <th className="p-3.5 w-10">
                        <input
                          type="checkbox"
                          checked={movements.length > 0 && selectedMovIds.length === movements.length}
                          onChange={handleToggleSelectAll}
                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                      </th>
                      <th className="p-3.5">İşlem No</th>
                      <th className="p-3.5">Tarih</th>
                      <th className="p-3.5">Tür</th>
                      <th className="p-3.5">Ürün / Seri No</th>
                      <th className="p-3.5">Adet</th>
                      <th className="p-3.5">Önceki → Yeni Konum</th>
                      <th className="p-3.5">Kullanıcı</th>
                      <th className="p-3.5">Açıklama</th>
                      <th className="p-3.5 text-right">Düzeltme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map(m => {
                      const info = MOV_LABELS[m.movement_type] || {
                        label: m.movement_type,
                        cls: 'bg-slate-100',
                      }
                      const first = m.items[0]
                      const isSelected = selectedMovIds.includes(m.id)
                      return (
                        <tr
                          key={m.id}
                          className={`border-t border-slate-100 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-800/40 ${
                            m.is_reversed ? 'opacity-50 line-through' : ''
                          } ${isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''}`}
                        >
                          <td className="p-3.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectOne(m.id)}
                              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                          </td>
                          <td className="p-3.5 font-mono text-xs font-bold text-brand-600 dark:text-indigo-400">
                            {m.movement_no}
                          </td>
                          <td className="p-3.5 whitespace-nowrap text-xs text-slate-500">
                            {new Date(m.occurred_at).toLocaleString('tr-TR')}
                          </td>
                          <td className="p-3.5">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${info.cls}`}>
                              {info.label}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <div className="font-medium">{first?.product_name || '—'}</div>
                            {first?.serial_number && (
                              <div className="font-mono text-xs text-slate-500">SN: {first.serial_number}</div>
                            )}
                          </td>
                          <td className="p-3.5 font-bold">
                            {first ? fmtQty(first.quantity) : '—'}
                          </td>
                          <td className="p-3.5 text-xs">
                            {(first?.previous_location_text || m.from_warehouse_name || '—') +
                              ' → ' +
                              (first?.new_location_text || m.to_warehouse_name || '—')}
                          </td>
                          <td className="p-3.5 text-xs">{m.performed_by_name}</td>
                          <td className="p-3.5 text-xs text-slate-500">{m.note || '—'}</td>
                          <td className="p-3.5 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {can('movement.approve') && !m.is_reversed && m.movement_type !== 'reversal' && (
                                <button
                                  onClick={() => handleReverse(m)}
                                  className="inline-flex items-center gap-1 rounded border border-amber-200 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950/40"
                                  title="Ters İşlem Oluştur"
                                >
                                  <RotateCcw className="h-3 w-3" /> Ters İşlem
                                </button>
                              )}
                              {can('movement.approve') && (
                                <button
                                  onClick={() => handleDeleteMovement(m)}
                                  className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                  title="Hareketi Sil"
                                >
                                  <Trash2 className="h-3 w-3" /> Sil
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
        </div>
      )}

      {/* TAB 2: ONAYLI DEPOLAR ARASI TRANSFERLER */}
      {tab === 'transfers' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {tLoad ? (
            <div className="grid place-items-center p-12">
              <Loader2 className="animate-spin text-brand-600" />
            </div>
          ) : !transfers.length ? (
            <div className="p-12 text-center text-slate-500">
              Henüz depolar arası transfer talebi bulunmuyor.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                <tr>
                  <th className="p-3.5">Transfer No</th>
                  <th className="p-3.5">Ürün / Cihaz</th>
                  <th className="p-3.5">Adet</th>
                  <th className="p-3.5">Kaynak Depo → Hedef Depo</th>
                  <th className="p-3.5">Talep Eden</th>
                  <th className="p-3.5">Durum</th>
                  <th className="p-3.5 text-right">Onay İşlemi</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map(t => (
                  <tr key={t.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-3.5 font-mono text-xs font-bold text-brand-600">{t.transfer_no}</td>
                    <td className="p-3.5">
                      <div className="font-semibold">{t.product_name}</div>
                      {t.serial_number && (
                        <div className="font-mono text-xs text-slate-500">SN: {t.serial_number}</div>
                      )}
                    </td>
                    <td className="p-3.5 font-bold">{fmtQty(t.quantity)}</td>
                    <td className="p-3.5 text-xs font-medium">
                      {t.from_warehouse_name} → {t.to_warehouse_name}
                    </td>
                    <td className="p-3.5 text-xs">{t.requested_by_name}</td>
                    <td className="p-3.5">
                      {t.status === 'pending' && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                          Onay Bekliyor (Lokasyon Değişmedi)
                        </span>
                      )}
                      {t.status === 'approved' && (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                          Onaylandı ({t.approved_by_name})
                        </span>
                      )}
                      {t.status === 'rejected' && (
                        <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                          Reddedildi
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        {t.status === 'pending' && can('movement.approve') && (
                          <>
                            <button
                              onClick={() => handleApproveTransfer(t.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Onayla
                            </button>
                            <button
                              onClick={() => handleRejectTransfer(t.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                            >
                              <XCircle className="h-3.5 w-3.5" /> Reddet
                            </button>
                          </>
                        )}
                        {can('movement.approve') && (
                          <button
                            onClick={() => handleDeleteTransfer(t)}
                            className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                            title="Transfer Kaydını Sil"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Sil
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* YENİ STOK HAREKETİ MODALI */}
      {openMovModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={submitMovement}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Yeni Stok Hareketi Oluştur</h2>
              <button type="button" onClick={() => setOpenMovModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <label className="block text-sm font-medium">
              Hareket Türü *
              <select
                value={mType}
                onChange={e => setMType(e.target.value)}
                className={inputCls + ' mt-1'}
              >
                <option value="initial">İlk Ürün Girişi</option>
                <option value="purchase">Satın Alma Girişi</option>
                <option value="manual_in">Manuel Giriş</option>
                <option value="out">Depodan Çıkış</option>
                <option value="to_project">Projeye Gönderim</option>
                <option value="from_project">Projeden Geri Dönüş</option>
                <option value="to_service">Servise Gönderim</option>
                <option value="from_service">Servisten Dönüş</option>
                <option value="scrap">Hurdaya Ayırma</option>
                <option value="count_diff">Sayım Farkı</option>
                <option value="adjustment">Stok Düzeltmesi</option>
              </select>
            </label>

            <label className="block text-sm font-medium">
              Ürün *
              <select
                required
                value={mProductId}
                onChange={e => {
                  setMProductId(e.target.value)
                  setMAssetId('')
                }}
                className={inputCls + ' mt-1'}
              >
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.inventory_code} — {p.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Seri Numaralı Cihaz (Varsa)
                <select
                  value={mAssetId}
                  onChange={e => setMAssetId(e.target.value)}
                  className={inputCls + ' mt-1'}
                >
                  <option value="">— Adet Bazlı / Seçilmedi —</option>
                  {assets
                    .filter(a => a.product_id === mProductId)
                    .map(a => (
                      <option key={a.id} value={a.id}>
                        {a.serial_number} ({a.inventory_code})
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Miktar *
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={mQty}
                  onChange={e => setMQty(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Kaynak Depo (Çıkış ise)
                <select
                  value={mFromWh}
                  onChange={e => setMFromWh(e.target.value)}
                  className={inputCls + ' mt-1'}
                >
                  <option value="">— Seçilmedi —</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Hedef Depo (Giriş ise)
                <select
                  value={mToWh}
                  onChange={e => setMToWh(e.target.value)}
                  className={inputCls + ' mt-1'}
                >
                  <option value="">— Seçilmedi —</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {(mType === 'to_project' || mType === 'from_project') && (
              <label className="block text-sm font-medium">
                İlgili Proje Adı
                <input
                  value={mProject}
                  onChange={e => setMProject(e.target.value)}
                  className={inputCls + ' mt-1'}
                  placeholder="Örn: Adana Müzesi"
                />
              </label>
            )}

            <label className="block text-sm font-medium">
              Açıklama
              <textarea
                rows={2}
                value={mNote}
                onChange={e => setMNote(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenMovModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                İptal
              </button>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                Hareketi Kaydet
              </button>
            </div>
          </form>
        </div>
      )}

      {/* YENİ DEPOLAR ARASI TRANSFER TALEBİ MODALI */}
      {openTrfModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={submitTransfer}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Depolar Arası Transfer Talebi</h2>
                <p className="text-xs text-slate-500">
                  Transfer onaylanmadan ürünün lokasyonu ve depo bakiyesi değişmez.
                </p>
              </div>
              <button type="button" onClick={() => setOpenTrfModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Kaynak Depo *
                <select
                  required
                  value={tFromWh}
                  onChange={e => setTFromWh(e.target.value)}
                  className={inputCls + ' mt-1'}
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Hedef Depo *
                <select
                  required
                  value={tToWh}
                  onChange={e => setTToWh(e.target.value)}
                  className={inputCls + ' mt-1'}
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-sm font-medium">
              Ürün *
              <select
                required
                value={tProductId}
                onChange={e => {
                  setTProductId(e.target.value)
                  setTAssetId('')
                }}
                className={inputCls + ' mt-1'}
              >
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.inventory_code} — {p.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Seri Numaralı Cihaz (Varsa)
                <select
                  value={tAssetId}
                  onChange={e => setTAssetId(e.target.value)}
                  className={inputCls + ' mt-1'}
                >
                  <option value="">— Adet Bazlı —</option>
                  {assets
                    .filter(a => a.product_id === tProductId)
                    .map(a => (
                      <option key={a.id} value={a.id}>
                        {a.serial_number}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Miktar *
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={tQty}
                  onChange={e => setTQty(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
            </div>

            <label className="block text-sm font-medium">
              Transfer Açıklaması
              <textarea
                rows={2}
                value={tNote}
                onChange={e => setTNote(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenTrfModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                İptal
              </button>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                Onaya Gönder
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
