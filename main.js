const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { printInvoice } = require('./printer');

let tailwindCssContent;
try {
    const tailwindCssPath = path.join(app.getAppPath(), 'resources', 'tailwind.css');
    tailwindCssContent = fs.readFileSync(tailwindCssPath, 'utf8');
} catch (error) {
    if (error.code === 'ENOENT') {
        console.warn(`⚠️ Warning: Tailwind CSS file not found at ${error.path}. Printing may be unstyled. Setting tailwindCssContent to empty string.`);
        tailwindCssContent = ''; // Set to empty string if file is missing
    } else {
        console.error(`❌ Error loading Tailwind CSS: ${error.message}. Setting tailwindCssContent to empty string.`);
        tailwindCssContent = ''; // Set to empty string for other errors as well
    }
}

console.log("▶️ Electron app starting...");

let mainWindow; // Declare globally

let dbAPI;
try {
  dbAPI = require('./db');
  console.log("✅ Database module loaded.");

  // 🔧 One-time migration: Add hsn_code column if missing
  try {
    const cols = dbAPI.db.prepare("PRAGMA table_info(products)").all();
    const hasHSN = cols.some(col => col.name === "hsn_code");
    if (!hasHSN) {
      dbAPI.db.prepare("ALTER TABLE products ADD COLUMN hsn_code TEXT").run();
      console.log("✅ hsn_code column added to products table.");
    } else {
      console.log("🟡 hsn_code column already exists.");
    }
  } catch (err) {
    console.error("❌ Failed to check or add hsn_code column:", err.message);
  }

  // 🔧 One-time migration: Add missing store_settings columns
  try {
    const storeCols = dbAPI.db.prepare("PRAGMA table_info(store_settings)").all();
    const colNames = storeCols.map(col => col.name);

    const missingCols = [
      { name: "store_subtitle", type: "TEXT" },
      { name: "store_phone", type: "TEXT" },
      { name: "store_gstin", type: "TEXT" },
      { name: "store_footer", type: "TEXT" },
      { name: "store_fssai", type: "TEXT" }
    ].filter(col => !colNames.includes(col.name));

    for (const col of missingCols) {
      dbAPI.db.prepare(`ALTER TABLE store_settings ADD COLUMN ${col.name} ${col.type}`).run();
      console.log(`✅ Added column to store_settings: ${col.name}`);
    }

    if (missingCols.length === 0) {
      console.log("🟡 store_settings already has all required columns.");
    }
  } catch (err) {
    console.error("❌ Failed to migrate store_settings columns:", err.message);
  }

} catch (err) {
  console.error("❌ Failed to load database:", err);
}

function createWindow() {
  console.log("📦 Creating main window...");
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.loadFile('index.html');
  console.log("✅ Window loaded.");
}

let barcodeCounter = 0;

function generateBarcode(product) {
  try {
    const category = (product.category || 'UNK').substring(0, 3).toUpperCase().padEnd(3, 'X');
    const name = (product.name || 'NA').substring(0, 2).toUpperCase().padEnd(2, 'X');
    const subCategory = (product.sub_category || '_').substring(0, 1).toUpperCase();
    const brand = (product.brand || 'XX').substring(0, 2).toUpperCase().padEnd(2, 'X');
    const model = (product.model_name ? product.model_name.split('-')[0] : 'ZZ').substring(0, 2).toUpperCase().padEnd(2, 'Z');

    const counter = (++barcodeCounter).toString().padStart(5, '0');

    return `${category}${name}${subCategory}${brand}${counter}${model}`;
  } catch (error) {
    console.error("Failed to generate barcode for", product.name, error);
    return "ERROR";
  }
}

async function regenerateAllBarcodes() {
  if (!dbAPI) return;
  try {
    console.log('🔄 Clearing all existing barcode values...');
    dbAPI.db.prepare('UPDATE products SET barcode_value = NULL').run();

    const products = dbAPI.getAllProducts();
    console.log(`Found ${products.length} products to process.`);
    const maxBarcode = dbAPI.db.prepare("SELECT MAX(barcode_value) as max FROM products").get();
    if (maxBarcode && maxBarcode.max) {
      const match = maxBarcode.max.match(/(\d{5})/);
      if (match) {
        barcodeCounter = parseInt(match[1], 10);
      }
    }
    console.log(`Starting barcode counter at ${barcodeCounter}`);

    console.log('🔄 Regenerating all product barcodes...');
    const updateStmt = dbAPI.db.prepare('UPDATE products SET barcode_value = ? WHERE id = ?');

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const newBarcode = generateBarcode(product);
      updateStmt.run(newBarcode, product.id);
      if (i < 5) {
        console.log(`Generated barcode for ${product.name}: ${newBarcode}`);
      }
    }
    console.log('✅ Barcode regeneration complete.');
  } catch (error) {
    console.error('❌ Failed to regenerate barcodes:', error);
  }
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  console.log("🚀 App is ready.");
  if (process.env.NODE_ENV !== 'production') {
    // await regenerateAllBarcodes(); // Uncomment for development if needed
  } else {
    console.warn('Production mode: Automatic barcode regeneration on boot is disabled.');
  }
  createWindow();

  // ✅ IPC Handlers
  if (dbAPI) {
    async function getNextInvoiceNumber() {
      // Initialize invoice_daily_counter table and reset if new day
      const today = new Date();
      const todayDateString = today.toISOString().slice(0, 10); // YYYY-MM-DD

      let dailyCounterRow = dbAPI.db.prepare("SELECT last_reset_date, current_daily_number FROM invoice_daily_counter WHERE id = 1").get();

      if (!dailyCounterRow) {
        // First time setup
        dbAPI.db.prepare("INSERT INTO invoice_daily_counter (id, last_reset_date, current_daily_number) VALUES (1, ?, 0)").run(todayDateString);
        dailyCounterRow = { last_reset_date: todayDateString, current_daily_number: 0 };
      } else if (dailyCounterRow.last_reset_date !== todayDateString) {
        // New day, reset counter
        dbAPI.db.prepare("UPDATE invoice_daily_counter SET last_reset_date = ?, current_daily_number = 0 WHERE id = 1").run(todayDateString);
        dailyCounterRow.current_daily_number = 0;
      }

      const nextSerial = dailyCounterRow.current_daily_number + 1;
      dbAPI.db.prepare("UPDATE invoice_daily_counter SET current_daily_number = ? WHERE id = 1").run(nextSerial);

      const year = today.getFullYear();
      const month = (today.getMonth() + 1).toString().padStart(2, '0');
      const day = today.getDate().toString().padStart(2, '0');
      const prefix = `${year}${month}${day}`; // e.g., 20250728

      const newInvoiceNo = `INV${prefix}${nextSerial.toString().padStart(4, '0')}`;
      console.log(`Generated Invoice No: ${newInvoiceNo}`); // Debug log
      return newInvoiceNo;
    }

    ipcMain.handle('get-products', async () => {
      return dbAPI.getAllProducts();
    });

    ipcMain.handle('add-product', async (event, product) => {
      return dbAPI.addProduct(product);
    });

    ipcMain.handle('delete-product', async (event, id) => {
      return dbAPI.deleteProduct(id);
    });

    ipcMain.handle('update-product', async (event, product) => {
      return dbAPI.updateProduct(product);
    });

    ipcMain.handle("import-products-csv", (event, rows) => {
      return dbAPI.importProductsFromCSV(rows, generateBarcode);
    });

    // ✅ GST-aware sale handler
    ipcMain.handle("save-sale", async (event, saleData) => {
      try {
        const {
          payment_method,
          customer_name,
          customer_phone,
          customer_gstin,
          invoice_no, // Expect invoice_no from renderer
          items
        } = saleData;

        const timestamp = new Date().toISOString();

        if (!Array.isArray(items) || items.length === 0) {
          throw new Error("Cart is empty or invalid");
        }

        console.log("🧾 Processing Sale...");
        console.log("Invoice No:", invoice_no);
        console.log("Date:", timestamp);
        console.log("Payment Method:", payment_method);
        console.log("Customer:", customer_name, customer_phone, customer_gstin);
        console.log("Items:", items);

        const result = dbAPI.saveSale({
          invoice_no,
          payment_method,
          customer_name,
          customer_phone,
          customer_gstin,
          items,
          timestamp
        });

        if (result.success) {
          console.log("✅ Sale saved successfully. Sale ID:", result.sale_id);
          result.invoice_no = invoice_no; // Add invoice number to the result
        } else {
          console.error("❌ Failed to save sale:", result.message);
        }

        return result;
      } catch (err) {
        console.error("❌ Error during sale save:", err);
        return { success: false, message: err.message || "Unknown error" };
      }
    });

    // ✅ SETTINGS: Load full store settings
    ipcMain.handle("get-store-settings", () => {
      try {
        const row = dbAPI.db.prepare(`
          SELECT
            store_name,
            store_subtitle,
            store_address,
            store_phone,
            store_gstin,
            store_footer,
            store_fssai
          FROM store_settings WHERE id = 1
        `).get();

        return row || {
          store_name: "",
          store_subtitle: "",
          store_address: "",
          store_phone: "",
          store_gstin: "",
          store_footer: "",
          store_fssai: ""
        };
      } catch (err) {
        console.error("❌ Failed to fetch store settings:", err);
        return {
          store_name: "",
          store_subtitle: "",
          store_address: "",
          store_phone: "",
          store_gstin: "",
          store_footer: "",
          store_fssai: ""
        };
      }
    });

    // ✅ SETTINGS: Save full store settings
    ipcMain.handle("save-store-settings", (event, settings) => {
      console.log("📦 Incoming store settings to save:", settings);
      try {
        dbAPI.db.prepare(`
          INSERT INTO store_settings ( 
            id, store_name, store_subtitle, store_address,
            store_phone, store_gstin, store_footer, store_fssai
          ) VALUES ( 
            1, @store_name, @store_subtitle, @store_address,
            @store_phone, @store_gstin, @store_footer, @store_fssai
          )
          ON CONFLICT(id) DO UPDATE SET
            store_name = excluded.store_name,
            store_subtitle = excluded.store_subtitle,
            store_address = excluded.store_address,
            store_phone = excluded.store_phone,
            store_gstin = excluded.store_gstin,
            store_footer = excluded.store_footer,
            store_fssai = excluded.store_fssai
        `).run(settings);

        return { success: true };
      } catch (err) {
        console.error("❌ Failed to save store settings:", err);
        return { success: false, message: err.message || "Unknown error" };
      }
    });

    // ✅ CATEGORY MAP: Save updated category->HSN map
    ipcMain.handle("save-category-map", (event, data) => {
      try {
        const filePath = path.join(__dirname, 'category-hsn-map.json');
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return { success: true };
      } catch (err) {
        console.error("❌ Failed to save category map:", err);
        return { success: false, message: err.message || "Unknown error" };
      }
    });

    // --- DASHBOARD & REPORTS ---
    ipcMain.handle('get-dashboard-stats', async () => {
      return dbAPI.getDashboardStats();
    });

    ipcMain.handle('get-recent-invoices', async () => {
      return dbAPI.getRecentInvoices();
    });

    ipcMain.handle('get-invoice-details', async (event, id) => {
      return dbAPI.getInvoiceDetails(id);
    });

    ipcMain.handle('get-invoices', async (event, options) => {
      return dbAPI.getInvoices(options);
    });

    // --- Excel Export Helper ---
    async function generateExcelReport(data) {
      const workbook = new ExcelJS.Workbook();
      const invoiceSheet = workbook.addWorksheet('Invoices');
      const summarySheet = workbook.addWorksheet('GST Summary');

      // --- Invoices Sheet ---
      const invoiceHeaders = [
        { header: 'Invoice Number', key: 'invoice_no', width: 20 },
        { header: 'Date', key: 'timestamp', width: 15 },
        { header: 'Customer Name', key: 'customer_name', width: 25 },
        { header: 'Customer GSTIN', key: 'customer_gstin', width: 20 },
        { header: 'Item Name', key: 'item_name', width: 30 },
        { header: 'Quantity', key: 'quantity', width: 10 },
        { header: 'Price (₹)', key: 'price', width: 15 },
        { header: 'GST %', key: 'gst_percent', width: 10 },
        { header: 'Taxable Value (₹)', key: 'taxable_value', width: 20 },
        { header: 'GST Amount (₹)', key: 'gst_amount', width: 20 },
        { header: 'CGST (₹)', key: 'cgst', width: 15 },
        { header: 'SGST (₹)', key: 'sgst', width: 15 },
        { header: 'Total (₹)', key: 'total', width: 20 },
      ];

      invoiceSheet.columns = invoiceHeaders;

      // Style Headers
      invoiceSheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD3D3D3' },
        };
      });

      // Add Rows
      data.forEach(row => {
        invoiceSheet.addRow({
          ...row,
          gst_percent: (row.gst_percent || 0) / 100, // Divide by 100 for Excel percentage formatting
          total: row.taxable_value + row.gst_amount,
        });
      });

      // Format Cells
      invoiceSheet.getColumn('timestamp').numFmt = 'dd-mmm-yyyy';
      invoiceSheet.getColumn('price').numFmt = '₹#,##0.00';
      invoiceSheet.getColumn('gst_percent').numFmt = '0.00%';
      invoiceSheet.getColumn('taxable_value').numFmt = '₹#,##0.00';
      invoiceSheet.getColumn('gst_amount').numFmt = '₹#,##0.00';
      invoiceSheet.getColumn('cgst').numFmt = '₹#,##0.00';
      invoiceSheet.getColumn('sgst').numFmt = '₹#,##0.00';
      invoiceSheet.getColumn('total').numFmt = '₹#,##0.00';
      invoiceSheet.getColumn('quantity').numFmt = '#,##0';


      // --- Totals Footer ---
      const totalRow = invoiceSheet.addRow([]);
      totalRow.font = { bold: true };
      const totalQuantity = data.reduce((sum, row) => sum + row.quantity, 0);
      const totalTaxableValue = data.reduce((sum, row) => sum + row.taxable_value, 0);
      const totalGstAmount = data.reduce((sum, row) => sum + row.gst_amount, 0);
      const totalCgst = data.reduce((sum, row) => sum + row.cgst, 0);
      const totalSgst = data.reduce((sum, row) => sum + row.sgst, 0);
      const grandTotal = totalTaxableValue + totalGstAmount;

      totalRow.getCell('E').value = 'Totals';
      totalRow.getCell('F').value = totalQuantity;
      totalRow.getCell('I').value = totalTaxableValue;
      totalRow.getCell('J').value = totalGstAmount;
      totalRow.getCell('K').value = totalCgst;
      totalRow.getCell('L').value = totalSgst;
      totalRow.getCell('M').value = grandTotal;
      
      totalRow.getCell('I').numFmt = '₹#,##0.00';
      totalRow.getCell('J').numFmt = '₹#,##0.00';
      totalRow.getCell('K').numFmt = '₹#,##0.00';
      totalRow.getCell('L').numFmt = '₹#,##0.00';
      totalRow.getCell('M').numFmt = '₹#,##0.00';


      // --- GST Summary Sheet ---
      summarySheet.columns = [
        { header: 'Description', key: 'desc', width: 25 },
        { header: 'Amount (₹)', key: 'amount', width: 20 },
      ];
      
      summarySheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true };
      });

      summarySheet.addRows([
        { desc: 'Total Taxable Value', amount: totalTaxableValue },
        { desc: 'Total GST Amount', amount: totalGstAmount },
        { desc: 'Total CGST', amount: totalCgst },
        { desc: 'Total SGST', amount: totalSgst },
        { desc: 'Grand Total', amount: grandTotal },
      ]);
      
      summarySheet.getColumn('amount').numFmt = '₹#,##0.00';


      return await workbook.xlsx.writeBuffer();
    }

    // --- CSV Fallback Helper ---
    function generateCsvFallback(data) {
      const header = [
        'InvoiceNo', 'Date', 'CustomerName', 'CustomerGSTIN', 'Total',
        'ItemName', 'Quantity', 'Price', 'GSTPercent', 'TaxableValue',
        'GSTAmount', 'CGST', 'SGST'
      ].join(',');

      const rows = data.map(row => {
        const sanitizedRow = [
          row.invoice_no || '',
          row.timestamp ? new Date(row.timestamp).toISOString() : '',
          `"${(row.customer_name || '').replace(/"/g, '""')}"`, // Corrected escaping for quotes within customer_name
          row.customer_gstin || '',
          row.total || 0,
          `"${(row.item_name || '').replace(/"/g, '""')}"`, // Corrected escaping for quotes within item_name
          row.quantity || 0,
          row.price || 0,
          (row.gst_percent || 0) / 100,
          row.taxable_value || 0,
          row.gst_amount || 0,
          row.cgst || 0,
          row.sgst || 0,
        ];
        return sanitizedRow.join(',');
      });

      return [header, ...rows].join('\n');
    }


    ipcMain.handle('export-invoices-csv', async (event, options) => {
      const result = dbAPI.getInvoicesForExport(options);
      if (!result.success) {
        return { success: false, message: 'Failed to retrieve invoices for export.' };
      }

      const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Invoices',
        defaultPath: `invoices-${options.startDate && options.endDate ? `${options.startDate}-to-${options.endDate}` : new Date().toISOString().slice(0, 10)}.xlsx`,
        filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
      });

      if (canceled) {
        return { success: false, message: 'Export canceled.' };
      }

      try {
        const buffer = await generateExcelReport(result.data);
        fs.writeFileSync(filePath, buffer);
        shell.openPath(filePath);
        return { success: true };
      } catch (error) {
        console.error('❌ Failed to generate Excel report:', error);
        // Log to file
        const logDir = path.join(app.getPath('logs'), 'error.log');
        fs.appendFileSync(logDir, `[${new Date().toISOString()}] Excel Export Error: ${error.stack}\n`);

        // Fallback to CSV
        try {
          const csvPath = filePath.replace('.xlsx', '.csv');
          const csvContent = generateCsvFallback(result.data);
          fs.writeFileSync(csvPath, csvContent);
          shell.openPath(csvPath);
          return { 
            success: false, 
            message: 'We couldn’t generate the Excel report. A CSV fallback has been created.' 
          };
        } catch (csvError) {
          console.error('❌ Failed to generate CSV fallback:', csvError);
          return { 
            success: false, 
            message: 'We couldn’t generate the Excel report or the CSV fallback. Please try again or contact support.' 
          };
        }
      }
    });

    ipcMain.handle("getUniqueSubCategories", (event, category) => {
        console.log(`Fetching unique sub-categories for category: ${category}`);
        try {
            const query = `SELECT DISTINCT sub_category FROM products WHERE category = ? AND sub_category IS NOT NULL`;
            const rows = dbAPI.db.prepare(query).all(category);
            return rows.map(r => r.sub_category).filter(Boolean);
        } catch (error) {
            console.error("Error fetching sub-categories:", error);
            return [];
        }
    });

    // ✅ Generate and increment next invoice number
    ipcMain.handle('get-next-invoice-no', async () => {
      return await getNextInvoiceNumber();
    });

    ipcMain.handle('print-label', (event, { html, width, height }) => {
      const printWindow = new BrowserWindow({ show: false });

      printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

      printWindow.webContents.on('did-finish-load', () => {
        printWindow.webContents.print({
          silent: true,
          printBackground: true,
          pageSize: {
            width: width, // in microns
            height: height, // in microns
          },
          margins: { marginType: 'none' },
        }, (success, errorType) => {
          if (!success) console.log(errorType);
          printWindow.close();
        });
      });
    });

    // --- PATCHED print-invoice handler ---
    ipcMain.on('print-invoice', async (event, invoiceData) => {
      console.log('Main: Received print-invoice IPC call. Passing data to printer.js');
      printInvoice(invoiceData);
    });

    ipcMain.handle('regenerate-barcodes', async () => {
      await regenerateAllBarcodes();
      return { success: true };
    });

    ipcMain.handle('get-product-by-id', async (event, id) => {
      return dbAPI.getProductById(id);
    });

    // --- DATA DUMP & RESTORE ---
    try {
      ipcMain.handle("export-data-dump", async () => {
        return dbAPI.exportDataDump();
      });

      ipcMain.handle("import-data-dump", async (event, payload) => {
        return dbAPI.importDataDump(payload);
      });
    } catch (err) {
      console.error("❌ Failed to register data dump handlers:", err);
    }
  }
});