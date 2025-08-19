// main.js
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

/** ─────────────────────────────────────────────────────
 *  CONFIG: set your label size and printer name here
 *  ────────────────────────────────────────────────────*/
const PRINTER_NAME = "DP27P Label Printer (USB)"; // must match getPrinters()
const LABEL_WIDTH_MM = 50;  // 50mm
const LABEL_HEIGHT_MM = 25; // 25mm

// Convert mm → microns
function mmToMicrons(mm) {
  return Math.round(mm * 1000);
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile("index.html");

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/**
 * Print HTML for a 50x25mm label using the printer driver.
 */
ipcMain.on("print-label", (event, labelHtml) => {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true },
  });

  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(labelHtml)}`;
  printWindow.loadURL(dataUrl);

  const closeAndCleanup = () => {
    if (!printWindow.isDestroyed()) printWindow.close();
  };

  printWindow.webContents.on("did-finish-load", () => {
    setTimeout(() => {
      const pageSize = {
        width: mmToMicrons(LABEL_WIDTH_MM),   // 50mm → 50000 µm
        height: mmToMicrons(LABEL_HEIGHT_MM), // 25mm → 25000 µm
      };

      console.log("🖨 pageSize (microns):", pageSize);

      printWindow.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: PRINTER_NAME,
          copies: 1,
          margins: { marginType: "none" },
          landscape: false,
          pageSize,
        },
        (success, failureReason) => {
          if (!success) {
            console.error("Print error:", failureReason || "unknown");
          } else {
            console.log("✅ Print job sent to:", PRINTER_NAME);
          }
          closeAndCleanup();
        }
      );
    }, 150);
  });

  setTimeout(closeAndCleanup, 20_000);
});
