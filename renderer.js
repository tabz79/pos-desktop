<<<<<<< Updated upstream
=======

// --- START: NEW BARCODE SCANNER IMPLEMENTATION ---
document.addEventListener("DOMContentLoaded", () => {
  const SCANNER_TIMEOUT = 50; // ms between keystrokes
  let barcodeBuffer = '';
  let lastKeyTime = 0;

  window.addEventListener('keydown', (e) => {
// --- BEGIN SAFE TYPING GUARD (production) ---
const t = e.target;
if (
  (t && (t.isContentEditable ||
         t.tagName === 'INPUT' ||
         t.tagName === 'TEXTAREA' ||
         t.tagName === 'SELECT')) ||
  (document.activeElement &&
   (document.activeElement.isContentEditable ||
    ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)))
) {
  return; // allow normal typing inside real form controls
}
// --- END SAFE TYPING GUARD ---
    // 1. Only run logic if we are on the Sales tab.
    // We check this via a DOM element unique to the sales view.
    const salesViewActive = !!document.getElementById('salesProductList');
    if (!salesViewActive) {
      barcodeBuffer = ''; // Reset buffer when not on sales tab
      return;
    }

    // 2. Prevent default browser action for scanner-like keys.
    // This is the core of the fix. It stops the browser from interpreting
    // the scan as navigation or button clicks.
    if (e.key === 'Enter' || e.key.length === 1) {
      e.preventDefault();
      e.stopPropagation();
    }

    const now = Date.now();
    // Reset buffer if keys are typed too slowly
    if (now - lastKeyTime > SCANNER_TIMEOUT) {
      barcodeBuffer = '';
    }

    if (e.key === 'Enter') {
      if (barcodeBuffer.length > 0) {
        console.log(`[SCAN] Detected barcode: ${barcodeBuffer}`);
        // Use the 'send' method exposed on the context bridge to talk to main.js
        window.postMessage({ type: 'ipc-send', channel: 'barcode-scan-request', args: [barcodeBuffer] });
      }
      barcodeBuffer = ''; // Clear buffer after Enter
    } else if (e.key.length === 1) {
      // It's a character key, add it to the buffer.
      barcodeBuffer += e.key;
    }
    
    lastKeyTime = now;
  }, true); // Use CAPTURE phase to get the event before other listeners.
});

// New listener for the response from main process
window.addEventListener('message', (event) => {
  if (event.source === window && event.data.type === 'ipc-reply' && event.data.channel === 'barcode-scan-response') {
    const product = event.data.args[0];
    if (product) {
      console.log('[SCAN] Received product:', product.name);
      // This addToCart function is defined later in this file.
      // It correctly handles adding a new item or incrementing quantity.
      addToCart(product.id, product.name, product.price);
      showToast(`✅ Added ${product.name} from scan`);
    } else {
      console.log('[SCAN] Product not found for scanned barcode.');
      showToast('❌ Product not found by scan.');
    }
  }
});
// --- END: NEW BARCODE SCANNER IMPLEMENTATION ---

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


>>>>>>> Stashed changes
// ✅ POS Renderer Script with Live Stock Update, Quantity Control, Print Layout, and Business Profile Support

document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");
  let editingProductId = null;
  let allProducts = [];
  const cart = [];
  let lastSale = [];
  let salesProductList = null;

  const views = {
    Products: `
      <div>
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">Product List</h2>
          <div class="flex gap-2">
            <input type="text" id="searchInput" placeholder="Search..." class="border rounded px-2 py-1" />
            <button id="addProductBtn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
              + Add Product
            </button>
          </div>
        </div>

        <table class="w-full bg-white shadow rounded mb-4">
          <thead>
            <tr class="bg-gray-200 text-left">
              <th class="p-2">Name</th>
              <th class="p-2">Price</th>
              <th class="p-2">Stock</th>
              <th class="p-2">Actions</th>
            </tr>
          </thead>
          <tbody id="productTable"></tbody>
        </table>

        <div id="productModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden z-50">
          <div class="bg-white p-6 rounded shadow w-96">
            <h2 class="text-lg font-semibold mb-4" id="modalTitle">Add Product</h2>
            <input type="text" id="productName" placeholder="Name" class="w-full mb-2 p-2 border rounded" />
            <input type="number" id="productPrice" placeholder="Price" class="w-full mb-2 p-2 border rounded" />
            <input type="number" id="productStock" placeholder="Stock" class="w-full mb-4 p-2 border rounded" />
			<select id="productCategory" class="w-full mb-4 p-2 border rounded">
  <option value="">Select Category</option>
</select>
			<input type="text" id="productHSN" placeholder="HSN Code (optional)" class="w-full mb-4 p-2 border rounded" />
			<input type="number" id="productGST" placeholder="GST % (optional)" class="w-full mb-4 p-2 border rounded" />
            <div class="flex justify-end space-x-2">
              <button id="cancelModalBtn" class="px-4 py-2 bg-gray-300 rounded">Cancel</button>
              <button id="saveProductBtn" class="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
            </div>
          </div>
        </div>
      </div>
    `,
    Sales: `
      <div>
        <h2 class="text-xl font-bold mb-4">Sales</h2>
        <div id="salesProductList" class="grid grid-cols-2 gap-4 mb-6"></div>
        <div>
          <h3 class="text-lg font-semibold mb-2">🧾 Cart</h3>
          <div id="cartList" class="bg-white p-4 rounded shadow border mb-4">
            <p class="text-gray-500">Cart is empty.</p>
          </div>
          <button id="checkoutBtn" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded disabled:opacity-50" disabled>
            ✅ Checkout & Save Sale
          </button>
        </div>
      </div>
    `,
    Reports: `
      <div>
        <h2 class="text-xl font-bold mb-2">Reports</h2>
        <p class="text-gray-700">Monthly report goes here...</p>
      </div>
    `,
    Settings: `
      <div class="p-4 bg-white rounded shadow w-full">
        <h2 class="text-xl font-bold mb-4">Business Profile</h2>
        <form id="store-profile-form" class="space-y-4">
          <div>
            <label class="block text-sm font-medium">Store Name</label>
            <input type="text" id="storeNameInput" class="w-full border px-3 py-2 rounded" required />
          </div>
          <div>
            <label class="block text-sm font-medium">Subtitle / Tagline</label>
            <input type="text" id="storeSubtitleInput" class="w-full border px-3 py-2 rounded" />
          </div>
          <div>
            <label class="block text-sm font-medium">Full Address</label>
            <textarea id="storeAddressInput" class="w-full border px-3 py-2 rounded" required></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium">Phone Number</label>
            <input type="text" id="storePhoneInput" class="w-full border px-3 py-2 rounded" required />
          </div>
          <div>
            <label class="block text-sm font-medium">GSTIN (optional)</label>
            <input type="text" id="storeGstinInput" class="w-full border px-3 py-2 rounded" />
          </div>
          <div>
            <label class="block text-sm font-medium">Footer Note (optional)</label>
            <textarea id="storeFooterInput" class="w-full border px-3 py-2 rounded"></textarea>
          </div>
          <button type="submit" id="saveSettingsBtn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
            💾 Save Profile
          </button>
        </form>
      </div>
    `
  };

function setupProductView() {
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

  async function renderProducts() {
    allProducts = await window.api.getProducts();
    displayFilteredProducts(allProducts);
  }

  function displayFilteredProducts(products) {
    productTable.innerHTML = products.map(p => `
      <tr>
        <td class="p-2">${p.name}</td>
        <td class="p-2">₹${p.price}</td>
        <td class="p-2">${p.stock}</td>
        <td class="p-2 space-x-2">
          <button class="text-blue-600" onclick="editProduct(
  ${p.id},
  '${p.name.replace(/'/g, "\\'")}',
  ${p.price},
  ${p.stock},
  '${p.hsn_code || ""}',
  '${p.category || ""}',
  ${p.gst_percent ?? 'null'}
)">✏️</button>
          <button class="text-red-600" onclick="deleteProduct(${p.id})">🗑️</button>
        </td>
      </tr>
    `).join("");
  }

  renderProducts();

  searchInput.addEventListener("input", () => {
    const term = searchInput.value.trim().toLowerCase();
    const filtered = allProducts.filter(p => p.name.toLowerCase().includes(term));
    displayFilteredProducts(filtered);
  });

  const categorySelect = document.getElementById("productCategory");
  const hsnInput = document.getElementById("productHSN");
  const gstInput = document.getElementById("productGST");

  if (categorySelect && hsnInput && gstInput) {
    categorySelect.addEventListener("change", () => {
      const selectedCategory = categorySelect.value;
      const mapping = categoryHSNMap[selectedCategory];
      if (mapping) {
        hsnInput.value = mapping.hsn || "";
        gstInput.value = mapping.gst || "";
      }
    });
  }

  addBtn.addEventListener("click", () => {
    editingProductId = null;
    nameInput.value = "";
    priceInput.value = "";
    stockInput.value = "";
    modalTitle.textContent = "Add Product";
    modal.classList.remove("hidden");
  });

  cancelBtn.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

saveBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  const price = parseFloat(priceInput.value);
  const stock = parseInt(stockInput.value);
  const hsn = hsnInput.value.trim();
  const gst = parseFloat(gstInput.value);

  if (!name || isNaN(price) || isNaN(stock)) {
    showToast("⚠️ Please fill all fields correctly.");
    return;
  }

  const payload = {
    name,
    price,
    stock,
    hsn_code: hsn || null,
    gst_percent: isNaN(gst) ? null : gst
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
    modal.classList.add("hidden");
    renderProducts();
  } else {
    showToast("❌ Failed to save product.");
  }
});
}

function renderView(viewName) {
  app.innerHTML = views[viewName] || `<p>Unknown view: ${viewName}</p>`;

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.remove("bg-gray-300", "font-semibold");
    if (btn.innerText.trim() === viewName) {
      btn.classList.add("bg-gray-300", "font-semibold");
    }
  });

  if (viewName === "Products") {
    setupProductView();
  }

  if (viewName === "Sales") {
    salesProductList = document.getElementById("salesProductList");
    renderSalesProducts();

    const checkoutBtn = document.getElementById("checkoutBtn");
    if (checkoutBtn) {
      checkoutBtn.addEventListener("click", async () => {
        if (!Array.isArray(cart) || cart.length === 0) {
          showToast("⚠️ Cart is empty.");
          return;
        }

        const isCartValid = cart.every(item =>
          item.id && item.name && typeof item.price === "number" && item.quantity > 0
        );

        if (!isCartValid) {
          showToast("❌ Invalid cart data. Please refresh.");
          return;
        }

// 🔄 Enrich cart with HSN & GST info before sending and showing invoice
const enrichedCart = cart.map(item => {
  const product = allProducts.find(p => p.id === item.id) || {};
  return {
    ...item,
    hsn_code: product.hsn_code || null,
    gst_percent: product.gst_percent || 0
  };
});

lastSale = enrichedCart;
const result = await window.api.saveSale(enrichedCart);

if (result.success) {
  showToast("✅ Sale recorded and cart cleared!");
  cart.length = 0;
  updateCartUI();
  await renderSalesProducts();
  showInvoice(lastSale); // ✅ Now uses enriched cart
} else {
          showToast(`❌ Failed to save sale: ${result.message || "Please try again."}`);
        }
      });
    }
  }

if (viewName === "Settings") {
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
      .then(() => showToast("✅ Business profile saved!"))
      .catch(() => showToast("❌ Failed to save. Try again."));
  });
}

  }
  

  async function renderSalesProducts() {
    allProducts = await window.api.getProducts();
    if (!salesProductList) return;
    salesProductList.innerHTML = "";

    if (allProducts.length === 0) {
      salesProductList.innerHTML = `<p class="text-gray-500 col-span-2">No products available for sale.</p>`;
      return;
    }

    allProducts.forEach(p => {
      const card = document.createElement("div");
      card.className = "border rounded shadow p-4 flex flex-col justify-between";
      const safeName = p.name.replace(/'/g, "\\'");
      card.innerHTML = `
        <div>
          <h3 class="text-lg font-semibold">${p.name}</h3>
          <p class="text-gray-700">₹${p.price}</p>
          <p class="text-sm ${p.stock < 5 ? 'text-red-600' : 'text-gray-500'}">${p.stock} in stock</p>
        </div>
        <button class="mt-4 ${p.stock === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'} text-white px-3 py-1 rounded w-full"
                onclick="addToCart(${p.id}, '${safeName}', ${p.price})"
                ${p.stock === 0 ? 'disabled' : ''}>
          ${p.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
        </button>
      `;
      salesProductList.appendChild(card);
    });
    updateCartUI();
  }

function updateCartUI() {
  const cartList = document.getElementById("cartList");
  const checkoutBtn = document.getElementById("checkoutBtn");
  if (!cartList) return;

  if (cart.length === 0) {
    cartList.innerHTML = `<p class="text-gray-500">Cart is empty.</p>`;
    if (checkoutBtn) checkoutBtn.disabled = true;
    return;
  }

let subtotal = 0;
let totalGST = 0;

const itemsHTML = cart.map((item, index) => {
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
  if (checkoutBtn) checkoutBtn.disabled = false;
}

  window.increaseQty = function (id) {
  const item = cart.find(p => p.id === id);
  const stockProduct = allProducts.find(p => p.id === id);
  if (!item || !stockProduct) return;
  if (item.quantity >= stockProduct.stock) {
    showToast("⚠️ Reached stock limit.");
    return;
  }
  item.quantity += 1;
  updateCartUI();
};

window.decreaseQty = function (id) {
  const index = cart.findIndex(p => p.id === id);
  if (index !== -1) {
    if (cart[index].quantity > 1) {
      cart[index].quantity -= 1;
    } else {
      cart.splice(index, 1);
    }
    updateCartUI();
  }
};

window.removeItem = function (id) {
  const index = cart.findIndex(p => p.id === id);
  if (index !== -1) {
    const removed = cart.splice(index, 1);
    showToast(`❌ Removed ${removed[0].name}`);
    updateCartUI();
  }
};

window.updateQty = function (id, newQty) {
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
  updateCartUI();
};

window.addToCart = function (id, name, price) {
  const existing = cart.find(p => p.id === id);
  if (existing) {
    const stockProduct = allProducts.find(p => p.id === id);
    if (existing.quantity >= stockProduct.stock) {
      showToast("⚠️ Stock limit reached.");
      return;
    }
    existing.quantity += 1;
  } else {
    cart.push({ id, name, price, quantity: 1 });
  }
  showToast(`🛒 ${name} added`);
  updateCartUI();
};

  window.editProduct = function (id, name, price, stock, hsn_code, category, gst_percent) {
    const modal = document.getElementById("productModal");
    const modalTitle = document.getElementById("modalTitle");
    const nameInput = document.getElementById("productName");
    const priceInput = document.getElementById("productPrice");
    const stockInput = document.getElementById("productStock");

    editingProductId = id;
    nameInput.value = name;
    priceInput.value = price;
    stockInput.value = stock;
	document.getElementById("productHSN").value = hsn_code || "";
document.getElementById("productCategory").value = category || "";
document.getElementById("productGST").value = gst_percent ?? "";
    modalTitle.textContent = "Edit Product";
    modal.classList.remove("hidden");
    nameInput.focus();
  };

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.innerText.trim();
    console.log("🧭 Switching to:", tab);
    renderView(tab);
  });
});

renderView("Products"); // Initial load
});

// 🧾 Invoice print layout support
document.getElementById("close-invoice-btn").addEventListener("click", () => {
  document.getElementById("invoice-modal").classList.add("hidden");
});
function showInvoice(items) {
  renderInvoice(items);
  const modal = document.getElementById("invoice-modal");
  if (modal) {
    modal.classList.remove("hidden");
  } else {
    console.warn("❗ Invoice modal not found in DOM.");
  }
}
async function renderInvoice(items) {
  const invoiceItemsDiv = document.getElementById("invoice-items");
  const invoiceTotalP = document.getElementById("invoice-total");
  const invoiceMeta = document.getElementById("invoice-meta");
  const printMode = document.getElementById("print-mode")?.value || "thermal";
  document.body.classList.remove("print-thermal", "print-a4");
  document.body.classList.add(`print-${printMode}`);

  invoiceItemsDiv.innerHTML = "";
  const invoiceHeader = document.getElementById("invoice-header");
const settings = await window.api.getStoreSettings();
if (invoiceHeader && settings) {
invoiceHeader.innerHTML = `
  <div class="text-center mb-1">
    <div class="text-lg font-bold">${settings.store_name || "Your Store"}</div>
    ${settings.store_subtitle ? `<div class="text-sm">${settings.store_subtitle}</div>` : ""}
    <div class="border-t border-b my-1 py-0.5 text-sm font-semibold">TAX INVOICE</div>
  </div>

  <div class="text-xs leading-tight mt-1 text-left">
    ${settings.store_address ? settings.store_address.split(",").slice(0, -1).join(",") : ""}<br>
    ${settings.store_address ? settings.store_address.split(",").slice(-1)[0] : ""}
    ${settings.store_phone ? `<div class="mt-1">📞 ${settings.store_phone}</div>` : ""}
    <div class="border-t my-1"></div>

${settings.store_gstin ? `
  <div>
    <div>GSTIN: ${settings.store_gstin}</div>
  </div>
` : ""}
  </div>
`;
}
  let subtotal = 0;
  let totalGST = 0;

  const hsnSummary = {};
  const showTaxable = localStorage.getItem("showTaxable") === "true"; // Will later come from settings

let tableHTML = `
  <table class="w-full text-xs border-collapse">
    <thead>
      <tr class="border-b border-dotted border-gray-400 text-left">
        <th class="p-1 font-normal">S.No</th>
        <th class="p-1 font-normal">Item</th>
        ${showTaxable ? `<th class="p-1 font-normal text-right">GST%</th>` : ""}
        <th class="p-1 font-normal text-right">Rate</th>
        <th class="p-1 font-normal text-right">Qty</th>
        <th class="p-1 font-normal text-right">Disc.</th>
        <th class="p-1 font-normal text-right">Amount</th>
      </tr>
    </thead>
    <tbody>
`;

items.forEach((item, index) => {
  const qty = item.quantity;
  const price = item.price;
  const gstRate = item.gst_percent ?? 0;
  const hsn = item.hsn_code || "N/A";
  const discount = item.discount ?? 0;

  const gross = price * qty;
  const finalAmount = +(gross - discount).toFixed(2);
  const baseAmount = +(finalAmount / (1 + gstRate / 100)).toFixed(2);
  const gstAmount = +(finalAmount - baseAmount).toFixed(2);
  const cgst = +(gstAmount / 2).toFixed(2);
  const sgst = +(gstAmount / 2).toFixed(2);

  subtotal += baseAmount;
  totalGST += gstAmount;

  if (!hsnSummary[hsn]) {
    hsnSummary[hsn] = { taxable: 0, gst: 0, rate: gstRate };
  }
  hsnSummary[hsn].taxable += baseAmount;
  hsnSummary[hsn].gst += gstAmount;

  tableHTML += `
    <tr class="border-b border-dotted border-gray-300">
      <td class="p-1">${index + 1}</td>
      <td class="p-1">${item.name}</td>
      ${showTaxable ? `<td class="p-1 text-right">${gstRate}%</td>` : ""}
      <td class="p-1 text-right">₹${price.toFixed(2)}</td>
      <td class="p-1 text-right">${qty}</td>
      <td class="p-1 text-right">₹${discount.toFixed(2)}</td>
      <td class="p-1 text-right">₹${finalAmount.toFixed(2)}</td>
    </tr>
  `;
});

tableHTML += `</tbody></table>`;
invoiceItemsDiv.innerHTML = tableHTML;
  const grandTotal = subtotal + totalGST;
  invoiceTotalP.innerHTML = `
    <div class="text-sm mt-3 border-t pt-2 text-right">
      <div>Subtotal: ₹${subtotal.toFixed(2)}</div>
      <div>GST Total: ₹${totalGST.toFixed(2)} (CGST + SGST)</div>
      <div class="text-lg font-bold mt-1">Total: ₹${grandTotal.toFixed(2)}</div>
    </div>
  `;

const now = new Date();
const date = now.toLocaleString("en-IN", {
  dateStyle: "short",
  timeStyle: "short"
});

const saleId = Math.floor(100000 + Math.random() * 900000);

invoiceMeta.innerHTML = `
  <div class="text-xs flex justify-between">
    <div class="text-left">
      Customer: ${settings.customer_name || "—"}<br>
      Phone: ${settings.customer_phone || "—"}
    </div>
    <div class="text-right text-nowrap">
      Invoice No: ${saleId}<br>
      ${date}
    </div>
  </div>
  <div class="border-t my-1"></div>
`;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2000);
}
