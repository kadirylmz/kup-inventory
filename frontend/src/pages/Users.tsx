import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit3, Loader2, Plus, Shield, Trash2, Users, UserX, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

interface RoleItem {
  id: string
  code: string
  name: string
  is_system: boolean
  permissions: string[]
}

interface UserItem {
  id: string
  email: string
  full_name: string
  is_active: boolean
  roles: { id: string; code: string; name: string }[]
}

export default function UsersPage() {
  const { me, can } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'users' | 'roles'>('users')
  const [openModal, setOpenModal] = useState(false)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)

  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  // Rol Yetki Düzenleme Modalı
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null)
  const [rolePerms, setRolePerms] = useState<string[]>([])

  const { data: users = [], isLoading: uLoad } = useQuery({
    queryKey: ['users'],
    queryFn: () => api<UserItem[]>('/users'),
    enabled: can('user.view'),
  })

  const { data: roles = [], isLoading: rLoad } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api<RoleItem[]>('/roles'),
    enabled: can('role.view'),
  })

  const { data: allPermissions = [] } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api<string[]>('/permissions'),
    enabled: can('role.view'),
  })

  if (!can('user.view')) {
    return <p className="text-slate-500">Bu sayfayı görüntüleme yetkiniz yok.</p>
  }

  const openCreateUserModal = () => {
    setEditingUser(null)
    setEmail('')
    setFullName('')
    setPassword('')
    const techRole = roles.find(r => r.code === 'TECHNICIAN')
    setSelectedRoleIds(techRole ? [techRole.id] : [])
    setOpenModal(true)
  }

  const openEditUserModal = (u: UserItem) => {
    setEditingUser(u)
    setEmail(u.email)
    setFullName(u.full_name)
    setPassword('')
    setSelectedRoleIds(u.roles.map(r => r.id))
    setOpenModal(true)
  }

  const toggleActive = async (u: UserItem) => {
    try {
      await api(`/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !u.is_active }),
      })
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('Kullanıcı durumu güncellendi.')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleDeleteUser = async (u: UserItem) => {
    if (u.id === me?.id) {
      toast.error('Kendi hesabınızı silemezsiniz.')
      return
    }
    if (!window.confirm(`"${u.full_name}" (${u.email}) kullanıcısını silmek istediğinize emin misiniz?`)) {
      return
    }
    try {
      await api(`/users/${u.id}`, { method: 'DELETE' })
      toast.success('Kullanıcı silindi.')
      qc.invalidateQueries({ queryKey: ['users'] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const saveUser = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (editingUser) {
        await api(`/users/${editingUser.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            full_name: fullName,
            role_ids: selectedRoleIds,
            password: password ? password : null,
          }),
        })
        toast.success('Kullanıcı bilgileri ve rolleri güncellendi.')
      } else {
        await api('/users', {
          method: 'POST',
          body: JSON.stringify({
            email,
            full_name: fullName,
            password,
            role_ids: selectedRoleIds,
          }),
        })
        toast.success('Yeni kullanıcı oluşturuldu.')
      }
      qc.invalidateQueries({ queryKey: ['users'] })
      setOpenModal(false)
      setEditingUser(null)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const saveRolePermissions = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingRole) return
    try {
      await api(`/roles/${editingRole.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permission_codes: rolePerms }),
      })
      toast.success(`${editingRole.name} rol yetkileri güncellendi.`)
      setEditingRole(null)
      qc.invalidateQueries({ queryKey: ['roles'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  // Türkçe İzin Açıklamaları
  const PERM_LABELS: Record<string, string> = {
    'dashboard.view': 'Genel Bakış (Dashboard)',
    'product.view': 'Envanter Görüntüleme',
    'product.create': 'Yeni Ürün/Cihaz Ekleme',
    'product.update': 'Ürün/Cihaz Düzenleme',
    'product.delete': 'Ürün/Cihaz Silme',
    'product.deactivate': 'Ürün Pasife Alma',
    'category.view': 'Kategori Görüntüleme',
    'category.manage': 'Kategori Yönetimi',
    'brand.view': 'Marka & Model Görüntüleme',
    'brand.manage': 'Marka & Model Yönetimi',
    'warehouse.view': 'Depoları Görüntüleme',
    'warehouse.manage': 'Depo & Raf Yönetimi',
    'movement.view': 'Stok Hareketleri Görüntüleme',
    'movement.create': 'Stok Hareketi Oluşturma',
    'movement.approve': 'Stok Hareketi Onaylama',
    'project.view': 'Projeler Görüntüleme',
    'project.manage': 'Proje Yönetimi & Ekipman Sevki',
    'employee.view': 'Personel Listesi Görüntüleme',
    'employee.manage': 'Personel Yönetimi',
    'assignment.view': 'Zimmet Listesi Görüntüleme',
    'assignment.manage': 'Zimmet Verme & İade Alma',
    'license.view': 'Yazılım Lisansları Görüntüleme',
    'license.manage': 'Lisans Yönetimi',
    'license.view_key': 'Lisans Anahtarı Görme',
    'maintenance.view': 'Bakım & Servis Görüntüleme',
    'maintenance.manage': 'Bakım & Servis Yönetimi',
    'stocktake.view': 'Sayım Listesi Görüntüleme',
    'stocktake.perform': 'Sayım Yapma',
    'stocktake.approve': 'Sayım Onaylama',
    'valuation.view': 'Değerleme & Piyasa Fiyatları',
    'valuation.update': 'Değerleme Güncelleme',
    'valuation.approve': 'Değerleme Onaylama',
    'report.view': 'Raporlar Ekranı',
    'report.generate': 'Rapor Üretme & İndirme',
    'notification.view': 'Bildirimleri Görüntüleme',
    'audit.view': 'İşlem Geçmişi (Audit Logs)',
    'user.view': 'Kullanıcıları Görüntüleme',
    'user.manage': 'Kullanıcı Yönetimi',
    'role.view': 'Rolleri Görüntüleme',
    'role.manage': 'Rol & Yetki Yönetimi',
    'setting.view': 'Ayarları Görüntüleme',
    'setting.manage': 'Ayar Değiştirme',
    'backup.view': 'Yedekleri Görüntüleme',
    'backup.manage': 'Yedek Alma & Geri Yükleme',
    'app_license.view': 'Sistem Lisansı Görüntüleme',
    'app_license.manage': 'Sistem Lisansı Yönetimi',
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kullanıcılar ve Yetki Rolleri</h1>
          <p className="text-sm text-slate-500">
            Rol bazlı erişim kontrolü (RBAC), teknisyen kısıtlamaları ve sistem kullanıcı hesapları
          </p>
        </div>
        {can('user.manage') && (
          <button
            onClick={openCreateUserModal}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Yeni Kullanıcı Ekle
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setTab('users')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold ${
            tab === 'users'
              ? 'border-brand-600 text-brand-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500'
          }`}
        >
          <Users className="h-4 w-4" /> Kullanıcılar ({users.length})
        </button>
        <button
          onClick={() => setTab('roles')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold ${
            tab === 'roles'
              ? 'border-brand-600 text-brand-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500'
          }`}
        >
          <Shield className="h-4 w-4" /> Roller ve Yetkiler ({roles.length})
        </button>
      </div>

      {tab === 'users' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {uLoad ? (
            <div className="grid place-items-center p-10">
              <Loader2 className="animate-spin text-brand-600" />
            </div>
          ) : !users.length ? (
            <div className="p-10 text-center text-slate-500">
              <UserX className="mx-auto mb-2" /> Kullanıcı yok.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                <tr>
                  <th className="p-3.5">Ad Soyad</th>
                  <th className="p-3.5">E-posta</th>
                  <th className="p-3.5">Atanan Roller</th>
                  <th className="p-3.5">Durum</th>
                  <th className="p-3.5 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-3.5 font-semibold">{u.full_name}</td>
                    <td className="p-3.5">{u.email}</td>
                    <td className="p-3.5">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map(r => (
                          <span
                            key={r.id}
                            className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                          >
                            {r.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          u.is_active
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {u.is_active ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      {can('user.manage') && (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => openEditUserModal(u)}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Düzenle
                          </button>
                          {u.id !== me?.id && (
                            <>
                              <button
                                onClick={() => toggleActive(u)}
                                className="rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                              >
                                {u.is_active ? 'Pasifleştir' : 'Aktifleştir'}
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u)}
                                title="Kullanıcıyı Sil"
                                className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Sil
                              </button>
                            </>
                          )}
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

      {tab === 'roles' && (
        <div className="grid gap-4 md:grid-cols-2">
          {rLoad ? (
            <Loader2 className="animate-spin" />
          ) : (
            roles.map(r => (
              <div
                key={r.id}
                className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-brand-600 dark:text-indigo-400">
                      {r.code}
                    </span>
                    <h3 className="text-base font-bold">{r.name}</h3>
                    {r.code === 'TECHNICIAN' && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        Sadece Envanter görüntüleme ve yeni ürün/cihaz ekleme yetkisi vardır.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs dark:bg-slate-800">
                      {r.permissions.length} yetki
                    </span>
                    {can('role.manage') && r.code !== 'ADMIN' && (
                      <button
                        onClick={() => {
                          setEditingRole(r)
                          setRolePerms(r.permissions)
                        }}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        <Edit3 className="h-3 w-3" /> Yetkileri Düzenle
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.permissions.map(p => (
                    <span
                      key={p}
                      className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Kullanıcı Oluştur / Düzenle Modalı */}
      {openModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={saveUser}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {editingUser ? `Kullanıcıyı Düzenle (${editingUser.email})` : 'Yeni Kullanıcı Oluştur'}
              </h2>
              <button type="button" onClick={() => setOpenModal(false)}>
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
            <label className="block text-sm font-medium">
              E-posta *
              <input
                type="email"
                required
                disabled={!!editingUser}
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={inputCls + ' mt-1 disabled:opacity-60'}
                placeholder="teknisyen@kup.local"
              />
            </label>
            <label className="block text-sm font-medium">
              {editingUser
                ? 'Yeni Parola (Değiştirmek istemiyorsanız boş bırakın)'
                : 'Parola (En az 10 karakter, harf + rakam) *'}
              <input
                type="password"
                required={!editingUser}
                minLength={10}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={inputCls + ' mt-1'}
                placeholder={editingUser ? '••••••••••' : 'Örn: Teknisyen2026!'}
              />
            </label>
            <div className="space-y-1.5">
              <div className="text-sm font-medium">Roller</div>
              {roles.map(r => (
                <label key={r.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedRoleIds.includes(r.id)}
                    onChange={e =>
                      setSelectedRoleIds(
                        e.target.checked
                          ? [...selectedRoleIds, r.id]
                          : selectedRoleIds.filter(id => id !== r.id),
                      )
                    }
                  />
                  <div>
                    <span className="font-medium">{r.name}</span>{' '}
                    <span className="text-xs text-slate-400">({r.code})</span>
                    {r.code === 'TECHNICIAN' && (
                      <div className="text-[11px] text-slate-500">
                        Yalnızca Envanter sekmesini görür ve ürün/cihaz ekleyebilir; diğer alanlara giremez.
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
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
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
              >
                {editingUser ? 'Güncelle' : 'Oluştur'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rol Yetkilerini Düzenle Modalı */}
      {editingRole && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={saveRolePermissions}
            className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-bold">{editingRole.name} ({editingRole.code}) Yetkileri</h2>
                <p className="text-xs text-slate-500">Bu role sahip kullanıcıların erişebileceği modül ve işlemleri seçin</p>
              </div>
              <button type="button" onClick={() => setEditingRole(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="grid max-h-96 grid-cols-1 gap-2 overflow-y-auto p-1 sm:grid-cols-2">
              {allPermissions.map(code => (
                <label
                  key={code}
                  className={`flex items-start gap-2.5 rounded-lg border p-2 text-xs transition cursor-pointer ${
                    rolePerms.includes(code)
                      ? 'border-indigo-300 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/30'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded text-brand-600 focus:ring-brand-500"
                    checked={rolePerms.includes(code)}
                    onChange={e =>
                      setRolePerms(
                        e.target.checked ? [...rolePerms, code] : rolePerms.filter(c => c !== code),
                      )
                    }
                  />
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {PERM_LABELS[code] || code}
                    </div>
                    <div className="font-mono text-[10px] text-slate-400">{code}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingRole(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                İptal
              </button>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                Yetkileri Kaydet
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
