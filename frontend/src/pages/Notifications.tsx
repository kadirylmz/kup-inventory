import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Bell, CheckCheck, Info, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '@/lib/api'

interface NotificationItem {
  id: string
  category: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  body: string
  link?: string
  is_read: boolean
  created_at: string
}

export default function NotificationsPage() {
  const qc = useQueryClient()

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<NotificationItem[]>('/notifications'),
  })

  const readOne = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const readAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      toast.success('Tüm bildirimler okundu olarak işaretlendi.')
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bildirim Merkezi</h1>
          <p className="text-sm text-slate-500">
            Yaklaşan yazılım lisans yenilemeleri, garanti bitişleri, kritik stok seviyesi ve servis uyarıları
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => readAll.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <CheckCheck className="h-4 w-4" /> Tümünü Okundu İşaretle ({unreadCount})
          </button>
        )}
      </div>

      <div className="space-y-3">
        {notifications.length === 0 ? (
          <div className="grid h-64 place-items-center rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
            <div>
              <Bell className="mx-auto h-10 w-10 text-slate-300" />
              <div className="mt-2 font-semibold">Aktif Uyarı Bulunmuyor</div>
              <p className="mt-1 text-xs text-slate-500">
                Sistemdeki lisanslar, garantiler ve stok seviyeleri normal sınırlar içerisindedir.
              </p>
            </div>
          </div>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              className={`flex items-start justify-between gap-4 rounded-xl border p-4 transition ${
                n.is_read
                  ? 'border-slate-200 bg-white opacity-75 dark:border-slate-800 dark:bg-slate-900'
                  : 'border-brand-300 bg-brand-50/30 shadow-xs dark:border-indigo-800 dark:bg-indigo-950/20'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                    n.severity === 'critical'
                      ? 'bg-rose-100 text-rose-600'
                      : n.severity === 'warning'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-600'
                  }`}
                >
                  {n.severity === 'critical' ? (
                    <ShieldAlert className="h-5 w-5" />
                  ) : n.severity === 'warning' ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : (
                    <Info className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{n.title}</span>
                    {!n.is_read && (
                      <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        YENİ
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{n.body}</p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
                    <span>{new Date(n.created_at).toLocaleString('tr-TR')}</span>
                    {n.link && (
                      <Link to={n.link} className="font-semibold text-brand-600 hover:underline">
                        İlgili Modüle Git →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
              {!n.is_read && (
                <button
                  onClick={() => readOne.mutate(n.id)}
                  className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  Okundu
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
