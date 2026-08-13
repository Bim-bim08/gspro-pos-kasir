const express = require('express');
const path = require('path');
require('dotenv').config();

const indexRouter = require('./routes/index');
const productsRouter = require('./routes/products');
const transactionsRouter = require('./routes/transactions');
const reportsRouter = require('./routes/reports');
const stockAdjustmentsRouter = require('./routes/stockAdjustments');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/', indexRouter);
app.use('/api/products', productsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/stock-adjustments', stockAdjustmentsRouter);

// Multer error handler (harus sebelum 404 & general error handler)
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'Ukuran file terlalu besar. Maksimal 2MB' });
  }
  if (err.name === 'MulterError') {
    return res.status(400).json({ success: false, message: `Error upload: ${err.message}` });
  }
  // Teruskan error lain ke handler berikutnya
  next(err);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Halaman tidak ditemukan' });
});

// General error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  res.status(500).json({ success: false, message: 'Terjadi kesalahan server', error: err.message });
});

// Jalankan server hanya di lingkungan lokal (bukan Vercel/Production)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`✅ Gspro POS Server berjalan di http://localhost:${PORT}`);
  });
}

module.exports = app;
