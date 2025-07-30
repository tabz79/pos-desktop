const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 🔄 Product Operations
  getProducts: () => ipcRenderer.invoke('get-products'),
  addProduct: (product) => ipcRenderer.invoke('add-product', product),
  deleteProduct: (id) => ipcRenderer.invoke('delete-product', id),
  updateProduct: (product) => ipcRenderer.invoke('update-product', product),

  importProductsCSV: (rows) => ipcRenderer.invoke('import-products-csv', rows),

  // 🧾 Save Sale with inclusive GST
  saveSale: (saleData) => ipcRenderer.invoke('save-sale', saleData),

  // 🏪 Store Settings
  getStoreSettings: () => ipcRenderer.invoke('get-store-settings'),
  saveStoreSettings: (settings) => ipcRenderer.invoke('save-store-settings', settings),
  saveCategoryMap: (data) => ipcRenderer.invoke('save-category-map', data),
  getNextInvoiceNo: () => ipcRenderer.invoke('get-next-invoice-no'),

  // 📊 Dashboard & Reports
  getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),
  getRecentInvoices: () => ipcRenderer.invoke('get-recent-invoices'),
  getInvoiceDetails: (id) => ipcRenderer.invoke('get-invoice-details', id),
  getInvoices: (options) => ipcRenderer.invoke('get-invoices', options),

  // ✅ New: Sub-Category fetcher
  getUniqueSubCategories: (category) => ipcRenderer.invoke("getUniqueSubCategories", category),

  // ✅ New: Backup trigger
  backupNow: () => ipcRenderer.invoke("export-data-dump"),

  // ✅ New: Import products from CSV rows
  importProductsCSV: (rows) => ipcRenderer.invoke("import-products-csv", rows),
  // ...leave other api functions untouched
});
