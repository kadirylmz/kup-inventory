import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building, Edit3, Eye, Loader2, Plus, Trash2, UserSquare, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export interface DepartmentItem {
  id: string
  name: string
  parent_id: string | null
}

export interface EmployeeItem {
  id: string
  full_name: string
  department_id: string | null
  department_name: string | null
  position: string | null
  email: string | null
  phone: string | null
  is_active: boolean
  active_assignment_count: number
}

interface ActiveEmpAsset {
  assignment_item_id: string
  assignment_no: string
  delivered_at: string
  product_id: string
  product_name: string
  brand_name?: string | null
  model_name?: string | null
  inventory_code: string
  asset_id: string | null
  serial_number: string | null
  remaining_quantity: number
}

export default function EmployeesPage() {
  const { can } = useAuth()
  const qc = useQueryClient()

  const [openEmpModal, setOpenEmpModal] = useState(false)
  const [openDeptModal, setOpenDeptModal] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState<EmployeeItem | null>(null)
  const [editingEmp, setEditingEmp] = useState<EmployeeItem | null>(null)

  const [fullName, setFullName] = useState('')
  const [deptId, setDeptId] = useState('')
  const [position, setPosition] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [deptName, setDeptName] = useState('')

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<EmployeeItem[]>('/employees?include_inactive=true'),
  })

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api<DepartmentItem[]>('/departments'),
  })

  const { data: empAssets = [], isLoading: aLoad } = useQuery({
    queryKey: ['employee-assets', selectedEmp?.id],
    queryFn: () => api<ActiveEmpAsset[]>(`/employees/${selectedEmp!.id}/assets`),
    enabled: !!selectedEmp,
  })

  const createDepartment = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api('/departments', {
        method: 'POST',
        body: JSON.stringify({ name: deptName }),
      })
      toast.success('Departman eklendi.')
      qc.invalidateQueries({ queryKey: ['departments'] })
      setOpenDeptModal(false)
      setDeptName('')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleDeleteDepartment = async (dept: DepartmentItem) => {
    if (!confirm(`"${dept.name}" departmanını silmek istediğinize emin misiniz?`)) return
    try {
      await api(`/departments/${dept.id}`, { method: 'DELETE' })
      toast.success(`${dept.name} departmanı silindi.`)
      qc.invalidateQueries({ queryKey: ['departments'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const openCreateEmpModal = () => {
    setEditingEmp(null)
    setFullName('')
    setDeptId('')
    setPosition('')
    setEmail('')
    setPhone('')
    setOpenEmpModal(true)
  }

  const openEditEmpModal = (emp: EmployeeItem) => {
    setEditingEmp(emp)
    setFullName(emp.full_name)
    setDeptId(emp.department_id || '')
    setPosition(emp.position || '')
    setEmail(emp.email || '')
    setPhone(emp.phone || '')
    setOpenEmpModal(true)
  }

  const saveEmployee = async (e: FormEvent) => {
    e.preventDefault()
    try {
      if (editingEmp) {
        await api(`/employees/${editingEmp.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            full_name: fullName,
            department_id: deptId || null,
            position: position || null,
            email: email || null,
            phone: phone || null,
          }),
        })
        toast.success('Personel bilgileri güncellendi.')
      } else {
        await api('/employees', {
          method: 'POST',
          body: JSON.stringify({
            full_name: fullName,
            department_id: deptId || null,
            position: position || null,
            email: email || null,
            phone: phone || null,
          }),
        })
        toast.success('Personel kaydı oluşturuldu.')
      }
      qc.invalidateQueries({ queryKey: ['employees'] })
      setOpenEmpModal(false)
      setEditingEmp(null)
      setFullName('')
      setPosition('')
      setEmail('')
      setPhone('')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleDeleteEmployee = async (emp: EmployeeItem) => {
    if (emp.active_assignment_count > 0) {
      toast.error(`Bu personelin üzerinde ${emp.active_assignment_count} aktif zimmetli ürün var. Önce zimmetleri iade almalısınız.`)
      return
    }
    if (!confirm(`"${emp.full_name}" personelini sistemden kalıcı olarak silmek istediğinize emin misiniz?`)) return
    try {
      await api(`/employees/${emp.id}`, { method: 'DELETE' })
      toast.success(`${emp.full_name} başarıyla silindi.`)
      qc.invalidateQueries({ queryKey: ['employees'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const toggleActive = async (emp: EmployeeItem) => {
    try {
      await api(`/employees/${emp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !emp.is_active }),
      })
      qc.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Personel durumu güncellendi.')
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
          <h1 className="text-2xl font-bold tracking-tight">Personel Yönetimi</h1>
          <p className="text-sm text-slate-500">
            Şirket personelleri, departmanlar ve personelin üzerindeki zimmetli ekipman listesi
          </p>
        </div>
        {can('employee.manage') && (
          <div className="flex gap-2">
            <button
              onClick={openCreateEmpModal}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> Yeni Personel
            </button>
            <button
              onClick={() => setOpenDeptModal(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <Building className="h-4 w-4" /> Departman Ekle
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {isLoading ? (
          <div className="grid place-items-center p-12">
            <Loader2 className="animate-spin text-brand-600" />
          </div>
        ) : !employees.length ? (
          <div className="p-12 text-center text-slate-500">
            <UserSquare className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            Henüz kayıtlı personel bulunmuyor.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
              <tr>
                <th className="p-3.5">Ad Soyad</th>
                <th className="p-3.5">Departman</th>
                <th className="p-3.5">Pozisyon</th>
                <th className="p-3.5">E-posta / Telefon</th>
                <th className="p-3.5">Üzerindeki Zimmet</th>
                <th className="p-3.5">Durum</th>
                <th className="p-3.5 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-3.5 font-semibold">{emp.full_name}</td>
                  <td className="p-3.5">{emp.department_name || '—'}</td>
                  <td className="p-3.5 text-slate-500">{emp.position || '—'}</td>
                  <td className="p-3.5 text-xs text-slate-500">
                    {[emp.email, emp.phone].filter(Boolean).join(' • ') || '—'}
                  </td>
                  <td className="p-3.5">
                    <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                      {emp.active_assignment_count} Aktif Ürün
                    </span>
                  </td>
                  <td className="p-3.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        emp.is_active
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {emp.is_active ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="inline-flex items-center gap-3">
                      <button
                        onClick={() => setSelectedEmp(emp)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        <Eye className="h-3.5 w-3.5" /> Zimmetlerini Gör
                      </button>
                      {can('employee.manage') && (
                        <>
                          <button
                            onClick={() => openEditEmpModal(emp)}
                            title="Personeli Düzenle"
                            className="inline-flex items-center gap-0.5 text-xs text-brand-600 hover:underline"
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Düzenle
                          </button>
                          <button
                            onClick={() => toggleActive(emp)}
                            className="text-xs text-slate-600 hover:underline dark:text-slate-400"
                          >
                            {emp.is_active ? 'Pasifleştir' : 'Aktifleştir'}
                          </button>
                          <button
                            onClick={() => handleDeleteEmployee(emp)}
                            title="Personeli Sil"
                            className="inline-flex items-center gap-0.5 text-xs text-rose-600 hover:underline"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Sil
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Personelin Üzerindeki Bütün Ürünler Çekmecesi */}
      {selectedEmp && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
          <div className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-bold">{selectedEmp.full_name} — Zimmetli Ekipmanlar</h2>
                <p className="text-xs text-slate-500">
                  {[selectedEmp.department_name, selectedEmp.position].filter(Boolean).join(' • ')}
                </p>
              </div>
              <button onClick={() => setSelectedEmp(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="mt-5">
              {aLoad ? (
                <Loader2 className="animate-spin" />
              ) : !empAssets.length ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400 dark:border-slate-700">
                  Bu personelin üzerinde aktif zimmetli ürün bulunmuyor.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800">
                    <tr>
                      <th className="p-3">Fiş No</th>
                      <th className="p-3">Ürün / Kod</th>
                      <th className="p-3">Seri No</th>
                      <th className="p-3">Adet</th>
                      <th className="p-3">Teslim Tarihi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empAssets.map(item => (
                      <tr key={item.assignment_item_id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="p-3 font-mono text-xs font-bold text-brand-600">{item.assignment_no}</td>
                        <td className="p-3">
                          <div className="font-medium">{item.product_name}</div>
                          {(item.brand_name || item.model_name) && (
                            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              {[item.brand_name, item.model_name].filter(Boolean).join(' • ')}
                            </div>
                          )}
                          <div className="font-mono text-xs text-slate-500">{item.inventory_code}</div>
                        </td>
                        <td className="p-3 font-mono font-bold">{item.serial_number || '—'}</td>
                        <td className="p-3 font-bold">{item.remaining_quantity}</td>
                        <td className="p-3 text-xs text-slate-500">
                          {new Date(item.delivered_at).toLocaleDateString('tr-TR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Personel Ekle / Düzenle Modalı */}
      {openEmpModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={saveEmployee}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingEmp ? 'Personel Düzenle' : 'Yeni Personel Kaydı'}</h2>
              <button type="button" onClick={() => setOpenEmpModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <label className="block text-sm font-medium">
              Ad Soyad *
              <input
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Departman
                <select
                  value={deptId}
                  onChange={e => setDeptId(e.target.value)}
                  className={inputCls + ' mt-1'}
                >
                  <option value="">— Seçin —</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Pozisyon / Unvan
                <input
                  value={position}
                  onChange={e => setPosition(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                E-posta
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
              <label className="block text-sm font-medium">
                Telefon
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenEmpModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                İptal
              </button>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                {editingEmp ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Yeni Departman Modalı */}
      {openDeptModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={createDepartment}
            className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Yeni Departman Ekle</h2>
              <button type="button" onClick={() => setOpenDeptModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <label className="block text-sm font-medium">
              Departman Adı *
              <input
                required
                value={deptName}
                onChange={e => setDeptName(e.target.value)}
                className={inputCls + ' mt-1'}
                placeholder="Örn: Teknik Prodüksiyon, Ar-Ge"
              />
            </label>

            {departments.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <div className="text-xs font-semibold uppercase text-slate-500">Mevcut Departmanlar</div>
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                  {departments.map(d => (
                    <div key={d.id} className="flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{d.name}</span>
                      {can('employee.manage') && (
                        <button
                          type="button"
                          onClick={() => handleDeleteDepartment(d)}
                          title="Departmanı Sil"
                          className="text-rose-500 hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenDeptModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                İptal
              </button>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                Ekle
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
