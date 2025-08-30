const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  printLabel: (labelHtml) => ipcRenderer.send('print-label', labelHtml),
});