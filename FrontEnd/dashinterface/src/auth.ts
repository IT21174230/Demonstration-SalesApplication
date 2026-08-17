/**
 * Token management and SSO utilities for Azure AD authentication.
 */
import type { UserRole } from './types'

const ACCESS_KEY = 'access_token'
const REFRESH_KEY = 'refresh_token'

// ---------------------------------------------------------------------------
// Token storage (localStorage)
// ---------------------------------------------------------------------------

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

// ---------------------------------------------------------------------------
// JWT decode (no library needed)
// ---------------------------------------------------------------------------

export interface JwtClaims {
  sub: string       // emp_id as string
  mail_id: string
  name: string
  dept: string
  desig: string
  exp: number
  jti: string
}

export function decodeJwt(token: string): JwtClaims {
  const base64Url = token.split('.')[1]
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  const json = decodeURIComponent(
    atob(base64)
      .split('')
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  )
  return JSON.parse(json)
}

export function isTokenExpired(token: string): boolean {
  try {
    const { exp } = decodeJwt(token)
    return Date.now() / 1000 >= exp - 60   // 60-second buffer
  } catch {
    return true
  }
}

// ---------------------------------------------------------------------------
// Dept → Role mapping
// ---------------------------------------------------------------------------

const DEPT_ROLE_MAP: Record<string, UserRole> = {
  procurement: 'Procurement',
  finance: 'Finance',
  'customer-service': 'CS',
  sales: 'Sales',
  IT: 'Admin',
}

export function deptToRole(dept: string | undefined): UserRole {
  if (!dept) return 'CS'
  return DEPT_ROLE_MAP[dept] ?? 'CS'
}

// ---------------------------------------------------------------------------
// Proactive token refresh scheduler
// ---------------------------------------------------------------------------

export function scheduleTokenRefresh(
  doRefresh: () => Promise<void>,
): () => void {
  const token = getAccessToken()
  if (!token) return () => {}

  try {
    const { exp } = decodeJwt(token)
    const msUntilRefresh = (exp - 60) * 1000 - Date.now()   // 1 min before expiry
    if (msUntilRefresh <= 0) {
      doRefresh().catch(() => {})
      return () => {}
    }

    const timer = window.setTimeout(() => {
      doRefresh().catch(() => {})
    }, msUntilRefresh)

    return () => window.clearTimeout(timer)
  } catch {
    return () => {}
  }
}
