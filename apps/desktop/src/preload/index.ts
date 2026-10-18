import { contextBridge, ipcRenderer } from 'electron'
import { MAIL_METHODS, type BearBridge } from '@bear/core'

const bridge: BearBridge = {
  platform: process.platform,
  openFile: (filters) => ipcRenderer.invoke('file:open', filters),
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  saveFile: (path, data) => ipcRenderer.invoke('file:save', path, data),
  chooseSavePath: (defaultName, filters) => ipcRenderer.invoke('file:chooseSavePath', defaultName, filters),
  exportPdf: (defaultName) => ipcRenderer.invoke('file:exportPdf', defaultName),
  getRecent: () => ipcRenderer.invoke('recent:get'),
  addRecent: (path, app) => ipcRenderer.invoke('recent:add', path, app),
  removeRecent: (path) => ipcRenderer.invoke('recent:remove', path),
  showInFolder: (path) => ipcRenderer.invoke('shell:showInFolder', path),
  setTitle: (title) => ipcRenderer.send('window:setTitle', title),
  takeLaunchFile: () => ipcRenderer.invoke('app:takeLaunchFile'),
  readData: (name) => ipcRenderer.invoke('data:read', name),
  writeData: (name, value) => ipcRenderer.invoke('data:write', name, value),
  deleteData: (name) => ipcRenderer.invoke('data:delete', name),
  chooseFolder: (title) => ipcRenderer.invoke('folder:choose', title),
  listFolder: (path) => ipcRenderer.invoke('folder:list', path),
  openExternal: (path) => ipcRenderer.invoke('shell:openPath', path),
  screenCount: () => ipcRenderer.invoke('screen:count'),
  capture: (rect) => ipcRenderer.invoke('window:capture', rect),
  onCloseRequest: (handler) => {
    const listener = () => {
      if (handler()) ipcRenderer.send('window:forceClose')
    }
    ipcRenderer.on('window:close-request', listener)
    return () => ipcRenderer.removeListener('window:close-request', listener)
  },
  forceClose: () => ipcRenderer.send('window:forceClose'),
  // Each mail call maps to an ipcMain handler named mail:<method> (see main/mail). contextBridge copies
  // plain properties only, so the methods are listed rather than produced by a Proxy.
  mail: Object.fromEntries(
    MAIL_METHODS.map((m) => [m, (...args: unknown[]) => ipcRenderer.invoke(`mail:${m}`, ...args)])
  ) as unknown as BearBridge['mail']
}

contextBridge.exposeInMainWorld('bear', bridge)
