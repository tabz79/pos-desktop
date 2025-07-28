const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

console.log("▶️ Electron app starting...");

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
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  win.loadFile('index.html');
  console.log("✅ Window loaded.");
}

app.disableHardwareAcceleration();

app.whenReady().then(() => {
  console.log("🚀 App is ready.");
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ✅ IPC Handlers
if (dbAPI) {
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

// ✅ Generate and increment next invoice number
ipcMain.handle('get-next-invoice-no', async () => {
  const db = dbAPI.db;
  const today = new Date();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  const prefix = `${year}${month}${day}`; // e.g., 20250728

  // Get current counter value and increment it
  let counterRow = db.prepare("SELECT current_number FROM invoice_counter WHERE id = 1").get();
  if (!counterRow) {
    // This should ideally not happen if db.js initializes it, but as a fallback
    db.prepare("INSERT INTO invoice_counter (id, current_number) VALUES (1, 0)").run();
    counterRow = { current_number: 0 };
  }
  const nextSerial = counterRow.current_number + 1;
  db.prepare("UPDATE invoice_counter SET current_number = ? WHERE id = 1").run(nextSerial);

  const newInvoiceNo = `INV${prefix}${nextSerial.toString().padStart(4, '0')}`;
  console.log(`Generated Invoice No: ${newInvoiceNo}`); // Debug log
  return newInvoiceNo;
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
}
