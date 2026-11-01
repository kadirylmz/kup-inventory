import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Filter,
  FolderKanban,
  Loader2,
  PackagePlus,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { fmtMoney, fmtQty } from '@/lib/format'
import type { WarehouseItem } from '@/pages/Warehouses'
import type { AssetItem, ProductItem } from '@/pages/Inventory'

interface ProjectAssetLine {
  id: string
  product_id: string
  product_name: string
  inventory_code: string
  unit: string
  asset_id: string | null
  serial_number: string | null
  quantity: string
  returned_quantity: string
  remaining_in_project: string
  status: 'in_project' | 'partial_returned' | 'returned'
  purchase_cost_total: string
  purchase_currency: string
  market_value_total: string
  market_value_currency: string
  sent_at: string
  returned_at: string | null
  note: string | null
}

interface ProjectRecord {
  id: string
  code: string
  name: string
  customer: string | null
  start_date: string | null
  end_date: string | null
  manager_name: string | null
  address: string | null
  status: 'planned' | 'active' | 'completed' | 'cancelled'
  description: string | null
  total_sent_items: number
  still_in_project_items: number
  returned_items: number
  purchase_cost_by_currency: Record<string, number>
  market_value_by_currency: Record<string, number>
  equipment: ProjectAssetLine[]
}

const PROJ_STATUS: Record<string, { label: string; cls: string }> = {
  planned: { label: 'Planlandı', cls: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  active: { label: 'Aktif Saha Projesi', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  completed: { label: 'Tamamlandı', cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
  cancelled: { label: 'İptal', cls: 'bg-slate-100 text-slate-500' },
}

function fmtMoneyMap(m: Record<string, number> | undefined) {
  if (!m) return '0 ₺'
  const parts: string[] = []
  if (m.TRY) parts.push(`${fmtMoney(m.TRY)} ₺`)
  if (m.EUR) parts.push(`${fmtMoney(m.EUR)} €`)
  if (m.USD) parts.push(`${fmtMoney(m.USD)} $`)
  return parts.length ? parts.join(' + ') : '0 ₺'
}

export default function ProjectsPage() {
  const { can } = useAuth()
  const qc = useQueryClient()

  const [selectedProjId, setSelectedProjId] = useState<string>('')
  const [openCreate, setOpenCreate] = useState(false)
  const [openSendModal, setOpenSendModal] = useState(false)
  const [returnModal, setReturnModal] = useState<{
    project: ProjectRecord
    item: ProjectAssetLine
  } | null>(null)

  // Yeni Proje State
  const [pCode, setPCode] = useState('')
  const [pName, setPName] = useState('')
  const [pCustomer, setPCustomer] = useState('')
  const [pStart, setPStart] = useState('')
  const [pEnd, setPEnd] = useState('')
  const [pManager, setPManager] = useState('')
  const [pAddress, setPAddress] = useState('')
  const [pDesc, setPDesc] = useState('')

  // Projeye Ekipman Gönderim State
  const [sFromWh, setSFromWh] = useState('')
  const [sNote, setSNote] = useState('')
  const [sLines, setSLines] = useState<{ product_id: string; asset_id: string; quantity: string }[]>([
    { product_id: '', asset_id: '', quantity: '1' },
  ])

  // Projeden İade State
  const [rQty, setRQty] = useState('1')
  const [rToWh, setRToWh] = useState('')
  const [rNote, setRNote] = useState('')

  // Proje Ekipman Filtresi (Varsayılan olarak projede aktif olanlar listelenir, istenirse tüm geçmiş görülebilir)
  const [showReturned, setShowReturned] = useState(false)

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<ProjectRecord[]>('/projects'),
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

  const activeProj = projects.find(p => p.id === selectedProjId) || projects[0]

  const createProject = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const res = await api<ProjectRecord>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          code: pCode.toUpperCase(),
          name: pName,
          customer: pCustomer || null,
          start_date: pStart || null,
          end_date: pEnd || null,
          manager_name: pManager || null,
          address: pAddress || null,
          description: pDesc || null,
        }),
      })
      toast.success('Proje oluşturuldu.')
      qc.invalidateQueries({ queryKey: ['projects'] })
      setSelectedProjId(res.id)
      setOpenCreate(false)
      setPCode('')
      setPName('')
      setPCustomer('')
      setPManager('')
      setPAddress('')
      setPDesc('')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const submitSendEquipment = async (e: FormEvent) => {
    e.preventDefault()
    if (!activeProj) return
    try {
      await api(`/projects/${activeProj.id}/send`, {
        method: 'POST',
        body: JSON.stringify({
          from_warehouse_id: sFromWh || null,
          note: sNote || null,
          items: sLines.map(l => ({
            product_id: l.product_id,
            asset_id: l.asset_id || null,
            quantity: l.asset_id ? '1' : l.quantity,
          })),
        }),
      })
      toast.success('Ekipmanlar projeye atandı.')
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['inventory-summary'] })
      setOpenSendModal(false)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const submitReturnEquipment = async (e: FormEvent) => {
    e.preventDefault()
    if (!returnModal) return
    try {
      await api(`/projects/${returnModal.project.id}/return`, {
        method: 'POST',
        body: JSON.stringify({
          project_asset_id: returnModal.item.id,
          returned_quantity: rQty,
          to_warehouse_id: rToWh || null,
          note: rNote || null,
        }),
      })
      toast.success('Ekipman projeden depoya iade alındı.')
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['inventory-summary'] })
      setReturnModal(null)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Proje ve Saha Ekipman Yönetimi</h1>
          <p className="text-sm text-slate-500">
            Müze, sergi ve prodüksiyon projelerindeki ekipmanlar, alış maliyetleri, piyasa değerleri ve iade takibi
          </p>
        </div>
        {can('project.manage') && (
          <div className="flex gap-2">
            <button
              onClick={() => setOpenCreate(true)}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> Yeni Proje Oluştur
            </button>
            {activeProj && (
              <button
                onClick={() => {
                  if (!products.length) {
                    toast.error('Önce Envanter menüsünden ürün ekleyin.')
                    return
                  }
                  setSFromWh(warehouses[0]?.id || '')
                  setSLines([{ product_id: products[0].id, asset_id: '', quantity: '1' }])
                  setOpenSendModal(true)
                }}
                className="flex items-center gap-2 rounded-lg border border-brand-600 px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50 dark:text-indigo-400 dark:hover:bg-slate-800"
              >
                <PackagePlus className="h-4 w-4" /> Projeye Ekipman Ata
              </button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid place-items-center p-12">
          <Loader2 className="animate-spin text-brand-600" />
        </div>
      ) : !projects.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-14 text-center text-slate-500 dark:border-slate-700">
          <FolderKanban className="mx-auto mb-3 h-10 w-10 text-slate-400" />
          <p className="font-medium">Henüz tanımlanmış proje bulunmuyor.</p>
          <p className="mt-1 text-xs">Örn: "Adana Müzesi" projesini oluşturup projektör, medya sunucusu ve kabloları atayabilirsiniz.</p>
        </div>
      ) : (
        <>
          {/* Proje Seçim Kartları */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
            {projects.map(p => {
              const isSelected = activeProj?.id === p.id
              const st = PROJ_STATUS[p.status] || { label: p.status, cls: 'bg-slate-100' }
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedProjId(p.id)}
                  className={`flex flex-col justify-between rounded-xl border p-4 text-left transition ${
                    isSelected
                      ? 'border-brand-600 bg-brand-50/40 ring-2 ring-brand-500/20 dark:border-indigo-500 dark:bg-indigo-950/30'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-brand-600 dark:text-indigo-400">
                      {p.code}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="text-base font-bold">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.customer || 'Kurum içi proje'}</div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800">
                    <span>Sahada: {p.still_in_project_items} kalem</span>
                    <span>Dönen: {p.returned_items}</span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Seçili Proje Detayı ve Finansal / Ekipman Tablosu */}
          {activeProj && (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-brand-600">{activeProj.code}</span>
                    <h2 className="text-xl font-bold">{activeProj.name}</h2>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {[
                      activeProj.customer && `Müşteri: ${activeProj.customer}`,
                      activeProj.manager_name && `Sorumlu: ${activeProj.manager_name}`,
                      activeProj.address && `Adres: ${activeProj.address}`,
                    ]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                </div>

                {/* Proje Finansal ve Miktar Özeti */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 px-3.5 py-2 dark:bg-slate-800">
                    <div className="text-[11px] text-slate-500">Gönderilen / Sahada / İade</div>
                    <div className="text-sm font-bold">
                      {activeProj.total_sent_items} /{' '}
                      <span className="text-indigo-600">{activeProj.still_in_project_items}</span> /{' '}
                      <span className="text-emerald-600">{activeProj.returned_items}</span>
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3.5 py-2 sm:col-span-1 dark:bg-slate-800">
                    <div className="text-[11px] text-slate-500">Sahadaki Alış Maliyeti</div>
                    <div className="text-sm font-bold">
                      {fmtMoneyMap(activeProj.purchase_cost_by_currency)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3.5 py-2 sm:col-span-2 dark:bg-slate-800">
                    <div className="text-[11px] text-slate-500">Sahadaki Güncel Piyasa Değeri</div>
                    <div className="text-sm font-bold text-emerald-600">
                      {fmtMoneyMap(activeProj.market_value_by_currency)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Proje Ekipman Listesi ve PDF Çıktı Butonu */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 print:hidden">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold">Projedeki Ekipmanlar</h3>
                  <button
                    type="button"
                    onClick={() => setShowReturned(prev => !prev)}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold border transition ${
                      showReturned
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                    }`}
                  >
                    <Filter className="h-3 w-3" />
                    {showReturned ? 'Tüm Geçmişi Göster (İade Edilenler Dahil)' : 'Yalnızca Projedeki Mevcutlar'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Printer className="h-3.5 w-3.5 text-slate-500" />
                  Proje Malzeme Listesini Yazdır / PDF İndir
                </button>
              </div>

              {(() => {
                const filteredEquipment = activeProj.equipment.filter(eq =>
                  showReturned ? true : Number(eq.remaining_in_project) > 0
                )
                if (!filteredEquipment.length) {
                  return (
                    <div className="p-8 text-center text-sm text-slate-400">
                      {showReturned
                        ? 'Bu projeye henüz ekipman gönderilmemiş.'
                        : 'Bu projede şu anda aktif malzeme bulunmuyor (Tüm gönderilenler depoya iade edilmiş).'}
                    </div>
                  )
                }

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                        <tr>
                          <th className="p-3">Envanter Kodu</th>
                          <th className="p-3">Ekipman Adı</th>
                          <th className="p-3">Seri Numarası</th>
                          <th className="p-3">Gönderilen</th>
                          <th className="p-3">Dönen</th>
                          <th className="p-3">Hâlâ Projede</th>
                          <th className="p-3">Alış Maliyeti</th>
                          <th className="p-3">Piyasa Değeri</th>
                          <th className="p-3">Durum</th>
                          <th className="p-3 text-right print:hidden">İade İşlemi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEquipment.map(eq => (
                          <tr key={eq.id} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="p-3 font-mono text-xs font-bold text-brand-600">
                              {eq.inventory_code}
                            </td>
                            <td className="p-3 font-medium">{eq.product_name}</td>
                            <td className="p-3 font-mono font-bold">{eq.serial_number || '—'}</td>
                            <td className="p-3">
                              {fmtQty(eq.quantity)} {eq.unit}
                            </td>
                            <td className="p-3 text-emerald-600">
                              {fmtQty(eq.returned_quantity)} {eq.unit}
                            </td>
                            <td className="p-3 font-bold text-indigo-600">
                              {fmtQty(eq.remaining_in_project)} {eq.unit}
                            </td>
                            <td className="p-3">
                              {fmtMoney(eq.purchase_cost_total)} {eq.purchase_currency}
                            </td>
                            <td className="p-3 text-emerald-600">
                              {fmtMoney(eq.market_value_total)} {eq.market_value_currency}
                            </td>
                            <td className="p-3">
                              {eq.status === 'in_project' ? (
                                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                                  Projede
                                </span>
                              ) : eq.status === 'partial_returned' ? (
                                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                                  Kısmi Döndü
                                </span>
                              ) : (
                                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                                  Depoya Döndü
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right print:hidden">
                              {Number(eq.remaining_in_project) > 0 && can('project.manage') && (
                                <button
                                  onClick={() => {
                                    setRQty(String(Number(eq.remaining_in_project)))
                                    setRToWh(warehouses[0]?.id || '')
                                    setReturnModal({ project: activeProj, item: eq })
                                  }}
                                  className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                                >
                                  <RotateCcw className="h-3 w-3" /> Depoya Dönüş Al
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })()}

              {/* PDF Çıktı / Rapor İmza ve Doğrulama Altlığı (Yazdırmada görünür) */}
              <div className="hidden border-t-2 border-slate-900 pt-4 text-xs print:flex print:items-center print:justify-between">
                <div className="space-y-0.5 text-slate-600">
                  <div className="font-bold">KÜP PRODÜKSİYON PROJE EKİPMAN SEVK VE MEVCUT LİSTESİ</div>
                  <div>Rapor Tarihi: {new Date().toLocaleDateString('tr-TR')} {new Date().toLocaleTimeString('tr-TR')}</div>
                  <div>Bu belge merkezi veritabanı kayıtları esas alınarak oluşturulmuştur.</div>
                </div>
                <div className="flex gap-8 text-center">
                  <div>
                    <div className="mb-8 font-semibold text-slate-700">Depo Sorumlusu</div>
                    <div className="text-[11px] text-slate-400">İmza / Kaşe</div>
                  </div>
                  <div>
                    <div className="mb-8 font-semibold text-slate-700">Proje / Saha Sorumlusu</div>
                    <div className="text-[11px] text-slate-400">İmza / Kaşe</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Yeni Proje Modalı */}
      {openCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={createProject}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Yeni Proje Oluştur</h2>
              <button type="button" onClick={() => setOpenCreate(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Proje Kodu *
                <input
                  required
                  value={pCode}
                  onChange={e => setPCode(e.target.value.toUpperCase())}
                  className={inputCls + ' mt-1 font-mono uppercase'}
                  placeholder="PRJ-ADANA-01"
                />
              </label>
              <label className="block text-sm font-medium">
                Müşteri / Kurum
                <input
                  value={pCustomer}
                  onChange={e => setPCustomer(e.target.value)}
                  className={inputCls + ' mt-1'}
                  placeholder="Adana Müzesi Müdürlüğü"
                />
              </label>
            </div>
            <label className="block text-sm font-medium">
              Proje Adı *
              <input
                required
                value={pName}
                onChange={e => setPName(e.target.value)}
                className={inputCls + ' mt-1'}
                placeholder="Adana Müzesi Dijital Sergi Kurulumu"
              />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="block text-sm font-medium">
                Proje Sorumlusu
                <input
                  value={pManager}
                  onChange={e => setPManager(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
              <label className="block text-sm font-medium">
                Başlangıç Tarihi
                <input
                  type="date"
                  value={pStart}
                  onChange={e => setPStart(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
              <label className="block text-sm font-medium">
                Bitiş Tarihi
                <input
                  type="date"
                  value={pEnd}
                  onChange={e => setPEnd(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
            </div>
            <label className="block text-sm font-medium">
              Proje Adresi
              <input
                value={pAddress}
                onChange={e => setPAddress(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>
            <label className="block text-sm font-medium">
              Açıklama
              <textarea
                rows={2}
                value={pDesc}
                onChange={e => setPDesc(e.target.value)}
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
                Projeyi Kaydet
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Projeye Ekipman Gönderim Modalı */}
      {openSendModal && activeProj && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={submitSendEquipment}
            className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{activeProj.name} — Projeye Ekipman Gönder</h2>
              <button type="button" onClick={() => setOpenSendModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <label className="block text-sm font-medium">
              Çıkış Yapılan Depo
              <select
                value={sFromWh}
                onChange={e => setSFromWh(e.target.value)}
                className={inputCls + ' mt-1'}
              >
                <option value="">— Seçin —</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>Gönderilecek Cihaz / Kablo Kalemleri</span>
                <button
                  type="button"
                  onClick={() =>
                    setSLines([
                      ...sLines,
                      { product_id: products[0]?.id || '', asset_id: '', quantity: '1' },
                    ])
                  }
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  + Kalem Ekle
                </button>
              </div>
              {sLines.map((ln, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <div className="col-span-5">
                    <select
                      value={ln.product_id}
                      onChange={e => {
                        const next = [...sLines]
                        next[idx].product_id = e.target.value
                        next[idx].asset_id = ''
                        setSLines(next)
                      }}
                      className={inputCls}
                    >
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4">
                    <select
                      value={ln.asset_id}
                      onChange={e => {
                        const next = [...sLines]
                        next[idx].asset_id = e.target.value
                        setSLines(next)
                      }}
                      className={inputCls}
                    >
                      <option value="">— Adet Bazlı / Seri Seçin —</option>
                      {assets
                        .filter(a => a.product_id === ln.product_id && a.status !== 'in_project')
                        .map(a => (
                          <option key={a.id} value={a.id}>
                            {a.serial_number}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      disabled={!!ln.asset_id}
                      value={ln.asset_id ? '1' : ln.quantity}
                      onChange={e => {
                        const next = [...sLines]
                        next[idx].quantity = e.target.value
                        setSLines(next)
                      }}
                      className={inputCls}
                    />
                  </div>
                  <div className="col-span-1 flex items-center justify-center">
                    {sLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setSLines(sLines.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <label className="block text-sm font-medium">
              Gönderim Notu
              <input
                value={sNote}
                onChange={e => setSNote(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenSendModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                İptal
              </button>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                Projeye Gönder
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Projeden İade / Dönüş Modalı */}
      {returnModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={submitReturnEquipment}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Projeden Depoya Dönüş Al</h2>
              <button type="button" onClick={() => setReturnModal(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">
              <div>
                <strong>Proje:</strong> {returnModal.project.name}
              </div>
              <div>
                <strong>Ekipman:</strong> {returnModal.item.product_name}{' '}
                {returnModal.item.serial_number && `(SN: ${returnModal.item.serial_number})`}
              </div>
            </div>

            <label className="block text-sm font-medium">
              Giriş Yapılacak Depo *
              <select
                required
                value={rToWh}
                onChange={e => setRToWh(e.target.value)}
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
              Dönen Miktar *
              <input
                type="number"
                min="1"
                required
                value={rQty}
                onChange={e => setRQty(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>

            <label className="block text-sm font-medium">
              Dönüş Notu
              <input
                value={rNote}
                onChange={e => setRNote(e.target.value)}
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
                Dönüşü Kaydet
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
