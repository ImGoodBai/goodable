/**
 * Preload script - IPC bridge between main and renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Send chat message to main process
  chat: (prompt) => ipcRenderer.invoke('chat', prompt),

  // Listen for logs from main process
  onLog: (callback) => {
    ipcRenderer.on('log', (event, data) => callback(data));
  },
});
