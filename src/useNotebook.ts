import { useEffect, useRef, useState } from 'react'
import { mergeObservation, type ProbeResult } from './discovery'
import {
  appendSnapshot, boundAddresses, CONNECTION_STORAGE_KEY, emptyConnectionData, loadConnectionData, removeConnectionData,
  saveConnectionData, updateLabel, type ConnectionData, type ScanSnapshot, type StorageFailure,
} from './history'

export function useNotebook(demo: boolean) {
  const [initial] = useState(loadConnectionData)
  const [live, setLive] = useState<ConnectionData>(() => initial.data ?? emptyConnectionData())
  const [example, setExample] = useState<ConnectionData>(emptyConnectionData)
  const [remember, setRememberState] = useState(initial.data !== null)
  const [storageError, setStorageError] = useState<StorageFailure | null>(initial.error)
  const writesAllowed = useRef(true)
  const current = demo ? example : live

  useEffect(() => {
    if (!remember || demo || !writesAllowed.current) return
    const stored = loadConnectionData()
    if (stored.error) { setStorageError(stored.error); return }
    if (!stored.data) { setRememberState(false); return }
    const error = saveConnectionData(live)
    setStorageError(error)
  }, [live, remember, demo])

  // Another tab can revoke consent or clear site data. Do not recreate its store.
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if ((event.key === CONNECTION_STORAGE_KEY || event.key === null) && event.newValue === null) {
        writesAllowed.current = false
        setRememberState(false)
        setStorageError(null)
      }
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [])

  const recordResult = (result: ProbeResult, scanId: number) => setLive((previous) => {
    const addresses = boundAddresses(mergeObservation(previous.addresses, result, scanId))
    const labels = Object.fromEntries(Object.entries(previous.labels).filter(([ip]) => addresses.some((address) => address.ip === ip)))
    return { ...previous, addresses, labels }
  })
  const recordScan = (snapshot: ScanSnapshot) => setLive((previous) => ({ ...previous, history: appendSnapshot(previous.history, snapshot) }))
  const nameAddress = (ip: string, name: string) => {
    try {
      const labels = updateLabel(current.labels, ip, name)
      if (demo) setExample((previous) => ({ ...previous, labels }))
      else setLive((previous) => ({ ...previous, labels }))
      return true
    } catch { return false }
  }
  const setRemember = (enabled: boolean) => {
    if (demo) return
    writesAllowed.current = enabled
    const error = enabled ? saveConnectionData(live) : removeConnectionData()
    setStorageError(error)
    if (!error) setRememberState(enabled)
  }
  const retrySave = () => setRemember(true)
  const clearData = () => {
    if (demo) return false
    writesAllowed.current = false
    const error = removeConnectionData()
    setStorageError(error)
    if (error) return false
    setRememberState(false)
    setLive(emptyConnectionData())
    return true
  }
  return {
    ...current, remember, storageError, setRemember, retrySave, clearData,
    recordResult, recordScan, nameAddress, setExample,
  }
}
