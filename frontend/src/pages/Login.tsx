import { useState, type FormEvent } from 'react'
import { Boxes, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true)
    try { await login(email, password) }
    catch (err) { toast.error((err as Error).message) }
    finally { setBusy(false) }
  }
  const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900'
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-white"><Boxes /></div>
          <div><div className="text-lg font-bold leading-tight">KÜP INVENTORY</div>
            <div className="text-xs text-slate-500">Varlık ve Envanter Yönetimi</div></div>
        </div>
        <label className="block text-sm font-medium">E-posta
          <input className={input + ' mt-1'} type="email" required value={email} onChange={e => setEmail(e.target.value)} autoFocus /></label>
        <label className="block text-sm font-medium">Parola
          <input className={input + ' mt-1'} type="password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Giriş Yap
        </button>
      </form>
    </div>
  )
}
