const express = require('express');
const router = express.Router();
const pool = require('../db');
const { isDbFallback } = require('../db');
const { MOCK_STOCK_ADJUSTMENTS, MOCK_PRODUCTS } = require('../fallbackData');

// ============================================================
// POST /api/stock-adjustments - Catat penyesuaian stok
// Body: { product_id, qty_lost, reason, note }
// ============================================================
router.post('/', async (req, res) => {
  // Mode DB_FALLBACK: proses penyesuaian stok dengan data mock + kurangi stok
  if (isDbFallback()) {
    const { product_id, qty_lost, reason, note } = req.body;
    const product = MOCK_PRODUCTS.find(p => p.id === parseInt(product_id));
    if (!product) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    }
    const qty = parseInt(qty_lost);
    if (!qty || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Jumlah berkurang harus lebih dari 0' });
    }

    // Pastikan stok tidak negatif
    if (product.stock < qty) {
      return res.status(400).json({
        success: false,
        message: `Stok ${product.name} tidak mencukupi (tersisa: ${product.stock}, akan dikurangi: ${qty})`
      });
    }

    // Kurangi stok
    product.stock = Math.max(0, product.stock - qty);

    const estimatedLoss = qty * parseFloat(product.price);
    return res.status(201).json({
      success: true,
      message: `Penyesuaian stok untuk "${product.name}" berhasil dicatat (Demo Mode)`,
      data: {
        id: MOCK_STOCK_ADJUSTMENTS.length + 100,
        product_id,
        product_name: product.name,
        qty_lost: qty,
        reason,
        note: note || null,
        estimated_loss: Math.round(estimatedLoss * 100) / 100
      }
    });
  }

  const connection = await pool.getConnection();
  try {
    const { product_id, qty_lost, reason, note } = req.body;

    // Validasi input
    if (!product_id) {
      return res.status(400).json({ success: false, message: 'Produk harus dipilih' });
    }
    if (!qty_lost || parseInt(qty_lost) <= 0) {
      return res.status(400).json({ success: false, message: 'Jumlah berkurang harus lebih dari 0' });
    }
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Alasan harus dipilih' });
    }

    const qty = parseInt(qty_lost);
    const validReasons = ['Hilang/Kemalingan', 'Rusak/Kadaluarsa', 'Selisih Hitung', 'Lainnya'];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ success: false, message: 'Alasan tidak valid' });
    }

    await connection.beginTransaction();

    // Cek apakah produk ada dan stok mencukupi
    const [products] = await connection.query(
      'SELECT id, name, stock, price FROM products WHERE id = ?',
      [product_id]
    );

    if (products.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    }

    const product = products[0];
    if (product.stock < qty) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Stok ${product.name} tidak mencukupi (tersisa: ${product.stock}, akan dikurangi: ${qty})`
      });
    }

    // Simpan data penyesuaian stok
    const [result] = await connection.query(
      'INSERT INTO stock_adjustments (product_id, qty_lost, reason, note) VALUES (?, ?, ?, ?)',
      [product_id, qty, reason, note || null]
    );

    // Kurangi stok produk
    await connection.query(
      'UPDATE products SET stock = stock - ? WHERE id = ?',
      [qty, product_id]
    );

    await connection.commit();

    // Hitung estimasi kerugian
    const estimatedLoss = qty * parseFloat(product.price);

    res.status(201).json({
      success: true,
      message: `Penyesuaian stok untuk "${product.name}" berhasil dicatat`,
      data: {
        id: result.insertId,
        product_id,
        product_name: product.name,
        qty_lost: qty,
        reason,
        note: note || null,
        estimated_loss: Math.round(estimatedLoss * 100) / 100
      }
    });

  } catch (err) {
    await connection.rollback();
    console.error('Error saving stock adjustment:', err.message);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
});

// ============================================================
// GET /api/stock-adjustments - Ambil riwayat penyesuaian stok
// Mendukung query parameter ?page & ?limit untuk paginasi
// ============================================================
router.get('/', async (req, res) => {
  try {
    // Mode DB_FALLBACK: kembalikan data mock
    if (isDbFallback()) {
      return res.json({
        success: true,
        data: MOCK_STOCK_ADJUSTMENTS,
        total_loss: MOCK_STOCK_ADJUSTMENTS.reduce((s, a) => s + a.estimated_loss, 0),
        total: MOCK_STOCK_ADJUSTMENTS.length,
        page: 1,
        limit: 50,
        total_pages: 1
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // Hitung total data
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM stock_adjustments'
    );
    const total = countResult[0].total;

    // Ambil data dengan JOIN ke tabel products
    const [adjustments] = await pool.query(
      `SELECT 
        sa.id,
        sa.product_id,
        p.name AS product_name,
        p.price AS product_price,
        sa.qty_lost,
        sa.reason,
        sa.note,
        sa.created_at,
        (sa.qty_lost * p.price) AS estimated_loss
       FROM stock_adjustments sa
       JOIN products p ON p.id = sa.product_id
       ORDER BY sa.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // Hitung total nilai kerugian keseluruhan
    const [totalLossResult] = await pool.query(
      `SELECT COALESCE(SUM(sa.qty_lost * p.price), 0) AS total_loss
       FROM stock_adjustments sa
       JOIN products p ON p.id = sa.product_id`
    );
    const totalLoss = Math.round(parseFloat(totalLossResult[0].total_loss) * 100) / 100;

    res.json({
      success: true,
      data: adjustments.map(a => ({
        ...a,
        estimated_loss: Math.round(parseFloat(a.estimated_loss) * 100) / 100,
        qty_lost: parseInt(a.qty_lost)
      })),
      total_loss: totalLoss,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit)
    });

  } catch (err) {
    console.error('Error fetching stock adjustments:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
