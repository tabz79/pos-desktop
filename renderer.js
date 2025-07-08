document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");

  const views = {
    Products: `
      <div>
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">Product List</h2>
          <button id="addProductBtn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
            + Add Product
          </button>
        </div>

        <table class="w-full bg-white shadow rounded mb-4">
          <thead>
            <tr class="bg-gray-200 text-left">
              <th class="p-2">Name</th>
              <th class="p-2">Price</th>
              <th class="p-2">Stock</th>
            </tr>
          </thead>
          <tbody id="productTable"></tbody>
        </table>
      </div>
    `,
    Sales: `
      <div>
        <h2 class="text-xl font-bold mb-2">Sales</h2>
        <p class="text-gray-700">Today's sales summary...</p>
      </div>
    `,
    Reports: `
      <div>
        <h2 class="text-xl font-bold mb-2">Reports</h2>
        <p class="text-gray-700">Monthly report goes here...</p>
      </div>
    `,
  };

  function renderView(viewName) {
    app.innerHTML = views[viewName] || `<p>Unknown view: ${viewName}</p>`;

    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.remove("bg-gray-300", "font-semibold");
      if (btn.innerText.trim() === viewName) {
        btn.classList.add("bg-gray-300", "font-semibold");
      }
    });

    if (viewName === "Products") {
      const addBtn = document.getElementById("addProductBtn");
      const modal = document.getElementById("productModal");
      const nameInput = document.getElementById("productName");
      const priceInput = document.getElementById("productPrice");
      const stockInput = document.getElementById("productStock");
      const saveBtn = document.getElementById("saveProductBtn");
      const cancelBtn = document.getElementById("cancelModalBtn");
      const productTable = document.getElementById("productTable");

      function clearInputs() {
        nameInput.value = "";
        priceInput.value = "";
        stockInput.value = "";
      }

      async function renderProducts() {
        const products = await window.api.getProducts();
        productTable.innerHTML = "";
        products.forEach((p) => {
          const row = document.createElement("tr");
          row.innerHTML = `
            <td class="p-2">${p.name}</td>
            <td class="p-2">₹${p.price}</td>
            <td class="p-2">${p.stock}</td>
          `;
          productTable.appendChild(row);
        });
      }

      addBtn.addEventListener("click", () => {
        modal.classList.remove("hidden");
      });

      cancelBtn.addEventListener("click", () => {
        modal.classList.add("hidden");
        clearInputs();
      });

      // ✅ Save to SQLite using IPC
      saveBtn.addEventListener("click", async () => {
        const newProduct = {
          name: nameInput.value.trim(),
          price: parseFloat(priceInput.value),
          stock: parseInt(stockInput.value)
        };

        if (!newProduct.name || isNaN(newProduct.price) || isNaN(newProduct.stock)) {
          alert("Please fill all fields correctly.");
          return;
        }

        try {
          const result = await window.api.addProduct(newProduct);
          console.log("✅ Product saved:", result);
          clearInputs();
          modal.classList.add("hidden");
          renderProducts();
        } catch (err) {
          console.error("❌ Failed to save product:", err);
          alert("Something went wrong while saving.");
        }
      });

      renderProducts();
    }
  }

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.innerText.trim();
      renderView(view);
    });
  });

  renderView("Products");
});
