
/* --- injected: global no-drag safety net for inputs --- */
document.addEventListener("DOMContentLoaded", () => {
  try {
    const s = document.createElement('style');
    s.textContent = `
      body, #app, * { -webkit-app-region: no-drag; }
      .titlebar, .drag { -webkit-app-region: drag; }
    `;
    document.head.appendChild(s);
  } catch (e) { console.warn('no-drag style inject failed', e); }
}, { once: true });
/* --- end inject --- */

// (removed duplicate scanner block to prevent double listeners)

/**
 * Generates a product_id and barcode_value based on product details.
 * This function is pure and can be reused for bulk imports.

 * It replicates the user's Excel formula logic.
 * @param {object} params
 * @param {string} [params.category=''] - Product category
 * @param {string} [params.name=''] - Product name
 * @param {string} [params.brand=''] - Brand name
 * @param {string} [params.model_name=''] - Model name
 * @returns {{product_id: string, barcode_value: string}}
 */

// Global state for invoice navigation
window.currentInvoicePageData = [];
window.currentInvoicePageIndex = -1;



function parsePriceFromModel(model_name = '') {
  if (!model_name) return null;
  model_name = model_name.trim();

  // Regex for formats like 2k, 1.5h, 10t (at the end of a word or string)
  const multiplierRegex = /(\d+\.?\d*)\s?([kht])\b/i;
  const multiplierMatch = model_name.match(multiplierRegex);
  if (multiplierMatch && multiplierMatch[1] && multiplierMatch[2]) {
    const value = parseFloat(multiplierMatch[1]);
    const multiplier = multiplierMatch[2].toLowerCase();
    const multipliers = { k: 1000, h: 200, t: 20 };
    if (multipliers[multiplier]) {
      return value * multipliers[multiplier];
    }
  }

  // Regex for formats like ₹749, Rs.749, Rs 749
  const currencyRegex = /(?:₹|Rs\.?)\s?(\d+\.?\d*)/;
  const currencyMatch = model_name.match(currencyRegex);
  if (currencyMatch && currencyMatch[1]) {
    return parseFloat(currencyMatch[1]);
  }

  return null;
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


// ✅ POS Renderer Script with Live Stock Update, Quantity Control, Print Layout, and Business Profile Support

function debounce(func, delay) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

// Stub for applySalesFilters to prevent ReferenceError before Sales view is rendered
function applySalesFilters() {
  // This function will be properly defined when the Sales view is rendered.
  // This stub prevents runtime errors if called prematurely.
}

document.addEventListener("DOMContentLoaded", async () => {
  

// --- Delegated close handler for invoice/quotation modal ---
document.body.addEventListener('click', function(e) {
  var closeBtn = e.target.closest('#close-invoice-btn');
  if (closeBtn) {
    try { setOverlayVisible('invoice-modal', false); }
    catch (_e) {
      var modal = document.getElementById('invoice-modal');
      if (modal) { modal.classList.add('hidden'); modal.style.pointerEvents = 'none'; }
    }
    const cartOverlay = document.getElementById('cartOverlay');
    if (cartOverlay) {
        // Re-enable pointer events on the cart overlay when the invoice modal is closed.
        cartOverlay.style.pointerEvents = 'auto';
    }
    e.preventDefault();
    e.stopPropagation();
  }
});

// --- START: Robust Toast Utility ---
  if (typeof window.showToast !== 'function') {
    const toastEl = document.createElement('div');
    toastEl.id = 'gemini-toast';
    toastEl.style.cssText = `
      position: fixed; top: 20px; right: 20px;
      background-color: #333; color: white;
      padding: 10px 20px; border-radius: 8px;
      z-index: 2147483647;
      opacity: 0;
      transition: opacity 0.3s ease-in-out;
      -webkit-app-region: no-drag;
      pointer-events: all;
    `;
    document.body.appendChild(toastEl);

    window.showToast = (message, type = 'info') => {
      toastEl.textContent = message;
      // why: Use color to distinguish success/error toasts.
      const isError = type === 'error' || message.startsWith('❌');
      toastEl.style.backgroundColor = isError ? '#d9534f' : '#333';
      toastEl.style.opacity = '1';
      setTimeout(() => {
        toastEl.style.opacity = '0';
      }, 3000);
    };
  }
  // --- END: Robust Toast Utility ---
  // Inject CSS to make form controls clickable in a frameless window
  const style = document.createElement('style');
  style.textContent = `input, textarea, select, button, .nav-btn { -webkit-app-region: no-drag; }`;
  document.head.append(style);

  
  // --- Modal clickability hardening (quotation/invoice) ---
  (function(){
    try {
      var modalFixStyle = document.createElement('style');
      modalFixStyle.textContent = [
        '#invoice-modal, #invoice-modal * { -webkit-app-region: no-drag; }',
        '#invoice-modal #close-invoice-btn, #invoice-modal .close, #invoice-modal .btn-close { cursor: pointer; }',
        '#invoice-modal, #invoice-modal * { cursor: default; }',
        '#invoice-modal input, #invoice-modal textarea { cursor: text; }'
      ].join('\n');
      document.head.append(modalFixStyle);
    } catch (_e) { /* noop */ }
  })();
// Helper to safely show/hide overlays and manage pointer events
  function setOverlayVisible(id, visible) { const el = document.getElementById(id); if (el) { el.style.pointerEvents = visible ? 'auto' : 'none'; el.classList.toggle('hidden', !visible); } }

  // Persistent, delegated event listener for the label print modal
  document.body.addEventListener('click', async (event) => {
    const printBtn = event.target.closest('#printLabelBtn');
    const cancelBtn = event.target.closest('#cancelPrintLabelBtn');
    const modal = document.getElementById('printLabelModal');

    if (printBtn && modal) {
      console.log('[DEBUG PRINT] Print button clicked.');
      const productId = modal.dataset.productId;
      console.log(`[DEBUG PRINT] modal.dataset.productId is: ${productId}`);

      if (productId) {
        event.stopPropagation();
        await printLabel(productId);
        setOverlayVisible('printLabelModal', false);
      }
    } else if (cancelBtn && modal) {
      setOverlayVisible('printLabelModal', false);
    }
  });

	// --- BEGIN: Keyboard-wedge barcode scanner shield (Sales tab only) ---
(function initKeyboardWedgeScanner() {
  const SCAN_CHAR_WINDOW_MS = 50;
  const MIN_SCAN_LEN = 6;
  const END_KEYS = new Set(['Enter', 'Tab']);

  let buf = '';
  let lastTs = 0;
  let scanning = false;

  function reset() {
    buf = '';
    lastTs = 0;
    scanning = false;
  }

  function isTextInput(el) {
    if (!el) return false;
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    return el.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  window.addEventListener('keydown', async (e) => {
    // Enforce your rule: scanner works only on Sales screen
    if (typeof currentTab !== 'undefined' && currentTab !== 'Sales') return;

    // If the user is typing in an input/textarea/contenteditable, don't hijack
    if (isTextInput(document.activeElement)) return;

    const now = Date.now();

    // Fast character stream → treat as scanner input
    if (e.key.length === 1) {
      if (!lastTs || now - lastTs > SCAN_CHAR_WINDOW_MS) {
        buf = '';
        scanning = true;
      }
      buf += e.key;
      lastTs = now;
      // Don't prevent default for character keys so normal typing in non-input areas stays harmless
      return;
    }

    // Scanner usually ends with Enter/Tab — stop UI from "clicking" focused buttons
    if (END_KEYS.has(e.key)) {
      if (scanning && buf.length >= MIN_SCAN_LEN && now - lastTs <= SCAN_CHAR_WINDOW_MS * 2) {
        e.preventDefault();
        e.stopPropagation();

        const code = buf.trim();
        reset();

        try {
          // Requires preload to expose findProductByBarcode (see note below)
          const product = window.api?.findProductByBarcode
            ? await window.api.findProductByBarcode(code)
            : null;

          if (product) {
            if (typeof currentTab !== 'undefined' && currentTab !== 'Sales') {
              await renderView('Sales');
              await new Promise(r => setTimeout(r, 0)); // ensure Sales UI is painted
            }
            addToCart(product.id, product.name, product.price);
            showToast(`✅ Added ${product.name} from scan`);
          } else {
            showToast('❌ Product not found by scan.');
          }
        } catch (err) {
          console.error('Scan lookup failed:', err);
          showToast('❌ Scan failed. See console.');
        }
        return;
      } else {
        // Not a tight scan sequence — don't hijack normal Enter/Tab
        reset();
        return;
      }
    }

    // Any other non-char key: if idle too long, reset
    if (now - lastTs > SCAN_CHAR_WINDOW_MS) reset();
  }, true); // capture:true so we intercept before UI reacts
})();

/* --- injected: ESC overlay teardown --- */
(function(){
  let _escBound=false;
  if(!_escBound){
    _escBound=true;
    window.addEventListener('keydown', function(e){
      if(e.key === 'Escape'){
        ['productModal','printLabelModal','cartOverlay','invoice-modal'].forEach(function(id){
          var el = document.getElementById(id);
          if(el){
            try{
              if (typeof setOverlayVisible === 'function') {
                setOverlayVisible(id, false);
              } else {
                el.classList.add('hidden');
                el.style.pointerEvents = 'none';
              }
            }catch(err){ console.warn('ESC hide failed for', id, err); }
          }
        });
      }
    }, true);
  }
})();
/* --- end inject --- */

/// --- END: Keyboard-wedge barcode scanner shield ---
  window.api.onBarcodeScanned(async (product) => {
    // BUG FIX: Dashboard scans do nothing & Sales-tab scans during tab switch fail
    // This handler now ensures the Sales tab is active and ready before adding to cart.
    if (product) {
      if (currentTab !== "Sales") {
        await renderView("Sales");
      }
      // Ensure the sales view is fully rendered before adding to cart
      await new Promise(resolve => setTimeout(resolve, 0));

      addToCart(product.id, product.name, product.price);
      showToast(`✅ Added ${product.name} from scan`);
    } else {
      showToast("❌ Product not found.");
    }
  });

  const app = document.getElementById("app");
  let editingProductId = null;
  let allProducts = [];
  let productCache = null; // Cached product data
  let productsLoaded = false; // ✅ Flag to track if products are loaded
  const cart = [];
  let activeInvoiceNo = null; // New variable to store the generated invoice number
  let lastSale = [];
  let salesProductList = null;
  let currentSalesPage = 1; // Global variable for Sales tab pagination
  const itemsPerSalesPage = 50; // Global variable for Sales tab pagination
  let currentTab = "Sales"; // Initialize currentTab globally

// Function to apply filters for sales products (moved to global scope)
async function applySalesFilters() {
  let filtered = [...allProducts];
  const salesSearchInput = document.getElementById("salesSearchInput");
  const salesFilterCategory = document.getElementById("salesFilterCategory");
  const salesFilterSubCategory = document.getElementById("salesFilterSubCategory");

  const selectedCategory = salesFilterCategory?.value;
  const selectedSubCategory = salesFilterSubCategory?.value;
  const salesSearch = salesSearchInput?.value.toLowerCase();

  if (selectedCategory) {
    filtered = filtered.filter(p => p.category === selectedCategory);
  }
  if (selectedSubCategory) {
    filtered = filtered.filter(p => p.sub_category === selectedSubCategory);
  }
  if (salesSearch) {
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(salesSearch) ||
      (p.brand && p.brand.toLowerCase().includes(salesSearch)) ||
      (p.model_name && p.model_name.toLowerCase().includes(salesSearch))
    );
  }

  renderSalesProducts(filtered, currentSalesPage, itemsPerSalesPage);
}

function renderSalesPaginationControls(totalPages) {
  const paginationContainer = document.getElementById('salesPaginationControls');
  if (!paginationContainer) {
    console.error("Sales pagination container not found.");
    return;
  }

  paginationContainer.innerHTML = `
    <button id="prevSalesPageBtn" class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 ${currentSalesPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}" ${currentSalesPage === 1 ? 'disabled' : ''}>Previous</button>
    <span class="text-sm">Page ${currentSalesPage} of ${totalPages}</span>
    <button id="nextSalesPageBtn" class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 ${currentSalesPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}" ${currentSalesPage === totalPages ? 'disabled' : ''}>Next</button>
  `;

  document.getElementById('prevSalesPageBtn').onclick = () => {
    if (currentSalesPage > 1) {
      currentSalesPage--;
      applySalesFilters();
    }
  };

  document.getElementById('nextSalesPageBtn').onclick = () => {
    if (currentSalesPage < totalPages) {
      currentSalesPage++;
      applySalesFilters();
    }
  };
}

  // ✅ Fix Scroll Bleed: Dynamically adjust padding based on cart height
  const mainContent = document.getElementById('main-scrollable-content');
  const fixedCart = document.getElementById('fixed-cart-ui');
  if (mainContent && fixedCart) {
    const cartObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        const cartHeight = entry.contentRect.height;
        mainContent.style.paddingBottom = `${cartHeight}px`;
      }
    });
    cartObserver.observe(fixedCart);
  }


  const views = {
    Dashboard: `
      <div class="h-[56px] flex items-center px-6">
        <h2 class="text-3xl font-bold leading-tight text-gray-800">Dashboard</h2>
      </div>
      <div class="p-6 pt-4">
        
        <!-- Sales Stats -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div class="bg-white p-4 rounded-lg shadow card-transition">
            <h3 class="text-gray-500 text-sm font-medium">Today's Sales</h3>
            <p id="today-sales" class="text-2xl font-semibold">₹0</p>
          </div>
          <div class="bg-white p-4 rounded-lg shadow card-transition">
            <h3 class="text-gray-500 text-sm font-medium">This Month's Sales</h3>
            <p id="month-sales" class="text-2xl font-semibold">₹0</p>
          </div>
          <div class="bg-white p-4 rounded-lg shadow card-transition">
            <h3 class="text-gray-500 text-sm font-medium">This Year's Sales</h3>
            <p id="year-sales" class="text-2xl font-semibold">₹0</p>
          </div>
        </div>

        <!-- Chart and Top Products -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div class="bg-white p-4 rounded-lg shadow card-transition">
            <h3 class="text-lg font-semibold mb-2">Daily Sales</h3>
            <canvas id="daily-sales-chart"></canvas>
          </div>
          <div class="bg-white p-4 rounded-lg shadow card-transition">
            <h3 class="text-lg font-semibold mb-2">Weekly Sales</h3>
            <canvas id="weekly-sales-chart"></canvas>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div class="lg:col-span-2 bg-white p-4 rounded-lg shadow card-transition">
            <h3 class="text-lg font-semibold mb-2">Monthly Sales</h3>
            <canvas id="monthly-sales-chart"></canvas>
          </div>
          <div class="bg-white p-4 rounded-lg shadow card-transition">
            <h3 class="text-lg font-semibold mb-2">Top Selling Products</h3>
            <canvas id="top-products-chart"></canvas>
          </div>
        </div>

        <!-- Recent Invoices -->
        <div class="bg-white p-4 rounded-lg shadow">
          <div class="flex justify-between items-center mb-2">
            <h3 class="text-lg font-semibold">Recent Invoices</h3>
            <button id="view-all-invoices-btn" class="text-blue-600 hover:underline">View All →</button>
          </div>
          <table class="w-full text-sm text-left">
            <thead>
              <tr class="bg-gray-100">
                <th class="p-2">Invoice #</th>
                <th class="p-2">Customer</th>
                <th class="p-2">Date</th>
                <th class="p-2 text-right">Total</th>
                <th class="p-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody id="recent-invoices"></tbody>
          </table>
        </div>
      </div>
    `,
    Products: `
      <div class="h-[56px] flex items-end px-6">
        <h2 class="text-2xl font-bold text-gray-800">Product List</h2>
      </div>
      <div class="p-6 pt-0">
        <div class="flex justify-between items-center mb-4">
          <div class="flex gap-2">
            <input type="text" id="searchInput" placeholder="Search by name..." class="border border-secondary-light rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary" />
            <select id="filterCategory" class="border border-secondary-light rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">All Categories</option>
            </select>
            <select id="filterSubCategory" class="border border-secondary-light rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary" disabled>
              <option value="">All Sub Categories</option>
            </select>
            <button id="addProductBtn" class="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded btn-transition">
              + Add Product
            </button>
          </div>
        </div>

        <table class="w-full bg-white shadow rounded mb-4">
          <thead>
            <tr class="bg-gray-200 text-left">
              <th class="p-2">Name</th>
              <th class="p-2">Category</th>
              <th class="p-2">Sub Category</th>
              <th class="p-2">Brand</th>
              <th class="p-2">Model</th>
              <th class="p-2">Unit</th>
              <th class="p-2">Price</th>
              <th class="p-2">Stock</th>
              <th class="p-2">Actions</th>
            </tr>
          </thead>
          <tbody id="productTable"></tbody>
        </table>
        <div id="productPaginationControls" class="flex justify-center items-center space-x-2 mt-4"></div>

        <div id="productModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden z-50" style="overflow-y: auto;">
          <div class="bg-white p-6 rounded shadow-lg w-full max-w-md mx-auto my-8">
            <h2 class="text-lg font-semibold mb-4" id="modalTitle">Add Product</h2>
            <input type="text" id="productName" placeholder="Product Name" class="w-full mb-2 p-2 border border-secondary-light rounded focus:outline-none focus:ring-2 focus:ring-primary" />
            <div class="flex gap-2 mb-2">
              <select id="productCategory" class="w-1/2 p-2 border border-secondary-light rounded focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Select Category</option>
              </select>
              <button id="addNewCategoryBtn" class="bg-secondary-light text-secondary-dark px-2 rounded hover:bg-secondary-dark hover:text-white transition-colors duration-200">+ New</button>
            </div>
            <input type="text" id="newCategoryInput" placeholder="New Category" class="w-full mb-2 p-2 border border-secondary-light rounded focus:outline-none focus:ring-2 focus:ring-primary hidden" />
            <div class="flex gap-2 mb-2">
              <select id="productSubCategory" class="w-1/2 p-2 border border-secondary-light rounded focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Select Sub Category</option>
              </select>
              <button id="addNewSubCategoryBtn" class="bg-secondary-light text-secondary-dark px-2 rounded hover:bg-secondary-dark hover:text-white transition-colors duration-200">+ New</button>
            </div>
            <input type="text" id="newSubCategoryInput" placeholder="New Sub Category" class="w-full mb-2 p-2 border border-secondary-light rounded focus:outline-none focus:ring-2 focus:ring-primary hidden" />
            <input type="text" id="productBrand" placeholder="Brand" class="w-full mb-2 p-2 border border-secondary-light rounded focus:outline-none focus:ring-2 focus:ring-primary" />
            <input type="text" id="productModelName" placeholder="Model Name" class="w-full mb-2 p-2 border border-secondary-light rounded focus:outline-none focus:ring-2 focus:ring-primary" />
            <input type="number" id="productPrice" placeholder="Price" class="w-full mb-2 p-2 border border-secondary-light rounded focus:outline-none focus:ring-2 focus:ring-primary" />
            <input type="text" id="productUnit" placeholder="Unit" class="w-full mb-2 p-2 border border-secondary-light rounded focus:outline-none focus:ring-2 focus:ring-primary" />
            <input type="number" id="productStock" placeholder="Stock" class="w-full mb-2 p-2 border border-secondary-light rounded focus:outline-none focus:ring-2 focus:ring-primary" />
            <input type="text" id="productHSN" placeholder="HSN Code (optional)" class="w-full mb-2 p-2 border border-secondary-light rounded focus:outline-none focus:ring-2 focus:ring-primary" />
            <input type="number" id="productGST" placeholder="GST % (optional)" class="w-full mb-2 p-2 border border-secondary-light rounded focus:outline-none focus:ring-2 focus:ring-primary" />
            <input type="text" id="productBarcodeValue" placeholder="Barcode Value (auto)" class="w-full mb-2 p-2 border rounded bg-gray-100" readonly />
            <input type="text" id="productProductId" placeholder="Product ID (auto)" class="w-full mb-4 p-2 border rounded bg-gray-100" readonly />
            <div class="flex justify-end space-x-2">
              <button id="cancelModalBtn" class="px-4 py-2 bg-secondary-light text-secondary-dark rounded hover:bg-secondary-dark hover:text-white transition-colors duration-200">Cancel</button>
              <button id="saveProductBtn" class="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark transition-colors duration-200">Save</button>
            </div>
          </div>
        </div>

        <div id="printLabelModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden z-50">
          <div class="bg-white p-6 rounded shadow-lg w-full max-w-md mx-auto">
            <h2 class="text-lg font-semibold mb-4">Print Label</h2>
            <div id="label-preview" class="mb-4 border p-4 text-xs">
              <div id="label-store-name" class="text-center font-extrabold text-lg"></div>
              <div id="label-product-name" class="text-center text-sm font-medium"></div>
              <canvas id="label-barcode" class="max-w-full h-auto mx-auto"></canvas>
              <div id="label-mrp" class="text-center text-base font-bold mt-1"></div>
            </div>
            <div class="flex items-center justify-between mb-4">
              <label for="label-size">Label Size:</label>
              <select id="label-size" class="border rounded px-2 py-1">
                <option value="50x25">50x25 mm</option>
                <option value="50x38">50x38 mm</option>
                <option value="50x30">50x30 mm</option>
              </select>
            </div>
            <div class="flex items-center justify-between mb-4">
              <label for="label-quantity">Quantity:</label>
              <input type="number" id="label-quantity" value="1" min="1" class="border rounded px-2 py-1 w-24">
              <span id="label-stock-ref" class="text-sm text-gray-500"></span>
            </div>
            <div class="flex justify-end space-x-2">
              <button id="cancelPrintLabelBtn" class="px-4 py-2 bg-secondary-light text-secondary-dark rounded">Cancel</button>
              <button id="printLabelBtn" class="px-4 py-2 bg-primary text-white rounded">Print</button>
            </div>
          </div>
        </div>
      </div>
    `,
    Sales: `
      <div class="h-[56px] flex items-end px-6">
        <h2 class="text-2xl font-bold text-gray-800">Sales</h2>
      </div>
      <div class="p-6 pt-0">
        <div class="flex justify-between items-center mb-4">
          <div class="flex gap-2">
            <input type="text" id="salesSearchInput" placeholder="Search by name..." class="border border-secondary-light rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary" />
            <select id="salesFilterCategory" class="border border-secondary-light rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">All Categories</option>
            </select>
            <select id="salesFilterSubCategory" class="border border-secondary-light rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary" disabled>
              <option value="">All Sub Categories</option>
            </select>
          </div>
        </div>
        <div id="salesProductList" class="grid grid-cols-2 gap-4 mb-6"></div>
        <div id="salesPaginationControls" class="flex justify-center items-center space-x-2 mt-4"></div>
      </div>
    `,
    InvoiceHistory: `
      <div class="h-[56px] flex items-end px-6">
        <h2 class="text-2xl font-bold text-gray-800">Invoice History</h2>
      </div>
      <div class="p-6 pt-0">
        <div class="bg-white p-4 rounded-lg shadow mb-6">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label for="start-date" class="block text-sm font-medium">Start Date</label>
              <input type="date" id="start-date" class="w-full border border-secondary-light rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary">
            </div>
            <div>
              <label for="end-date" class="block text-sm font-medium">End Date</label>
              <input type="date" id="end-date" class="w-full border border-secondary-light rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary">
            </div>
            <div>
              <label for="invoice-search" class="block text-sm font-medium">Search</label>
              <input type="text" id="invoice-search" placeholder="Invoice # or Customer" class="w-full border border-secondary-light rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary">
            </div>
            <div class="flex items-end">
              <button id="filter-invoices-btn" class="bg-primary text-white px-4 py-2 rounded w-full hover:bg-primary-dark transition-colors duration-200">Filter</button>
            </div>
          </div>
          <div class="flex items-center space-x-2 mt-2">
              <span class="text-sm font-medium">Quick Filters:</span>
              <button id="today-filter-btn" class="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300">Today</button>
              <button id="this-week-filter-btn" class="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300">This Week</button>
              <button id="export-csv-btn" class="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600 ml-auto">Download GST Report</button>
          </div>
        </div>
        <table class="w-full bg-white shadow rounded text-sm text-left">
          <thead>
            <tr class="bg-gray-100">
              <th class="p-2">Invoice #</th>
              <th class="p-2">Customer</th>
              <th class="p-2">Date</th>
              <th class="p-2 text-right">Total</th>
              <th class="p-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody id="invoice-history-table"></tbody>
        </table>
        <div id="pagination-controls" class="flex justify-between items-center mt-4"></div>
      </div>
    `,
    Settings: `
      <div class="h-[56px] flex items-end px-6">
        <h2 class="text-2xl font-bold text-gray-800">Business Profile</h2>
      </div>
      <div class="p-6 pt-0">
        <div class="p-4 bg-white rounded shadow w-full">
        <form id="store-profile-form" class="space-y-4">
          <div>
            <label class="block text-sm font-medium">Store Name</label>
            <input type="text" id="storeNameInput" class="w-full border border-secondary-light px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-primary" required />
          </div>
          <div>
            <label class="block text-sm font-medium">Subtitle / Tagline</label>
            <input type="text" id="storeSubtitleInput" class="w-full border border-secondary-light px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label class="block text-sm font-medium">Full Address</label>
            <textarea id="storeAddressInput" class="w-full border border-secondary-light px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-primary" required></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium">Phone Number</label>
            <input type="text" id="storePhoneInput" class="w-full border border-secondary-light px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-primary" required />
          </div>
          <div>
            <label class="block text-sm font-medium">GSTIN (optional)</label>
            <input type="text" id="storeGstinInput" class="w-full border border-secondary-light px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label class="block text-sm font-medium">Footer Note (optional)</label>
            <textarea id="storeFooterInput" class="w-full border border-secondary-light px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-primary"></textarea>
          </div>
          <button type="submit" id="saveSettingsBtn" class="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded transition-colors duration-200">
            💾 Save Profile
          </button>
        </form>
        <div class="mt-6">
          <h3 class="text-lg font-semibold mb-2">Printer Settings</h3>
          <div class="flex items-center space-x-2 mb-4">
            <label for="labelPrinterSelect" class="block text-sm font-medium">Label Printer:</label>
            <select id="labelPrinterSelect" class="w-full border border-secondary-light px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">-- Select a Printer --</option>
            </select>
            <button id="refreshPrintersBtn" class="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded transition-colors duration-200">Refresh</button>
          </div>
          <button id="savePrinterSettingsBtn" class="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded transition-colors duration-200">
            💾 Save Printer Settings
          </button>
          <button id="testPrintBtn" class="bg-secondary hover:bg-secondary-dark text-white px-4 py-2 rounded transition-colors duration-200">
            🖨️ Test Print
          </button>
        </div>
        <div class="mt-6">
          <h3 class="text-lg font-semibold mb-2">Advanced</h3>
          <button id="regenerateBarcodesBtn" class="bg-danger hover:bg-red-700 text-white px-4 py-2 rounded transition-colors duration-200">
            🔄 Regenerate All Barcodes
          </button>
          <p class="text-sm text-gray-600 mt-2">This will regenerate barcodes for all products. Use this if you encounter issues with missing or incorrect barcodes.</p>
        </div>
        <div class="mt-6">
          <h3 class="text-lg font-semibold mb-2">Test Barcode</h3>
          <div class="flex items-center space-x-2">
            <input type="number" id="testProductId" placeholder="Product ID" class="border rounded px-2 py-1 w-24">
            <button id="testBarcodeBtn" class="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded transition-colors duration-200">
              Test
            </button>
          </div>
      </div>
    `
  };

function renderDailySalesChart() {
  const dailySalesCtx = document.getElementById('daily-sales-chart').getContext('2d');
  new Chart(dailySalesCtx, {
    type: 'line',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Daily Sales',
        data: [1200, 1500, 1000, 1800, 1600, 2000, 1700],
        backgroundColor: 'rgba(255, 99, 132, 0.6)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 1
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

function renderWeeklySalesChart() {
  const weeklySalesCtx = document.getElementById('weekly-sales-chart').getContext('2d');
  new Chart(weeklySalesCtx, {
    type: 'bar',
    data: {
      labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      datasets: [{
        label: 'Weekly Sales',
        data: [5000, 5500, 6200, 5800],
        backgroundColor: 'rgba(153, 102, 255, 0.6)',
        borderColor: 'rgba(153, 102, 255, 1)',
        borderWidth: 1
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

async function setupDashboardView() {
  renderDailySalesChart();
  renderWeeklySalesChart();

  const stats = await window.api.getDashboardStats();
  if (stats) {
    document.getElementById('today-sales').textContent = `₹${stats.today_sales.toFixed(2)}`;
    document.getElementById('month-sales').textContent = `₹${stats.month_sales.toFixed(2)}`;
    document.getElementById('year-sales').textContent = `₹${stats.year_sales.toFixed(2)}`;

    console.log('Top Products Data:', stats.top_products); // Temporary log for debugging
    const topProductsChartCtx = document.getElementById('top-products-chart').getContext('2d');
    new Chart(topProductsChartCtx, {
      type: 'bar',
      data: {
        labels: stats.top_products.map(p => p.name),
        datasets: [{
          label: 'Quantity Sold',
          data: stats.top_products.map(p => p.total_quantity),
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        scales: {
          x: {
            beginAtZero: true
          }
        }
      }
    });

    const ctx = document.getElementById('monthly-sales-chart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: stats.monthly_sales_chart.map(d => d.month),
        datasets: [{
          label: 'Monthly Sales',
          data: stats.monthly_sales_chart.map(d => d.total_sales),
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        }]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  const invoices = await window.api.getRecentInvoices();
  const recentInvoicesTable = document.getElementById('recent-invoices');
  recentInvoicesTable.innerHTML = invoices.map(inv => `
    <tr class="border-b">
      <td class="p-2">${inv.invoice_no}</td>
      <td class="p-2">${inv.customer_name || 'N/A'}</td>
      <td class="p-2">${new Date(inv.timestamp).toLocaleDateString()}</td>
      <td class="p-2 text-right">₹${inv.total.toFixed(2)}</td>
      <td class="p-2 text-center">
        <button class="text-blue-600" onclick="viewInvoice(${inv.id})">View</button>
      </td>
    </tr>
  `).join('');

  document.getElementById('view-all-invoices-btn').addEventListener('click', () => {
    renderView('InvoiceHistory');
  });
}

async function setupInvoiceHistoryView() {
  let currentPage = 1;
  const limit = 15;

  const startDateInput = document.getElementById('start-date');
  const endDateInput = document.getElementById('end-date');
  const searchInput = document.getElementById('invoice-search');
  const filterBtn = document.getElementById('filter-invoices-btn');
  const invoiceTable = document.getElementById('invoice-history-table');
  const paginationControls = document.getElementById('pagination-controls');

    // --- QUICK FILTER LOGIC START ---
    const todayFilterBtn = document.getElementById('today-filter-btn');
    const thisWeekFilterBtn = document.getElementById('this-week-filter-btn');

    const formatDate = (date) => date.toISOString().slice(0, 10);

    if (todayFilterBtn) {
        todayFilterBtn.addEventListener('click', () => {
            const today = new Date();
            startDateInput.value = formatDate(today);
            endDateInput.value = formatDate(today);
            filterBtn.click();
        });
    }

    if (thisWeekFilterBtn) {
        thisWeekFilterBtn.addEventListener('click', () => {
            const today = new Date();
            const dayOfWeek = today.getDay(); // Sunday = 0, Monday = 1, etc.
            const firstDayOfWeek = new Date(today.setDate(today.getDate() - dayOfWeek));
            const lastDayOfWeek = new Date(firstDayOfWeek);
            lastDayOfWeek.setDate(lastDayOfWeek.getDate() + 6);
            
            startDateInput.value = formatDate(firstDayOfWeek);
            endDateInput.value = formatDate(lastDayOfWeek);
            filterBtn.click();
        });
    }
    // --- QUICK FILTER LOGIC END ---

    // --- CSV EXPORT LOGIC START ---
    const exportCsvBtn = document.getElementById('export-csv-btn');
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', async () => {
            const options = {
                startDate: startDateInput.value,
                endDate: endDateInput.value,
                searchQuery: searchInput.value
            };

            showToast('⏳ Generating CSV export...');
            const result = await window.api.exportInvoicesCsv(options);

            if (result.success) {
                showToast('✅ GST Report generated and opened.');
            } else {
                showToast('❌ Failed to generate report: ' + result.message, 'error');
            }
        });
    }
    // --- CSV EXPORT LOGIC END ---

  async function fetchAndRenderInvoices() {
    const options = {
      page: currentPage,
      limit,
      startDate: startDateInput.value,
      endDate: endDateInput.value,
      searchQuery: searchInput.value
    };
    const { data, total } = await window.api.getInvoices(options);

    window.currentInvoicePageData = data; // Store current page data for navigation

    invoiceTable.innerHTML = data.map(inv => `
      <tr class="border-b">
        <td class="p-2">${inv.invoice_no}</td>
        <td class="p-2">${inv.customer_name || 'N/A'}</td>
        <td class="p-2">${new Date(inv.timestamp).toLocaleDateString()}</td>
        <td class="p-2 text-right">₹${inv.total.toFixed(2)}</td>
        <td class="p-2 text-center">
          <button class="text-blue-600" onclick="viewInvoice(${inv.id})">View</button>
        </td>
      </tr>
    `).join('');

    renderPagination(total);
  }

  function renderPagination(total) {
    const totalPages = Math.ceil(total / limit);
    paginationControls.innerHTML = `
      <div>
        <button id="prev-page" class="bg-gray-300 px-4 py-2 rounded" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
        <span class="px-4">Page ${currentPage} of ${totalPages}</span>
        <button id="next-page" class="bg-gray-300 px-4 py-2 rounded" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
      </div>
      <div>
        <span>Total Invoices: ${total}</span>
      </div>
    `;

    document.getElementById('prev-page')?.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        fetchAndRenderInvoices();
      }
    });

    document.getElementById('next-page')?.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        fetchAndRenderInvoices();
      }
    });
  }

  filterBtn.addEventListener('click', () => {
    currentPage = 1;
    fetchAndRenderInvoices();
  });

  fetchAndRenderInvoices();
}

window.viewInvoice = async function(id) {
  // Log 1: Click detected and invoiceId
  console.log('DEBUG-INVOICE-MODAL: View button click detected. Invoice ID:', id);

  // Log 2: Page data at click time and index
  console.log('DEBUG-INVOICE-MODAL: currentInvoicePageData at click:', window.currentInvoicePageData);
  console.log('DEBUG-INVOICE-MODAL: currentInvoicePageIndex before find:', window.currentInvoicePageIndex);

  // Find the index of the current invoice in the current page data
  window.currentInvoicePageIndex = window.currentInvoicePageData.findIndex(inv => inv.id === id);

  console.log('DEBUG-INVOICE-MODAL: currentInvoicePageIndex after find:', window.currentInvoicePageIndex);

  // Log 3: Before fetching invoice details
  console.log('DEBUG-INVOICE-MODAL: Fetching invoice details for ID:', id);
  const invoice = await window.api.getInvoiceDetails(id);

  // Log 4: Result from getInvoiceDetails
  console.log('DEBUG-INVOICE-MODAL: Result from getInvoiceDetails:', invoice);

  if (invoice) {
    // Log 5: Before showing the modal (populateInvoiceModal also shows it)
    console.log('DEBUG-INVOICE-MODAL: Attempting to populate and show modal with invoice data.');

    // --- NEW DEBUG LOGS START ---
    const invoiceModal = document.getElementById('invoice-modal');
    console.log('DEBUG-INVOICE-MODAL: Modal element existence check:', invoiceModal ? 'Exists' : 'Does NOT exist');

    if (invoiceModal) {
      console.log('DEBUG-INVOICE-MODAL: Modal classList BEFORE populate:', invoiceModal.classList.value);
      console.log('DEBUG-INVOICE-MODAL: Modal display style BEFORE populate:', invoiceModal.style.display);
      console.log('DEBUG-INVOICE-MODAL: Modal visibility style BEFORE populate:', invoiceModal.style.visibility);
      console.log('DEBUG-INVOICE-MODAL: Modal opacity style BEFORE populate:', invoiceModal.style.opacity);
    }
    // --- NEW DEBUG LOGS END ---

    populateInvoiceModal(invoice.items, invoice.invoice_no);

    // --- FIX START: Make modal visible ---
    if (invoiceModal) {
      console.log('DEBUG-INVOICE-MODAL: Modal classList before show logic:', invoiceModal.classList.value);
      setOverlayVisible('invoice-modal', true);
      // Clear inline styles that might be hiding the modal
      invoiceModal.style.display = 'flex';
      invoiceModal.style.zIndex = '100';
      invoiceModal.style.visibility = '';
      invoiceModal.style.opacity = '';
      console.log('DEBUG-INVOICE-MODAL: Modal classList after show logic:', invoiceModal.classList.value);
      console.log('DEBUG-INVOICE-MODAL: Modal display style after show logic:', invoiceModal.style.display);
    }
    // --- FIX END ---

    // --- NEW DEBUG LOGS START (AFTER populateInvoiceModal call) ---
    if (invoiceModal) {
      console.log('DEBUG-INVOICE-MODAL: Modal classList AFTER populate:', invoiceModal.classList.value);
      console.log('DEBUG-INVOICE-MODAL: Modal display style AFTER populate:', invoiceModal.style.display);
      console.log('DEBUG-INVOICE-MODAL: Modal visibility style AFTER populate:', invoiceModal.style.visibility);
      console.log('DEBUG-INVOICE-MODAL: Modal opacity style AFTER populate:', invoiceModal.style.opacity);
    }
    // --- NEW DEBUG LOGS END ---

    // Wire Next/Prev buttons and update their state
    const prevBtn = document.getElementById('prev-invoice-btn');
    const nextBtn = document.getElementById('next-invoice-btn');

    // Remove existing listeners to prevent multiple bindings
    if (prevBtn) prevBtn.removeEventListener('click', window.handlePrevInvoice);
    if (nextBtn) nextBtn.removeEventListener('click', window.handleNextInvoice);

    // Add new listeners
    if (prevBtn) prevBtn.addEventListener('click', window.handlePrevInvoice);
    if (nextBtn) nextBtn.addEventListener('click', window.handleNextInvoice);

    window.updateModalNavigationButtons();
  } else {
    console.log('DEBUG-INVOICE-MODAL: Invoice details not found or invalid for ID:', id);
  }
}

// Function to update the state of Next/Prev buttons
window.updateModalNavigationButtons = function() {
  const prevBtn = document.getElementById('prev-invoice-btn');
  const nextBtn = document.getElementById('next-invoice-btn');

  if (prevBtn) {
    prevBtn.disabled = window.currentInvoicePageIndex <= 0;
  }
  if (nextBtn) {
    nextBtn.disabled = window.currentInvoicePageIndex >= window.currentInvoicePageData.length - 1;
  }
};

// Handler for Previous button
window.handlePrevInvoice = async function() {
  // --- FIX START: Robust invoice navigation ---
  if (window.currentInvoicePageIndex > 0) {
    window.currentInvoicePageIndex--;
    const prevInvoice = window.currentInvoicePageData[window.currentInvoicePageIndex];
    if (prevInvoice && prevInvoice.id) {
      const invoice = await window.api.getInvoiceDetails(prevInvoice.id);
      if (invoice) {
        populateInvoiceModal(invoice.items, invoice.invoice_no);
        window.updateModalNavigationButtons();
      }
    }
  }
  // --- FIX END: Robust invoice navigation ---
};

// Handler for Next button
window.handleNextInvoice = async function() {
  // --- FIX START: Robust invoice navigation ---
  if (window.currentInvoicePageIndex < window.currentInvoicePageData.length - 1) {
    window.currentInvoicePageIndex++;
    const nextInvoice = window.currentInvoicePageData[window.currentInvoicePageIndex];
    if (nextInvoice && nextInvoice.id) {
      const invoice = await window.api.getInvoiceDetails(nextInvoice.id);
      if (invoice) {
        populateInvoiceModal(invoice.items, invoice.invoice_no);
        window.updateModalNavigationButtons();
      }
    }
  }
  // --- FIX END: Robust invoice navigation ---
};



function setupProductView() {
  let currentPage = 1; // Current page for product pagination
  const itemsPerPage = 50; // Number of products to display per page

  const addBtn = document.getElementById("addProductBtn");
  const modal = document.getElementById("productModal");
  const modalTitle = document.getElementById("modalTitle");
  const nameInput = document.getElementById("productName");
  const priceInput = document.getElementById("productPrice");
  const stockInput = document.getElementById("productStock");
  const saveBtn = document.getElementById("saveProductBtn");
  const cancelBtn = document.getElementById("cancelModalBtn");
  const searchInput = document.getElementById("searchInput");
  const productTable = document.getElementById("productTable");
  const filterCategory = document.getElementById("filterCategory");
  const filterSubCategory = document.getElementById("filterSubCategory");
  const fixedCart = document.getElementById("fixed-cart-ui");

  // 🔽 Load category → HSN + GST mapping
  let categoryHSNMap = {};
  fetch("category-hsn-map.json")
    .then((res) => res.json())
    .then((data) => {
      categoryHSNMap = data;
      const categorySelect = document.getElementById("productCategory");
      if (categorySelect) {
        categorySelect.innerHTML =
          `<option value="">Select Category</option>` +
          Object.keys(data)
            .map(cat => `<option value="${cat}">${cat}</option>`)
            .join("");
      }
    })
    .catch((err) => console.error("❌ Failed to load category-HSN map:", err));

  

  

  // Advanced filter logic for Products tab
  function applyProductFilters() {
    const nameTerm = document.getElementById("searchInput").value.trim().toLowerCase();
    const selectedCategory = document.getElementById("filterCategory").value;
    const selectedSubCategory = document.getElementById("filterSubCategory").value;
    let filtered = allProducts;
    if (nameTerm) {
      filtered = filtered.filter(p => p.name.toLowerCase().includes(nameTerm));
    }
    if (selectedCategory) {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }
    if (selectedSubCategory) {
      filtered = filtered.filter(p => p.sub_category === selectedSubCategory);
    }
    displayFilteredProducts(filtered, currentPage, itemsPerPage);
  }

  // Initial population for Products tab
  async function renderProducts(products) {
    console.log('[Products] renderProducts() called');
    // why: Use passed-in list to prevent race conditions; only fetch if no list is provided.
    allProducts = (typeof products !== 'undefined' && products !== null) ? products : await window.api.getProducts();
    
    console.log(`[Products] using list with ${allProducts.length} items`);
    populateCategoryDropdown(allProducts, document.getElementById("filterCategory"));
    await updateProductFilterSubCategoryDropdown(document.getElementById("filterCategory").value);
    applyProductFilters();
  }
  window.renderProducts = renderProducts;

  function displayFilteredProducts(products, page, perPage) {
    const productTable = document.getElementById("productTable");
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedProducts = products.slice(startIndex, endIndex);

    productTable.innerHTML = paginatedProducts.map(p => `
      <tr data-product-id="${p.id}">
        <td class="p-2">${p.name}</td>
        <td class="p-2">${p.category || ''}</td>
        <td class="p-2">${p.sub_category || ''}</td>
        <td class="p-2">${p.brand || ''}</td>
        <td class="p-2">${p.model_name || ''}</td>
        <td class="p-2">${p.unit || ''}</td>
        <td class="p-2">₹${p.price}</td>
        <td class="p-2">${p.stock}</td>
        <td class="p-2 space-x-2">
          <button class="text-blue-600" onclick="editProduct(${p.id})">✏️</button>
          <button class="text-red-600 delete-product-btn" data-id="${p.id}">🗑️</button> <!-- why: Use data-id for reliable ID retrieval -->
          <button class="text-green-600" onclick="showPrintLabelModal(${p.id})">️ Print Label</button>
        </td>
      </tr>
    `).join("");

    const totalPages = Math.ceil(products.length / perPage);
    renderPaginationControls(totalPages, page);
  }

  function renderPaginationControls(totalPages, page) {
    const paginationContainer = document.getElementById('productPaginationControls');
    if (!paginationContainer) return;

    paginationContainer.innerHTML = `
      <button id="prevPageBtn" class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 ${page === 1 ? 'opacity-50 cursor-not-allowed' : ''}" ${page === 1 ? 'disabled' : ''}>Previous</button>
      <span class="text-sm">Page ${page} of ${totalPages}</span>
      <button id="nextPageBtn" class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 ${page === totalPages ? 'opacity-50 cursor-not-allowed' : ''}" ${page === totalPages ? 'disabled' : ''}>Next</button>
    `;

    document.getElementById('prevPageBtn').onclick = () => {
      if (currentPage > 1) {
        currentPage--;
        applyProductFilters();
      }
    };

    document.getElementById('nextPageBtn').onclick = () => {
      if (currentPage < totalPages) {
        currentPage++;
        applyProductFilters();
      }
    };
  }

  window.deleteProduct = async function(id) {
    const confirmed = confirm("Are you sure you want to delete?");
    if (!confirmed) return;

    // why: Pass ID as an object to match the expected IPC payload.
    const result = await window.api.deleteProduct({ id });
    if (result.success && result.changes > 0) {
      showToast("🗑️ Product deleted");
      // Refetch the entire list to ensure UI is consistent.
      const freshProducts = await window.api.getProducts();
      productCache = freshProducts;
      await renderProducts(freshProducts);
    } else {
      showToast("❌ Delete failed. The product may have already been removed.", 'error');
    }
  }

  // Delegated listener for delete buttons
  productTable.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-product-btn')) {
      const id = e.target.getAttribute('data-id');
      if (id) {
        deleteProduct(Number(id));
      }
    }
  });

  document.getElementById("searchInput").addEventListener("input", applyProductFilters);
  document.getElementById("filterCategory").addEventListener("change", async (e) => {
    const selectedCategory = e.target.value;
    const subCategoryDropdown = document.getElementById("filterSubCategory");
    if (!subCategoryDropdown) return;

    if (selectedCategory) {
      const subCategories = await window.api.getUniqueSubCategories(selectedCategory);
      subCategoryDropdown.innerHTML = `<option value="">All Sub Categories</option>`;
      subCategories.forEach(sub => {
        const opt = document.createElement("option");
        opt.value = sub;
        opt.textContent = sub;
        subCategoryDropdown.appendChild(opt);
      });
      subCategoryDropdown.disabled = false;
    } else {
      subCategoryDropdown.innerHTML = `<option value="">All Sub Categories</option>`;
      subCategoryDropdown.disabled = true;
    }
    subCategoryDropdown.value = "";
    applyProductFilters();
  });
  document.getElementById("filterSubCategory").addEventListener("change", applyProductFilters);

  const categorySelect = document.getElementById("productCategory");
  const hsnInput = document.getElementById("productHSN");
  const gstInput = document.getElementById("productGST");
  const productIdInput = document.getElementById("productProductId");
  const subCategoryInput = document.getElementById("productSubCategory");
  const brandInput = document.getElementById("productBrand");
  const modelNameInput = document.getElementById("productModelName");
  const unitInput = document.getElementById("productUnit");
  const barcodeValueInput = document.getElementById("productBarcodeValue");

  // ✅ START: FIX FOR ISSUE #1 and #2
  function updateGeneratedIds() {
    const tempProduct = {
      name: nameInput.value,
      category: categorySelect.value,
      sub_category: subCategoryInput.value,
      brand: brandInput.value,
      model_name: modelNameInput.value,
    };
    const barcode = generateBarcode(tempProduct);
    barcodeValueInput.value = barcode;
    productIdInput.value = barcode;
  }

  const modalInputs = modal.querySelectorAll('input, select');
  modalInputs.forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
    });
  });

  [nameInput, brandInput, modelNameInput].forEach(input => {
    input.addEventListener('input', updateGeneratedIds);
  });
  [categorySelect, subCategoryInput].forEach(select => {
    select.addEventListener('change', updateGeneratedIds);
  });

  modelNameInput.addEventListener('input', () => {
    const price = parsePriceFromModel(modelNameInput.value);
    if (price !== null) {
      priceInput.value = price;
    }
  });
  // ✅ END: FIX FOR ISSUE #1 and #2


  if (categorySelect && hsnInput && gstInput) {
    categorySelect.addEventListener("change", async () => {
      const selectedCategory = categorySelect.value;
      const mapping = categoryHSNMap[selectedCategory];
      if (mapping) {
        hsnInput.value = mapping.hsn || "";
        gstInput.value = mapping.gst || "";
      }
      await updateProductModalSubCategoryDropdown(selectedCategory);
      subCategoryInput.value = ""; // Reset sub-category selection
    });

    document.getElementById("productCategory").addEventListener("change", async (e) => {
      const selectedCategory = e.target.value;
      await updateProductModalSubCategoryDropdown(selectedCategory);
      document.getElementById("productSubCategory").value = "";
    });
  }

  addBtn.addEventListener("click", () => {
    editingProductId = null;

    // Clear sub-category dropdown and disable it initially
    subCategoryInput.innerHTML = '<option value="">Select Sub Category</option>';
    subCategoryInput.disabled = true;

    // Clear all fields in the modal form
    const fieldsToClear = [
      nameInput, priceInput, stockInput, hsnInput, gstInput,
      brandInput, modelNameInput, unitInput, barcodeValueInput, productIdInput
    ];
    fieldsToClear.forEach(field => field.value = "");
    categorySelect.value = "";
    subCategoryInput.value = ""; // Also clear sub-category selection
    
    modalTitle.textContent = "Add Product";
    setOverlayVisible('productModal', true);
    if (fixedCart) fixedCart.style.display = "none";
  });

  cancelBtn.addEventListener("click", () => {
    setOverlayVisible('productModal', false);
    if (fixedCart) fixedCart.style.display = "block";
  });

  saveBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const price = parseFloat(priceInput.value);
    const stock = parseInt(stockInput.value);
    const hsn = hsnInput.value.trim();
    const gst = parseFloat(gstInput.value);
    const category = categorySelect.value.trim();
    const product_id = productIdInput.value.trim();
    const sub_category = subCategoryInput.value.trim();
    const brand = brandInput.value.trim();
    const model_name = modelNameInput.value.trim();
    const unit = unitInput.value.trim();
    
    // This is a slight bug in the original code. `payload` is not defined yet.
    // It should generate the barcode from the collected constants.
    const tempPayloadForBarcode = { name, category, sub_category, brand, model_name };
    const barcode_value = generateBarcode(tempPayloadForBarcode);

    if (!name || isNaN(price) || isNaN(stock)) {
      showToast("⚠️ Please fill all fields correctly.");
      return;
    }

    const payload = {
      name,
      price,
      stock,
      category: category || null,
      hsn_code: hsn || null,
      gst_percent: isNaN(gst) ? null : gst,
      product_id: product_id || barcode_value, // Fallback to barcode_value if product_id is empty
      sub_category: sub_category || null,
      brand: brand || null,
      model_name: model_name || null,
      unit: unit || null,
      barcode_value: barcode_value
    };

    let result;
    if (editingProductId) {
      payload.id = editingProductId;
      result = await window.api.updateProduct(payload);
    } else {
      result = await window.api.addProduct(payload);
    }

    if (result.success) {
      showToast(editingProductId ? "✏️ Product updated!" : "✅ Product added!");

      try {
        // why: To prevent the new item from being hidden, reset filters and pagination.
        document.getElementById('searchInput').value = '';
        document.getElementById('filterCategory').value = '';
        document.getElementById('filterSubCategory').value = '';
        document.getElementById('filterSubCategory').disabled = true;
        currentPage = 1;

        productCache = null;


        const fresh = await window.api.getProducts();

        window.allProducts = Array.isArray(fresh) ? fresh : [];
        window.productsLoaded = true;
        productCache = window.allProducts;

        if (typeof window.renderProducts === 'function' && window.currentTab === 'Products') {
          await window.renderProducts(fresh);
        }

      } catch (e) {
        console.warn('refresh Products failed', e);
      }

      setOverlayVisible('productModal', false);
      if (fixedCart) fixedCart.style.display = "block";
    } else {
      showToast("❌ Failed to save product.", 'error');
    }
  });

  // Add New Category functionality
  const addNewCategoryBtn = document.getElementById("addNewCategoryBtn");
  const newCategoryInput = document.getElementById("newCategoryInput");
  const addNewSubCategoryBtn = document.getElementById("addNewSubCategoryBtn");
  const newSubCategoryInput = document.getElementById("newSubCategoryInput");

  if (addNewCategoryBtn && newCategoryInput) {
    addNewCategoryBtn.addEventListener("click", async () => {
      if (newCategoryInput.classList.contains("hidden")) {
        newCategoryInput.classList.remove("hidden");
        newCategoryInput.focus();
        addNewCategoryBtn.textContent = "Save";
      } else {
        const newCategory = newCategoryInput.value.trim();
        if (newCategory) {
          // Add to category mapping if it doesn't exist
          if (!categoryHSNMap[newCategory]) {
            categoryHSNMap[newCategory] = { hsn: "", gst: "" };
            
            // ✅ Persist the updated map
            const result = await window.api.saveCategoryMap(categoryHSNMap);
            if (result.success) {
              showToast(`✅ Category '${newCategory}' saved.`);
            } else {
              showToast(`❌ Failed to save category.`);
              // Revert optimistic update if save fails
              delete categoryHSNMap[newCategory]; 
              return;
            }
          }
          
          // Add to dropdown and select it
          const optionExists = Array.from(categorySelect.options).some(opt => opt.value === newCategory);
          if (!optionExists) {
            categorySelect.innerHTML += `<option value="${newCategory}">${newCategory}</option>`;
          }
          categorySelect.value = newCategory;
          
          // Trigger change event to populate HSN/GST if available
          categorySelect.dispatchEvent(new Event('change'));
          
          newCategoryInput.classList.add("hidden");
          newCategoryInput.value = "";
          addNewCategoryBtn.textContent = "+ New";
        }
      }
    });
  }

  if (addNewSubCategoryBtn && newSubCategoryInput) {
    addNewSubCategoryBtn.addEventListener("click", () => {
      if (newSubCategoryInput.classList.contains("hidden")) {
        newSubCategoryInput.classList.remove("hidden");
        newSubCategoryInput.focus();
        addNewSubCategoryBtn.textContent = "Save";
      } else {
        const newSubCategory = newSubCategoryInput.value.trim();
        if (newSubCategory) {
          subCategoryInput.innerHTML += `<option value="${newSubCategory}">${newSubCategory}</option>`;
          subCategoryInput.value = newSubCategory;
          newSubCategoryInput.classList.add("hidden");
          newSubCategoryInput.value = "";
          addNewSubCategoryBtn.textContent = "+ New";
        }
      }
    });
  }
}
function populateCategoryDropdown(products, dropdownElement) {
  if (!dropdownElement || !products) return;

  const uniqueCategories = [...new Set(products.map(p => p.category).filter(Boolean))];
  dropdownElement.innerHTML = `<option value="">All</option>`;
  uniqueCategories.forEach(cat => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = cat;
    dropdownElement.appendChild(option);
  });
}

async function updateSalesSubCategoryDropdown(selectedCategory) {
  const dropdown = document.getElementById("salesFilterSubCategory");
  if (!dropdown) return;

  // why: Prevent IPC spam when no category is selected during view rendering.
  if (!selectedCategory) {
    dropdown.innerHTML = `<option value="">All</option>`;
    dropdown.disabled = true;
    return;
  }

  const subCategories = await window.api.getUniqueSubCategories(selectedCategory);
  dropdown.innerHTML = `<option value="">All</option>`;
  subCategories.forEach(sub => {
    const opt = document.createElement("option");
    opt.value = sub;
    opt.textContent = sub;
    dropdown.appendChild(opt);
  });
  dropdown.disabled = false;
}

async function updateProductFilterSubCategoryDropdown(selectedCategory) {
  const dropdown = document.getElementById("filterSubCategory");
  if (!dropdown) return;

  // why: Prevent IPC spam when no category is selected during view rendering.
  if (!selectedCategory) {
    dropdown.innerHTML = `<option value="">All Sub Categories</option>`;
    dropdown.disabled = true;
    return;
  }

  const subCategories = await window.api.getUniqueSubCategories(selectedCategory);
  dropdown.innerHTML = `<option value="">All Sub Categories</option>`;
  subCategories.forEach(sub => {
    const opt = document.createElement("option");
    opt.value = sub;
    opt.textContent = sub;
    dropdown.appendChild(opt);
  });
  dropdown.disabled = false;
}

async function updateProductModalSubCategoryDropdown(category) {
  const subCatInput = document.getElementById("productSubCategory");
  if (!subCatInput || !category) return;

  const subCategories = await window.api.getUniqueSubCategories(category);
  subCatInput.innerHTML = `<option value="">Select Sub Category</option>`;
  subCategories.forEach(sub => {
    const opt = document.createElement("option");
    opt.value = sub;
    opt.textContent = sub;
    subCatInput.appendChild(opt);
  });
  subCatInput.disabled = false;
}


async function populateInvoiceModal(cartItems, invoiceNo, isQuotation = false) {
  const storeSettings = await window.api.getStoreSettings();
  const invoiceHeader = document.getElementById('invoice-header');
  const invoiceMeta = document.getElementById('invoice-meta');
  const invoiceItems = document.getElementById('invoice-items');
  const invoiceTotal = document.getElementById('invoice-total');

  // Store Header
  const invoiceType = isQuotation ? 'PROFORMA INVOICE' : 'TAX INVOICE';
  let headerHTML = `
    <div class="text-center mb-1">
      <div class="text-lg font-bold">${storeSettings?.store_name || "Asian Sports"}</div>
      <div class="text-sm">No. 1 Store for All Your Sporting&nbsp;needs</div>
      <div class="border-t border-b my-1 py-0.5 text-sm font-semibold">${invoiceType}</div>
    </div>
    <div class="text-xs leading-tight mt-1 text-left">
      ${storeSettings?.store_address || "Yellandu Cross Road, IT Hub Circle"}<br>
      ${storeSettings?.store_city || "Khammam-507001"}
      <div class="mt-1">📞 ${storeSettings?.store_phone || "1234567890"}</div>
      <div class="border-t my-1"></div>
      <div>GSTIN: ${storeSettings?.store_gstin || "N/A"}</div>
    </div>
  `;
  if (invoiceHeader) invoiceHeader.innerHTML = headerHTML;

  // Invoice Meta
  const now = new Date();
  const metaHTML = isQuotation
    ? ''
    : `
    <div class="text-xs mb-1">
      <div>Invoice No: ${invoiceNo}</div>
      <div>Date: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}</div>
    </div>
  `;
  if (invoiceMeta) invoiceMeta.innerHTML = metaHTML;

  // Customer Details
  const customerName = document.getElementById("custName")?.value || "";
  const customerPhone = document.getElementById("custPhone")?.value || "";
  const custGSTIN = document.getElementById("custGSTIN")?.value || "";
  const customerHTML = `
    <div class="text-xs border-t pt-1">
      <div>Customer: ${customerName}</div>
      <div>Phone: ${customerPhone}</div>
      ${custGSTIN ? `<div>GSTIN: ${custGSTIN}</div>` : ''}
    </div>
  `;
  const customerSection = document.getElementById("invoice-customer");
  if (customerSection) customerSection.innerHTML = customerHTML;

  // Items
  let totalAmount = 0;
  let totalGST = 0;
  let totalDiscount = 0;
  const colWidths = {
    sno: '5%',
    item: '30%',
    rate: '13%',
    gstPercent: '7%',
    gstAmount: '13%',
    qty: '5%',
    disc: '12%',
    amount: '15%'
  };

  const itemsHTML = cartItems.map((item, index) => {
    const product = allProducts.find(p => p.id === item.id) || {};
    const gstRate = item.gst_percent || product.gst_percent || 0;
    const qty = item.quantity || 1;
    const price = item.price || 0;
    const discount = item.discount || 0;

    const gross = price * qty;
    const baseAmount = gross / (1 + gstRate / 100);
    const gstAmount = gross - baseAmount;
    const finalAmount = gross - discount;

    totalAmount += finalAmount;
    totalGST += gstAmount;
    totalDiscount += discount;

    return `
      <tr class="border-b">
        <td style="width: ${colWidths.sno}; text-align: center;">${index + 1}</td>
        <td style="width: ${colWidths.item};">${item.name}</td>
        <td style="width: ${colWidths.rate}; text-align: right;">₹${price.toFixed(2)}</td>
        <td style="width: ${colWidths.gstPercent}; text-align: right;">${gstRate}%</td>
        <td style="width: ${colWidths.gstAmount}; text-align: right;">₹${gstAmount.toFixed(2)}</td>
        <td style="width: ${colWidths.qty}; text-align: right;">${qty}</td>
        <td style="width: ${colWidths.disc}; text-align: right;">₹${discount.toFixed(2)}</td>
        <td style="width: ${colWidths.amount}; text-align: right;">₹${finalAmount.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const tableContent = `
    <style>
      /* Scoped styles for invoice preview table */
      #invoice-items table td:nth-child(2) { /* Targets the 'Item' column (2nd td) */
        word-wrap: break-word;
        white-space: normal;
      }
    </style>
    <table style="width: 100%; table-layout: fixed; border-collapse: collapse;" class="text-xs">
      <thead>
        <tr class="bg-gray-100">
          <th style="width: ${colWidths.sno}; text-align: center; padding: 4px; word-wrap: break-word;">S.No</th>
          <th style="width: ${colWidths.item}; text-align: left; padding: 4px;">Item</th>
          <th style="width: ${colWidths.rate}; text-align: right; padding: 4px;">Rate</th>
          <th style="width: ${colWidths.gstPercent}; text-align: right; padding: 4px;">GST%</th>
          <th style="width: ${colWidths.gstAmount}; text-align: right; padding: 4px;">GST Amt</th>
          <th style="width: ${colWidths.qty}; text-align: right; padding: 4px;">Qty</th>
          <th style="width: ${colWidths.disc}; text-align: right; padding: 4px;">Disc.</th>
          <th style="width: ${colWidths.amount}; text-align: right; padding: 4px;">Amt</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
      </tbody>
    </table>
  `;

  if (invoiceItems) invoiceItems.innerHTML = tableContent;

  // Totals
  const cgst = totalGST / 2;
  const sgst = totalGST / 2;
  const grandTotal = totalAmount;
  const payable = grandTotal;

  invoiceTotal.innerHTML = `
    <div class="text-sm mt-3 border-t pt-2 text-right">
      <div>Total GST: ₹${totalGST.toFixed(2)}</div>
      <div>CGST + SGST: ₹${cgst.toFixed(2)} + ₹${sgst.toFixed(2)}</div>
      <div>Total Amount: ₹${(grandTotal + totalDiscount).toFixed(2)}</div>
      <div class="text-red-600">Discount: − ₹${totalDiscount.toFixed(2)}</div>
      <div class="text-lg font-bold mt-1">Payable: ₹${payable.toFixed(2)}</div>
      <div class="text-center mt-4 font-medium"> Thank you! Visit again.</div>
    </div>`;
}

async function renderView(viewName) {
  currentTab = viewName; // Update currentTab on view change

  // Force-hide all known modals/overlays to prevent event blocking on tab switch
  ['productModal', 'printLabelModal', 'cartOverlay', 'invoice-modal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('hidden');
      el.style.pointerEvents = 'none';
    }
  });

  app.innerHTML = views[viewName] || `<p>Unknown view: ${viewName}</p>`;

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const tabName = btn.innerText.trim().replace(/\s+/g, '');
    if (tabName === viewName) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  if (viewName === "Dashboard") {
    await setupDashboardView();
  }
  if (viewName === "Products") {
    performance.mark('renderView_Products_start');
    const productTable = document.getElementById('productTable');
    if (!productCache) {
      if(productTable) productTable.innerHTML = '<tr><td colspan="9" class="text-center p-4">Loading products...</td></tr>';
      console.time("IPC_getProducts");
      productCache = await window.api.getProducts();
      console.timeEnd("IPC_getProducts");
    }
    allProducts = productCache;
    productsLoaded = true;
    currentPage = 1; // Reset to first page on tab switch
    await setupProductView();
    if (typeof window.renderProducts === 'function') {
      window.renderProducts();
    }
    performance.mark('renderView_Products_end');
    performance.measure('renderView_Products_duration', 'renderView_Products_start', 'renderView_Products_end');
  }
  if (viewName === "InvoiceHistory") {
    await setupInvoiceHistoryView();
  }

  if (viewName === "Sales") {
    const salesViewCartElement = document.getElementById("fixed-cart-ui");
    if (salesViewCartElement) salesViewCartElement.classList.remove("hidden");

    if (!productsLoaded) {
        const salesProductList = document.getElementById('salesProductList');
        if(salesProductList) salesProductList.innerHTML = '<p class="text-center col-span-full">Loading products...</p>';
        allProducts = await window.api.getProducts();
        productsLoaded = true;
    }
    // Pressing Enter in any input should trigger blur (and thereby onchange)
    const cartOverlay = document.getElementById("cartOverlay");
    if (cartOverlay) {
      // Remove any existing listeners to prevent duplicates
      cartOverlay.removeEventListener("keydown", handleCartKeydown);
      cartOverlay.removeEventListener("input", handleCartInput);
      
      // Add the listeners
      cartOverlay.addEventListener("keydown", handleCartKeydown);
      cartOverlay.addEventListener("input", handleCartInput);
    }
    
    salesProductList = document.getElementById("salesProductList");
    salesProductList.className = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-6"; // Updated grid classes

    const salesSearchInput = document.getElementById("salesSearchInput");
    const salesFilterCategory = document.getElementById("salesFilterCategory");
    const salesFilterSubCategory = document.getElementById("salesFilterSubCategory");

    // Populate category dropdown for sales
    populateCategoryDropdown(allProducts, salesFilterCategory);

    

    // Event Listeners for sales filters
    salesSearchInput.addEventListener("input", debounce(applySalesFilters, 300));
    salesFilterCategory.addEventListener("change", async (e) => {
      const selectedCategory = e.target.value;
      await updateSalesSubCategoryDropdown(selectedCategory);
      document.getElementById("salesFilterSubCategory").value = "";
      currentSalesPage = 1; // Reset page on filter change
      applySalesFilters();
    });
    salesFilterSubCategory.addEventListener("change", (e) => {
      currentSalesPage = 1; // Reset page on filter change
      applySalesFilters();
    });

    // Function to apply filters for sales products
    async function applySalesFilters() {
      let filtered = [...allProducts];
      const selectedCategory = document.getElementById("salesFilterCategory").value;
      const selectedSubCategory = document.getElementById("salesFilterSubCategory").value;
      const salesSearch = document.getElementById("salesSearchInput").value.toLowerCase();

      if (selectedCategory) {
        filtered = filtered.filter(p => p.category === selectedCategory);
      }
      if (selectedSubCategory) {
        filtered = filtered.filter(p => p.sub_category === selectedSubCategory);
      }
      if (salesSearch) {
        filtered = filtered.filter(p =>
          p.name.toLowerCase().includes(salesSearch) ||
          (p.brand && p.brand.toLowerCase().includes(salesSearch)) ||
          (p.model_name && p.model_name.toLowerCase().includes(salesSearch))
        );
      }

      renderSalesProducts(filtered, currentSalesPage, itemsPerSalesPage);
    }



    await renderSalesProducts(allProducts, currentSalesPage, itemsPerSalesPage); // Initial render of all products

    const checkoutBtn = document.querySelector("#fixed-cart-ui #checkoutBtn");
    if (checkoutBtn) {
      // 🛒 Step 2C — Show Cart Overlay on button click
      checkoutBtn.addEventListener("click", () => {
        const cartOverlay = document.getElementById("cartOverlay");
        if (cartOverlay) {
          setOverlayVisible('cartOverlay', true);
          renderCartOverlay();
        } else {
          completeSaleAndPrint();
        }
      });
    }

    
  }

  // Define the event handlers inside renderView to avoid global pollution
  function handleCartKeydown(e) {
    // Only handle Enter key in cart overlay inputs
    if (e.key === "Enter" && e.target.matches("input") && e.target.closest("#cartOverlay")) {
      e.preventDefault();
      e.target.blur(); // Triggers onchange
    }
  }

  function handleCartInput(e) {
    // Only handle inputs within cart overlay
    const row = e.target.closest("tr[data-index]");
    if (!row || !e.target.closest("#cartOverlay")) return;

    const inputs = row.querySelectorAll("input[type='number']");
    const [rateInput, qtyInput, gstInput, discountInput] = [...inputs];

    const rate = parseFloat(rateInput?.value?.trim() || "0") || 0;
    const qty = parseFloat(qtyInput?.value?.trim() || "0") || 0;
    const gst = parseFloat(gstInput?.value?.trim() || "0") || 0;
    const discount = parseFloat(discountInput?.value?.trim() || "0") || 0;

    const gross = rate * qty; // MRP x Qty stays fixed
    const finalAmount = gross - discount; // Apply discount on MRP

    const baseAmount = +(finalAmount / (1 + gst / 100)).toFixed(2); // Inclusive tax math
    const taxAmount = +(finalAmount - baseAmount).toFixed(2);

    const amtCell = row.querySelector("td:last-child");
    if (amtCell) amtCell.textContent = `₹${finalAmount.toFixed(2)}`;

    const index = parseInt(row.dataset.index);
    if (!isNaN(index) && cart[index]) {
      cart[index].price = rate;
      cart[index].quantity = qty;
      cart[index].gst_percent = gst;
      cart[index].discount = discount;
    }
  }

if (viewName === "Settings") {
  // Show the CSV import section
  const csvImportSection = document.getElementById('csv-import-section');
  if (csvImportSection) {
    csvImportSection.classList.remove('hidden');
  }

  window.api.getStoreSettings().then(data => {
    if (!data) return;
    document.getElementById("storeNameInput").value = data.store_name || "";
    document.getElementById("storeSubtitleInput").value = data.store_subtitle || "";
    document.getElementById("storeAddressInput").value = data.store_address || "";
    document.getElementById("storePhoneInput").value = data.store_phone || "";
    document.getElementById("storeGstinInput").value = data.store_gstin || "";
    document.getElementById("storeFooterInput").value = data.store_footer || "";
  });

  const form = document.getElementById("store-profile-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const payload = {
      store_name: document.getElementById("storeNameInput").value.trim(),
      store_subtitle: document.getElementById("storeSubtitleInput").value.trim(),
      store_address: document.getElementById("storeAddressInput").value.trim(),
      store_phone: document.getElementById("storePhoneInput").value.trim(),
      store_gstin: document.getElementById("storeGstinInput").value.trim(),
      store_footer: document.getElementById("storeFooterInput").value.trim(),
    };

    if (!payload.store_name || !payload.store_address || !payload.store_phone) {
      showToast("⚠️ Store name, address, and phone are required.");
      return;
    }

    window.api.saveStoreSettings(payload)
      .then(() => {
        showToast("✅ Business profile saved!");
        window.api.getStoreSettings().then(data => {
          if (!data) return;
          document.getElementById("storeNameInput").value = data.store_name || "";
          document.getElementById("storeSubtitleInput").value = data.store_subtitle || "";
          document.getElementById("storeAddressInput").value = data.store_address || "";
          document.getElementById("storePhoneInput").value = data.store_phone || "";
          document.getElementById("storeGstinInput").value = data.store_gstin || "";
          document.getElementById("storeFooterInput").value = data.store_footer || "";
        });
      })
      .catch(() => showToast("❌ Failed to save. Try again."));
  });

  // --- START: Printer Settings Logic ---
  const printerSelect = document.getElementById('labelPrinterSelect');
  const refreshPrintersBtn = document.getElementById('refreshPrintersBtn');
  const savePrinterSettingsBtn = document.getElementById('savePrinterSettingsBtn');

  async function populatePrinterDropdown() {
    if (!printerSelect) return;
    
    showToast('Loading printers...');
    const savedSettings = await window.api.getStoreSettings();
    const printers = await window.api.getPrinters();
    
    const currentSelection = printerSelect.value;
    printerSelect.innerHTML = '<option value="">-- Select a Printer --</option>'; // Clear existing options

    if (printers && printers.length > 0) {
      printers.forEach(p => {
        const option = document.createElement('option');
        option.value = p.name;
        option.textContent = p.name;
        printerSelect.appendChild(option);
      });
      // Restore previous selection or saved setting
      printerSelect.value = currentSelection || savedSettings?.label_printer_name || "";
      showToast('✅ Printers loaded.', 'success');
    } else {
      showToast('No printers found.', 'error');
    }
  }

  if (refreshPrintersBtn) {
    refreshPrintersBtn.addEventListener('click', populatePrinterDropdown);
  }

  if (savePrinterSettingsBtn) {
    savePrinterSettingsBtn.addEventListener('click', async () => {
      const selectedPrinter = printerSelect.value;

      // To avoid overwriting other settings, we fetch them all first,
      // then update only the printer name before saving.
      const currentSettings = await window.api.getStoreSettings();
      const newSettings = {
        ...currentSettings,
        store_name: document.getElementById("storeNameInput").value.trim(),
        store_subtitle: document.getElementById("storeSubtitleInput").value.trim(),
        store_address: document.getElementById("storeAddressInput").value.trim(),
        store_phone: document.getElementById("storePhoneInput").value.trim(),
        store_gstin: document.getElementById("storeGstinInput").value.trim(),
        store_footer: document.getElementById("storeFooterInput").value.trim(),
        label_printer_name: selectedPrinter // Set the new printer name
      };

      const result = await window.api.saveStoreSettings(newSettings);
      if (result.success) {
        showToast('✅ Printer settings saved!', 'success');
      } else {
        showToast(`❌ ${result.message || 'Failed to save settings.'}`, 'error');
      }
    });
  }

  // Initial population of the dropdown when the view loads
  populatePrinterDropdown();
  // --- END: Printer Settings Logic ---

  const testPrintBtn = document.getElementById('testPrintBtn');
  if (testPrintBtn) {
    testPrintBtn.addEventListener('click', async () => {
      const printerName = document.getElementById('labelPrinterNameInput').value.trim();
      if (!printerName) {
        showToast('Please enter a printer name first.', 'error');
        return;
      }
      showToast(`Sending test print to ${printerName}...`);
      const result = await window.api.testPrintLabel(printerName);
      if (result.success) {
        showToast('✅ Test print sent successfully!', 'success');
      } else {
        showToast(`❌ ${result.message}`, 'error');
      }
    });
  }

  // CSV Import Logic
  const importBtn = document.getElementById('importCsvBtn');
  const csvInput = document.getElementById('csvUploadInput');
  const importResult = document.getElementById('importResult');

  if (importBtn && csvInput && importResult) {
    importBtn.addEventListener('click', () => {
      const file = csvInput.files[0];
      if (!file) {
        importResult.textContent = 'Please select a CSV file.';
        importResult.className = 'text-red-500';
        return;
      }

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const requiredFields = ['product_id', 'name', 'category', 'price_selling', 'tax_rate'];
          const headers = Object.keys(results.data[0]).map(h => h.trim());

          if (!requiredFields.every(field => headers.includes(field))) {
            importResult.textContent = `❌ Invalid CSV. Missing required headers: ${requiredFields.join(', ')}`;
            importResult.className = 'text-red-500';
            return;
          }

          try {
            const res = await window.api.importProductsCSV(results.data);
            if (res.success) {
              importResult.textContent = `✅ ${res.imported} products imported, ${res.skipped} skipped.`;
              importResult.className = 'text-green-600';
              csvInput.value = ''; // Clear the input
              setTimeout(() => { importResult.textContent = '' }, 5000);
            } else {
              importResult.textContent = `❌ Import failed: ${res.message}`;
              importResult.className = 'text-red-500';
            }
          } catch (error) {
            importResult.textContent = `❌ An error occurred: ${error.message}`;
            importResult.className = 'text-red-500';
          }
        },
        error: (error) => {
          importResult.textContent = `❌ CSV parsing error: ${error.message}`;
          importResult.className = 'text-red-500';
        }
      });
    });
  }

  const regenerateBarcodesBtn = document.getElementById('regenerateBarcodesBtn');
  if(regenerateBarcodesBtn) {
    regenerateBarcodesBtn.addEventListener('click', async () => {
      const confirmed = confirm("Are you sure you want to regenerate all barcodes? This cannot be undone.");
      if(confirmed) {
        const result = await window.api.regenerateBarcodes();
if(result.success) {
  showToast("✅ Barcodes regenerated successfully.");
  productCache = null;
  allProducts = await window.api.getProducts();

  // Refresh the Products table only if that tab is visible
  if (typeof window.renderProducts === 'function' && window.currentTab === 'Products') {
    window.renderProducts();
  }
} else {
  showToast("❌ Barcode regeneration failed.");
}
      }
    });
  }

  const testBarcodeBtn = document.getElementById('testBarcodeBtn');
  if(testBarcodeBtn) {
    testBarcodeBtn.addEventListener('click', async () => {
      const productId = parseInt(document.getElementById('testProductId').value, 10);
      if(isNaN(productId)) {
        showToast("❌ Please enter a valid product ID.");
        return;
      }
      const product = await window.api.getProductById(idNum);
      if(product) {
        console.log(`Product ${productId} barcode:`, product.barcode_value);
        showToast(`Product ${productId} barcode: ${product.barcode_value}`);
      } else {
        showToast("❌ Product not found.");
      }
    });
  }
}

  }
  

      

  async function renderSalesProducts(productsToRender = allProducts, page = 1, perPage = 50) {
    console.log("renderSalesProducts: productsToRender received:", productsToRender);
    if (!salesProductList) {
      console.error("salesProductList element not found!");
      return;
    }
    console.log("salesProductList element found:", salesProductList);
    salesProductList.innerHTML = ""; // Clear existing products

    const products = productsToRender.length > 0 ? productsToRender : allProducts;

    if (products.length === 0) {
      salesProductList.innerHTML = `<p class="text-gray-500 col-span-full text-center">No products available for sale.</p>`;
      console.log("No products to display.");
      return;
    }

    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedProducts = products.slice(startIndex, endIndex);

    console.time("DOM_rendering_sales");
    const fragment = document.createDocumentFragment();

    paginatedProducts.forEach(p => {
      const card = document.createElement("div");
      card.className = "bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden flex flex-col";
      const safeName = p.name.replace(/'/g, "\\'");
      card.innerHTML = `
        <div class="p-4 flex-grow">
          <h3 class="text-lg font-semibold text-gray-800 mb-1">${p.name}</h3>
          <p class="text-sm text-gray-600 mb-2">${p.category || 'N/A'} ${p.brand ? `• ${p.brand}` : ''}</p>
          <div class="flex justify-between items-baseline mb-2">
            <span class="text-xl font-bold text-primary">₹${p.price}</span>
            <span class="text-sm text-gray-500">Stock: <span class="${p.stock < 5 ? 'text-danger font-semibold' : 'text-success'}">${p.stock}</span></span>
          </div>
        </div>
        <button class="w-full py-2 text-white font-semibold btn-transition
                ${p.stock === 0 ? 'bg-secondary-light cursor-not-allowed' : 'bg-primary hover:bg-primary-dark'}"
                onclick="addToCart(${p.id}, '${safeName}', ${p.price})"
                ${p.stock === 0 ? 'disabled' : ''}>
          ${p.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
        </button>
      `;
      fragment.appendChild(card);
    });
    salesProductList.appendChild(fragment);
    console.timeEnd("DOM_rendering_sales");
    await updateCartUI();

    const totalPages = Math.ceil(products.length / perPage);
    renderSalesPaginationControls(totalPages, page);
  }

async function updateCartUI() {
  const cartList = document.querySelector("#fixed-cart-ui #cartList");
  const checkoutBtn = document.querySelector("#fixed-cart-ui #checkoutBtn");
  if (!cartList) return;

  if (cart.length === 0) {
    cartList.innerHTML = `<p class="text-gray-500">Cart is empty.</p>`;
    if (checkoutBtn) checkoutBtn.disabled = true;
    return;
  }

let subtotal = 0;
let totalGST = 0;

const itemsHTML = [...cart].reverse().map((item, index) => {
  const product = allProducts.find(p => p.id === item.id);
  if (!product) return "";

  const qty = item.quantity;
  const price = item.price;
  const gstRate = product.gst_percent || 0;

  const gross = price * qty;
  const baseAmount = +(gross / (1 + gstRate / 100)).toFixed(2);
  const gstAmount = +(gross - baseAmount).toFixed(2);
  const cgst = +(gstAmount / 2).toFixed(2);
  const sgst = +(gstAmount / 2).toFixed(2);

  subtotal += baseAmount;
  totalGST += gstAmount;

  const maxReached = qty >= (product?.stock || 0);

return `
  <div class="mb-4 border-b pb-3">
    <div class="grid grid-cols-12 items-start gap-1">
      <div class="col-span-1 text-left text-sm font-semibold leading-6">${index + 1}.</div>
      <div class="col-span-7">
        <div class="text-base font-semibold text-gray-800 leading-6">${item.name}</div>
        <div class="text-xs text-gray-600 mt-0.5">
          GST (${gstRate}%): ₹${gstAmount} 
          <span class="text-gray-400">(CGST ₹${cgst}, SGST ₹${sgst})</span><br>
          <span class="taxable-line hidden">Taxable: ₹${baseAmount.toFixed(2)}</span>
        </div>
      </div>
      <div class="col-span-2 text-center">
        <input type="number" min="1" max="${product.stock}" value="${qty}" 
          onchange="updateQty(${item.id}, this.value)" 
          class="w-16 text-center border border-gray-300 rounded px-2 py-1 text-sm font-medium" />
      </div>
      <div class="col-span-2 text-right text-base font-semibold">₹${gross.toFixed(2)}</div>
      <div class="col-span-12 flex justify-end gap-1 mt-1 pr-1">
        <button class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-2 py-1 rounded" onclick="increaseQty(${item.id})" ${maxReached ? 'disabled' : ''}>+</button>
        <button class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-2 py-1 rounded" onclick="decreaseQty(${item.id})">−</button>
        <button onclick="removeItem(${item.id})" class="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-2 py-1 rounded">×</button>
      </div>
    </div>
  </div>
`;
}).join("");

const totalHTML = `
  <div class="border-t pt-3 mt-3 text-right text-sm">
    <div>Subtotal: ₹${subtotal.toFixed(2)}</div>
    <div>GST Total: ₹${totalGST.toFixed(2)} (CGST + SGST)</div>
    <div class="text-lg font-bold mt-1">Grand Total: ₹${(subtotal + totalGST).toFixed(2)}</div>
  </div>
`;

cartList.innerHTML = itemsHTML + totalHTML;

// 👇 Ensure recently added item is always visible (scroll to top)
cartList.scrollTop = 0;

if (checkoutBtn) checkoutBtn.disabled = false;

// 👇 Adjust sales content scroll space to cart height
const cartHeight = document.getElementById("fixed-cart-ui")?.offsetHeight || 0;
const mainContent = document.getElementById("main-scrollable-content");
if (mainContent) {
  mainContent.style.paddingBottom = cartHeight + "px";
}
}
async function renderCartOverlay() {
  const invoiceInput = document.getElementById("customerInvoiceNo");
  if (invoiceInput) {
    invoiceInput.value = activeInvoiceNo || ""; // Use activeInvoiceNo
  }

  // ✅ DO NOT set invoiceInput.value again here

  const overlayBody = document.getElementById("cartOverlayBody");
  if (!overlayBody) return;

  overlayBody.innerHTML = [...cart].reverse().map((item, index) => {
    const product = allProducts.find(p => p.id === item.id) || {};
    const gst = item.gst_percent ?? product.gst_percent ?? 0;
    const discount = item.discount ?? 0;
    const qty = item.quantity ?? 1;
    const rate = item.price ?? 0;

    const totalMRP = rate * qty;
    const gstFraction = gst / (100 + gst);
    const gstAmount = totalMRP * gstFraction;
    const base = totalMRP - gstAmount;
    const discountedBase = base - discount;
    const finalAmount = discountedBase + gstAmount;

    return `
      <tr class="border-b" data-index="${cart.length - 1 - index}">
        <td class="p-1 text-sm text-center">${index + 1}</td>
        <td class="p-1 text-sm">${item.name}</td>
        <td class="p-1 text-sm">
          <input type="number" value="${rate}" min="0" class="edit-rate w-16 text-right border px-1 py-0.5 text-xs rounded"
            onchange="updateCartItem(${item.id}, 'price', this.value)" />
        </td>
        <td class="p-1 text-sm">
          <input type="number" value="${qty}" min="1" max="${product.stock}" class="edit-qty w-12 text-center border px-1 py-0.5 text-xs rounded"
            onchange="updateCartItem(${item.id}, 'quantity', this.value)" />
        </td>
        <td class="p-1 text-sm">
          <input type="number" value="${gst}" min="0" max="28" class="edit-gst w-12 text-center border px-1 py-0.5 text-xs rounded"
            onchange="updateCartItem(${item.id}, 'gst_percent', this.value)" />
        </td>
        <td class="p-1 text-sm">
          <input type="number" value="${discount}" min="0" class="edit-discount w-14 text-right border px-1 py-0.5 text-xs rounded"
            onchange="updateCartItem(${item.id}, 'discount', this.value)" />
        </td>
        <td class="p-1 text-sm text-right font-semibold amount-cell">
          ₹${finalAmount.toFixed(2)}
        </td>
      </tr>
    `;
  }).join("");

  // ✅ Call footer update here
  updateCartSummaryFooter();

  // Minimal function definition for post-print cleanup
  function doPostPrintCleanup(result) {
      console.log("Post print cleanup done.", result);

      try {
          // Store the current cart items as the last sale before clearing the cart
          // This is crucial for the invoice preview.
          lastSale = [...cart]; // Make a copy of the cart before clearing it.

          // 1. Clear the cart and update UI
          cart.length = 0; // Empty the cart array
          updateCartUI(); // Update the cart display

          // 2. Hide the cart overlay
          const cartOverlay = document.getElementById("cartOverlay");
          if (cartOverlay) {
              setOverlayVisible('cartOverlay', false);
          }

          // 3. Navigate back to Dashboard
          renderView('Dashboard');

          // 4. Show the invoice preview modal
          const invoiceModal = document.getElementById('invoice-modal');
          if (invoiceModal) {
              // Populate the invoice modal with the last sale data
              populateInvoiceModal(lastSale, activeInvoiceNo);
              setOverlayVisible('invoice-modal', true);
              invoiceModal.style.display = 'flex';
              invoiceModal.style.zIndex = '100';

              // 5. Allow the user to close the preview early with the Close button
              const closeInvoiceBtn = document.getElementById('close-invoice-btn');
              let autoCloseTimeout; // Declare here to be accessible by both close handler and setTimeout

              if (closeInvoiceBtn) {
                  // Ensure only one event listener is attached
                  const existingListener = closeInvoiceBtn.onclick;
                  if (existingListener && existingListener._isGeminiAdded) {
                      closeInvoiceBtn.removeEventListener('click', existingListener);
                  }
                  const newListener = () => {
                      setOverlayVisible('invoice-modal', false);
                      clearTimeout(autoCloseTimeout); // Clear auto-close timeout if closed manually
                  };
                  newListener._isGeminiAdded = true; // Mark the listener
                  closeInvoiceBtn.addEventListener('click', newListener);
              }

              // 6. Auto-close the invoice preview modal after 3 seconds
              autoCloseTimeout = setTimeout(() => {
                  if (invoiceModal && !invoiceModal.classList.contains('hidden')) {
                      setOverlayVisible('invoice-modal', false);
                  }
              }, 3000);
          }

      } catch (err) {
          console.error("Error during post-print cleanup:", err);
      }
  }

    async function completeSaleAndPrint(isQuotation = false) {
  console.log(`Renderer: Before print call. isQuotation: ${isQuotation}`);
  
  // First, save the sale and get the final invoice details
  const customerName = document.getElementById("custName")?.value || "";
  const customerPhone = document.getElementById("custPhone")?.value || "";
  const gstin = document.getElementById("custGSTIN")?.value?.trim() || null;
  const invoiceNo = document.getElementById("customerInvoiceNo")?.value || generateInvoiceNumber();
  const paymentMethod = document.getElementById("paymentMode")?.value?.trim() || "Cash";

  if (!isQuotation && (!invoiceNo || cart.length === 0)) {
    showToast(cart.length === 0 ? "🛒 Cart is empty." : "⚠️ Invoice number missing.");
    return;
  }

  const itemsWithAmount = cart.map(item => {
    const product = allProducts.find(p => p.id === item.id);
    const rate = item.price ?? 0;
    const qty = item.quantity ?? 1;
    const gst = item.gst_percent ?? product?.gst_percent ?? 0;
    const discount = item.discount ?? 0;
    const totalMRP = rate * qty;
    const gstFraction = gst / (100 + gst);
    const gstAmount = totalMRP * gstFraction;
    const base = totalMRP - gstAmount;
    const discountedBase = base - discount;
    const finalAmount = discountedBase + gstAmount;
    return { ...item, product_id: product?.product_id || null, final_amount: parseFloat(finalAmount.toFixed(2)), gst_percent: gst, discount: discount };
  });

  let result = null;
  if (!isQuotation) {
    const salePayload = {
      invoice_no: activeInvoiceNo,
      timestamp: new Date().toISOString(),
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_gstin: gstin,
      payment_method: paymentMethod,
      items: itemsWithAmount
    };

    result = await window.api.saveSale(salePayload);
    if (!result?.success) {
      showToast("❌ Failed to save sale.");
      return;
    }
  }
  
  // Now that sale is saved, gather data for printing
  const storeInfo = await window.api.getStoreSettings();
  const now = new Date();

  let totalAmount = 0;
  let totalGST = 0;
  let totalDiscount = 0;

  itemsWithAmount.forEach(item => {
    const product = allProducts.find(p => p.id === item.id) || {};
    const gstRate = item.gst_percent || product.gst_percent || 0;
    const qty = item.quantity || 1;
    const price = item.price || 0;
    const discount = item.discount || 0;

    const gross = price * qty;
    const baseAmount = gross / (1 + gstRate / 100);
    const gstAmount = gross - baseAmount;
    const finalAmount = gross - discount;

    totalAmount += finalAmount;
    totalGST += gstAmount;
    totalDiscount += discount;
  });

  const cgst = totalGST / 2;
  const sgst = totalGST / 2;
  const grandTotal = totalAmount;
  const payable = grandTotal;

  const invoiceMeta = {
    invoice_no: isQuotation ? null : result?.invoice_no,
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
    payment_method: isQuotation ? null : paymentMethod,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_gstin: gstin
  };

  const totals = {
    total_gst: totalGST,
    cgst: cgst,
    sgst: sgst,
    total_amount: grandTotal + totalDiscount, // This is the pre-discount total
    discount: totalDiscount,
    payable: payable
  };

  const invoiceData = {
    store: storeInfo,
    meta: invoiceMeta,
    items: itemsWithAmount,
    totals: totals,
    isQuotation: isQuotation
  };

  try {
    if (window.api && typeof window.api.printInvoice === "function") {
      await window.api.printInvoice(invoiceData);
    } else {
      console.error("printInvoice function is not available");
      showToast("❌ Printing service not available.");
    }
  } catch (err) {
    console.error("Printing failed:", err);
    showToast("🖨️ Print failed. Check printer connection.");
  } finally {
    // This now correctly runs after the print job is sent.
    if (!isQuotation) {
      doPostPrintCleanup(result);
    }
  }
}

  const confirmBtn = document.getElementById("cartCheckoutBtn");
  if (confirmBtn) {
	  confirmBtn.disabled = false; // 👈 this is what’s missing!
    confirmBtn.onclick = () => completeSaleAndPrint(false);
  }

  window.getCart = () => cart;
  window.populateInvoiceModal = populateInvoiceModal;
  window.completeSaleAndPrint = completeSaleAndPrint;
// ✅ Wire Preview Invoice button ONCE when overlay is rendered
const previewBtn = document.getElementById("previewInvoiceBtn");
if (previewBtn) {
  previewBtn.onclick = () => {
    try {
      if (cart.length === 0) {
        showToast("🛒 Cart is empty.");
        return;
      }
      populateInvoiceModal([...cart], activeInvoiceNo || Date.now());
      const invoiceModal = document.getElementById('invoice-modal');
      const cartOverlay = document.getElementById('cartOverlay');
      if (invoiceModal) {
        setOverlayVisible('invoice-modal', true);
        invoiceModal.style.display = 'flex';
        invoiceModal.style.zIndex = '2000';
        if (cartOverlay) {
            cartOverlay.style.pointerEvents = 'none';
        }
      }
    } catch (err) {
      console.error('Error rendering invoice preview:', err);
      showToast("❌ Error generating preview.");
    }
  };
}
  // Attach Global Discount Button (after overlay renders)
const globalDiscountBtn = document.getElementById("applyGlobalDiscountBtn");
const globalDiscountTypeEl = document.getElementById("globalDiscountType");
const globalDiscountValueEl = document.getElementById("globalDiscountValue");
const resetGlobalDiscountBtn = document.getElementById("resetGlobalDiscountBtn");

if (globalDiscountBtn) {
	if (globalDiscountValueEl) {
  globalDiscountValueEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      globalDiscountBtn.click(); // Trigger Apply button
    }
  });
}
  globalDiscountBtn.onclick = () => {
    const type = globalDiscountTypeEl?.value;
    const value = parseFloat(globalDiscountValueEl?.value);

    if (isNaN(value) || value < 0) {
      showToast("⚠️ Enter a valid overall discount.");
      return;
    }

    applyGlobalDiscount(type, value);
  };
}

if (resetGlobalDiscountBtn) {
  resetGlobalDiscountBtn.onclick = () => {
    cart.forEach(item => item.discount = 0);
    if (globalDiscountValueEl) globalDiscountValueEl.value = "";
    renderCartOverlay();
  };
}
}
function applyGlobalDiscount(type, value) {
  if (!cart.length) return;

  if (type === "percent") {
    cart.forEach(item => {
      const rate = item.price || 0;
      const qty = item.quantity || 1;
      const gross = rate * qty;

      item.discount = Math.round((gross * value) / 100);
    });
} else {
  const total = cart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
  let remaining = value;
  let totalAssigned = 0;

  const shares = cart.map(item => {
    const gross = (item.price || 0) * (item.quantity || 1);
    const share = Math.floor((gross / total) * value);
    totalAssigned += share;
    return share;
  });

  // Distribute leftover to the last item
  const leftover = value - totalAssigned;
  if (shares.length > 0) {
    shares[shares.length - 1] += leftover;
  }

  cart.forEach((item, i) => {
    item.discount = shares[i];
  });
}

  renderCartOverlay(); // ✅ triggers live update
}
function updateCartSummaryFooter() {
  const preTotal = cart.reduce((sum, item) => {
    const rate = item.price || 0;
    const qty = item.quantity || 1;
    return sum + (rate * qty);
  }, 0);

  const postTotal = cart.reduce((sum, item) => {
    const rate = item.price || 0;
    const qty = item.quantity || 1;
    const gst = parseFloat(item.gst_percent) || 0;
    const discount = item.discount || 0;

    const gross = rate * qty;
    const gstFraction = gst / (100 + gst);
    const gstAmount = gross * gstFraction;
    const base = gross - gstAmount;
    const discountedBase = base - discount;
    const finalAmount = discountedBase + gstAmount;

    return sum + finalAmount;
  }, 0);

  const totalDiscount = preTotal - postTotal;

  const totalGST = cart.reduce((sum, item) => {
    const rate = item.price || 0;
    const qty = item.quantity || 1;
    const gst = parseFloat(item.gst_percent) || 0;
    const gross = rate * qty;
    const gstFraction = gst / (100 + gst);
    const gstAmount = gross * gstFraction;
    return sum + gstAmount;
  }, 0);


  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

setText("footerTotalAmount", `₹${preTotal.toFixed(2)}`);
// Group GST by slab rate
const gstBreakdown = {};

cart.forEach(item => {
  const rate = item.price || 0;
  const qty = item.quantity || 1;
  const gst = parseFloat(item.gst_percent ?? 0);

  if (!gst || gst === 0) return; // 🛑 Skip non-GST items (0%)

  const gross = rate * qty;
  const gstFraction = gst / (100 + gst);
  const rawGST = gross * gstFraction;
  const rawCGST = rawGST / 2;
  const rawSGST = rawGST / 2;

  if (!gstBreakdown[gst]) {
    gstBreakdown[gst] = { cgst: 0, sgst: 0, total: 0 };
  }

  gstBreakdown[gst].cgst += rawCGST;
  gstBreakdown[gst].sgst += rawSGST;
  gstBreakdown[gst].total += rawGST;
});

// Format & display
const padLabel = (label) => label.padEnd(18, ' '); // ⬅️ align colon at same x-position

const gstLabelLines = Object.entries(gstBreakdown).map(([rate, data]) => {
  const r = parseFloat(rate);
  return [
    `${padLabel(`CGST (${r / 2}%)`)}: ₹${data.cgst.toFixed(2)}`,
    `${padLabel(`SGST (${r / 2}%)`)}: ₹${data.sgst.toFixed(2)}`,
    `${padLabel(`Total GST (${r}%)`)}: ₹${data.total.toFixed(2)}`
  ].join('\n');
});

setText("footerGSTLabel", gstLabelLines.join('\n').trim());
setText("footerTotalGST", `₹${totalGST.toFixed(2)}`);
setText("footerTotalDiscount", `− ₹${totalDiscount.toFixed(2)}`);
setText("footerPayable", `₹${postTotal.toFixed(2)}`);
}

window.increaseQty = async function (id) {
  const item = cart.find(p => p.id === id);
  const stockProduct = allProducts.find(p => p.id === id);
  if (!item || !stockProduct) return;
  if (item.quantity >= stockProduct.stock) {
    showToast("⚠️ Reached stock limit.");
    return;
  }
  item.quantity += 1;
  await updateCartUI();
  updateCartSummaryFooter();  // ✅ live recalc
};

window.decreaseQty = async function (id) {
  const index = cart.findIndex(p => p.id === id);
  if (index !== -1) {
    if (cart[index].quantity > 1) {
      cart[index].quantity -= 1;
    } else {
      cart.splice(index, 1);
    }
    await updateCartUI();
    updateCartSummaryFooter();  // ✅ live recalc
  }
};

window.updateQty = async function (id, newQty) {
  newQty = parseInt(newQty);
  const item = cart.find(p => p.id === id);
  const stockProduct = allProducts.find(p => p.id === id);
  if (!item || !stockProduct) return;

  if (isNaN(newQty) || newQty < 1) {
    showToast("⚠️ Quantity must be at least 1.");
    return;
  }

  if (newQty > stockProduct.stock) {
    showToast("⚠️ Exceeds stock limit.");
    return;
  }

  item.quantity = newQty;
  await updateCartUI();
  updateCartSummaryFooter();  // ✅ live recalc
};
window.removeItem = async function(id) {
  const index = cart.findIndex(p => p.id === id);
  if (index !== -1) {
    cart.splice(index, 1);
    await updateCartUI();
    updateCartSummaryFooter(); // ✅ live recalculation
  }
}
window.addToCart = async function (id, name, price) {
  // BUG FIX: Wrong quantity increment for different products
  // This now correctly checks if the product *ID* exists in the cart.
  const existing = cart.find(p => p.id === id);
  const product = allProducts.find(p => p.id === id);

  if (!product) {
    showToast("❌ Product not found.");
    return;
  }

  if (cart.length === 0 && activeInvoiceNo === null) {
    try {
      activeInvoiceNo = await window.api.getNextInvoiceNo();
      if (!activeInvoiceNo) {
        showToast("⚠️ Failed to generate invoice number. Try again.");
        return; // Prevent adding to cart if invoice number generation fails
      }
    } catch (err) {
      console.error("⚠️ Invoice number generation failed:", err);
      showToast("⚠️ Failed to generate invoice number. Try again.");
      return; // Prevent adding to cart if invoice number generation fails
    }
  }

  if (existing) {
    if (existing.quantity >= product.stock) {
      showToast("⚠️ Stock limit reached.");
      return;
    }
    existing.quantity += 1;
  } else {
    cart.push({ 
      id, 
      name, 
      price, 
      quantity: 1, 
      gst_percent: product.gst_percent || 0,
      discount: 0
    });
  }

  showToast(`🛒 ${name} added`);
  await updateCartUI();
  updateCartSummaryFooter();  // ✅ live recalc
};
window.updateCartItem = async function (id, field, value) {
  const item = cart.find(p => p.id === id);
  if (!item) return;

  let val = parseFloat(value);
  if (isNaN(val)) val = 0;

  switch (field) {
    case "price":
      item.price = val;
      break;
    case "quantity":
      item.quantity = Math.max(1, Math.floor(val));
      break;
    case "gst_percent":
      item.gst_percent = val;
      break;
    case "discount":
      item.discount = val;
      break;
  }

  await updateCartUI();
  renderCartOverlay(); // ✅ Will update summary footer too
};

  window.editProduct = function (id) {
    const product = allProducts.find(p => p.id === id);
    if (!product) {
      showToast("❌ Product not found.");
      return;
    }
    const modal = document.getElementById("productModal");
    const modalTitle = document.getElementById("modalTitle");
    const nameInput = document.getElementById("productName");
    const priceInput = document.getElementById("productPrice");
    const stockInput = document.getElementById("productStock");
    const categorySelect = document.getElementById("productCategory");
    const subCategoryInput = document.getElementById("productSubCategory");
    const brandInput = document.getElementById("productBrand");
    const modelNameInput = document.getElementById("productModelName");
    const unitInput = document.getElementById("productUnit");
    const hsnInput = document.getElementById("productHSN");
    const gstInput = document.getElementById("productGST");
    const barcodeValueInput = document.getElementById("productBarcodeValue");
    const productIdInput = document.getElementById("productProductId");

    editingProductId = id;
    nameInput.value = product.name;
    priceInput.value = product.price;
    stockInput.value = product.stock;
    hsnInput.value = product.hsn_code || "";
    gstInput.value = product.gst_percent ?? "";
    
    // Handle category selection properly
    if (product.category && categorySelect) {
      // Check if category exists in dropdown, if not add it
      const categoryExists = Array.from(categorySelect.options).some(option => option.value === product.category);
      if (!categoryExists && product.category) {
        categorySelect.innerHTML += `<option value="${product.category}">${product.category}</option>`;
      }
      categorySelect.value = product.category;
      // Trigger change event to populate HSN/GST and sub-category
      categorySelect.dispatchEvent(new Event('change'));
    }

    // Populate sub-category dropdown for editing
    if (product.category) {
      (async () => {
        await updateProductModalSubCategoryDropdown(product.category);
        subCategoryInput.value = product.sub_category || "";
      })();
    } else {
      subCategoryInput.innerHTML = `<option value="">Select Sub Category</option>`;
      subCategoryInput.disabled = true;
    }
    
    // Set other fields if they exist
    if (brandInput) brandInput.value = product.brand || "";
    if (modelNameInput) modelNameInput.value = product.model_name || "";
    if (unitInput) unitInput.value = product.unit || "";
    if (subCategoryInput) subCategoryInput.value = product.sub_category || "";
    if (barcodeValueInput) barcodeValueInput.value = product.barcode_value || "";
    if (productIdInput) productIdInput.value = product.product_id || "";
    
    modalTitle.textContent = "Edit Product";
    setOverlayVisible('productModal', true);
    nameInput.focus();
  };

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const tab = btn.innerText.trim().replace(' ', '');
    console.log("🧭 Switching to:", tab);
    await renderView(tab);
  });
});

  await renderView("Dashboard"); // Initial load

  window.showPrintLabelModal = async function(productId) {
  const idNum = Number.parseInt(productId, 10);
  if (!Number.isFinite(idNum)) {
    console.error('[PRINT] showPrintLabelModal invalid productId:', productId);
    showToast("❌ Can't open label dialog: invalid product id.", "error");
    return;
  }

  const modal = document.getElementById('printLabelModal');
  if (!modal) {
    console.error('[PRINT] printLabelModal element not found');
    showToast("❌ Print dialog missing in DOM.", "error");
    return;
  }

  const product = await window.api.getProductById(idNum);
  if (!product) {
    showToast("❌ Product not found.", "error");
    return;
  }

  // Save the numeric id on the modal dataset
  modal.dataset.productId = String(product.id);
  console.log(`[DEBUG PRINT] showPrintLabelModal setting productId: ${modal.dataset.productId}`);

  const storeSettings = await window.api.getStoreSettings();
  document.getElementById("label-store-name").textContent = storeSettings?.store_name || "";
  document.getElementById("label-product-name").textContent = product.name;
  document.getElementById("label-mrp").textContent = `MRP: ₹${product.price}`;
  document.getElementById("label-stock-ref").textContent = `(In Stock: ${product.stock})`;
  document.getElementById("label-quantity").value = 1;

  // Preview barcode in the modal
  const canvas = document.getElementById("label-barcode");
  try {
    bwipjs.toCanvas(canvas, {
      bcid: 'code128',
      text: product.barcode_value || product.product_id,
      scale: 2,
      height: 10,
      includetext: true,
      textxalign: 'center',
    });
  } catch (e) {
    console.error('Barcode generation failed:', e);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillText('Error generating barcode', 10, 20);
  }

  setOverlayVisible('printLabelModal', true);
};
async function printLabel(productId) {
  const idNum = Number.parseInt(productId, 10);
  if (!Number.isFinite(idNum)) { showToast('❌ Cannot print: invalid product id.', 'error'); return; }

    const quantity = parseInt(document.getElementById('label-quantity').value) || 1;
    const size = document.getElementById('label-size').value.split('x');
    const widthMm = parseInt(size[0]);
    const heightMm = parseInt(size[1]);

    // === BEGIN FIX: consistent effective height to prevent extra feed ===
    const SHRINK_MM = 2; // If still feeds, try 2.5; if content too tight, try 1
    const effectiveHeightMm = heightMm - SHRINK_MM;
    const pageWidthMicrons  = widthMm * 1000;
    const pageHeightMicrons = effectiveHeightMm * 1000;
    // === END FIX ===

    // === BEGIN: content offset (do not change anything above/below except where told) ===
    const CONTENT_TOP_OFFSET_MM = 2; // move the whole label content down by 2mm
    // === END: content offset ===

    const product = await window.api.getProductById(idNum);
    if (!product) {
        showToast('Cannot print label: Product not found.', 'error');
        return;
    }

    const storeSettings = await window.api.getStoreSettings();
    const barcodeValue = product.barcode_value || product.product_id;

    const canvas = document.createElement('canvas');
    try {
        // Generate barcode WITHOUT text. Text will be rendered manually in HTML.
        bwipjs.toCanvas(canvas, {
            bcid: 'code128',
            text: barcodeValue,
            scale: 3,      // Increased scale for sharpness
            height: 6,
            includetext: false, // IMPORTANT: Do not include text in the image
        });
    } catch (e) {
        console.error('Barcode generation failed:', e);
        showToast('❌ Error creating barcode.', 'error');
        return;
    }

    const barcodeBase64 = canvas.toDataURL('image/png');

    const labelHtml = `
      <html>
        <head>
          <style>
            @page { margin: 0; size: ${widthMm}mm ${effectiveHeightMm}mm; } /* exact canvas height */
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
              width: ${widthMm}mm;
              height: ${effectiveHeightMm}mm;
              box-sizing: border-box;
              overflow: hidden;

              /* ✅ Lock X, gently lift Y so first line shows, last line doesn't clip */
              position: relative;
              left: -7mm;     /* X locked (your sweet spot) */
              top:  -0.4mm;     /* subtle lift; avoids clipping store name */
              transform: none;
            }
            .label-container {
              padding-top: 0mm;  /* tiny cushion for the store name */
              box-sizing: border-box;
              text-align: center;
            }
            .store-name { 
              font-size: 7pt; 
              font-weight: bold; 
              line-height: 1; 
              margin: 0; 
            }
            .product-name {
              font-size: 6.5pt;
              line-height: 1;
              margin-top: 0.3mm;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              text-align: center;
              padding: 0 1.5mm;
              box-sizing: border-box;
              max-width: 100%;
              direction: ltr;
            }
            .barcode-img {
              width: 32mm;
              height: 5mm;
              margin-top: 0.2mm;   /* shave a bit to keep bottom tight */
              margin-left: 0mm;
            }
            .barcode-text { 
              font-size: 6pt; 
              line-height: 1; 
              margin: 0; 
            }
            .mrp { 
              font-size: 7pt; 
              font-weight: bold; 
              line-height: 1; 
              margin: 0; 
              margin-top: 0.2mm;   /* tighter stack so no bottom tail */
            }
          </style>
        </head>
        <body>
          <div class="label-container">
            <div class="store-name">${storeSettings?.store_name || 'My Store'}</div>
            <div class="product-name">${product.name}</div>
            <img class="barcode-img" src="${barcodeBase64}" />
            <div class="barcode-text">${barcodeValue}</div>
            <div class="mrp">MRP: ₹${product.price}</div>
          </div>
        </body>
      </html>
    `;

    for (let i = 0; i < quantity; i++) {
        const result = await window.api.printLabel({
            html: labelHtml,
            width: pageWidthMicrons,
            height: pageHeightMicrons,
        });

        if (result.success) {
            showToast(`✅ Label ${i + 1}/${quantity} sent to printer.`);
        } else {
            showToast(`❌ Print failed: ${result.message}`, 'error');
            break;
        }
    }
}
});


function applyGlobalDiscount(type, value) {
  if (!cart.length) return;

  if (type === "percent") {
    cart.forEach(item => {
      const rate = item.price || 0;
      const qty = item.quantity || 1;
      const gross = rate * qty;

      item.discount = Math.round((gross * value) / 100);
    });
  } else {
    const total = cart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
    const perItemShare = value / total;

    cart.forEach(item => {
      const gross = (item.price || 0) * (item.quantity || 1);
      item.discount = Math.floor(perItemShare * gross);
    });
  }

  renderCartOverlay();  // ✅ triggers live update
  // 🧾 Wire Preview Invoice button inside
}
// (removed legacy showToast to avoid shadowing the global toast)
// Ensure window.removeItem is defined and works
if (!window.removeItem) {
  window.removeItem = function(id) {
    const idx = cart.findIndex(p => p.id === id);
    if (idx !== -1) {
      cart.splice(idx, 1);
      updateCartUI();
      renderCartOverlay();
      updateCartSummaryFooter && updateCartSummaryFooter();
    }
  };
}

// Add missing deleteProduct function
if (!window.deleteProduct) {
  window.deleteProduct = async function(id) {
    if (confirm("Are you sure you want to delete this product?")) {
      try {
        const result = await window.api.deleteProduct(id);
        if (result.success) {
          showToast("🗑️ Product deleted!");
if (typeof window.renderProducts === 'function' && window.currentTab === 'Products') {
  window.renderProducts();
}
        } else {
          showToast("❌ Failed to delete product.");
        }
      } catch (error) {
        console.error("Delete product error:", error);
        showToast("❌ Error deleting product.");
      }
    }
  };
}

// Unified invoice population for both preview and checkout
async function populateInvoiceModal(items = [], invoiceNo = '0000') {
  const invoiceHeaderEl = document.getElementById('invoice-header');
  const invoiceMetaEl = document.getElementById('invoice-meta');
  const invoiceItemsEl = document.getElementById('invoice-items');
  const invoiceTotalEl = document.getElementById('invoice-total');

  const settings = await (window.api && window.api.getStoreSettings ? window.api.getStoreSettings() : Promise.resolve(null));

  if (invoiceHeaderEl && settings) {
    const storeName = settings.store_name || 'Your Store';
    const subtitle = settings.store_subtitle ? `<div class="text-sm">${settings.store_subtitle}</div>` : '';
    const addr = settings.store_address ? settings.store_address.split(',').map(s => s.trim()) : [];
    const addrTop = addr.slice(0, -1).join(', ');
    const addrLast = addr.length ? addr.slice(-1)[0] : '';
    const phoneLine = settings.store_phone ? `<div class="mt-1">📞 ${settings.store_phone}</div>` : '';
    const gstLine = settings.store_gstin ? `<div>GSTIN: ${settings.store_gstin}</div>` : '';

    invoiceHeaderEl.innerHTML = `
      <div class="text-center mb-1">
        <div class="text-lg font-bold">${storeName}</div>
        ${subtitle}
        <div class="border-t border-b my-1 py-0.5 text-sm font-semibold">TAX INVOICE</div>
      </div>
      <div class="text-xs leading-tight mt-1 text-left">
        ${addrTop ? `${addrTop}<br>` : ''}
        ${addrLast ? `${addrLast}<br>` : ''}
        ${phoneLine}
        <div class="border-t my-1"></div>
        ${gstLine}
      </div>
    `;
  } else if (invoiceHeaderEl) {
    invoiceHeaderEl.innerHTML = `<div class="text-lg font-bold">Your Store</div>`;
  }

  if (invoiceMetaEl) {
    const now = new Date();
    invoiceMetaEl.textContent = `INV${invoiceNo} | Date: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
  }

  const customerNameEl = document.getElementById('invoice-customer-name');
  const customerPhoneEl = document.getElementById('invoice-customer-phone');
  if (customerNameEl) {
    const nameVal = document.getElementById('customerName')?.value || '';
    customerNameEl.textContent = nameVal;
  }
  if (customerPhoneEl) {
    const phoneVal = document.getElementById('customerPhone')?.value || '';
    customerPhoneEl.textContent = phoneVal;
  }

  if (!invoiceItemsEl) return;

  invoiceItemsEl.innerHTML = '';

  let serial = 0;
  let grossBaseSum = 0;
  let totalGST = 0;
  let totalDiscount = 0;
  const rows = items.map(item => {
    serial++;
    const product = allProducts.find(p => p.id === item.id) || {};
    const rate = +(item.price || 0);
    const qty = +(item.quantity || 1);
    const gst = +((item.gst_percent !== undefined && item.gst_percent !== null) ? item.gst_percent : (product.gst_percent || 0));
    const discount = +(item.discount || 0);

    const totalMRP = rate * qty;
    const gstFraction = gst / (100 + gst);
    const gstAmount = +(totalMRP * gstFraction);
    const base = totalMRP - gstAmount;
    const discountedBase = base - discount;
    const finalAmount = +(discountedBase + gstAmount);

    grossBaseSum += base;
    totalGST += gstAmount;
    totalDiscount += discount;

    const rateFmt = `₹${rate.toFixed(2)}`;
    const gstPctFmt = `${gst}%`;
    const gstAmtFmt = `₹${gstAmount.toFixed(2)}`;
    const qtyFmt = `${qty}`;
    const discFmt = `₹${discount.toFixed(2)}`;
    const amountFmt = `₹${finalAmount.toFixed(2)}`;

    return `
      <div class="grid grid-cols-12 gap-2 border-b py-1">
        <div class="col-span-1 text-sm">${serial}</div>
        <div class="col-span-5 text-sm">${item.name}</div>
        <div class="col-span-1 text-right text-sm">${rateFmt}</div>
        <div class="col-span-1 text-right text-sm">${gstPctFmt}</div>
        <div class="col-span-1 text-right text-sm">${gstAmtFmt}</div>
        <div class="col-span-1 text-right text-sm">${qtyFmt}</div>
        <div class="col-span-1 text-right text-sm">${discFmt}</div>
        <div class="col-span-2 text-right text-sm">${amountFmt}</div>
      </div>
    `;
  


});

  const headerRow = `
    <div class="grid grid-cols-12 gap-2 font-semibold bg-gray-100 p-1 text-xs">
      <div class="col-span-1">S.No</div>
      <div class="col-span-5">Item</div>
      <div class="col-span-1 text-right">Rate</div>
      <div class="col-span-1 text-right">GST%</div>
      <div class="col-span-1 text-right">GST Amt</div>
      <div class="col-span-1 text-right">Qty</div>
      <div class="col-span-1 text-right">Disc.</div>
      <div class="col-span-2 text-right">Amount</div>
    </div>
  `;

  invoiceItemsEl.innerHTML = headerRow + rows.join('');

  const totalAmountBeforeDiscount = grossBaseSum + totalGST;
  const cgst = +(totalGST / 2);
  const sgst = +(totalGST / 2);
  const payable = +(totalAmountBeforeDiscount - totalDiscount);

  if (invoiceTotalEl) {
    invoiceTotalEl.innerHTML = `
      <div class="space-y-1 text-sm">
        <div class="flex justify-between"><span class="font-medium">Total GST:</span> <span>₹${totalGST.toFixed(2)}</span></div>
        <div class="flex justify-between"><span class="font-medium">CGST + SGST:</span> <span>₹${cgst.toFixed(2)} + ₹${sgst.toFixed(2)}</span></div>
        <div class="flex justify-between"><span class="font-medium">Total Amount:</span> <span>₹${totalAmountBeforeDiscount.toFixed(2)}</span></div>
        <div class="flex justify-between"><span class="font-medium">Discount:</span> <span>- ₹${totalDiscount.toFixed(2)}</span></div>
        <div class="flex justify-between font-bold text-xl"><span>Payable:</span> <span>₹${payable.toFixed(2)}</span></div>
      </div>
      <div class="mt-3 text-sm">Thank you! Visit again.</div>
    `;
  }

  await new Promise(resolve => requestAnimationFrame(resolve));
}


// --- Guard: ensure invoice modal is clickable when visible (auto-fix pointer-events) ---
(function(){
  try {
    var m = document.getElementById('invoice-modal');
    if (!m) return;
    function shown(el){
      return !el.classList.contains('hidden') || (el.style && el.style.display && el.style.display !== 'none');
    }
    function sync(){
      var vis = shown(m);
      m.style.pointerEvents = vis ? 'auto' : 'none';
      if (vis) m.style.zIndex = '2147483640';
    }
    // initial + react to class/style changes
    sync();
    new MutationObserver(sync).observe(m, { attributes: true, attributeFilter: ['class','style'] });
  } catch (e) { console.warn('invoice-modal guard error:', e); }
})();
