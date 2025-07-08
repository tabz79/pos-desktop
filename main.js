const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

console.log("▶️ Electron app starting...");

let db;
try {
  db = require('./db');
  console.log("✅ Database module loaded.");
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

if (db) {
  ipcMain.handle('get-products', () => {
    const stmt = db.prepare('SELECT * FROM products');
    return stmt.all();
  });

  ipcMain.handle('add-product', (event, product) => {
    const stmt = db.prepare(`
      INSERT INTO products (name, price, stock)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(product.name, product.price, product.stock);
    return { success: true, id: result.lastInsertRowid };
  });
}
