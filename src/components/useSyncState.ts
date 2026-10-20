import { useSyncExternalStore } from 'react'
import { getSyncState, subscribeSync, type SyncState } from '../sync/controller'

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSync, getSyncState)
}
