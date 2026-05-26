import { createContext, useContext } from 'react'
import type { UserRole, ActionId, Employee, PageId } from './mockData'

export interface RoleContextValue {
  activeEmployee: Employee
  activeRole: UserRole
  hasPermission: (action: ActionId) => boolean
  canAccessPage: (page: PageId) => boolean
}

export const RoleContext = createContext<RoleContextValue>(null!)
export const useRole = () => useContext(RoleContext)
