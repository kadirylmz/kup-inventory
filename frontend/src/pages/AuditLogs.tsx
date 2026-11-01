import { useQuery } from '@tanstack/react-query'
import { History, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

interface AuditItem {
  id: string
  user_id: string | null
  action: string
  entity: string | null
  entity_id: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  ip: string | null
  created_at: string
}

export default function AuditLogsPage() {
  const { can } = useAuth()
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => api<AuditItem[]>('/audit?limit=200'),
    enabled: can('audit.view'),
  })

  if (!can('audit.view')) {
    return <p className="text-slate-500">Denetim kayıtlarını görüntüleme yetkiniz yok.</p>
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Denetim ve İşlem Geçmişi (Audit Log)</h1>
        <p className="text-sm text-slate-500">
          Değiştirilemez ve silinemez güvenlik/işlem izleri (Son 200 kayıt)
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {isLoading ? (
          <div className="grid place-items-center p-12">
            <Loader2 className="animate-spin text-brand-600" />
          </div>
        ) : !logs.length ? (
          <div className="p-12 text-center text-slate-500">
            <History className="mx-auto mb-2" /> Kayıt bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/50">
                <tr>
                  <th className="p-3.5">Tarih / Saat</th>
                  <th className="p-3.5">İşlem Kodu</th>
                  <th className="p-3.5">Nesne</th>
                  <th className="p-3.5">Değişiklik Özeti</th>
                  <th className="p-3.5">IP Adresi</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-3.5 whitespace-nowrap text-xs text-slate-500">
                      {new Date(l.created_at).toLocaleString('tr-TR')}
                    </td>
                    <td className="p-3.5 font-mono text-xs font-semibold text-brand-600 dark:text-indigo-400">
                      {l.action}
                    </td>
                    <td className="p-3.5 text-xs">
                      {l.entity || '—'}
                    </td>
                    <td className="p-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {l.new_value ? JSON.stringify(l.new_value) : '—'}
                    </td>
                    <td className="p-3.5 font-mono text-xs text-slate-400">{l.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
