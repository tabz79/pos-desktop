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
function generateProductDetails({ category = '', name = '', brand = '', model_name = '' }) {
  // 1. Category part: First 3 letters, padded with 'X' if less than 3.
  const categoryPart = (category || '').substring(0, 3).padEnd(3, 'X').toUpperCase();

  // 2. Name part: First letter of up to 6 words, padded to 6 with '0'.
  const namePart = (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 6).map(word => word.charAt(0)).join('').padEnd(6, '0').toUpperCase();

  // 3. Brand part: Initials of first 2 words, or first 2 letters of a single word.
  const brandWords = (brand || '').trim().split(/\s+/).filter(Boolean);
  let brandPart = '';
  if (brandWords.length > 1) {
    brandPart = brandWords.slice(0, 2).map(word => word.charAt(0)).join('');
  } else if (brandWords.length === 1) {
    brandPart = brandWords[0].substring(0, 2);
  }
  brandPart = brandPart.padEnd(2, '0').toUpperCase();

  // 4. Model part: Prefix before the first '-'.
  const modelPart = ((model_name || '').trim().split('-')[0] || '').toUpperCase();

  const finalId = `${categoryPart}${namePart}${brandPart}${modelPart}`;

  return {
    product_id: finalId,
    barcode_value: finalId,
  };
}

/**
 * Parses the price from a model name suffix (e.g., "a1-2k" -> 2000).
 * @param {string} model_name - The model name string.
 * @returns {number | null} The parsed price or null if invalid.
 */
function parsePriceFromModel(model_name = '') {
  try {
    const suffix = (model_name || '').split('-')[1];
    if (!suffix) return null;

    const multiplierChar = suffix.slice(-1).toLowerCase();
    const numericPart = parseFloat(suffix.slice(0, -1));

    if (isNaN(numericPart)) return null;

    const multipliers = { k: 1000, h: 100, t: 10 };
    const multiplier = multipliers[multiplierChar];

    if (multiplier) {
      return numericPart * multiplier;
    }
    return null;
  } catch (error) {
    return null;
  }
}


// ✅ POS Renderer Script with Live Stock Update, Quantity Control, Print Layout, and Business Profile Support

document.addEventListener("DOMContentLoaded", async () => {
  const app = document.getElementById("app");
  let editingProductId = null;
  let allProducts = [];
  const cart = [];
  let activeInvoiceNo = null; // New variable to store the generated invoice number
  let lastSale = [];
  let salesProductList = null;

  const views = {
    Dashboard: `
      <div>
        <h2 class="text-2xl font-bold mb-6">Dashboard</h2>
        
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
      <div>
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">Product List</h2>
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

        <div id="productModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden z-50">
          <div class="bg-white p-6 rounded shadow-lg w-full max-w-md mx-auto">
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
      </div>
    `,
    Sales: `
      <div>
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">Sales</h2>
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
      </div>
    `,
    InvoiceHistory: `
      <div>
        <h2 class="text-2xl font-bold mb-6">Invoice History</h2>
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
      <div class="p-4 bg-white rounded shadow w-full">
        <h2 class="text-xl font-bold mb-4">Business Profile</h2>
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
      </div>
    `
  };

async function setupDashboardView() {
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

  async function fetchAndRenderInvoices() {
    const options = {
      page: currentPage,
      limit,
      startDate: startDateInput.value,
      endDate: endDateInput.value,
      searchQuery: searchInput.value
    };
    const { data, total } = await window.api.getInvoices(options);

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
  const invoice = await window.api.getInvoiceDetails(id);
  if (invoice) {
    showInvoice(invoice.items);
  }
}

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
    displayFilteredProducts(filtered);
  }

  // Initial population for Products tab
  async function renderProducts() {
    allProducts = await window.api.getProducts();
    populateCategoryDropdown(allProducts, document.getElementById("filterCategory"));
    await updateProductFilterSubCategoryDropdown(document.getElementById("filterCategory").value);
    applyProductFilters();
  }

  function displayFilteredProducts(products) {
    const productTable = document.getElementById("productTable");
    productTable.innerHTML = products.map(p => `
      <tr>
        <td class="p-2">${p.name}</td>
        <td class="p-2">${p.category || ''}</td>
        <td class="p-2">${p.sub_category || ''}</td>
        <td class="p-2">${p.brand || ''}</td>
        <td class="p-2">${p.model_name || ''}</td>
        <td class="p-2">${p.unit || ''}</td>
        <td class="p-2">₹${p.price}</td>
        <td class="p-2">${p.stock}</td>
        <td class="p-2 space-x-2">
          <button class="text-blue-600" onclick="editProduct(${p.id}, '${p.name.replace(/'/g, "'")}', ${p.price}, ${p.stock}, '${p.hsn_code || ""}', '${p.category || ""}', ${p.gst_percent ?? 'null'})">✏️</button>
          <button class="text-red-600" onclick="deleteProduct(${p.id})">🗑️</button>
        </td>
      </tr>
    `).join("");
  }
  window.deleteProduct = async function(id) {
  const confirmed = confirm("Are you sure you want to delete?");
  if (!confirmed) return;

  const result = await window.api.deleteProduct(id);
  if (result.success) {
    showToast("🗑️ Product deleted");
    renderProducts(); // ✅ This is the fix: force live refresh
  } else {
    showToast("❌ Delete failed");
  }
}

  renderProducts();

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

  // --- Auto-generation logic ---
  function updateGeneratedFields() {
    // 1. Generate Product ID and Barcode
    const details = generateProductDetails({
      category: categorySelect.value,
      name: nameInput.value,
      brand: brandInput.value,
      model_name: modelNameInput.value,
    });
    productIdInput.value = details.product_id;
    barcodeValueInput.value = details.barcode_value;

    // 2. Parse Price from Model Name
    const parsedPrice = parsePriceFromModel(modelNameInput.value);
    if (parsedPrice !== null) {
      priceInput.value = parsedPrice;
    }
  }

  // Attach event listeners to trigger the auto-generation
  nameInput.addEventListener('input', updateGeneratedFields);
  brandInput.addEventListener('input', updateGeneratedFields);
  modelNameInput.addEventListener('input', updateGeneratedFields);
  categorySelect.addEventListener('change', updateGeneratedFields);
  // --- End of auto-generation logic ---


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
    modal.classList.remove("hidden");
    if (fixedCart) fixedCart.style.display = "none";
  });

  cancelBtn.addEventListener("click", () => {
    modal.classList.add("hidden");
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
    const barcode_value = barcodeValueInput.value.trim();

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
      product_id: product_id || null,
      sub_category: sub_category || null,
      brand: brand || null,
      model_name: model_name || null,
      unit: unit || null,
      barcode_value: barcode_value || null
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

  if (selectedCategory) {
    const subCategories = await window.api.getUniqueSubCategories(selectedCategory);
    dropdown.innerHTML = `<option value="">All</option>`;
    subCategories.forEach(sub => {
      const opt = document.createElement("option");
      opt.value = sub;
      opt.textContent = sub;
      dropdown.appendChild(opt);
    });
    dropdown.disabled = false;
  } else {
    dropdown.innerHTML = `<option value="">All</option>`;
    dropdown.disabled = true;
  }
}

async function updateProductFilterSubCategoryDropdown(selectedCategory) {
  const dropdown = document.getElementById("filterSubCategory");
  if (!dropdown) return;

  if (selectedCategory) {
    const subCategories = await window.api.getUniqueSubCategories(selectedCategory);
    dropdown.innerHTML = `<option value="">All Sub Categories</option>`;
    subCategories.forEach(sub => {
      const opt = document.createElement("option");
      opt.value = sub;
      opt.textContent = sub;
      dropdown.appendChild(opt);
    });
    dropdown.disabled = false;
  } else {
    dropdown.innerHTML = `<option value="">All Sub Categories</option>`;
    dropdown.disabled = true;
  }
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


async function renderView(viewName) {
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
    await setupProductView();
  }
  if (viewName === "InvoiceHistory") {
    await setupInvoiceHistoryView();
  }

  if (viewName === "Sales") {
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

    // Ensure allProducts is fetched before setting up filters
    allProducts = await window.api.getProducts();
    console.log("Sales tab: allProducts after fetch:", allProducts);

    const salesSearchInput = document.getElementById("salesSearchInput");
    const salesFilterCategory = document.getElementById("salesFilterCategory");
    const salesFilterSubCategory = document.getElementById("salesFilterSubCategory");

    // Populate category dropdown for sales
    populateCategoryDropdown(allProducts, salesFilterCategory);

    // Function to apply filters for sales products
    function applySalesFilters() {
      const nameTerm = salesSearchInput.value.trim().toLowerCase();
      const selectedCategory = salesFilterCategory.value;
      const selectedSubCategory = salesFilterSubCategory.value;
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
      renderSalesProducts(filtered); // Pass filtered products to render function
    }

    // Event Listeners for sales filters
    salesSearchInput.addEventListener("input", applySalesFilters);
    salesFilterCategory.addEventListener("change", async (e) => {
      const selectedCategory = e.target.value;
      await updateSalesSubCategoryDropdown(selectedCategory);
      document.getElementById("salesFilterSubCategory").value = "";
      applySalesFilters(); // this is already defined
    });
    salesFilterSubCategory.addEventListener("change", applySalesFilters);

    await renderSalesProducts(allProducts); // Initial render of all products

    const checkoutBtn = document.querySelector("#fixed-cart-ui #checkoutBtn");
    if (checkoutBtn) {
      // 🛒 Step 2C — Show Cart Overlay on button click
      checkoutBtn.addEventListener("click", async () => {
        const cartOverlay = document.getElementById("cartOverlay");
        if (cartOverlay) {
          cartOverlay.classList.remove("hidden");
          await renderCartOverlay(); // Await the async function call
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
      .then(() => showToast("✅ Business profile saved!"))
      .catch(() => showToast("❌ Failed to save. Try again."));
  });

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
}

  }
  

  async function renderSalesProducts(productsToRender = allProducts) {
    console.log("renderSalesProducts: productsToRender received:", productsToRender);
    if (!salesProductList) {
      console.error("salesProductList element not found!");
      return;
    }
    console.log("salesProductList element found:", salesProductList);
    salesProductList.innerHTML = "";

    const products = productsToRender.length > 0 ? productsToRender : allProducts;

    if (products.length === 0) {
      salesProductList.innerHTML = `<p class="text-gray-500 col-span-full text-center">No products available for sale.</p>`;
      console.log("No products to display.");
      return;
    }

    products.forEach(p => {
      const card = document.createElement("div");
      card.className = "bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden flex flex-col";
      const safeName = p.name.replace(/'/g, "'");
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
      salesProductList.appendChild(card);
      console.log("Appended card for product:", p.name);
    });
    await updateCartUI();
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

  const confirmBtn = document.getElementById("cartCheckoutBtn");
  if (confirmBtn) {
	  confirmBtn.disabled = false; // 👈 this is what’s missing!
    confirmBtn.onclick = async () => {
      const invoiceNo = document.getElementById("customerInvoiceNo")?.value?.trim(); // Get the value from the input
      const name = document.getElementById("custName")?.value?.trim() || null;
      const phone = document.getElementById("custPhone")?.value?.trim() || null;
      const gstin = document.getElementById("custGSTIN")?.value?.trim() || null;

      if (!invoiceNo) {
        showToast("⚠️ Invoice number missing.");
        return;
      }

      if (cart.length === 0) {
        showToast("🛒 Cart is empty.");
        return;
      }

      const itemsWithAmount = cart.map(item => {
        const product = allProducts.find(p => p.id === item.id); // Find the product here
        const rate = item.price ?? 0;
        const qty = item.quantity ?? 1;
        const gst = item.gst_percent ?? product?.gst_percent ?? 0; // Use optional chaining for product
        const discount = item.discount ?? 0;

        const totalMRP = rate * qty;
        const gstFraction = gst / (100 + gst);
        const gstAmount = totalMRP * gstFraction;
        const base = totalMRP - gstAmount;
        const discountedBase = base - discount;
        const finalAmount = discountedBase + gstAmount;

        return {
          ...item,
          product_id: product?.product_id || null, // Pass the generated product_id string
          final_amount: parseFloat(finalAmount.toFixed(2)),
        };
      });
const paymentMethod = document.getElementById("paymentMode")?.value?.trim() || "Cash";
const salePayload = {
  invoice_no: activeInvoiceNo, // Use the stored activeInvoiceNo
  timestamp: new Date().toISOString(),
  customer_name: name,
  customer_phone: phone,
  customer_gstin: gstin,
  payment_method: paymentMethod, // ✅ now included
  items: itemsWithAmount
};


try {
  const result = await window.api.saveSale(salePayload);
  console.log("🧾 Final Invoice No used:", result.invoice_no); // Debug log

  if (result?.success) {
    const invoiceNo = result.invoice_no;

    // ✅ Inject confirmed invoice number into DOM first
    const invoiceInput = document.getElementById("customerInvoiceNo");
    if (invoiceInput && invoiceNo) {
      invoiceInput.value = invoiceNo;
    }

    const clonedCart = structuredClone(itemsWithAmount); // ✅ Clone after DOM is updated
    showInvoice(clonedCart); // ✅ Now pulls correct invoice number

    showToast("✅ Sale saved!");
    cart.length = 0;
    updateCartUI();
    document.getElementById("cartOverlay").classList.add("hidden");
    activeInvoiceNo = null; // Clear activeInvoiceNo after successful sale

    // ✅ Save serial part for preview
    if (invoiceNo.length >= 15) {
      const prefix = invoiceNo.slice(3, 11);
      const serial = parseInt(invoiceNo.slice(-4));
      if (!isNaN(serial)) {
        localStorage.setItem(`lastInvoiceNumber_inv${prefix}`, serial);
      }
    }
  } else {
    showToast("❌ Failed to save sale.");
  }
} catch (err) {
  console.error("❌ saveSale error:", err);
  showToast("⚠️ Could not save. Try again.");
}
    };
  }
// ✅ Wire Preview Invoice button ONCE when overlay is rendered
const previewBtn = document.getElementById("previewInvoiceBtn");
if (previewBtn) {
  previewBtn.onclick = () => {
    if (cart.length === 0) {
      showToast("🛒 Cart is empty.");
      return;
    }
    showInvoice([...cart]);
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
  const previewBtn = document.getElementById("previewInvoiceBtn");
if (previewBtn) {
  previewBtn.addEventListener("click", () => {
    if (cart.length === 0) {
      showToast("🛒 Cart is empty.");
      return;
    }
    showInvoice([...cart]);
  });
}
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

  window.editProduct = function (id, name, price, stock, hsn_code, category, gst_percent) {
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
    nameInput.value = name;
    priceInput.value = price;
    stockInput.value = stock;
    hsnInput.value = hsn_code || "";
    gstInput.value = gst_percent ?? "";
    
    // Handle category selection properly
    if (category && categorySelect) {
      // Check if category exists in dropdown, if not add it
      const categoryExists = Array.from(categorySelect.options).some(option => option.value === category);
      if (!categoryExists && category) {
        categorySelect.innerHTML += `<option value="${category}">${category}</option>`;
      }
      categorySelect.value = category;
      // Trigger change event to populate HSN/GST and sub-category
      categorySelect.dispatchEvent(new Event('change'));
    }

    // Populate sub-category dropdown for editing
    if (category) {
      (async () => {
        await updateProductModalSubCategoryDropdown(category);
        subCategoryInput.value = allProducts.find(p => p.id === id)?.sub_category || "";
      })();
    } else {
      subCategoryInput.innerHTML = `<option value="">Select Sub Category</option>`;
      subCategoryInput.disabled = true;
    }
    
    // Set other fields if they exist
    if (brandInput) brandInput.value = "";
    if (modelNameInput) modelNameInput.value = "";
    if (unitInput) unitInput.value = "";
    if (subCategoryInput) subCategoryInput.value = "";
    if (barcodeValueInput) barcodeValueInput.value = "";
    if (productIdInput) productIdInput.value = "";
    
    modalTitle.textContent = "Edit Product";
    modal.classList.remove("hidden");
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
        <th class="p-1">S.No</th>
        <th class="p-1">Item</th>
        ${showTaxable ? `<th class="p-1 text-right">GST%</th>` : ""}
        <th class="p-1 text-right">Rate</th>
        <th class="p-1 text-right">Qty</th>
        <th class="p-1 text-right">Disc.</th>
        <th class="p-1 text-right">Amount</th>
      </tr>
    </thead>
    <tbody>
`;

items.forEach((item, index) => {
  const qty = item.quantity;
  const price = item.price;
  const gstRate = item.gst_percent || 0;
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
// ➕ New slab-wise GST breakdown (matches updateCartSummaryFooter logic)
const gstBreakdown = {};
items.forEach(item => {
  const rate = item.price || 0;
  const qty = item.quantity || 1;
  const gst = parseFloat(item.gst_percent ?? 0);

  if (!gst || gst === 0) return;

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

const gstLines = Object.entries(gstBreakdown)
  .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])) // low to high
  .map(([rate, data]) => `
    <div>CGST (${rate / 2}%): ₹${data.cgst.toFixed(2)}</div>
    <div>SGST (${rate / 2}%): ₹${data.sgst.toFixed(2)}</div>
    <div>Total GST (${rate}%): ₹${data.total.toFixed(2)}</div>
  `).join("");

// ➕ Total pre-discount
const grossTotal = items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
const totalDiscount = grossTotal - (subtotal + totalGST);

invoiceTotalP.innerHTML = `
  <div class="text-sm mt-3 border-t pt-2 text-right">
    <div>Total Amount: ₹${grossTotal.toFixed(2)}</div>
    ${gstLines}
    <div class="text-red-600">Discount: − ₹${totalDiscount.toFixed(2)}</div>
    <div class="text-lg font-bold mt-1">Payable: ₹${(subtotal + totalGST).toFixed(2)}</div>
  </div>
`;

const now = new Date();
const date = now.toLocaleString("en-IN", {
  dateStyle: "short",
  timeStyle: "short"
});

const invoiceNo = document.getElementById("customerInvoiceNo")?.value?.trim() || "N/A";
const custName = document.getElementById("custName")?.value?.trim() || "—";
const custPhone = document.getElementById("custPhone")?.value?.trim() || "—";

invoiceMeta.innerHTML = `
  <div class="text-xs flex justify-between">
    <div class="text-left">
      Customer: ${custName}<br>
      Phone: ${custPhone}
    </div>
    <div class="text-right text-nowrap">
      Invoice No: ${invoiceNo}<br>
      ${date}
    </div>
  </div>
  <div class="border-t my-1"></div>
`;
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
    const perItemShare = value / total;

    cart.forEach(item => {
      const gross = (item.price || 0) * (item.quantity || 1);
      item.discount = Math.floor(perItemShare * gross);
    });
  }

  renderCartOverlay();  // ✅ triggers live update
  // 🧾 Wire Preview Invoice button inside cart overlay
}
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2000);
}

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
          renderProducts();
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