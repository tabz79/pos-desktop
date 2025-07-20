const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 🔄 Product Operations
  getProducts: () => ipcRenderer.invoke('get-products'),
  addProduct: (product) => ipcRenderer.invoke('add-product', product),
  deleteProduct: (id) => ipcRenderer.invoke('delete-product', id),
  updateProduct: (product) => ipcRenderer.invoke('update-product', product),

  // 🧾 Save Sale with inclusive GST
  saveSale: (saleData) => ipcRenderer.invoke('save-sale', saleData),

  // 🏪 Store Settings
  getStoreSettings: () => ipcRenderer.invoke('get-store-settings'),
  saveStoreSettings: (settings) => ipcRenderer.invoke('save-store-settings', settings)
});
