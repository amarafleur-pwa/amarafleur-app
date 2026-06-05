import { createContext, useContext } from 'react'

export const SyncContext = createContext(0)
export const useSyncVersion = () => useContext(SyncContext)

interface SyncActions {
  forceSync: () => Promise<void>
  isSyncing: boolean
  lastSyncedAt: Date | null
}

export const SyncActionsContext = createContext<SyncActions>({
  forceSync: async () => {},
  isSyncing: false,
  lastSyncedAt: null,
})
export const useSyncActions = () => useContext(SyncActionsContext)
