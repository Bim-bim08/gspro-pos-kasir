/* ============================================
   Gspro - POS / Kasir Frontend Logic
   SMK Jakarta Pusat 1
   ============================================ */

// ====== STATE ======
const state = {
  cart: [],
  paymentMethod: 'cash',
  cashInput: 0,
  lastTransaction: null,
  discount: {
    active: false,
    type: 'nominal', // 'nominal' or 'percent'
    value: 0,
    amount: 0
  }
};

// ====== LOCALSTORAGE SYNC (Demo Mode) ======
const LS_KEYS = {
  products: 'gspro_pos_products',
  transactions: 'gspro_pos_transactions',
  transactionDetails: 'gspro_pos_transaction_details',
  stockAdjustments: 'gspro_pos_stock_adjustments'
};

function isDemoMode() {
  return window.IS_DEMO === true;
}

// --- Generic save / load ---
function saveToLS(key, data) {
  if (!isDemoMode()) return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('Gagal menyimpan ke localStorage:', key, e);
  }
}

function loadFromLS(key) {
  if (!isDemoMode()) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('Gagal memuat dari localStorage:', key, e);
    return null;
  }
}

// --- Products ---
function saveProductsToLocalStorage(products) {
  saveToLS(LS_KEYS.products, products);
}

function loadProductsFromLocalStorage() {
  return loadFromLS(LS_KEYS.products);
}

// Update stok produk tertentu di localStorage (langsung, tanpa fetch)
function updateProductStockInLS(productId, qtyChange) {
  const products = loadFromLS(LS_KEYS.products);
  if (!products) return;
  const product = products.find(p => p.id === productId);
  if (product) {
    product.stock = Math.max(0, product.stock + qtyChange);
    saveToLS(LS_KEYS.products, products);
  }
}

// --- Transactions ---
function saveTransactionsToLocalStorage(transactions) {
  saveToLS(LS_KEYS.transactions, transactions);
}

function loadTransactionsFromLocalStorage() {
  return loadFromLS(LS_KEYS.transactions);
}

// Tambah 1 transaksi baru ke array di localStorage
function appendTransactionToLS(txData) {
  const list = loadFromLS(LS_KEYS.transactions) || [];
  list.push(txData);
  saveToLS(LS_KEYS.transactions, list);
}

// --- Transaction Details ---
function saveTransactionDetailsToLocalStorage(details) {
  saveToLS(LS_KEYS.transactionDetails, details);
}

function loadTransactionDetailsFromLocalStorage() {
  return loadFromLS(LS_KEYS.transactionDetails);
}

// Simpan detail 1 transaksi baru
function appendTransactionDetailsToLS(txId, items) {
  const all = loadFromLS(LS_KEYS.transactionDetails) || {};
  all[txId] = items.map((d, idx) => ({
    id: idx + 1,
    product_id: d.product_id,
    product_name: d.product_name,
    qty: d.qty,
    price: d.price,
    subtotal: d.subtotal
  }));
  saveToLS(LS_KEYS.transactionDetails, all);
}

// --- Stock Adjustments ---
function saveAdjustmentsToLocalStorage(adjustments) {
  saveToLS(LS_KEYS.stockAdjustments, adjustments);
}

function loadAdjustmentsFromLocalStorage() {
  return loadFromLS(LS_KEYS.stockAdjustments);
}

function appendAdjustmentToLS(adjData) {
  const list = loadFromLS(LS_KEYS.stockAdjustments) || [];
  list.push(adjData);
  saveToLS(LS_KEYS.stockAdjustments, list);
}

// --- Sync ke server ---
async function syncAllDemoDataToServer() {
  if (!isDemoMode()) return;
  try {
    await fetch('/api/demo/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        products: loadFromLS(LS_KEYS.products) || [],
        transactions: loadFromLS(LS_KEYS.transactions) || [],
        transactionDetails: loadFromLS(LS_KEYS.transactionDetails) || {},
        stockAdjustments: loadFromLS(LS_KEYS.stockAdjustments) || []
      })
    });
  } catch (e) {
    console.warn('Gagal sinkronisasi data demo ke server:', e);
  }
}

// Legacy alias (masih dipanggil di beberapa tempat)
async function syncServerProducts(products) {
  if (!isDemoMode() || !products) return;
  try {
    await fetch('/api/products/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products })
    });
  } catch (e) {
    console.warn('Gagal sinkronisasi produk ke server:', e);
  }
}

// ====== DOM REFS ======
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const cartItems = $('#cartItems');
const subtotalDisplay = $('#subtotalDisplay');
const totalDisplay = $('#totalDisplay');
const changeDisplay = $('#changeDisplay');
const changeRow = $('#changeRow');
const payBtn = $('#payBtn');
const clearCartBtn = $('#clearCartBtn');
const cashInput = $('#cashInput');
const quickCash = $('#quickCash');
const searchInput = $('#searchInput');
const productGrid = $('#productGrid');
const qrisModal = $('#qrisModal');
const qrisTotal = $('#qrisTotal');
const qrisCode = $('#qrisCode');
const qrisImage = $('#qrisImage');
const qrisPlaceholder = $('#qrisPlaceholder');
const qrisLoading = $('#qrisLoading');
const receiptModal = $('#receiptModal');
const loadingOverlay = $('#loadingOverlay');

// ====== CART OPERATIONS ======

function addToCart(id, name, price) {
  const existing = state.cart.find(item => item.product_id === id);

  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({ product_id: id, name, price, qty: 1 });
  }

  renderCart();
  showToast(`${name} ditambahkan ke keranjang`);
  updatePayButton();
  updateClearButton();
}

function removeFromCart(id) {
  state.cart = state.cart.filter(item => item.product_id !== id);
  renderCart();
  updatePayButton();
  updateClearButton();
}

function updateQty(id, delta) {
  const item = state.cart.find(i => i.product_id === id);
  if (!item) return;

  item.qty += delta;
  if (item.qty <= 0) {
    removeFromCart(id);
    return;
  }

  renderCart();
  updatePayButton();
}

function clearCart() {
  if (state.cart.length === 0) return;
  // Tampilkan custom confirmation modal (dark-themed)
  const modal = document.getElementById('confirmClearModal');
  if (modal) modal.classList.add('show');
}

function closeConfirmClear() {
  document.getElementById('confirmClearModal').classList.remove('show');
}

function executeClearCart() {
  document.getElementById('confirmClearModal').classList.remove('show');
  state.cart = [];
  removeDiscount();
  renderCart();
  updatePayButton();
  updateClearButton();
  resetSummary();
  showToast('Keranjang berhasil dikosongkan');
}

function renderCart() {
  if (state.cart.length === 0) {
    cartItems.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon"><i class="fas fa-cart-plus"></i></div>
        <p class="cart-empty-text">Belum ada item</p>
        <p class="cart-empty-hint">Scan barcode atau pilih produk</p>
      </div>
    `;
    return;
  }

  let html = '';
  state.cart.forEach(item => {
    const itemTotal = item.price * item.qty;
    html += `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">Rp ${Number(item.price).toLocaleString('id-ID')}</div>
        </div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="updateQty(${item.product_id}, -1)">
            <i class="fas fa-minus"></i>
          </button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-btn" onclick="updateQty(${item.product_id}, 1)">
            <i class="fas fa-plus"></i>
          </button>
        </div>
        <span class="cart-item-subtotal">Rp ${Number(itemTotal).toLocaleString('id-ID')}</span>
        <button class="cart-item-remove" onclick="removeFromCart(${item.product_id})">
          <i class="fas fa-xmark"></i>
        </button>
      </div>
    `;
  });

  cartItems.innerHTML = html;
  updateSummary();
}

function getSubtotal() {
  return state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
}

function getDiscountAmount(subtotal) {
  if (!state.discount.active || state.discount.value <= 0) return 0;

  if (state.discount.type === 'percent') {
    return Math.round(subtotal * (state.discount.value / 100));
  } else {
    return Math.min(state.discount.value, subtotal);
  }
}

function getTotal() {
  const subtotal = getSubtotal();
  const discountAmount = getDiscountAmount(subtotal);
  return Math.round(subtotal - discountAmount);
}

function updateSummary() {
  const subtotal = getSubtotal();
  const discountAmount = getDiscountAmount(subtotal);
  const total = Math.round(subtotal - discountAmount);

  subtotalDisplay.textContent = `Rp ${subtotal.toLocaleString('id-ID')}`;
  totalDisplay.textContent = `Rp ${total.toLocaleString('id-ID')}`;

  const discountRow = $('#discountRow');
  const discountDisplay = $('#discountDisplay');
  if (state.discount.active && state.discount.value > 0) {
    discountRow.style.display = 'flex';
    discountDisplay.textContent = `-Rp ${discountAmount.toLocaleString('id-ID')}`;
  } else {
    discountRow.style.display = 'none';
  }

  if (state.paymentMethod === 'cash') {
    updateChange(total);
  }
}

function resetSummary() {
  subtotalDisplay.textContent = 'Rp 0';
  totalDisplay.textContent = 'Rp 0';
  changeDisplay.textContent = 'Rp 0';
  changeRow.style.display = 'none';
  $('#discountRow').style.display = 'none';
}

function updatePayButton() {
  payBtn.disabled = state.cart.length === 0;
}

function updateClearButton() {
  clearCartBtn.style.display = state.cart.length > 0 ? 'flex' : 'none';
}

// ====== PAYMENT ======

function selectPayment(method) {
  state.paymentMethod = method;

  $$('.payment-btn').forEach(btn => btn.classList.remove('active'));
  $(`.payment-btn[data-method="${method}"]`).classList.add('active');

  if (method === 'cash') {
    quickCash.style.display = 'flex';
    const total = getTotal();
    updateChange(total);
  } else {
    quickCash.style.display = 'none';
    changeRow.style.display = 'none';
    cashInput.value = '';
    state.cashInput = 0;
  }
}

function setCash(amount, btn) {
  state.cashInput = amount;
  cashInput.value = amount.toLocaleString('id-ID');
  $$('.cash-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  cashInput.focus();
  const total = getTotal();
  updateChange(total);
}

function setCashExact(btn) {
  const total = getTotal();
  state.cashInput = total;
  cashInput.value = total.toLocaleString('id-ID');
  $$('.cash-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  cashInput.focus();
  updateChange(total);
}

function formatCashInput(el) {
  let val = el.value.replace(/[^\d]/g, '');
  if (val === '') {
    state.cashInput = 0;
    el.value = '';
    return;
  }
  state.cashInput = parseInt(val);
  el.value = Number(val).toLocaleString('id-ID');
  const total = getTotal();
  updateChange(total);
}

function updateChange(total) {
  const cash = state.cashInput;
  if (cash > 0) {
    if (cash >= total) {
      // Uang cukup atau lebih — tampilkan kembalian normal
      const change = cash - total;
      changeDisplay.textContent = `Rp ${change.toLocaleString('id-ID')}`;
      changeDisplay.classList.remove('change-insufficient');
      changeDisplay.classList.add('change-sufficient');
      changeRow.classList.remove('change-warning');
      changeRow.style.display = 'flex';
    } else {
      // Uang kurang — tampilkan selisih dengan peringatan
      const deficit = total - cash;
      changeDisplay.textContent = `Kurang Rp ${deficit.toLocaleString('id-ID')}`;
      changeDisplay.classList.remove('change-sufficient');
      changeDisplay.classList.add('change-insufficient');
      changeRow.classList.add('change-warning');
      changeRow.style.display = 'flex';
    }
  } else {
    changeRow.style.display = 'none';
    changeRow.classList.remove('change-warning');
  }
}

// ====== DISCOUNT ======

function toggleDiscount() {
  const body = $('#discountBody');
  const chevron = $('#discountChevron');
  body.classList.toggle('open');
  chevron.classList.toggle('open');
}

function selectDiscountType(type) {
  state.discount.type = type;
  $$('.discount-type-btn').forEach(b => b.classList.remove('active'));
  $(`.discount-type-btn[data-dtype="${type}"]`).classList.add('active');

  const prefix = $('#discountPrefix');
  const suffix = $('#discountSuffix');
  if (type === 'nominal') {
    prefix.textContent = 'Rp';
    suffix.style.display = 'none';
  } else {
    prefix.textContent = '';
    suffix.style.display = 'inline';
  }
}

function formatDiscountInput(el) {
  let val = el.value.replace(/[^\d]/g, '');
  if (val === '') {
    el.value = '';
    return;
  }
  el.value = Number(val).toLocaleString('id-ID');
}

function applyDiscount() {
  const input = $('#discountInput');
  let val = input.value.replace(/[^\d]/g, '');

  if (!val || parseInt(val) <= 0) {
    showToast('Masukkan nilai diskon yang valid', 'error');
    input.focus();
    return;
  }

  const value = parseInt(val);
  const subtotal = getSubtotal();

  if (state.discount.type === 'percent' && value > 100) {
    showToast('Diskon persen tidak boleh lebih dari 100%', 'error');
    input.focus();
    return;
  }

  state.discount.active = true;
  state.discount.value = value;

  const status = $('#discountStatus');
  const typeLabel = state.discount.type === 'nominal' ? 'Rp' : '%';
  status.textContent = `${typeLabel} ${Number(value).toLocaleString('id-ID')}`;
  status.classList.add('active');

  updateSummary();
  updateChange(getTotal());

  const body = $('#discountBody');
  const chevron = $('#discountChevron');
  body.classList.remove('open');
  chevron.classList.remove('open');

  showToast(`Diskon berhasil diterapkan: ${typeLabel} ${Number(value).toLocaleString('id-ID')}`);
}

function removeDiscount() {
  state.discount.active = false;
  state.discount.value = 0;
  state.discount.amount = 0;

  $('#discountInput').value = '';
  $('#discountStatus').textContent = 'Belum ada';
  $('#discountStatus').classList.remove('active');

  updateSummary();
  updateChange(getTotal());
}

// ====== PROCESS PAYMENT ======

async function processPayment() {
  if (state.cart.length === 0) return;

  if (state.paymentMethod === 'qris') {
    const total = getTotal();
    qrisTotal.textContent = `Rp ${total.toLocaleString('id-ID')}`;
    generateQRCode(total);
    qrisModal.classList.add('show');
    return;
  }

  if (state.paymentMethod === 'cash') {
    const total = getTotal();
    if (state.cashInput < total) {
      showToast('Uang yang dibayarkan kurang!', 'error');
      cashInput.focus();
      return;
    }
  }

  await submitTransaction();
}

function generateQRCode(total) {
  qrisLoading.classList.add('show');
  qrisImage.style.display = 'none';
  qrisPlaceholder.style.display = 'none';

  const qrData = `QRIS:GSPRO:SMK Jakarta Pusat 1:${total}:INV/${new Date().toISOString().slice(0,10).replace(/-/g, '')}/GS/${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}&format=png&margin=10`;

  const img = new Image();
  img.onload = function() {
    qrisImage.src = qrUrl;
    qrisImage.style.display = 'block';
    qrisLoading.classList.remove('show');
  };
  img.onerror = function() {
    qrisLoading.classList.remove('show');
    qrisPlaceholder.style.display = 'block';
    showToast('Gagal memuat kode QR, silakan coba lagi', 'error');
  };
  img.src = qrUrl;
}

async function confirmQRIS() {
  const qrisSuccess = document.getElementById('qrisSuccess');
  const qrisPaidBtn = document.querySelector('.qris-paid-btn');

  // Hide QR code, status, hint, and button
  document.querySelector('.qris-code').style.display = 'none';
  document.querySelector('.qris-merchant').style.display = 'none';
  document.querySelector('.qris-total').style.display = 'none';
  document.getElementById('qrisStatus').style.display = 'none';
  document.querySelector('.qris-hint').style.display = 'none';
  qrisPaidBtn.style.display = 'none';

  // Show success animation
  qrisSuccess.style.display = 'flex';

  // After 1.5 seconds, close QRIS modal, submit transaction (skip loading overlay), and show receipt
  setTimeout(async () => {
    qrisModal.classList.remove('show');

    // Reset QRIS modal for next use
    qrisSuccess.style.display = 'none';
    document.querySelector('.qris-code').style.display = 'flex';
    document.querySelector('.qris-merchant').style.display = 'flex';
    document.querySelector('.qris-total').style.display = 'block';
    document.getElementById('qrisStatus').style.display = 'flex';
    document.querySelector('.qris-hint').style.display = 'block';
    qrisPaidBtn.style.display = 'flex';

    // Submit without showing loading overlay since success animation already shown
    await submitTransaction(true);
  }, 1500);
}

function closeQRIS() {
  qrisModal.classList.remove('show');
  qrisLoading.classList.remove('show');
  qrisImage.style.display = 'none';
  qrisPlaceholder.style.display = 'block';
  // Reset success state
  const qrisSuccess = document.getElementById('qrisSuccess');
  if (qrisSuccess) qrisSuccess.style.display = 'none';
  const qrisCodeEl = document.querySelector('.qris-code');
  if (qrisCodeEl) qrisCodeEl.style.display = 'flex';
  const qrisMerchantEl = document.querySelector('.qris-merchant');
  if (qrisMerchantEl) qrisMerchantEl.style.display = 'flex';
  const qrisTotalEl = document.querySelector('.qris-total');
  if (qrisTotalEl) qrisTotalEl.style.display = 'block';
  const qrisStatusEl = document.getElementById('qrisStatus');
  if (qrisStatusEl) qrisStatusEl.style.display = 'flex';
  const qrisHintEl = document.querySelector('.qris-hint');
  if (qrisHintEl) qrisHintEl.style.display = 'block';
  const qrisPaidBtn = document.querySelector('.qris-paid-btn');
  if (qrisPaidBtn) qrisPaidBtn.style.display = 'flex';
}

async function submitTransaction(skipLoading = false) {
  if (!skipLoading) {
    loadingOverlay.classList.add('show');
  }

  const discountAmount = state.discount.active ? getDiscountAmount(getSubtotal()) : 0;

  const payload = {
    items: state.cart.map(item => ({
      product_id: item.product_id,
      qty: item.qty
    })),
    payment_method: state.paymentMethod,
    cash_paid: state.paymentMethod === 'cash' ? state.cashInput : (state.paymentMethod === 'qris' ? getTotal() : 0),
    discount_type: state.discount.active ? state.discount.type : null,
    discount_value: state.discount.active ? state.discount.value : 0,
    discount_amount: discountAmount
  };

  try {
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    if (result.success) {
      state.lastTransaction = result.data;
      loadingOverlay.classList.remove('show');

      // Simpan transaksi & detail ke localStorage (demo mode)
      if (isDemoMode()) {
        // Simpan record transaksi ke array
        const txRecord = {
          id: result.data.transaction_id,
          invoice_number: result.data.invoice_number,
          payment_method: result.data.payment_method,
          subtotal: result.data.subtotal,
          discount_type: result.data.discount_type,
          discount_value: result.data.discount_value,
          discount_amount: result.data.discount_amount,
          total_amount: result.data.total_amount,
          cash_paid: result.data.cash_paid,
          change_amount: result.data.change_amount,
          created_at: new Date().toISOString()
        };
        appendTransactionToLS(txRecord);

        // Simpan detail transaksi
        appendTransactionDetailsToLS(result.data.transaction_id, result.data.items);

        // Kurangi stok produk di localStorage langsung (tanpa harus fetch)
        result.data.items.forEach(item => {
          updateProductStockInLS(item.product_id, -item.qty);
        });

        // Sync seluruh data ke server agar laporan & riwayat up-to-date
        syncAllDemoDataToServer();
      }

      showReceipt(result.data);
      // Refresh produk agar badge stok terbaru segera tampil
      fetchProducts();
      // Perbarui ringkasan penjualan harian
      loadDailyReport();
      state.cart = [];
      removeDiscount();
      renderCart();
      updatePayButton();
      updateClearButton();
      resetSummary();
      cashInput.value = '';
      state.cashInput = 0;
    } else {
      loadingOverlay.classList.remove('show');
      showToast(result.message || 'Transaksi gagal', 'error');
    }
  } catch (err) {
    loadingOverlay.classList.remove('show');
    showToast('Gagal terhubung ke server', 'error');
    console.error(err);
  }
}

// ====== RECEIPT DIGITAL ======

function showReceipt(data) {
  const paymentLabel = data.payment_method === 'cash' ? 'Tunai' : 'QRIS';
  const date = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  document.getElementById('rcptInvoice').textContent = `#${data.invoice_number}`;
  document.getElementById('rcptDate').textContent = date;

  let itemsHtml = '';
  data.items.forEach(item => {
    itemsHtml += `
      <div class="rcpt-item">
        <span class="rcpt-item-name">${item.product_name}</span>
        <span class="rcpt-item-qty">x${item.qty}</span>
        <span class="rcpt-item-price">Rp ${Number(item.subtotal).toLocaleString('id-ID')}</span>
      </div>
    `;
  });
  document.getElementById('rcptItems').innerHTML = itemsHtml;

  let summaryHtml = `
    <div class="rcpt-line">
      <span>Subtotal</span>
      <span>Rp ${Number(data.subtotal).toLocaleString('id-ID')}</span>
    </div>
  `;

  if (data.discount_amount && data.discount_amount > 0) {
    const discLabel = data.discount_type === 'percent'
      ? `Diskon ${data.discount_value}%`
      : `Diskon Rp ${Number(data.discount_value).toLocaleString('id-ID')}`;
    summaryHtml += `
      <div class="rcpt-line rcpt-discount">
        <span>${discLabel}</span>
        <span>-Rp ${Number(data.discount_amount).toLocaleString('id-ID')}</span>
      </div>
    `;
  }

  summaryHtml += `
    <div class="rcpt-line rcpt-total">
      <span>Total</span>
      <span>Rp ${Number(data.total_amount).toLocaleString('id-ID')}</span>
    </div>
  `;

  if (data.payment_method === 'cash') {
    summaryHtml += `
      <div class="rcpt-line rcpt-cash">
        <span>Tunai</span>
        <span>Rp ${Number(data.cash_paid).toLocaleString('id-ID')}</span>
      </div>
      <div class="rcpt-line rcpt-change">
        <span>Kembalian</span>
        <span>Rp ${Number(data.change_amount).toLocaleString('id-ID')}</span>
      </div>
    `;
  }
  document.getElementById('rcptSummary').innerHTML = summaryHtml;

  document.getElementById('rcptPayment').innerHTML = `
    Metode Pembayaran: <span class="rcpt-payment-method">${paymentLabel}</span>
  `;

  state.lastTransaction = data;
  setPaperSize('thermal-80');
  receiptModal.classList.add('show');
}

async function fetchProducts() {
  try {
    const res = await fetch('/api/products');
    const result = await res.json();
    if (result.success) {
      updateProductGrid(result.data);
      // Simpan ke localStorage agar tetap persist di mode demo
      saveProductsToLocalStorage(result.data);
    }
  } catch (err) {
    console.error('Error refreshing products:', err);
  }
}

function updateProductGrid(products) {
  // Build a lookup map from product id -> product
  const productMap = {};
  products.forEach(p => { productMap[p.id] = p; });

  const cards = document.querySelectorAll('.product-card');
  cards.forEach(card => {
    const id = parseInt(card.dataset.id);
    const product = productMap[id];
    if (!product) return;

    // Update data attribute
    card.dataset.stock = product.stock;

    // Toggle disabled state
    if (product.stock <= 0) {
      card.classList.add('product-disabled');
    } else {
      card.classList.remove('product-disabled');
    }

    // Update stock badge
    const badge = card.querySelector('.product-stock-badge');
    if (badge) {
      if (product.stock <= 0) {
        badge.className = 'product-stock-badge out';
        badge.textContent = 'Habis';
      } else if (product.stock <= 5) {
        badge.className = 'product-stock-badge low';
        badge.textContent = `Sisa ${product.stock}`;
      } else {
        badge.className = 'product-stock-badge in-stock';
        badge.textContent = `Stok ${product.stock}`;
      }
    }

    // Update stock text below price
    const stockText = card.querySelector('.product-stock-text');
    if (stockText) {
      stockText.textContent = `Stok: ${product.stock}`;
    }

    // Update add-to-cart button disabled state
    const addBtn = card.querySelector('.btn-add-cart');
    if (addBtn) {
      addBtn.disabled = product.stock <= 0;
    }
  });

  // Update total product count badge
  const totalEl = document.getElementById('totalProducts');
  if (totalEl) {
    totalEl.textContent = `${products.length} Produk`;
  }
}

function closeReceipt() {
  receiptModal.classList.remove('show');
  document.getElementById('waInputWrapper').style.display = 'none';
}

function finishReceipt() {
  closeReceipt();
  // Pastikan keranjang kosong
  state.cart = [];
  removeDiscount();
  renderCart();
  updatePayButton();
  updateClearButton();
  resetSummary();
  cashInput.value = '';
  state.cashInput = 0;
  searchInput.value = '';
  searchInput.focus();
  // Refresh stok produk
  fetchProducts();
}

function printReceipt() {
  window.print();
}

// ====== PAPER SIZE ======

function setPaperSize(size) {
  const card = document.getElementById('receiptCard');
  card.className = 'receipt-card ' + size;

  const oldPageStyle = document.getElementById('pageSizeStyle');
  if (oldPageStyle) oldPageStyle.remove();

  let pageRule = '';
  if (size === 'thermal-58') {
    pageRule = '@page { margin: 0; size: 58mm auto; }';
  } else if (size === 'thermal-80') {
    pageRule = '@page { margin: 0; size: 80mm auto; }';
  } else {
    pageRule = '@page { size: A4; margin: 10mm; }';
  }

  const style = document.createElement('style');
  style.id = 'pageSizeStyle';
  style.textContent = pageRule;
  document.head.appendChild(style);
}

// ====== WHATSAPP SHARING ======

function sendWhatsApp() {
  const wrapper = document.getElementById('waInputWrapper');
  if (wrapper.style.display === 'flex') {
    wrapper.style.display = 'none';
    return;
  }
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  document.getElementById('waPhoneInput').value = '';
  document.getElementById('waPhoneInput').focus();
}

function closeWaInput() {
  document.getElementById('waInputWrapper').style.display = 'none';
}

function confirmSendWa() {
  const phoneInput = document.getElementById('waPhoneInput');
  let phone = phoneInput.value.replace(/[^\d]/g, '');

  if (!phone) {
    showToast('Silakan masukkan nomor WhatsApp', 'error');
    phoneInput.focus();
    return;
  }

  if (phone.startsWith('0')) {
    phone = '62' + phone.slice(1);
  }
  if (!phone.startsWith('62')) {
    phone = '62' + phone;
  }

  const data = state.lastTransaction;
  if (!data) {
    showToast('Data transaksi tidak tersedia', 'error');
    return;
  }

  const paymentLabel = data.payment_method === 'cash' ? 'Tunai' : 'QRIS';
  const date = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  let itemsText = '';
  data.items.forEach((item, i) => {
    itemsText += `${i + 1}. ${item.product_name} x${item.qty} - Rp ${Number(item.subtotal).toLocaleString('id-ID')}\n`;
  });

  let message = `🧾 *Gspro - SMK Jakarta Pusat 1*\n\n`;
  message += `📋 *Invoice*: #${data.invoice_number}\n`;
  message += `📅 *Tanggal*: ${date}\n\n`;
  message += `*Daftar Belanja:*\n${itemsText}\n`;
  message += `─────────────\n`;
  message += `Subtotal  : Rp ${Number(data.subtotal).toLocaleString('id-ID')}\n`;

  if (data.discount_amount && data.discount_amount > 0) {
    message += `Diskon    : -Rp ${Number(data.discount_amount).toLocaleString('id-ID')}\n`;
  }

  message += `*Total      : Rp ${Number(data.total_amount).toLocaleString('id-ID')}*\n`;

  if (data.payment_method === 'cash') {
    message += `Tunai     : Rp ${Number(data.cash_paid).toLocaleString('id-ID')}\n`;
    message += `Kembalian : Rp ${Number(data.change_amount).toLocaleString('id-ID')}\n`;
  }

  message += `\n💳 *${paymentLabel}*\n\n`;
  message += `Terima kasih telah berbelanja! 🙏`;

  const waUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
  window.open(waUrl, '_blank');

  document.getElementById('waInputWrapper').style.display = 'none';
  showToast('Pesan WhatsApp berhasil dibuka');
}

// ====== NEW TRANSACTION ======

function newTransaction() {
  receiptModal.classList.remove('show');
  document.getElementById('waInputWrapper').style.display = 'none';
  state.cart = [];
  removeDiscount();
  renderCart();
  updatePayButton();
  updateClearButton();
  resetSummary();
  cashInput.value = '';
  state.cashInput = 0;
  searchInput.value = '';
  searchInput.focus();
  // Refresh stok produk
  fetchProducts();
}

// ====== NAVIGATION ======

function openHistory(dateFilter = null) {
  const modal = document.getElementById('historyModal');
  modal.classList.add('show');
  loadHistory(dateFilter);
}

function closeHistory() {
  document.getElementById('historyModal').classList.remove('show');
}

// ====== DRILL-DOWN: Rincian Pendapatan per Produk Berdasarkan Tanggal ======
let _drillDownDate = null;

function showDailyItems(rawDate, displayDate) {
  // Tutup Modal Laporan Pendapatan
  closeIncomeModal();

  // Simpan tanggal mentah (YYYY-MM-DD) untuk digunakan di tombol "Lihat Riwayat Transaksi"
  _drillDownDate = rawDate;

  // Set judul modal dengan tanggal cantik (DD MMM YYYY) — HANYA untuk tampilan
  document.getElementById('dailyItemsDate').textContent = displayDate;

  // Buka modal
  const modal = document.getElementById('dailyItemsModal');
  modal.classList.add('show');

  // Muat data menggunakan rawDate (YYYY-MM-DD) untuk fetch API
  loadDailyItems(rawDate);
}

function closeDailyItems() {
  document.getElementById('dailyItemsModal').classList.remove('show');
}

// Tombol "Lihat Riwayat Transaksi" di modal
function showTransactionsForDate() {
  if (!_drillDownDate) return;
  closeDailyItems();

  // Format tanggal display
  const parts = _drillDownDate.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const monthName = months[parseInt(parts[1]) - 1] || '';
  const day = parseInt(parts[2]);
  const displayDate = `${day} ${monthName} ${parts[0]}`;

  const searchInput = document.getElementById('historySearch');
  if (searchInput) {
    searchInput.value = displayDate;
  }

  openHistory(_drillDownDate);
}

async function loadDailyItems(dateStr) {
  const loading = document.getElementById('dailyItemsLoading');
  const summary = document.getElementById('dailyItemsSummary');
  const tableWrapper = document.getElementById('dailyItemsTableWrapper');
  const tbody = document.getElementById('dailyItemsTableBody');
  const empty = document.getElementById('dailyItemsEmpty');

  loading.style.display = 'flex';
  summary.style.display = 'none';
  tableWrapper.style.display = 'none';

  try {
    // Gunakan encodeURIComponent untuk keamanan saat mengirim parameter URL
    const res = await fetch(`/api/reports/daily-items?date=${encodeURIComponent(dateStr)}`);
    const result = await res.json();

    loading.style.display = 'none';

    if (result.success) {
      // Response format: { success: true, items: [...], total_omset, total_qty, total_jenis }
      const items = result.items || [];
      const totalOmset = result.total_omset || 0;
      const totalQty = result.total_qty || 0;
      const totalJenis = result.total_jenis || 0;

      // Update summary cards
      document.getElementById('dailyItemsTotalRevenue').textContent =
        `Rp ${Number(totalOmset).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
      document.getElementById('dailyItemsTotalQty').textContent =
        Number(totalQty).toLocaleString('id-ID');
      document.getElementById('dailyItemsTotalProducts').textContent =
        Number(totalJenis).toLocaleString('id-ID');
      summary.style.display = 'flex';

      // Render table
      if (items.length > 0) {
        tableWrapper.style.display = 'block';
        empty.style.display = 'none';

        // Update table footer summary
        document.getElementById('dailyItemsFooterQty').textContent =
          Number(totalQty).toLocaleString('id-ID');
        document.getElementById('dailyItemsFooterRevenue').textContent =
          `Rp ${Number(totalOmset).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
        document.getElementById('dailyItemsTableFoot').style.display = 'table-footer-group';

        tbody.innerHTML = items.map((item, idx) => {
          const revenueClass = item.total_revenue >= (totalOmset * 0.2)
            ? 'items-revenue-high'
            : item.total_revenue >= (totalOmset * 0.05)
              ? 'items-revenue-mid'
              : '';
          return `
            <tr class="${revenueClass}">
              <td class="items-td-name">
                <span class="items-rank">${idx + 1}</span>
                <strong>${item.product_name}</strong>
              </td>
              <td><span class="items-category-badge">${item.category}</span></td>
              <td class="items-td-qty">
                <span class="items-qty-badge">${Number(item.total_qty).toLocaleString('id-ID')}</span>
              </td>
              <td class="items-td-revenue">Rp ${Number(item.total_revenue).toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
            </tr>
          `;
        }).join('');
      } else {
        tableWrapper.style.display = 'block';
        empty.style.display = 'flex';
        tbody.innerHTML = '';
      }
    } else {
      loading.style.display = 'none';
      tableWrapper.style.display = 'block';
      empty.style.display = 'flex';
      empty.innerHTML = `<i class="fas fa-exclamation-triangle"></i><p>${result.message || 'Gagal memuat rincian'}</p>`;
    }
  } catch (err) {
    loading.style.display = 'none';
    tableWrapper.style.display = 'block';
    empty.style.display = 'flex';
    empty.innerHTML = `<i class="fas fa-exclamation-triangle"></i><p>Gagal terhubung ke server</p>`;
    console.error('Error loading daily items:', err);
  }
}

function openProductModal() {
  const modal = document.getElementById('productModal');
  modal.classList.add('show');
  loadProductList();
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('show');
}

async function loadHistory(dateFilter = null) {
  const loading = document.getElementById('historyLoading');
  const wrapper = document.getElementById('historyTableWrapper');
  const tbody = document.getElementById('historyBody');
  const empty = document.getElementById('historyEmpty');

  loading.classList.add('show');
  wrapper.style.display = 'none';
  empty.style.display = 'none';

  try {
    // Build URL dengan optional date filter
    let url = '/api/transactions';
    if (dateFilter) {
      url += `?date=${dateFilter}`;
    }

    const res = await fetch(url);
    const result = await res.json();

    loading.classList.remove('show');

    if (result.success && result.data.length > 0) {
      wrapper.style.display = 'block';
      tbody.innerHTML = result.data.map(tx => {
        const date = new Date(tx.created_at).toLocaleDateString('id-ID', {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });
        const methodClass = tx.payment_method === 'cash' ? 'cash' : 'qris';
        const methodIcon = tx.payment_method === 'cash' ? 'fa-money-bill-wave' : 'fa-qrcode';
        return `
          <tr>
            <td><strong>#${tx.invoice_number}</strong></td>
            <td>${date}</td>
            <td>Rp ${Number(tx.total_amount).toLocaleString('id-ID')}</td>
            <td>
              <span class="badge-method ${methodClass}">
                <i class="fas ${methodIcon}"></i>
                ${tx.payment_method === 'cash' ? 'Tunai' : 'QRIS'}
              </span>
            </td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:nowrap">
                <button class="btn-history-detail" onclick="event.stopPropagation(); viewTransaction(${tx.id})">
                  <i class="fas fa-receipt"></i> Detail
                </button>
                <button class="btn-history-print" onclick="event.stopPropagation(); viewTransaction(${tx.id})" title="Cetak Ulang Struk">
                  <i class="fas fa-print"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      loading.classList.remove('show');
      wrapper.style.display = 'block';
      empty.style.display = 'flex';
    }
  } catch (err) {
    loading.classList.remove('show');
    wrapper.style.display = 'block';
    empty.style.display = 'flex';
    empty.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i>
      <p>Gagal memuat riwayat transaksi</p>
      <small style="color:var(--gray-400)">${err.message}</small>
    `;
    console.error('Error loading history:', err);
  }
}

function filterHistory() {
  const q = document.getElementById('historySearch').value.toLowerCase();
  const rows = document.querySelectorAll('#historyBody tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
}

function refreshHistory() {
  document.getElementById('historySearch').value = '';
  loadHistory();
}

async function viewTransaction(id) {
  try {
    const res = await fetch(`/api/transactions/${id}`);
    const result = await res.json();

    if (result.success) {
      state.lastTransaction = result.data;
      showReceipt(result.data);
      closeHistory();
    } else {
      showToast('Gagal memuat detail transaksi', 'error');
      console.error('Server response:', result);
    }
  } catch (err) {
    showToast('Gagal terhubung ke server', 'error');
    console.error('Error fetching transaction detail:', err);
  }
}

// ====== PRODUCT MANAGEMENT CRUD ======

async function loadProductList() {
  const loading = document.getElementById('productMgmtLoading');
  const wrapper = document.getElementById('productMgmtTableWrapper');
  const tbody = document.getElementById('productMgmtBody');
  const empty = document.getElementById('productMgmtEmpty');

  if (!loading || !wrapper) return;

  loading.classList.add('show');
  wrapper.style.display = 'none';

  try {
    const res = await fetch('/api/products');
    const result = await res.json();

    loading.classList.remove('show');

    if (result.success && result.data.length > 0) {
      wrapper.style.display = 'block';
      empty.style.display = 'none';
      tbody.innerHTML = result.data.map((p, i) => {
        let stockClass = 'ready';
        let stockLabel = p.stock;
        if (p.stock <= 0) { stockClass = 'out'; stockLabel = 'Habis'; }
        else if (p.stock <= 5) { stockClass = 'low'; stockLabel = `${p.stock} (menipis)`; }

        const imgHtml = p.image_url
          ? `<img src="${p.image_url}" alt="${p.name}" class="mgmt-product-img" />`
          : `<div class="mgmt-product-img-placeholder"><i class="fas fa-box-open"></i></div>`;

        return `
          <tr>
            <td>${imgHtml}</td>
            <td><strong>${p.name}</strong></td>
            <td><span style="color:var(--primary);font-weight:600;font-size:11px">${p.category}</span></td>
            <td>Rp ${Number(p.price).toLocaleString('id-ID')}</td>
            <td><span class="badge-stock ${stockClass}">${stockLabel}</span></td>
            <td>
              <button class="btn-product-action edit" onclick="openEditProduct(${p.id})">
                <i class="fas fa-pen"></i> Edit
              </button>
              <button class="btn-product-action delete" onclick="deleteProduct(${p.id}, '${p.name.replace(/'/g, "\\'")}')">
                <i class="fas fa-trash"></i> Hapus
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      loading.classList.remove('show');
      wrapper.style.display = 'block';
      empty.style.display = 'flex';
    }
  } catch (err) {
    loading.classList.remove('show');
    wrapper.style.display = 'block';
    empty.style.display = 'flex';
    empty.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i>
      <p>Gagal memuat produk</p>
      <small style="color:var(--gray-400)">${err.message}</small>
    `;
    console.error('Error loading products:', err);
  }
}

function filterProductMgmt() {
  const q = document.getElementById('productMgmtSearch').value.toLowerCase();
  const rows = document.querySelectorAll('#productMgmtBody tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
}

function formatCurrencyInput(el) {
  let val = el.value.replace(/[^\d]/g, '');
  if (val === '') {
    el.value = '';
    return;
  }
  el.value = Number(val).toLocaleString('id-ID');
}

function openAddProduct() {
  clearFileInput();
  document.getElementById('productFormTitle').innerHTML = '<i class="fas fa-plus-circle"></i> Tambah Produk Baru';
  document.getElementById('pfSubmitText').textContent = 'Simpan';
  document.getElementById('productForm').reset();
  document.getElementById('pfEditId').value = '';
  document.getElementById('productFormModal').classList.add('show');
}

// Set nilai kategori pada <select id="pfCategory"> secara robust:
// cocokkan case-insensitive, dan jika kategori produk belum ada di daftar opsi,
// tambahkan opsi baru otomatis agar dropdown tidak pernah tampil kosong.
function setCategoryValue(category) {
  const select = document.getElementById('pfCategory');
  const raw = (category || '').trim();

  if (!raw) {
    select.value = '';
    return;
  }

  // 1) Coba set langsung (case-sensitive)
  select.value = raw;

  // 2) Jika tidak ada opsi yang cocok (value jadi kosong/blank),
  //    cari opsi yang cocok secara case-insensitive
  if (select.value !== raw) {
    const match = Array.from(select.options)
      .find(opt => opt.value.toLowerCase() === raw.toLowerCase());
    if (match) {
      select.value = match.value;
      return;
    }

    // 3) Fallback: tambahkan opsi baru untuk kategori ini agar tidak blank
    const opt = document.createElement('option');
    opt.value = raw;
    opt.textContent = raw;
    select.add(opt);
    select.value = raw;
  }
}

async function openEditProduct(id) {
  try {
    const res = await fetch(`/api/products/${id}`);
    const result = await res.json();

    if (result.success) {
      const p = result.data;
      document.getElementById('productFormTitle').innerHTML = '<i class="fas fa-pen"></i> Edit Produk';
      document.getElementById('pfSubmitText').textContent = 'Perbarui';
      document.getElementById('pfBarcode').value = p.barcode || '';
      document.getElementById('pfName').value = p.name;
      setCategoryValue(p.category);
      document.getElementById('pfPrice').value = Number(p.price).toLocaleString('id-ID');
      document.getElementById('pfStock').value = p.stock;
      // Set existing image preview
      const existingImage = p.image_url || '';
      document.getElementById('pfEditId').value = p.id;

      // Show image preview if there's an existing image
      if (existingImage) {
        const preview = document.getElementById('filePreview');
        const previewImg = document.getElementById('filePreviewImg');
        previewImg.src = existingImage;
        preview.style.display = 'flex';
      }
      document.getElementById('productFormModal').classList.add('show');
    } else {
      showToast('Gagal memuat data produk', 'error');
    }
  } catch (err) {
    showToast('Gagal terhubung ke server', 'error');
    console.error(err);
  }
}

function closeProductForm() {
  document.getElementById('productFormModal').classList.remove('show');
  // Reset file input setelah modal ditutup
  setTimeout(clearFileInput, 300);
}

function clearFileInput() {
  const fileInput = document.getElementById('productImage');
  fileInput.value = '';
  const preview = document.getElementById('filePreview');
  preview.style.display = 'none';
  document.getElementById('filePreviewImg').src = '';
}

// Preview gambar sebelum upload
function previewFileInput(input) {
  const preview = document.getElementById('filePreview');
  const previewImg = document.getElementById('filePreviewImg');

  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      previewImg.src = e.target.result;
      preview.style.display = 'flex';
    };
    reader.readAsDataURL(input.files[0]);
  }
}

async function saveProductForm() {
  const editId = document.getElementById('pfEditId').value;
  const isEdit = !!editId;

  const barcode = document.getElementById('pfBarcode').value.trim();
  const name = document.getElementById('pfName').value.trim();
  const category = document.getElementById('pfCategory').value.trim() || 'Umum';
  const priceRaw = document.getElementById('pfPrice').value.replace(/[^\d]/g, '');
  const stock = parseInt(document.getElementById('pfStock').value) || 0;
  const imageFile = document.getElementById('productImage').files[0];

  if (!name) {
    showToast('Nama produk harus diisi', 'error');
    document.getElementById('pfName').focus();
    return;
  }

  if (!barcode) {
    showToast('Barcode harus diisi', 'error');
    document.getElementById('pfBarcode').focus();
    return;
  }

  if (!priceRaw || parseInt(priceRaw) <= 0) {
    showToast('Harga harus diisi dengan valid', 'error');
    document.getElementById('pfPrice').focus();
    return;
  }

  const price = parseInt(priceRaw);
  const url = isEdit ? `/api/products/${editId}` : '/api/products';
  const method = isEdit ? 'PUT' : 'POST';

  const formData = new FormData();
  formData.append('barcode', barcode);
  formData.append('name', name);
  formData.append('category', category);
  formData.append('price', price);
  formData.append('stock', stock);
  if (imageFile) {
    formData.append('image', imageFile);
  }

  try {
    const res = await fetch(url, {
      method,
      body: formData
    });

    const result = await res.json();

    if (result.success) {
      showToast(isEdit ? 'Produk berhasil diperbarui' : 'Produk berhasil ditambahkan');
      closeProductForm();
      document.getElementById('productMgmtSearch').value = '';
      loadProductList();
      // Refresh halaman utama setelah 1 detik agar data produk di grid ikut terupdate
      setTimeout(() => location.reload(), 1200);
    } else {
      showToast(result.message || 'Gagal menyimpan produk', 'error');
    }
  } catch (err) {
    showToast('Gagal terhubung ke server', 'error');
    console.error(err);
  }
}

async function deleteProduct(id, name) {
  const swalResult = await Swal.fire({
    title: 'Hapus Produk?',
    text: `Apakah Anda yakin ingin menghapus produk "${name}"?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#6b7280',
    confirmButtonText: 'Ya, Hapus!',
    cancelButtonText: 'Batal'
  });

  if (!swalResult.isConfirmed) return;

  try {
    const res = await fetch(`/api/products/${id}`, {
      method: 'DELETE'
    });

    const result = await res.json();

    if (result.success) {
      showToast(`Produk "${name}" berhasil dihapus`);
      loadProductList();
      // Refresh halaman utama setelah 1 detik agar data produk di grid ikut terupdate
      setTimeout(() => location.reload(), 1200);
    } else {
      showToast(result.message || 'Gagal menghapus produk', 'error');
    }
  } catch (err) {
    showToast('Gagal terhubung ke server', 'error');
    console.error(err);
  }
}

// ====== PRODUCT SEARCH & FILTER ======

function filterCategory(category) {
  $$('.category-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === category);
  });

  const cards = $$('.product-card');
  cards.forEach(card => {
    if (category === 'Semua' || card.dataset.category === category) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });
}

function searchProducts(query) {
  const q = query.toLowerCase().trim();
  const cards = $$('.product-card');

  cards.forEach(card => {
    const name = card.querySelector('.product-name').textContent.toLowerCase();
    const category = card.dataset.category.toLowerCase();

    if (name.includes(q) || category.includes(q)) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });
}

function clearSearch() {
  searchInput.value = '';
  searchProducts('');
  searchInput.focus();
}

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    searchInput.blur();
  }
});

// ====== KEYBOARD HOTKEYS ======

document.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if (e.key === 'F2') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }

  if (e.key === 'F4') {
    e.preventDefault();
    if (state.cart.length > 0) {
      processPayment();
    }
    return;
  }

  if (e.key === 'Escape') {
    if (qrisModal.classList.contains('show')) {
      closeQRIS();
    }
    if (receiptModal.classList.contains('show')) {
      closeReceipt();
    }
    if (document.getElementById('historyModal')?.classList.contains('show')) {
      closeHistory();
    }
    if (document.getElementById('productModal')?.classList.contains('show')) {
      closeProductModal();
    }
    if (document.getElementById('productFormModal')?.classList.contains('show')) {
      closeProductForm();
    }
    if (document.getElementById('stockAdjustModal')?.classList.contains('show')) {
      closeStockAdjust();
    }
    if (document.getElementById('stockHistoryModal')?.classList.contains('show')) {
      closeStockHistory();
    }
    return;
  }

  if (e.key === 'Enter' && e.target === searchInput) {
    const visibleCards = $$('.product-card:not([style*="display: none"]):not(.product-disabled)');
    if (visibleCards.length > 0) {
      const btn = visibleCards[0].querySelector('.btn-add-cart');
      if (btn && !btn.disabled) {
        btn.click();
      }
    }
  }
});

// ====== CLICK ON PRODUCT CARD ======
// Catatan: Tombol .btn-add-cart sudah punya onclick sendiri.
// Listener global ini hanya menangani klik di area kartu di luar tombol.
productGrid.addEventListener('click', (e) => {
  const card = e.target.closest('.product-card');
  if (!card) return;
  if (card.classList.contains('product-disabled')) return;
  // Jika klik berasal dari tombol .btn-add-cart, jangan dipicu dua kali
  if (e.target.closest('.btn-add-cart')) return;
  const btn = card.querySelector('.btn-add-cart');
  if (btn && !btn.disabled) {
    btn.click();
  }
});

// ====== SEARCH INPUT ======
searchInput.addEventListener('input', (e) => {
  searchProducts(e.target.value);
});

// ====== DAILY REPORT ======

async function loadDailyReport() {
  const loading = document.getElementById('dailySummaryLoading');
  const content = document.getElementById('dailySummaryContent');
  const revenueEl = document.getElementById('dailyRevenue');
  const txCountEl = document.getElementById('dailyTransactions');

  if (!loading || !content) return;

  loading.style.display = 'flex';
  content.style.display = 'none';

  try {
    const res = await fetch('/api/reports/daily');
    const result = await res.json();

    if (result.success) {
      revenueEl.textContent = `Rp ${Number(result.data.total_revenue).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
      txCountEl.textContent = result.data.total_transactions;
    } else {
      revenueEl.textContent = 'Rp 0';
      txCountEl.textContent = '0';
    }
    content.style.display = 'flex';
  } catch (err) {
    console.error('Error loading daily report:', err);
    revenueEl.textContent = 'Rp 0';
    txCountEl.textContent = '0';
    content.style.display = 'flex';
  } finally {
    loading.style.display = 'none';
  }
}

// ====== INCOME REPORT MODAL ======

let currentIncomePeriod = 'daily';

function openIncomeModal() {
  const modal = document.getElementById('incomeModal');
  modal.classList.add('show');
  switchIncomeTab('daily');
}

function closeIncomeModal() {
  document.getElementById('incomeModal').classList.remove('show');
}

function switchIncomeTab(period) {
  currentIncomePeriod = period;

  // Update tab active state
  document.querySelectorAll('.income-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.period === period);
  });

  loadIncomeReport(period);
}

async function loadIncomeReport(period) {
  const loading = document.getElementById('incomeLoading');
  const detail = document.getElementById('incomeDetail');
  const tbody = document.getElementById('incomeTableBody');
  const empty = document.getElementById('incomeEmpty');
  const titleEl = document.getElementById('incomeDetailTitle');

  loading.classList.add('show');
  detail.style.display = 'none';

  const periodLabels = {
    daily: 'Rincian Harian (30 hari terakhir)',
    monthly: 'Rincian Bulanan (12 bulan terakhir)',
    yearly: 'Rincian Tahunan'
  };
  if (titleEl) titleEl.textContent = periodLabels[period] || 'Rincian';

  try {
    const res = await fetch(`/api/reports/income?period=${period}`);
    const result = await res.json();

    loading.classList.remove('show');

    if (result.success) {
      // Update stat cards
      const summary = result.data.summary;
      document.getElementById('incomeTotalRevenue').textContent = `Rp ${Number(summary.total_revenue).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
      document.getElementById('incomeTotalTx').textContent = summary.total_transactions;

      const topPayLabel = summary.top_payment.method === 'cash'
        ? 'Tunai'
        : summary.top_payment.method === 'qris'
          ? 'QRIS'
          : '-';
      document.getElementById('incomeTopPayment').textContent = topPayLabel !== '-'
        ? `${topPayLabel} (${summary.top_payment.count} tx)`
        : '-';

      // Render detail table
      if (result.data.details && result.data.details.length > 0) {
        detail.style.display = 'block';
        empty.style.display = 'none';
        tbody.innerHTML = result.data.details.map(d => {
          let periodLabel = d.label_display;
          // For daily: show '24 Jul 2026' format already from label_display
          // For monthly: 'July 2026'
          // For yearly: 'Tahun 2026'
          // Hanya tambahkan onclick untuk periode harian (drill-down ke rincian per produk)
          // Mengirim 2 parameter: rawDate (YYYY-MM-DD) untuk API, displayDate (DD MMM YYYY) untuk judul modal
          const isDaily = currentIncomePeriod === 'daily';
          const rowAttrs = isDaily
            ? `class="income-row-clickable" onclick="showDailyItems('${d.label}', '${periodLabel}')" title="Lihat rincian penjualan tanggal ${periodLabel}"`
            : '';
          return `
            <tr ${rowAttrs}>
              <td><strong>${periodLabel}</strong></td>
              <td>${d.transaction_count}</td>
              <td class="income-td-revenue">Rp ${Number(d.revenue).toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
            </tr>
          `;
        }).join('');
      } else {
        detail.style.display = 'block';
        empty.style.display = 'flex';
        tbody.innerHTML = '';
      }
    } else {
      loading.classList.remove('show');
      detail.style.display = 'block';
      empty.style.display = 'flex';
      empty.innerHTML = `<i class="fas fa-exclamation-triangle"></i><p>${result.message || 'Gagal memuat laporan'}</p>`;
      console.error('Income report error:', result);
    }
  } catch (err) {
    loading.classList.remove('show');
    detail.style.display = 'block';
    empty.style.display = 'flex';
    empty.innerHTML = `<i class="fas fa-exclamation-triangle"></i><p>Gagal terhubung ke server</p>`;
    console.error('Error loading income report:', err);
  }
}

// ====== STOCK ADJUSTMENT FUNCTIONS ======

function openStockAdjustment() {
  const modal = document.getElementById('stockAdjustModal');
  if (!modal) return;
  document.getElementById('stockAdjustForm').reset();
  document.getElementById('saStockHint').style.display = 'none';
  modal.classList.add('show');
  document.getElementById('saProduct').focus();
}

function closeStockAdjust() {
  document.getElementById('stockAdjustModal').classList.remove('show');
}

// Live stock hint when product selected
document.addEventListener('change', function(e) {
  if (e.target.id === 'saProduct') {
    const sel = e.target;
    const opt = sel.options[sel.selectedIndex];
    if (opt && opt.value) {
      const stock = opt.dataset.stock || 0;
      document.getElementById('saStockAvailable').textContent = stock;
      document.getElementById('saStockHint').style.display = 'block';
      document.getElementById('saQtyLost').max = stock;
    } else {
      document.getElementById('saStockHint').style.display = 'none';
    }
  }
});

async function saveStockAdjustment() {
  const productId = document.getElementById('saProduct').value;
  const qtyLost = parseInt(document.getElementById('saQtyLost').value);
  const reason = document.getElementById('saReason').value;
  const note = document.getElementById('saNote').value.trim();

  if (!productId) {
    showToast('Silakan pilih produk', 'error');
    document.getElementById('saProduct').focus();
    return;
  }
  if (!qtyLost || qtyLost <= 0) {
    showToast('Jumlah berkurang harus lebih dari 0', 'error');
    document.getElementById('saQtyLost').focus();
    return;
  }
  if (!reason) {
    showToast('Silakan pilih alasan', 'error');
    document.getElementById('saReason').focus();
    return;
  }

  const btn = document.getElementById('saSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

  try {
    const res = await fetch('/api/stock-adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, qty_lost: qtyLost, reason, note })
    });
    const result = await res.json();

    if (result.success) {
      showToast(result.message);
      closeStockAdjust();

      // Simpan penyesuaian stok ke localStorage (demo mode)
      if (isDemoMode()) {
        appendAdjustmentToLS(result.data);
        // Kurangi stok produk di localStorage langsung
        updateProductStockInLS(parseInt(productId), -qtyLost);
        // Sync ke server agar stok & riwayat penyesuaian up-to-date
        syncAllDemoDataToServer();
      }

      fetchProducts();
      loadDailyReport();
    } else {
      showToast(result.message || 'Gagal menyimpan penyesuaian stok', 'error');
    }
  } catch (err) {
    showToast('Gagal terhubung ke server', 'error');
    console.error('Stock adjustment error:', err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Simpan Penyesuaian';
  }
}

function openStockHistory() {
  const modal = document.getElementById('stockHistoryModal');
  if (!modal) return;
  modal.classList.add('show');
  loadStockAdjustments();
}

function closeStockHistory() {
  document.getElementById('stockHistoryModal').classList.remove('show');
}

async function loadStockAdjustments() {
  const loading = document.getElementById('stockHistoryLoading');
  const wrapper = document.getElementById('stockHistoryTableWrapper');
  const tbody = document.getElementById('stockHistoryBody');
  const empty = document.getElementById('stockHistoryEmpty');

  loading.style.display = 'flex';
  wrapper.style.display = 'none';

  try {
    const res = await fetch('/api/stock-adjustments');
    const result = await res.json();

    loading.style.display = 'none';

    if (result.success && result.data.length > 0) {
      document.getElementById('stockTotalLoss').textContent =
        `Rp ${Number(result.total_loss).toLocaleString('id-ID')}`;

      let totalQty = 0;
      result.data.forEach(a => { totalQty += a.qty_lost; });
      document.getElementById('stockTotalItems').textContent = totalQty.toLocaleString('id-ID');
      document.getElementById('stockTotalEvents').textContent = result.data.length.toLocaleString('id-ID');

      wrapper.style.display = 'block';
      empty.style.display = 'none';

      tbody.innerHTML = result.data.map(a => {
        const date = new Date(a.created_at).toLocaleDateString('id-ID', {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });

        let reasonClass = '';
        if (a.reason === 'Hilang/Kemalingan') reasonClass = 'reason-loss';
        else if (a.reason === 'Rusak/Kadaluarsa') reasonClass = 'reason-damage';
        else if (a.reason === 'Selisih Hitung') reasonClass = 'reason-diff';
        else reasonClass = 'reason-other';

        const reasonIcon = a.reason === 'Hilang/Kemalingan' ? 'fa-person-walking-arrow-right' :
          a.reason === 'Rusak/Kadaluarsa' ? 'fa-triangle-exclamation' :
          a.reason === 'Selisih Hitung' ? 'fa-scale-balanced' : 'fa-question';

        return `
          <tr>
            <td class="stock-td-date">${date}</td>
            <td><strong>${a.product_name}</strong></td>
            <td class="stock-td-qty">
              <span class="stock-qty-badge">-${a.qty_lost}</span>
            </td>
            <td><span class="stock-reason-badge ${reasonClass}"><i class="fas ${reasonIcon}"></i> ${a.reason}</span></td>
            <td class="stock-td-note">${a.note || '-'}</td>
            <td class="stock-td-loss">Rp ${Number(a.estimated_loss).toLocaleString('id-ID')}</td>
          </tr>
        `;
      }).join('');
    } else {
      loading.style.display = 'none';
      wrapper.style.display = 'block';
      empty.style.display = 'flex';
      document.getElementById('stockTotalLoss').textContent = 'Rp 0';
      document.getElementById('stockTotalItems').textContent = '0';
      document.getElementById('stockTotalEvents').textContent = '0';
    }
  } catch (err) {
    loading.style.display = 'none';
    wrapper.style.display = 'block';
    empty.style.display = 'flex';
    empty.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i>
      <p>Gagal memuat riwayat</p>
      <small style="color:var(--gray-400)">${err.message}</small>
    `;
    console.error('Error loading stock adjustments:', err);
  }
}

// ====== INIT ======
document.addEventListener('DOMContentLoaded', () => {
  searchInput.focus();
  updatePayButton();
  loadDailyReport();

  // Sinkronisasi localStorage untuk mode demo — localStorage = single source of truth
  if (isDemoMode()) {
    const savedProducts = loadProductsFromLocalStorage();
    const savedTransactions = loadTransactionsFromLocalStorage();
    const savedDetails = loadTransactionDetailsFromLocalStorage();
    const savedAdjustments = loadAdjustmentsFromLocalStorage();

    if (savedProducts && savedProducts.length > 0) {
      // Ada data tersimpan — sync SEMUA data ke server agar laporan & riwayat akurat
      syncAllDemoDataToServer();
      updateProductGrid(savedProducts);
    } else {
      // Pertama kali — ambil data dari kartu yang di-render server, simpan ke localStorage
      const cards = document.querySelectorAll('.product-card');
      const products = [];
      cards.forEach(card => {
        products.push({
          id: parseInt(card.dataset.id),
          name: card.querySelector('.product-name').textContent,
          category: card.dataset.category,
          price: parseInt(card.querySelector('.product-price').textContent.replace(/[^\d]/g, '')),
          stock: parseInt(card.dataset.stock),
          image_url: card.querySelector('img') ? card.querySelector('img').src : null,
          barcode: ''
        });
      });
      saveProductsToLocalStorage(products);
      // Simpan juga transaksi awal dari server ke localStorage
      fetch('/api/transactions').then(r => r.json()).then(result => {
        if (result.success && result.data) {
          saveTransactionsToLocalStorage(result.data);
          // Ambil detail untuk setiap transaksi
          result.data.forEach(tx => {
            fetch(`/api/transactions/${tx.id}`).then(r => r.json()).then(detailResult => {
              if (detailResult.success && detailResult.data && detailResult.data.items) {
                appendTransactionDetailsToLS(tx.id, detailResult.data.items);
              }
            }).catch(() => {});
          });
        }
      }).catch(() => {});
      fetch('/api/stock-adjustments').then(r => r.json()).then(result => {
        if (result.success && result.data) {
          saveAdjustmentsToLocalStorage(result.data);
        }
      }).catch(() => {});
    }
  }
});
