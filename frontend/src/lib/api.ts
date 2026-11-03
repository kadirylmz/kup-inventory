import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...i: ClassValue[]) => twMerge(clsx(i))

let accessToken: string | null = null
export const setToken = (t: string | null) => { accessToken = t }

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function raw(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  return fetch(`/api/v1${path}`, { ...init, headers, credentials: 'same-origin' })
}

export async function refreshSession(): Promise<boolean> {
  const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' })
  if (!r.ok) return false
  setToken((await r.json()).access_token)
  return true
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let r = await raw(path, init)
  if (r.status === 401 && !path.startsWith('/auth/') && (await refreshSession())) {
    r = await raw(path, init)
  }
  if (!r.ok) {
    let msg = 'Beklenmeyen bir hata oluştu.'
    try {
      const d = await r.json()
      msg = typeof d.detail === 'string' ? d.detail : 'Gönderilen bilgiler geçersiz.'
    } catch {
      /* yoksay */
    }
    throw new ApiError(r.status, msg)
  }
  return r.status === 204 ? (undefined as T) : r.json()
}
export async function apiBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  let r = await raw(path, init)
  if (r.status === 401 && !path.startsWith('/auth/') && (await refreshSession())) {
    r = await raw(path, init)
  }
  if (!r.ok) {
    let msg = 'Dosya indirilemedi.'
    try {
      const d = await r.json()
      msg = typeof d.detail === 'string' ? d.detail : msg
    } catch {
      /* yoksay */
    }
    throw new ApiError(r.status, msg)
  }
  return r.blob()
}
