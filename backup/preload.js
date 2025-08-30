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
  exportInvoicesCsv: (options) => ipcRenderer.invoke('export-invoices-csv', options),

  // ✅ New: Sub-Category fetcher
  getUniqueSubCategories: (category) => ipcRenderer.invoke("getUniqueSubCategories", category),

  // ✅ New: Backup trigger
  backupNow: () => ipcRenderer.invoke("export-data-dump"),

  // ✅ New: Import products from CSV rows
  importProductsCSV: (rows) => ipcRenderer.invoke("import-products-csv", rows),
  regenerateBarcodes: () => ipcRenderer.invoke('regenerate-barcodes'),
  getProductById: (id) => ipcRenderer.invoke('get-product-by-id', id),
  printLabel: (options) => ipcRenderer.invoke('print-label', options),
  testPrintLabel: (printerName) => ipcRenderer.invoke('test-print-label', printerName),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printInvoice: (data) => {
    console.log('Preload: Sending print-invoice via ipcRenderer.send.');
    ipcRenderer.send('print-invoice', data);
  },
  findProductByBarcode: (code) => ipcRenderer.invoke('find-product-by-barcode', code),

  onBarcodeScanned: (callback) => ipcRenderer.on('barcode-scanned', (event, barcode) => callback(barcode)),
  // ...leave other api functions untouched
});
