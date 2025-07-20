const path = require('path');

let db;
try {
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, 'pos.db');
  db = new Database(dbPath);

  db.pragma('foreign_keys = ON');

  // ✅ Create initial products table (for first install only)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL,
      hsn_code TEXT
    )
  `).run();

  // 🛠️ Rebuild products table with category, hsn_code, gst_percent (safe migration)
  try {
    const columns = db.prepare(`PRAGMA table_info(products)`).all();
    const hasCategory = columns.some(col => col.name === 'category');
    const hasGST = columns.some(col => col.name === 'gst_percent');

    if (!hasCategory || !hasGST) {
      console.log("♻️ Rebuilding products table with category + gst_percent...");
      db.exec('PRAGMA foreign_keys = OFF');

      db.prepare(`ALTER TABLE products RENAME TO products_old`).run();

      db.prepare(`
        CREATE TABLE products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          price REAL NOT NULL,
          stock INTEGER NOT NULL,
          category TEXT,
          hsn_code TEXT,
          gst_percent REAL
        )
      `).run();

      db.prepare(`
        INSERT INTO products (id, name, price, stock, hsn_code)
        SELECT id, name, price, stock, hsn_code FROM products_old
      `).run();

      db.prepare(`DROP TABLE products_old`).run();
      db.exec('PRAGMA foreign_keys = ON');
      console.log("✅ Products table updated.");
    }
  } catch (err) {
    console.error("❌ Failed to migrate products table:", err);
  }

  // ✅ Create sales table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL,
      timestamp TEXT NOT NULL
    )
  `).run();

  // 🩺 One-time migration from 'created_at' → 'timestamp'
  try {
    const columns = db.prepare(`PRAGMA table_info(sales)`).all();
    const hasCreatedAt = columns.some(col => col.name === 'created_at');
    const hasTimestamp = columns.some(col => col.name === 'timestamp');

    if (hasCreatedAt && !hasTimestamp) {
      db.exec('PRAGMA foreign_keys = OFF');

      db.prepare(`ALTER TABLE sales RENAME TO sales_old`).run();
      db.prepare(`
        CREATE TABLE sales (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          total REAL NOT NULL,
          timestamp TEXT NOT NULL
        )
      `).run();
      db.prepare(`
        INSERT INTO sales (id, total, timestamp)
        SELECT id, total, created_at FROM sales_old
      `).run();
      db.prepare(`DROP TABLE sales_old`).run();

      db.exec('PRAGMA foreign_keys = ON');
      console.log("⚙️ Migrated sales table: renamed 'created_at' to 'timestamp'.");
    }
  } catch (err) {
    console.error("⚠️ Migration check failed:", err);
  }

  // ✅ Recreate sale_items with full GST structure
  try {
    const existing = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='sale_items'`).get();
    if (existing) {
      console.log("♻️ Dropping old sale_items table...");
      db.exec('PRAGMA foreign_keys = OFF');
      db.prepare(`DROP TABLE IF EXISTS sale_items`).run();
      db.exec('PRAGMA foreign_keys = ON');
    }

    db.prepare(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        product_id INTEGER,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        hsn_code TEXT,
        gst_percent REAL,
        taxable_value REAL,
        gst_amount REAL,
        cgst REAL,
        sgst REAL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) DEFERRABLE INITIALLY DEFERRED
      )
    `).run();

    console.log("✅ Rebuilt sale_items table with GST columns.");
  } catch (err) {
    console.error("⚠️ Failed updating sale_items table:", err);
  }

  // ✅ Create store_settings table (singleton row)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS store_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      store_name TEXT,
      store_address TEXT
    )
  `).run();

  console.log("✅ SQLite DB initialized successfully.");
} catch (err) {
  console.error("❌ Failed to load better-sqlite3:", err);
  db = null;
}

// ✅ Get all products
function getAllProducts() {
  const stmt = db.prepare('SELECT * FROM products ORDER BY id DESC');
  return stmt.all();
}

// ✅ Add a new product
function addProduct(product) {
  const stmt = db.prepare(`
    INSERT INTO products (name, price, stock, category, hsn_code, gst_percent)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    product.name,
    product.price,
    product.stock,
    product.category || null,
    product.hsn_code || null,
    product.gst_percent ?? null
  );
  return { success: true, id: info.lastInsertRowid };
}

// ✅ Delete a product by ID
function deleteProduct(id) {
  try {
    const stmt = db.prepare('DELETE FROM products WHERE id = ?');
    const info = stmt.run(id);
    return info.changes > 0
      ? { success: true }
      : { success: false, message: 'Product not found' };
  } catch (err) {
    console.error("❌ Failed to delete product:", err);
    return { success: false, message: 'Error deleting product' };
  }
}

// ✅ Update existing product
function updateProduct(product) {
  try {
    const stmt = db.prepare(`
      UPDATE products
      SET name = ?, price = ?, stock = ?, category = ?, hsn_code = ?, gst_percent = ?
      WHERE id = ?
    `);
    const info = stmt.run(
      product.name,
      product.price,
      product.stock,
      product.category || null,
      product.hsn_code || null,
      product.gst_percent ?? null,
      product.id
    );
    return info.changes > 0
      ? { success: true }
      : { success: false, message: 'Product not found or unchanged' };
  } catch (err) {
    console.error("❌ Failed to update product:", err);
    return { success: false, message: 'Error updating product' };
  }
}

// ✅ Save a full sale (sale + items with GST extracted from MRP)
function saveSale(items) {
  try {
    const timestamp = new Date().toISOString();
    const enrichedItems = [];

    for (const i of items) {
      const price = i.price;
      const qty = i.quantity;
      const gstRate = i.gst_percent ?? 0;

      const pricePerUnit = price;
      const totalMRP = pricePerUnit * qty;

      const divisor = 1 + gstRate / 100;
      const taxableValue = +(totalMRP / divisor).toFixed(2);
      const gstAmount = +(totalMRP - taxableValue).toFixed(2);
      const cgst = +(gstAmount / 2).toFixed(2);
      const sgst = +(gstAmount / 2).toFixed(2);

      enrichedItems.push({
        ...i,
        taxable_value: taxableValue,
        gst_amount: gstAmount,
        cgst,
        sgst
      });
    }

    const total = enrichedItems.reduce((acc, i) => acc + i.taxable_value + i.gst_amount, 0);
    const insertSale = db.prepare(`INSERT INTO sales (total, timestamp) VALUES (?, ?)`);
    const saleInfo = insertSale.run(total, timestamp);
    const saleId = saleInfo.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO sale_items (
        sale_id, product_id, name, price, quantity,
        hsn_code, gst_percent, taxable_value,
        gst_amount, cgst, sgst
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((items) => {
      for (const i of items) {
        insertItem.run(
          saleId,
          i.id || null,
          i.name,
          i.price,
          i.quantity,
          i.hsn_code || null,
          i.gst_percent ?? null,
          i.taxable_value,
          i.gst_amount,
          i.cgst,
          i.sgst
        );

        // ✅ Stock update
        if (i.id) {
          db.prepare(`UPDATE products SET stock = stock - ? WHERE id = ?`)
            .run(i.quantity, i.id);
        }
      }
    });

    insertMany(enrichedItems);
    return { success: true, sale_id: saleId };
  } catch (err) {
    console.error("❌ Failed to save sale:", err);
    return { success: false, message: 'Error saving sale' };
  }
}
// 🧠 Safe schema patch for store_settings (runs only if columns are missing)
try {
  const storeCols = db.prepare(`PRAGMA table_info(store_settings)`).all().map(c => c.name);
  const neededCols = [
    { name: 'store_subtitle', type: 'TEXT' },
    { name: 'store_phone', type: 'TEXT' },
    { name: 'store_gstin', type: 'TEXT' },
    { name: 'store_footer', type: 'TEXT' },
    { name: 'store_fssai', type: 'TEXT' }
  ];

  neededCols.forEach(col => {
    if (!storeCols.includes(col.name)) {
      db.prepare(`ALTER TABLE store_settings ADD COLUMN ${col.name} ${col.type}`).run();
      console.log(`✅ Added column: ${col.name} to store_settings`);
    }
  });
} catch (err) {
  console.error("❌ Failed to patch store_settings schema:", err);
}
// ✅ Save or update the singleton store settings
function saveStoreSettings(payload) {
  try {
    const exists = db.prepare('SELECT COUNT(*) as count FROM store_settings WHERE id = 1').get();
    if (exists.count > 0) {
      db.prepare(`
        UPDATE store_settings
        SET store_name = ?, store_address = ?, store_subtitle = ?, store_phone = ?, store_gstin = ?, store_footer = ?, store_fssai = ?
        WHERE id = 1
      `).run(
        payload.store_name || '',
        payload.store_address || '',
        payload.store_subtitle || '',
        payload.store_phone || '',
        payload.store_gstin || '',
        payload.store_footer || '',
        payload.store_fssai || ''
      );
    } else {
      db.prepare(`
        INSERT INTO store_settings (id, store_name, store_address, store_subtitle, store_phone, store_gstin, store_footer, store_fssai)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.store_name || '',
        payload.store_address || '',
        payload.store_subtitle || '',
        payload.store_phone || '',
        payload.store_gstin || '',
        payload.store_footer || '',
        payload.store_fssai || ''
      );
    }
    return { success: true };
  } catch (err) {
    console.error("❌ Failed to save store settings:", err);
    return { success: false, message: "DB save error" };
  }
}

// ✅ Get saved store settings
function getStoreSettings() {
  try {
    const row = db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
    return row || null;
  } catch (err) {
    console.error("❌ Failed to fetch store settings:", err);
    return null;
  }
}
module.exports = {
  db,
  getAllProducts,
  addProduct,
  deleteProduct,
  updateProduct,
  saveSale,
  saveStoreSettings,
  getStoreSettings
};

