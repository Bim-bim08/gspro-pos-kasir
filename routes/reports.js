const express = require('express');
const router = express.Router();
const pool = require('../db');
const { isDbFallback } = require('../db');
const { MOCK_TRANSACTIONS, MOCK_PRODUCTS } = require('../fallbackData');

// GET /api/reports/daily - Statistik penjualan hari ini
router.get('/daily', async (req, res) => {
  try {
    // Ambil tanggal hari ini dalam format YYYY-MM-DD
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Mode DB_FALLBACK: hitung dari data mock
    if (isDbFallback()) {
      const todayTx = MOCK_TRANSACTIONS.filter(t => t.invoice_number.startsWith(`INV/${dateStr.replace(/-/g, '')}`));
      const totalRevenue = todayTx.reduce((s, t) => s + t.total_amount, 0);
      return res.json({
        success: true,
        data: {
          date: dateStr,
          total_transactions: todayTx.length,
          total_revenue: Math.round(totalRevenue * 100) / 100,
          recent_transactions: todayTx.slice(0, 5).map(t => ({
            invoice_number: t.invoice_number,
            total_amount: t.total_amount,
            payment_method: t.payment_method,
            created_at: t.created_at
          }))
        }
      });
    }

    // Hitung total omset dan jumlah transaksi hari ini (dengan timezone WIB)
    const [result] = await pool.query(
      `SELECT 
        COUNT(*) AS total_transactions,
        COALESCE(SUM(total_amount), 0) AS total_revenue
       FROM transactions 
       WHERE DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) = ?`,
      [dateStr]
    );

    const stats = {
      date: dateStr,
      total_transactions: parseInt(result[0].total_transactions) || 0,
      total_revenue: Math.round(parseFloat(result[0].total_revenue) * 100) / 100 || 0
    };

    // Ambil 5 transaksi terakhir hari ini
    const [recent] = await pool.query(
      `SELECT invoice_number, total_amount, payment_method, created_at
       FROM transactions
       WHERE DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) = ?
       ORDER BY created_at DESC
       LIMIT 5`,
      [dateStr]
    );

    res.json({
      success: true,
      data: {
        ...stats,
        recent_transactions: recent
      }
    });
  } catch (err) {
    console.error('Error fetching daily report:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// GET /api/reports/income?period=daily|monthly|yearly
// Laporan Pendapatan dengan 3 periode
// ============================================================
router.get('/income', async (req, res) => {
  try {
    const period = req.query.period || 'daily';

    // Mode DB_FALLBACK: kembalikan data mock
    if (isDbFallback()) {
      const totalRevenue = MOCK_TRANSACTIONS.reduce((s, t) => s + t.total_amount, 0);
      const topPayment = MOCK_TRANSACTIONS.reduce((acc, t) => {
        acc[t.payment_method] = (acc[t.payment_method] || 0) + 1;
        return acc;
      }, {});
      const topMethod = Object.entries(topPayment).sort((a, b) => b[1] - a[1])[0];
      return res.json({
        success: true,
        data: {
          summary: {
            total_revenue: Math.round(totalRevenue * 100) / 100,
            total_transactions: MOCK_TRANSACTIONS.length,
            top_payment: topMethod ? { method: topMethod[0], count: topMethod[1], total: totalRevenue } : { method: '-', count: 0, total: 0 }
          },
          details: [{
            label: new Date().toISOString().slice(0,10),
            label_display: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
            transaction_count: MOCK_TRANSACTIONS.length,
            revenue: Math.round(totalRevenue * 100) / 100
          }]
        }
      });
    }

    let summaryQuery, detailQuery;

    if (period === 'daily') {
      // Per-hari: 30 hari terakhir
      summaryQuery = `
        SELECT
          COUNT(*) AS total_transactions,
          COALESCE(SUM(total_amount), 0) AS total_revenue
        FROM transactions
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      `;
      detailQuery = `
        SELECT
          DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) AS label,
          DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+07:00'), '%d %b %Y') AS label_display,
          COUNT(*) AS transaction_count,
          COALESCE(SUM(total_amount), 0) AS revenue
        FROM transactions
        WHERE CONVERT_TZ(created_at, '+00:00', '+07:00') >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY DATE(CONVERT_TZ(created_at, '+00:00', '+07:00'))
        ORDER BY label DESC
      `;
    } else if (period === 'monthly') {
      // Per-bulan: 12 bulan terakhir
      summaryQuery = `
        SELECT
          COUNT(*) AS total_transactions,
          COALESCE(SUM(total_amount), 0) AS total_revenue
        FROM transactions
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      `;
      detailQuery = `
        SELECT
          DATE_FORMAT(created_at, '%Y-%m') AS label,
          DATE_FORMAT(created_at, '%M %Y') AS label_display,
          COUNT(*) AS transaction_count,
          COALESCE(SUM(total_amount), 0) AS revenue
        FROM transactions
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
        ORDER BY label DESC
      `;
    } else { // yearly
      summaryQuery = `
        SELECT
          COUNT(*) AS total_transactions,
          COALESCE(SUM(total_amount), 0) AS total_revenue
        FROM transactions
      `;
      detailQuery = `
        SELECT
          YEAR(created_at) AS label,
          CONCAT('Tahun ', YEAR(created_at)) AS label_display,
          COUNT(*) AS transaction_count,
          COALESCE(SUM(total_amount), 0) AS revenue
        FROM transactions
        GROUP BY YEAR(created_at)
        ORDER BY label DESC
      `;
    }

    const [summaryResult] = await pool.query(summaryQuery);
    const [detailRows] = await pool.query(detailQuery);

    // Hitung metode pembayaran paling laris
    const [paymentStats] = await pool.query(
      `SELECT
         payment_method,
         COUNT(*) AS count,
         COALESCE(SUM(total_amount), 0) AS total
       FROM transactions
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ${period === 'yearly' ? '100 YEAR' : period === 'monthly' ? '12 MONTH' : '30 DAY'})
       GROUP BY payment_method
       ORDER BY count DESC
       LIMIT 1`
    );

    const topPayment = paymentStats.length > 0
      ? {
          method: paymentStats[0].payment_method,
          count: parseInt(paymentStats[0].count),
          total: Math.round(parseFloat(paymentStats[0].total) * 100) / 100
        }
      : { method: '-', count: 0, total: 0 };

    const summary = {
      total_revenue: Math.round(parseFloat(summaryResult[0].total_revenue) * 100) / 100 || 0,
      total_transactions: parseInt(summaryResult[0].total_transactions) || 0,
      top_payment: topPayment
    };

    res.json({
      success: true,
      data: {
        summary,
        details: detailRows.map(r => ({
          label: r.label,
          label_display: r.label_display,
          transaction_count: parseInt(r.transaction_count),
          revenue: Math.round(parseFloat(r.revenue) * 100) / 100
        }))
      }
    });

  } catch (err) {
    console.error('Error fetching income report:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// GET /api/reports/daily-items?date=...
// Rincian Pendapatan Berdasarkan Nama Produk per Tanggal
// total_omset dihitung dari transactions.total_amount agar 100%
// konsisten dengan angka di Laporan Harian (subtotal - diskon)
// ============================================================
router.get('/daily-items', async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Parameter date wajib diisi' });
    }

    // Mode DB_FALLBACK: kembalikan data mock
    if (isDbFallback()) {
      const { MOCK_TRANSACTION_DETAILS } = require('../fallbackData');
      const todayPrefix = `INV/${date.replace(/-/g, '')}`;
      const dayTx = MOCK_TRANSACTIONS.filter(t => t.invoice_number.startsWith(todayPrefix));
      const itemMap = {};
      let totalOmset = 0;
      for (const tx of dayTx) {
        totalOmset += tx.total_amount;
        const details = MOCK_TRANSACTION_DETAILS[tx.id] || [];
        for (const d of details) {
          if (!itemMap[d.product_id]) {
            const product = MOCK_PRODUCTS.find(p => p.id === d.product_id);
            itemMap[d.product_id] = { product_name: d.product_name, category: product ? product.category : 'Umum', total_qty: 0, total_revenue: 0 };
          }
          itemMap[d.product_id].total_qty += d.qty;
          itemMap[d.product_id].total_revenue += d.subtotal;
        }
      }
      const items = Object.values(itemMap).map(i => ({ ...i, total_revenue: Math.round(i.total_revenue * 100) / 100 }));
      return res.json({
        success: true,
        items,
        total_omset: Math.round(totalOmset * 100) / 100,
        total_qty: items.reduce((s, i) => s + i.total_qty, 0),
        total_jenis: items.length
      });
    }

    // ============================================================
    // Gunakan timezone WIB (UTC+7) secara eksplisit via CONVERT_TZ
    // Catatan: CONVERT_TZ membutuhkan timezone MySQL di-load.
    // Jika tidak tersedia, ganti dengan: t.created_at + INTERVAL 7 HOUR
    // ============================================================
    const tzCol = "CONVERT_TZ(t.created_at, '+00:00', '+07:00')";
    const tzParam = "CONVERT_TZ(?, '+00:00', '+07:00')";

    // Query 1: Rincian per produk — breakdown qty & subtotal per item
    const [items] = await pool.query(
      `SELECT 
          p.name AS product_name,
          p.category,
          SUM(td.qty) AS total_qty,
          SUM(td.subtotal) AS total_revenue
       FROM transaction_details td
       JOIN transactions t ON td.transaction_id = t.id
       JOIN products p ON td.product_id = p.id
       WHERE DATE(${tzCol}) = DATE(${tzParam})
       GROUP BY p.id, p.name, p.category
       ORDER BY total_revenue DESC`,
      [date]
    );

    // Query 2a: Total omset aktual dari transactions.total_amount
    // (subtotal setelah diskon, tanpa PPN) — SAMA dengan Laporan Harian
    const [omsetRows] = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS val
       FROM transactions
       WHERE DATE(CONVERT_TZ(created_at, '+00:00', '+07:00')) = DATE(${tzParam})`,
      [date]
    );

    // Query 2b: Total qty & jenis produk dari transaction_details
    const [aggRows] = await pool.query(
      `SELECT
          COALESCE(SUM(td.qty), 0) AS total_qty,
          COUNT(DISTINCT td.product_id) AS total_jenis
       FROM transaction_details td
       JOIN transactions t ON td.transaction_id = t.id
       WHERE DATE(${tzCol}) = DATE(${tzParam})`,
      [date]
    );

    // Catatan: total_omset dihitung dari transactions.total_amount (setelah diskon, tanpa PPN)
    // sehingga nilainya IDENTIK dengan yang tampil di Laporan Harian.
    // Namun total_revenue per-produk (dari td.subtotal) TIDAK termasuk diskon,
    // jadi jumlah baris tidak akan sama persis dengan total_omset — ini normal.
    const actualOmset = Math.round(parseFloat(omsetRows[0].val) * 100) / 100 || 0;
    const totalQty = parseInt(aggRows[0].total_qty) || 0;
    const totalJenis = parseInt(aggRows[0].total_jenis) || 0;

    // Format hasil per produk
    const results = items.map(item => ({
      product_name: item.product_name,
      category: item.category,
      total_qty: parseInt(item.total_qty) || 0,
      total_revenue: Math.round(parseFloat(item.total_revenue) * 100) / 100 || 0
    }));

    res.json({
      success: true,
      items: results,
      total_omset: actualOmset,
      total_qty: totalQty,
      total_jenis: totalJenis
    });

  } catch (err) {
    console.error('Error fetching daily items report:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
