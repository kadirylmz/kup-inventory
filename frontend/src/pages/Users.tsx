import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Shield, Users, UserX, X } from 'lucide-react'
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
  const { can } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'users' | 'roles'>('users')
  const [openModal, setOpenModal] = useState(false)

  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

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

  if (!can('user.view')) {
    return <p className="text-slate-500">Bu sayfayı görüntüleme yetkiniz yok.</p>
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

  const createUser = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
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
      qc.invalidateQueries({ queryKey: ['users'] })
      setOpenModal(false)
      setEmail('')
      setFullName('')
      setPassword('')
      setSelectedRoleIds([])
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kullanıcılar ve Yetki Rolleri</h1>
          <p className="text-sm text-slate-500">
            Rol bazlı erişim kontrolü (RBAC) ve sistem kullanıcı hesapları
          </p>
        </div>
        {can('user.manage') && (
          <button
            onClick={() => setOpenModal(true)}
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
                        <button
                          onClick={() => toggleActive(u)}
                          className="text-xs font-medium text-brand-600 hover:underline"
                        >
                          {u.is_active ? 'Pasifleştir' : 'Aktifleştir'}
                        </button>
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
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs dark:bg-slate-800">
                    {r.permissions.length} yetki
                  </span>
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

      {openModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form
            onSubmit={createUser}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Yeni Kullanıcı Oluştur</h2>
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
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={inputCls + ' mt-1'}
                placeholder="kullanici@kup.local"
              />
            </label>
            <label className="block text-sm font-medium">
              Parola (En az 10 karakter, harf + rakam) *
              <input
                type="password"
                required
                minLength={10}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={inputCls + ' mt-1'}
              />
            </label>
            <div className="space-y-1.5">
              <div className="text-sm font-medium">Roller</div>
              {roles.map(r => (
                <label key={r.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedRoleIds.includes(r.id)}
                    onChange={e =>
                      setSelectedRoleIds(
                        e.target.checked
                          ? [...selectedRoleIds, r.id]
                          : selectedRoleIds.filter(id => id !== r.id),
                      )
                    }
                  />
                  <span>
                    {r.name} <span className="text-xs text-slate-400">({r.code})</span>
                  </span>
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
                Oluştur
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
