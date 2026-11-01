import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, refreshSession, setToken } from '@/lib/api'

export interface Me {
  id: string; email: string; full_name: string; theme: string
  roles: { code: string; name: string }[]; permissions: string[]
}
interface AuthCtx {
  me: Me | null; loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  can: (perm: string) => boolean
}
const Ctx = createContext<AuthCtx>(null!)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  const loadMe = useCallback(async () => setMe(await api<Me>('/auth/me')), [])

  useEffect(() => {
    refreshSession().then(ok => (ok ? loadMe() : undefined)).finally(() => setLoading(false))
  }, [loadMe])

  const login = async (email: string, password: string) => {
    const r = await api<{ access_token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    setToken(r.access_token)
    await loadMe()
  }
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    setToken(null); setMe(null)
  }
  const can = (p: string) => !!me?.permissions.includes(p)
  return <Ctx.Provider value={{ me, loading, login, logout, can }}>{children}</Ctx.Provider>
}
