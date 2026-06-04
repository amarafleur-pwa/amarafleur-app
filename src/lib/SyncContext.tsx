import { createContext, useContext } from 'react'

export const SyncContext = createContext(0)
export const useSyncVersion = () => useContext(SyncContext)
