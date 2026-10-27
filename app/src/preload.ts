import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke: <T = unknown>(channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args) as Promise<T>,
  on: (channel: string, cb: (payload: unknown) => void) => {
    const listener = (_e: unknown, payload: unknown) => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },
}

contextBridge.exposeInMainWorld('tracker', api)

export type TrackerApi = typeof api
