const express = require('express');
const router = express.Router();
const pool = require('../db');
const { isDbFallback } = require('../db');
const { MOCK_CATEGORIES, MOCK_PRODUCTS, MOCK_TRANSACTIONS, MOCK_TRANSACTION_DETAILS, MOCK_STOCK_ADJUSTMENTS } = require('../fallbackData');

// GET / - Halaman utama POS
router.get('/', async (req, res) => {
  try {
    // Jika dalam mode DB_FALLBACK, gunakan data mock
    if (isDbFallback()) {
      return res.render('index', {
        title: 'Gspro - POS Kasir (Demo Mode)',
        categories: MOCK_CATEGORIES,
        products: MOCK_PRODUCTS,
        isDemo: true
      });
    }

    const [categories] = await pool.query(
      'SELECT DISTINCT category FROM products ORDER BY category'
    );
    
    const [products] = await pool.query(
      'SELECT * FROM products ORDER BY category, name'
    );

    res.render('index', {
      title: 'Gspro - POS Kasir',
      categories: categories.map(c => c.category),
      products,
      isDemo: false
    });
  } catch (err) {
    // Log error lengkap ke terminal VS Code
    console.error('');
    console.error('========================================');
    console.error('❌ ERROR LOADING POS PAGE');
    console.error('========================================');
    console.error('Message :', err.message);
    console.error('Code    :', err.code || 'N/A');
    console.error('Errno   :', err.errno || 'N/A');
    console.error('SQL     :', err.sql || 'N/A');
    console.error('Stack   :', err.stack);
    console.error('========================================');
    console.error('');
    
    // Tetap render halaman dengan data mock
    res.render('index', {
      title: 'Gspro - POS Kasir (Demo Mode)',
      categories: MOCK_CATEGORIES,
      products: MOCK_PRODUCTS,
      isDemo: true
    });
  }
});

// GET /struk/:invoice - Halaman struk/nota
router.get('/struk/:invoice', async (req, res) => {
  try {
    const [transactions] = await pool.query(
      'SELECT * FROM transactions WHERE invoice_number = ?',
      [req.params.invoice]
    );

    if (transactions.length === 0) {
      return res.status(404).send('Struk tidak ditemukan');
    }

    // JOIN dengan products untuk ambil nama produk sebagai product_name
    const [details] = await pool.query(
      `SELECT td.*, p.name AS product_name
       FROM transaction_details td
       JOIN products p ON p.id = td.product_id
       WHERE td.transaction_id = ?`,
      [transactions[0].id]
    );

    res.render('receipt', {
      title: 'Struk Belanja',
      transaction: transactions[0],
      details
    });
  } catch (err) {
    console.error('Error loading receipt:', err.message);
    res.status(500).send('Gagal memuat struk');
  }
});

// POST /api/demo/sync - Sinkronisasi komprehensif dari localStorage client ke server
// Mengembalikan semua data (produk, transaksi, detail, penyesuaian stok) saat cold-start
router.post('/api/demo/sync', async (req, res) => {
  if (!isDbFallback()) {
    return res.status(400).json({ success: false, message: 'Sinkronisasi hanya berlaku untuk mode demo' });
  }

  const { products, transactions, transactionDetails, stockAdjustments } = req.body;

  // Sinkronisasi Produk
  if (products && Array.isArray(products)) {
    MOCK_PRODUCTS.length = 0;
    products.forEach(p => {
      MOCK_PRODUCTS.push({
        id: p.id,
        barcode: p.barcode || `MOCK${String(p.id).padStart(3, '0')}`,
        name: p.name,
        category: p.category || 'Umum',
        price: Number(p.price) || 0,
        stock: Number(p.stock) || 0,
        image_url: p.image_url || null
      });
    });

    // Update kategori
    const cats = new Set(MOCK_PRODUCTS.map(p => p.category));
    MOCK_CATEGORIES.length = 0;
    cats.forEach(c => MOCK_CATEGORIES.push(c));
  }

  // Sinkronisasi Transaksi
  if (transactions && Array.isArray(transactions)) {
    MOCK_TRANSACTIONS.length = 0;
    transactions.forEach(t => {
      MOCK_TRANSACTIONS.push({
        id: t.id,
        invoice_number: t.invoice_number,
        payment_method: t.payment_method,
        subtotal: Number(t.subtotal) || 0,
        discount_type: t.discount_type || null,
        discount_value: Number(t.discount_value) || 0,
        discount_amount: Number(t.discount_amount) || 0,
        total_amount: Number(t.total_amount) || 0,
        cash_paid: Number(t.cash_paid) || 0,
        change_amount: Number(t.change_amount) || 0,
        created_at: t.created_at || new Date().toISOString()
      });
    });
  }

  // Sinkronisasi Detail Transaksi
  if (transactionDetails && typeof transactionDetails === 'object') {
    Object.keys(MOCK_TRANSACTION_DETAILS).forEach(k => delete MOCK_TRANSACTION_DETAILS[k]);
    Object.entries(transactionDetails).forEach(([txId, details]) => {
      MOCK_TRANSACTION_DETAILS[txId] = details.map(d => ({
        id: d.id,
        product_id: d.product_id,
        product_name: d.product_name,
        qty: d.qty,
        price: Number(d.price) || 0,
        subtotal: Number(d.subtotal) || 0
      }));
    });
  }

  // Sinkronisasi Penyesuaian Stok
  if (stockAdjustments && Array.isArray(stockAdjustments)) {
    MOCK_STOCK_ADJUSTMENTS.length = 0;
    stockAdjustments.forEach(a => {
      MOCK_STOCK_ADJUSTMENTS.push({
        id: a.id,
        product_id: a.product_id,
        product_name: a.product_name,
        product_price: Number(a.product_price) || 0,
        qty_lost: a.qty_lost,
        reason: a.reason,
        note: a.note || null,
        created_at: a.created_at || new Date().toISOString(),
        estimated_loss: Number(a.estimated_loss) || 0
      });
    });
  }

  console.log(`🔄 Demo data disinkronkan: ${MOCK_PRODUCTS.length} produk, ${MOCK_TRANSACTIONS.length} transaksi, ${MOCK_STOCK_ADJUSTMENTS.length} penyesuaian stok`);
  res.json({ success: true, message: 'Semua data demo berhasil disinkronkan' });
});

module.exports = router;
