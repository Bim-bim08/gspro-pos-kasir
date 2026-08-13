const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET / - Halaman utama POS
router.get('/', async (req, res) => {
  try {
    const [categories] = await pool.query(
      'SELECT DISTINCT category FROM products ORDER BY category'
    );
    
    const [products] = await pool.query(
      'SELECT * FROM products ORDER BY category, name'
    );

    res.render('index', {
      title: 'Gspro - POS Kasir',
      categories: categories.map(c => c.category),
      products
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
    
    // Tetap render halaman dengan data kosong
    res.render('index', {
      title: 'Gspro - POS Kasir',
      categories: [],
      products: []
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

module.exports = router;
