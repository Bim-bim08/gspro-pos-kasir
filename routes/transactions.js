const express = require('express');
const router = express.Router();
const pool = require('../db');

// Fungsi generate nomor invoice
async function generateInvoice() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const prefix = `INV/${y}${m}${d}/`;

  const [rows] = await pool.query(
    'SELECT COUNT(*) as count FROM transactions WHERE invoice_number LIKE ?',
    [`${prefix}%`]
  );

  const seq = String(rows[0].count + 1).padStart(4, '0');
  return `${prefix}GS/${seq}`;
}

// POST /api/transactions - Proses pembayaran
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { items, payment_method, cash_paid, discount_type, discount_value, discount_amount } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Keranjang belanja kosong' });
    }

    await connection.beginTransaction();

    // Hitung subtotal
    let subtotal = 0;
    const itemDetails = [];

    for (const item of items) {
      const [products] = await connection.query(
        'SELECT id, name, price, stock FROM products WHERE id = ?',
        [item.product_id]
      );

      if (products.length === 0) {
        throw new Error(`Produk ID ${item.product_id} tidak ditemukan`);
      }

      const product = products[0];
      const qty = parseInt(item.qty) || 1;

      if (product.stock < qty) {
        throw new Error(`Stok ${product.name} tidak mencukupi (tersisa: ${product.stock})`);
      }

      const itemSubtotal = product.price * qty;
      subtotal += itemSubtotal;

      itemDetails.push({
        product_id: product.id,
        product_name: product.name,
        qty,
        price: product.price,
        subtotal: itemSubtotal
      });

      // Kurangi stok
      await connection.query(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [qty, product.id]
      );
    }

    // Hitung diskon — default 0.00 / null jika kosong
    const discAmount = Math.round((parseFloat(discount_amount) || 0) * 100) / 100;
    const discType = discount_type || null;
    const discValue = Math.round((parseFloat(discount_value) || 0) * 100) / 100;

    // Hitung total akhir = subtotal - diskon (tanpa PPN)
    const totalAmount = subtotal - discAmount;

    // Generate invoice number
    const invoiceNumber = await generateInvoice();

    // Simpan transaksi
    let cashPaid = null;
    let changeAmount = null;

    if (payment_method === 'cash') {
      cashPaid = parseFloat(cash_paid) || 0;
      changeAmount = Math.round((cashPaid - totalAmount) * 100) / 100;

      if (changeAmount < 0) {
        throw new Error('Uang yang dibayarkan kurang');
      }
    }

    if (payment_method === 'qris') {
      cashPaid = Math.round(totalAmount * 100) / 100;
      changeAmount = 0;
    }

    // Fallback: pastikan tidak ada nilai null/undefined
    cashPaid = cashPaid ?? 0;
    changeAmount = changeAmount ?? 0;

    const [txResult] = await connection.query(
      `INSERT INTO transactions (invoice_number, payment_method, subtotal, discount_type, discount_value, discount_amount, total_amount, cash_paid, change_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceNumber, payment_method, Math.round(subtotal * 100) / 100, discType, discValue, discAmount, Math.round(totalAmount * 100) / 100, cashPaid, changeAmount]
    );

    const transactionId = txResult.insertId;

    // Simpan detail transaksi
    for (const detail of itemDetails) {
      await connection.query(
        `INSERT INTO transaction_details (transaction_id, product_id, qty, price, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [transactionId, detail.product_id, detail.qty, detail.price, detail.subtotal]
      );
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      data: {
        transaction_id: transactionId,
        invoice_number: invoiceNumber,
        subtotal: Math.round(subtotal * 100) / 100,
        discount_type: discType,
        discount_value: discValue,
        discount_amount: discAmount,
        total_amount: Math.round(totalAmount * 100) / 100,
        payment_method,
        cash_paid: cashPaid,
        change_amount: changeAmount,
        items: itemDetails
      }
    });

  } catch (err) {
    await connection.rollback();
    console.error('Transaction error:', err.message);
    res.status(400).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
});

// GET /api/transactions - Riwayat transaksi
// Mendukung query parameter ?date=YYYY-MM-DD untuk filter berdasarkan tanggal
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    let query;
    let params;

    if (date) {
      query = 'SELECT * FROM transactions WHERE DATE(created_at) = ? ORDER BY created_at DESC LIMIT 50';
      params = [date];
    } else {
      query = 'SELECT * FROM transactions ORDER BY created_at DESC LIMIT 50';
      params = [];
    }

    const [transactions] = await pool.query(query, params);
    res.json({ success: true, data: transactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/transactions/:id
// Menerima ID numerik (integer) atau invoice_number (string)
router.get('/:id', async (req, res) => {
  try {
    const param = req.params.id;
    let transaction;

    // Coba cari berdasarkan ID numerik dulu
    const idNum = parseInt(param);
    if (!isNaN(idNum) && String(idNum) === param) {
      const [rows] = await pool.query(
        'SELECT * FROM transactions WHERE id = ?',
        [idNum]
      );
      transaction = rows[0];
    }

    // Jika tidak ketemu, coba cari berdasarkan invoice_number
    if (!transaction) {
      const [rows] = await pool.query(
        'SELECT * FROM transactions WHERE invoice_number = ?',
        [param]
      );
      transaction = rows[0];
    }

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan' });
    }

    // JOIN dengan products untuk ambil nama produk sebagai product_name
    const [details] = await pool.query(
      `SELECT td.id, td.product_id, p.name AS product_name, td.price, td.qty, td.subtotal
       FROM transaction_details td
       JOIN products p ON p.id = td.product_id
       WHERE td.transaction_id = ?
       ORDER BY td.id ASC`,
      [transaction.id]
    );

    res.json({ success: true, data: { ...transaction, items: details } });
  } catch (err) {
    console.error('Error fetching transaction detail:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
