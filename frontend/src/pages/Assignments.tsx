import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Loader2, Plus, Printer, RotateCcw, Trash2, Truck, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { EmployeeItem } from '@/pages/Employees'
import type { WarehouseItem } from '@/pages/Warehouses'
import type { AssetItem, ProductItem } from '@/pages/Inventory'
import type { StockBalanceItem } from '@/pages/Warehouses'

interface AssignmentLine {
  id: string
  product_id: string
  product_name: string
  brand_name?: string | null
  model_name?: string | null
  inventory_code: string
  asset_id: string | null
  serial_number: string | null
  quantity: string
  returned_quantity: string
  is_returned: boolean
  returned_at: string | null
}

interface AssignmentRecord {
  id: string
  assignment_no: string
  from_warehouse_id: string | null
  from_warehouse_name: string | null
  employee_id: string
  employee_name: string
  employee_department: string | null
  employee_position: string | null
  delivered_by_name: string
  delivered_at: string
  expected_return_date: string | null
  status: 'active' | 'partial_returned' | 'returned'
  note: string | null
  items: AssignmentLine[]
}

export default function AssignmentsPage() {
  const { can } = useAuth()
  const qc = useQueryClient()

  const [openCreate, setOpenCreate] = useState(false)
  const [printRecord, setPrintRecord] = useState<AssignmentRecord | null>(null)
  const [returnModal, setReturnModal] = useState<{
    assignment: AssignmentRecord
    item: AssignmentLine
  } | null>(null)

  // Yeni Zimmet State
  const [empId, setEmpId] = useState('')
  const [fromWhId, setFromWhId] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<{ product_id: string; asset_id: string; quantity: string }[]>([
    { product_id: '', asset_id: '', quantity: '1' },
  ])

  // İade State
  const [retQty, setRetQty] = useState('1')
  const [retWhId, setRetWhId] = useState('')
  const [retCond, setRetCond] = useState('excellent')
  const [retNote, setRetNote] = useState('')

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => api<AssignmentRecord[]>('/assignments'),
  })

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<EmployeeItem[]>('/employees'),
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
  const { data: allStockBalances = [] } = useQuery({
    queryKey: ['warehouse-stock'],
    queryFn: () => api<StockBalanceItem[]>('/warehouses/stock'),
  })

  // Seçilen depodaki stok miktarları haritası (product_id -> bakiye)
  const selectedWhStockMap = fromWhId
    ? allStockBalances
        .filter(b => b.warehouse_id === fromWhId && b.source_type === 'warehouse')
        .reduce<Record<string, number>>((acc, b) => {
          acc[b.product_id] = (acc[b.product_id] || 0) + Number(b.quantity || 0)
          return acc
        }, {})
    : {}

  const selectedWhName = warehouses.find(w => w.id === fromWhId)?.name || ''

  const openNewAssignment = () => {
    if (!employees.length) {
      toast.error('Önce Personel menüsünden en az bir personel ekleyin.')
      return
    }
    if (!products.length) {
      toast.error('Önce Envanter menüsünden ürün ekleyin.')
      return
    }
    const initialWhId = warehouses[0]?.id || ''
    setEmpId(employees[0].id)
    setFromWhId(initialWhId)
    setNote('')
    setLines([{ product_id: products[0].id, asset_id: '', quantity: '1' }])
    setOpenCreate(true)
  }

  const submitAssignment = async (e: FormEvent) => {
    e.preventDefault()
    if (!fromWhId) {
      toast.error('Lütfen çıkış yapılacak depoyu seçin.')
      return
    }

    // Frontend doğrulaması
    for (const l of lines) {
      const prod = products.find(p => p.id === l.product_id)
      const prodName = prod?.name || 'Ürün'
      if (l.asset_id) {
        const ast = assets.find(a => a.id === l.asset_id)
        if (ast && ast.warehouse_name && ast.warehouse_name !== selectedWhName) {
          toast.error(
            `'${ast.serial_number}' seri numaralı cihaz '${ast.warehouse_name}' deposundadır. '${selectedWhName}' üzerinden teslim edilemez!`
          )
          return
        }
      } else {
        const currentWhQty = selectedWhStockMap[l.product_id] || 0
        const reqQty = Number(l.quantity || 0)
        if (reqQty <= 0) {
          toast.error(`'${prodName}' için geçerli bir teslim adedi girin.`)
          return
        }
        if (reqQty > currentWhQty) {
          toast.error(
            `'${prodName}' için ${selectedWhName} deposunda yeterli stok yok! (Mevcut: ${currentWhQty}, İstenen: ${reqQty})`
          )
          return
        }
      }
    }

    try {
      await api('/assignments', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: empId,
          from_warehouse_id: fromWhId,
          note: note || null,
          items: lines.map(l => ({
            product_id: l.product_id,
            asset_id: l.asset_id || null,
            quantity: l.quantity || '1',
          })),
        }),
      })
      toast.success('Zimmet teslim fişi oluşturuldu.')
      qc.invalidateQueries({ queryKey: ['assignments'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['warehouse-stock'] })
      setOpenCreate(false)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const submitReturn = async (e: FormEvent) => {
    e.preventDefault()
    if (!returnModal) return
    try {
      await api(`/assignments/${returnModal.assignment.id}/return`, {
        method: 'POST',
        body: JSON.stringify({
          assignment_item_id: returnModal.item.id,
          returned_quantity: retQty,
          to_warehouse_id: retWhId || null,
          condition_on_return: retCond,
          note: retNote || null,
        }),
      })
      toast.success('Zimmet iadesi kaydedildi.')
      qc.invalidateQueries({ queryKey: ['assignments'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['warehouse-stock'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
      setReturnModal(null)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleDeleteAssignment = async (asg: AssignmentRecord) => {
    if (
      !window.confirm(
        `"${asg.assignment_no}" numaralı zimmet fişini silmek istediğinize emin misiniz?\n\nİade edilmemiş tüm malzemeler otomatik olarak depoya geri aktarılacaktır.`,
      )
    ) {
      return
    }
    try {
      await api(`/assignments/${asg.id}`, { method: 'DELETE' })
      toast.success(`${asg.assignment_no} numaralı zimmet fişi silindi ve malzemeler depoya döndürüldü.`)
      qc.invalidateQueries({ queryKey: ['assignments'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['warehouse-stock'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleDeleteItem = async (asg: AssignmentRecord, item: AssignmentLine) => {
    const rem = Number(item.quantity) - Number(item.returned_quantity)
    const confirmMsg =
      rem > 0
        ? `Bu satır silindiğinde personeldeki ${rem} adet '${item.product_name}' otomatik olarak depoya geri aktarılacaktır. Silmek istediğinize emin misiniz?`
        : `'${item.product_name}' kalemini bu zimmet fişinden silmek istediğinize emin misiniz?`

    if (!window.confirm(confirmMsg)) return

    try {
      await api(`/assignments/${asg.id}/items/${item.id}`, { method: 'DELETE' })
      toast.success(`'${item.product_name}' kalemi zimmetten silindi.`)
      qc.invalidateQueries({ queryKey: ['assignments'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['warehouse-stock'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const [selectedAsgIds, setSelectedAsgIds] = useState<string[]>([])

  const handleBulkDeleteAssignments = async () => {
    if (!selectedAsgIds.length) return
    if (!window.confirm(`Seçili ${selectedAsgIds.length} adet zimmet fişini silmek istediğinize emin misiniz?\n\nİade edilmemiş tüm malzemeler otomatik olarak depoya geri aktarılacaktır.`)) return
    try {
      await api('/assignments/bulk-delete', {
        method: 'DELETE',
        body: JSON.stringify(selectedAsgIds),
      })
      toast.success(`${selectedAsgIds.length} adet zimmet fişi silindi ve malzemeler depoya döndürüldü.`)
      setSelectedAsgIds([])
      qc.invalidateQueries({ queryKey: ['assignments'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['warehouse-stock'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleClearAllAssignments = async () => {
    if (!assignments.length) return
    if (!window.confirm(`DİKKAT: Sistemdeki TÜM (${assignments.length}) zimmet fişini silmek ve tüm zimmetli malzemeleri depoya geri çekmek istediğinize emin misiniz?`)) return
    try {
      await api('/assignments/bulk-delete?all_clear=true', {
        method: 'DELETE',
      })
      toast.success('Tüm zimmet fişleri başarıyla silindi ve malzemeler depoya aktarıldı.')
      setSelectedAsgIds([])
      qc.invalidateQueries({ queryKey: ['assignments'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['warehouse-stock'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
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
          <h1 className="text-2xl font-bold tracking-tight">Zimmet Yönetimi</h1>
          <p className="text-sm text-slate-500">
            Personel zimmet teslim fişleri, iade işlemleri ve yazdırılabilir zimmet tutanakları
          </p>
        </div>
        {can('assignment.manage') && (
          <div className="flex items-center gap-2">
            {selectedAsgIds.length > 0 && (
              <button
                onClick={handleBulkDeleteAssignments}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-rose-700 transition"
              >
                <Trash2 className="h-4 w-4" /> Seçilenleri Sil ({selectedAsgIds.length})
              </button>
            )}
            {assignments.length > 0 && (
              <button
                onClick={handleClearAllAssignments}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300 transition"
              >
                <Trash2 className="h-4 w-4" /> Tümünü Temizle
              </button>
            )}
            <button
              onClick={openNewAssignment}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> Yeni Zimmet Teslimi
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {isLoading ? (
          <div className="grid place-items-center p-12">
            <Loader2 className="animate-spin text-brand-600" />
          </div>
        ) : !assignments.length ? (
          <div className="p-12 text-center text-slate-500">
            <Truck className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            Henüz kayıtlı zimmet işlemi bulunmuyor.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {assignments.map(asg => {
              const isSelected = selectedAsgIds.includes(asg.id)
              return (
              <div key={asg.id} className={`p-5 transition ${isSelected ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {can('assignment.manage') && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setSelectedAsgIds(prev =>
                            prev.includes(asg.id) ? prev.filter(x => x !== asg.id) : [...prev, asg.id]
                          )
                        }}
                        className="mt-1 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-brand-600 dark:text-indigo-400">
                          {asg.assignment_no}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            asg.status === 'active'
                              ? 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300'
                              : asg.status === 'partial_returned'
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                          }`}
                        >
                          {asg.status === 'active'
                            ? 'Aktif Zimmet'
                            : asg.status === 'partial_returned'
                              ? 'Kısmi İade'
                              : 'Tamamı İade Alındı'}
                        </span>
                      </div>
                      <div className="mt-1 text-base font-bold">
                        Teslim Alan: {asg.employee_name}{' '}
                        {asg.from_warehouse_name && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            Depo: {asg.from_warehouse_name}
                          </span>
                        )}
                        <span className="text-xs font-normal text-slate-500">
                          ({[asg.employee_department, asg.employee_position].filter(Boolean).join(' • ')})
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        Teslim Eden: {asg.delivered_by_name} • Tarih:{' '}
                        {new Date(asg.delivered_at).toLocaleString('tr-TR')}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPrintRecord(asg)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      <FileText className="h-4 w-4 text-brand-600" /> Zimmet Belgesi (PDF / Yazdır)
                    </button>
                    {can('assignment.manage') && (
                      <button
                        onClick={() => handleDeleteAssignment(asg)}
                        title="Zimmet Fişini Sil (Depoya İade Et)"
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/60 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" /> Sil
                      </button>
                    )}
                  </div>
                </div>

                {/* Kalemler */}
                <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-left uppercase text-slate-500 dark:bg-slate-800/50">
                      <tr>
                        <th className="p-2.5">Envanter Kodu</th>
                        <th className="p-2.5">Ürün Adı</th>
                        <th className="p-2.5">Marka / Model</th>
                        <th className="p-2.5">Seri Numarası</th>
                        <th className="p-2.5">Teslim Adedi</th>
                        <th className="p-2.5">İade Edilen</th>
                        <th className="p-2.5 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asg.items.map(it => {
                        const rem = Number(it.quantity) - Number(it.returned_quantity)
                        return (
                          <tr key={it.id} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="p-2.5 font-mono text-brand-600">{it.inventory_code}</td>
                            <td className="p-2.5 font-medium">
                              <div>{it.product_name}</div>
                            </td>
                            <td className="p-2.5">
                              {it.model_name || it.brand_name ? (
                                <div className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                                  {[it.brand_name, it.model_name].filter(Boolean).join(' • ')}
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="p-2.5 font-mono font-bold">{it.serial_number || '—'}</td>
                            <td className="p-2.5 font-semibold">{Number(it.quantity)}</td>
                            <td className="p-2.5">
                              {Number(it.returned_quantity)}
                              {it.returned_at && (
                                <span className="ml-1 text-slate-400">
                                  ({new Date(it.returned_at).toLocaleDateString('tr-TR')})
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                {!it.is_returned && can('assignment.manage') ? (
                                  <button
                                    onClick={() => {
                                      setRetQty(String(rem))
                                      setRetWhId(asg.from_warehouse_id || warehouses[0]?.id || '')
                                      setReturnModal({ assignment: asg, item: it })
                                    }}
                                    className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-700"
                                  >
                                    <RotateCcw className="h-3 w-3" /> İade Al
                                  </button>
                                ) : (
                                  <span className="text-emerald-600 font-semibold">İade Tamamlandı</span>
                                )}
                                {can('assignment.manage') && (
                                  <button
                                    onClick={() => handleDeleteItem(asg, it)}
                                    title="Bu kalemi zimmet fişinden sil (Personeldeyse depoya döner)"
                                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 transition"
                                  >
                                    <Trash2 className="h-4 w-4" />
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
              </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Yeni Zimmet Teslim Modalı */}
      {openCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={submitAssignment}
            className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Yeni Personel Zimmet Teslimi</h2>
              <button type="button" onClick={() => setOpenCreate(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Teslim Alan Personel *
                <select
                  required
                  value={empId}
                  onChange={e => setEmpId(e.target.value)}
                  className={inputCls + ' mt-1'}
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} {emp.position ? `(${emp.position})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium">
                Çıkış Yapılan Depo *
                <select
                  required
                  value={fromWhId}
                  onChange={e => {
                    const newWhId = e.target.value
                    setFromWhId(newWhId)
                    // Depo değiştiğinde seçili seri cihazları sıfırla ki yanlış depodaki cihaz seçili kalmasın
                    setLines(lines.map(l => ({ ...l, asset_id: '' })))
                  }}
                  className={inputCls + ' mt-1'}
                >
                  <option value="">— Çıkış Yapılacak Depoyu Seçin —</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>Zimmetlenecek Ürün / Cihaz Kalemleri</span>
                <button
                  type="button"
                  onClick={() =>
                    setLines([
                      ...lines,
                      { product_id: products[0]?.id || '', asset_id: '', quantity: '1' },
                    ])
                  }
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  + Kalem Ekle
                </button>
              </div>
              {lines.map((ln, idx) => {
                const whQty = selectedWhStockMap[ln.product_id] || 0
                const availableAssetsForProd = assets.filter(
                  a =>
                    a.product_id === ln.product_id &&
                    a.status !== 'assigned' &&
                    (!fromWhId || !a.warehouse_name || a.warehouse_name === selectedWhName)
                )
                const hasStockInWh = whQty > 0 || availableAssetsForProd.length > 0

                return (
                  <div key={idx} className="space-y-1">
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-5">
                        <select
                          value={ln.product_id}
                          onChange={e => {
                            const next = [...lines]
                            next[idx].product_id = e.target.value
                            next[idx].asset_id = ''
                            next[idx].quantity = '1'
                            setLines(next)
                          }}
                          className={inputCls}
                        >
                          <optgroup label="Teknik Envanter Ürünleri">
                            {products
                              .filter(p => !p.is_fixture)
                              .map(p => {
                                const pWhQty = selectedWhStockMap[p.id] || 0
                                const pAssets = assets.filter(
                                  a =>
                                    a.product_id === p.id &&
                                    a.status !== 'assigned' &&
                                    (!fromWhId || !a.warehouse_name || a.warehouse_name === selectedWhName)
                                )
                                const pAvailable = p.tracking_type === 'serial' ? pAssets.length : pWhQty
                                return (
                                  <option key={p.id} value={p.id}>
                                    [Envanter] {p.name}{p.model_name ? ` (${p.model_name})` : p.brand_name ? ` (${p.brand_name})` : ''} {fromWhId ? `(Bu Depoda: ${pAvailable} ${p.unit || 'Adet'})` : ''}
                                  </option>
                                )
                              })}
                          </optgroup>
                          <optgroup label="Şirket Demirbaşları">
                            {products
                              .filter(p => p.is_fixture)
                              .map(p => {
                                const pWhQty = selectedWhStockMap[p.id] || 0
                                const pAssets = assets.filter(
                                  a =>
                                    a.product_id === p.id &&
                                    a.status !== 'assigned' &&
                                    (!fromWhId || !a.warehouse_name || a.warehouse_name === selectedWhName)
                                )
                                const pAvailable = p.tracking_type === 'serial' ? pAssets.length : pWhQty
                                return (
                                  <option key={p.id} value={p.id}>
                                    [Demirbaş] {p.name}{p.model_name ? ` (${p.model_name})` : p.brand_name ? ` (${p.brand_name})` : ''} {fromWhId ? `(Bu Depoda: ${pAvailable} ${p.unit || 'Adet'})` : ''}
                                  </option>
                                )
                              })}
                          </optgroup>
                        </select>
                      </div>
                      <div className="col-span-4">
                        <select
                          value={ln.asset_id}
                          onChange={e => {
                            const next = [...lines]
                            next[idx].asset_id = e.target.value
                            setLines(next)
                          }}
                          className={inputCls}
                        >
                          <option value="">— Seri Cihaz Seçin (Opsiyonel) —</option>
                          {availableAssetsForProd.map(a => (
                            <option key={a.id} value={a.id}>
                              {a.serial_number} {a.warehouse_name ? `(${a.warehouse_name})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="1"
                          max={ln.asset_id ? 1 : Math.max(1, whQty)}
                          step="1"
                          disabled={!!ln.asset_id}
                          value={ln.asset_id ? '1' : ln.quantity}
                          onChange={e => {
                            const next = [...lines]
                            next[idx].quantity = e.target.value
                            setLines(next)
                          }}
                          className={inputCls}
                          title={ln.asset_id ? 'Seri cihaz tesliminde adet 1 dir.' : `Maksimum teslim adedi: ${whQty}`}
                        />
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    {fromWhId && !hasStockInWh && (
                      <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400 pl-1">
                        ⚠️ Bu ürün seçili <strong>{selectedWhName}</strong> deposunda tükenmiş veya mevcut değil. Çıkış için lütfen ürünün bulunduğu depoyu seçin.
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <label className="block text-sm font-medium">
              Zimmet Açıklaması / Not
              <textarea
                rows={2}
                value={note}
                onChange={e => setNote(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenCreate(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                İptal
              </button>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                Zimmeti Kaydet
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Zimmet İade Modalı */}
      {returnModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={submitReturn}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Zimmet İadesi Al</h2>
              <button type="button" onClick={() => setReturnModal(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800 space-y-1">
              <div>
                <strong>Personel:</strong> {returnModal.assignment.employee_name}
              </div>
              <div>
                <strong>Ürün:</strong> {returnModal.item.product_name}{' '}
                {[returnModal.item.brand_name, returnModal.item.model_name].filter(Boolean).length > 0 &&
                  `(${[returnModal.item.brand_name, returnModal.item.model_name].filter(Boolean).join(' - ')}) `}
                {returnModal.item.serial_number && `(SN: ${returnModal.item.serial_number})`}
              </div>
              {returnModal.assignment.from_warehouse_name && (
                <div className="text-slate-600 dark:text-slate-400">
                  <strong>Çıkış Deposu:</strong> {returnModal.assignment.from_warehouse_name}
                </div>
              )}
            </div>

            <label className="block text-sm font-medium">
              İade Alınan Depo *
              <select
                required
                value={retWhId}
                onChange={e => setRetWhId(e.target.value)}
                className={inputCls + ' mt-1'}
              >
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>

            {returnModal.assignment.from_warehouse_id &&
              retWhId &&
              returnModal.assignment.from_warehouse_id !== retWhId && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-300">
                  ⚠️ <strong>Farklı Depoya İade Uyarısı:</strong> Bu ürün <strong>{returnModal.assignment.from_warehouse_name}</strong> deposundan zimmetlenmiştir. İadeyi <strong>{warehouses.find(w => w.id === retWhId)?.name}</strong> deposuna almak üzeresiniz. Onaylarsanız stok bu yeni depoya girecektir.
                </div>
              )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                İade Adedi *
                <input
                  type="number"
                  min="1"
                  required
                  value={retQty}
                  onChange={e => setRetQty(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
              <label className="block text-sm font-medium">
                Cihaz Kondisyonu
                <select
                  value={retCond}
                  onChange={e => setRetCond(e.target.value)}
                  className={inputCls + ' mt-1'}
                >
                  <option value="excellent">Kusursuz / Sağlam</option>
                  <option value="good">İyi</option>
                  <option value="fair">Hasarlı / Kontrol Edilmeli</option>
                </select>
              </label>
            </div>

            <label className="block text-sm font-medium">
              İade Notu
              <input
                value={retNote}
                onChange={e => setRetNote(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReturnModal(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                İptal
              </button>
              <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                İadeyi Onayla
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Yazdırılabilir / PDF Zimmet Teslim ve İade Belgesi */}
      {printRecord && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4">
          <div className="mx-auto my-6 max-w-3xl rounded-2xl bg-white p-8 text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-4 print:hidden">
              <span className="text-sm font-bold">Zimmet Teslim & İade Tutanağı Önizleme</span>
              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white"
                >
                  <Printer className="h-4 w-4" /> Yazdır / PDF Kaydet
                </button>
                <button onClick={() => setPrintRecord(null)}>
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-6">
              <div className="flex items-start justify-between border-b border-slate-300 pb-4">
                <div>
                  <div className="text-xl font-black tracking-tight text-indigo-700">KÜP PRODÜKSİYON</div>
                  <div className="text-sm font-bold">PERSONEL EKİPMAN ZİMMET TESLİM / İADE BELGESİ</div>
                </div>
                <div className="text-right text-xs">
                  <div>
                    <strong>Belge No:</strong> {printRecord.assignment_no}
                  </div>
                  <div>
                    <strong>Tarih:</strong> {new Date(printRecord.delivered_at).toLocaleString('tr-TR')}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 p-4 text-xs">
                <div>
                  <div>
                    <strong>Teslim Alan Personel:</strong> {printRecord.employee_name}
                  </div>
                  <div>
                    <strong>Departman / Görev:</strong>{' '}
                    {[printRecord.employee_department, printRecord.employee_position]
                      .filter(Boolean)
                      .join(' / ') || '—'}
                  </div>
                </div>
                <div>
                  <div>
                    <strong>Teslim Eden Yetkili:</strong> {printRecord.delivered_by_name}
                  </div>
                  <div>
                    <strong>Belge Durumu:</strong> {printRecord.status}
                  </div>
                </div>
              </div>

              <table className="w-full border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 p-2 text-left">Envanter Kodu</th>
                    <th className="border border-slate-300 p-2 text-left">Ürün / Cihaz Adı</th>
                    <th className="border border-slate-300 p-2 text-left">Marka / Model</th>
                    <th className="border border-slate-300 p-2 text-left">Seri Numarası</th>
                    <th className="border border-slate-300 p-2 text-center">Teslim Adedi</th>
                    <th className="border border-slate-300 p-2 text-center">İade Durumu</th>
                  </tr>
                </thead>
                <tbody>
                  {printRecord.items.map(it => (
                    <tr key={it.id}>
                      <td className="border border-slate-300 p-2 font-mono">{it.inventory_code}</td>
                      <td className="border border-slate-300 p-2 font-medium">
                        <div>{it.product_name}</div>
                      </td>
                      <td className="border border-slate-300 p-2 text-xs">
                        {[it.brand_name, it.model_name].filter(Boolean).join(' / ') || '—'}
                      </td>
                      <td className="border border-slate-300 p-2 font-mono">{it.serial_number || '—'}</td>
                      <td className="border border-slate-300 p-2 text-center">{Number(it.quantity)}</td>
                      <td className="border border-slate-300 p-2 text-center">
                        {it.is_returned
                          ? `İade Alındı (${new Date(it.returned_at!).toLocaleDateString('tr-TR')})`
                          : 'Zimmette'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {printRecord.note && (
                <div className="text-xs">
                  <strong>Açıklama:</strong> {printRecord.note}
                </div>
              )}

              <p className="text-[11px] text-slate-600">
                Yukarıda seri numarası ve miktarı belirtilen ekipmanları çalışır ve eksiksiz durumda teslim aldım.
              </p>

              <div className="grid grid-cols-2 gap-8 pt-6 text-center text-xs">
                <div className="border-t border-slate-400 pt-2">
                  <strong>Teslim Eden Yetkili İmza</strong>
                  <div>{printRecord.delivered_by_name}</div>
                </div>
                <div className="border-t border-slate-400 pt-2">
                  <strong>Teslim Alan Personel İmza</strong>
                  <div>{printRecord.employee_name}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
