const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const { isDbFallback } = require('../db');
const { MOCK_PRODUCTS, MOCK_CATEGORIES } = require('../fallbackData');

// Konfigurasi multer untuk upload gambar
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
    // Buat folder jika belum ada
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate nama file unik: timestamp-random.ext
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `product-${Date.now()}-${Math.round(Math.random() * 9999)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extOk = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowedTypes.test(file.mimetype);
    if (extOk && mimeOk) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file gambar (JPG, PNG, GIF, WEBP) yang diizinkan'));
    }
  }
});

// Helper: hapus file gambar lama
function deleteOldImage(imagePath) {
  if (!imagePath) return;
  // Hanya hapus file yang di-upload (bukan URL eksternal)
  if (imagePath.startsWith('/uploads/')) {
    const fullPath = path.join(__dirname, '..', 'public', imagePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
}

// GET /api/products - Ambil semua produk atau filter
router.get('/', async (req, res) => {
  try {
    // Mode DB_FALLBACK: kembalikan data mock
    if (isDbFallback()) {
      let products = [...MOCK_PRODUCTS];
      const { category, search } = req.query;

      if (category && category !== 'Semua') {
        products = products.filter(p => p.category === category);
      }
      if (search) {
        const q = search.toLowerCase();
        products = products.filter(
          p => p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q)
        );
      }
      return res.json({ success: true, data: products });
    }

    const { category, search } = req.query;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (category && category !== 'Semua') {
      query += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND (name LIKE ? OR barcode LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY category, name';

    const [products] = await pool.query(query, params);
    res.json({ success: true, data: products });
  } catch (err) {
    console.error('Error fetching products:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/products/barcode/:barcode - Cari berdasarkan barcode (MUST be before :id route)
router.get('/barcode/:barcode', async (req, res) => {
  try {
    if (isDbFallback()) {
      const product = MOCK_PRODUCTS.find(p => p.barcode === req.params.barcode);
      if (!product) {
        return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
      }
      return res.json({ success: true, data: product });
    }

    const [products] = await pool.query(
      'SELECT * FROM products WHERE barcode = ?',
      [req.params.barcode]
    );
    if (products.length === 0) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    }
    res.json({ success: true, data: products[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    if (isDbFallback()) {
      const product = MOCK_PRODUCTS.find(p => p.id === parseInt(req.params.id));
      if (!product) {
        return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
      }
      return res.json({ success: true, data: product });
    }

    const [products] = await pool.query(
      'SELECT * FROM products WHERE id = ?',
      [req.params.id]
    );
    if (products.length === 0) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    }
    res.json({ success: true, data: products[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/products - Tambah produk baru (dengan upload gambar)
router.post('/', upload.single('image'), async (req, res) => {
  try {
    // Mode DB_FALLBACK: kembalikan respon sukses dummy
    if (isDbFallback()) {
      return res.status(201).json({
        success: true,
        message: 'Produk berhasil ditambahkan (Demo Mode)',
        id: Date.now(),
        image_url: null
      });
    }

    const { barcode, name, category, price, stock } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    const [result] = await pool.query(
      'INSERT INTO products (barcode, name, category, price, stock, image_url) VALUES (?, ?, ?, ?, ?, ?)',
      [barcode, name, category || 'Umum', price, stock || 0, image_url]
    );
    res.status(201).json({ success: true, id: result.insertId, image_url });
  } catch (err) {
    // Hapus file yang sudah terupload jika query gagal
    if (req.file) {
      deleteOldImage(`/uploads/${req.file.filename}`);
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/products/:id - Update produk (dengan upload gambar opsional)
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    // Mode DB_FALLBACK: kembalikan respon sukses dummy
    if (isDbFallback()) {
      return res.json({
        success: true,
        message: 'Produk berhasil diperbarui (Demo Mode)',
        image_url: null
      });
    }

    const { barcode, name, category, price, stock } = req.body;

    // Ambil data produk lama untuk cek gambar
    const [existing] = await pool.query(
      'SELECT image_url FROM products WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    }

    const oldImageUrl = existing[0].image_url;

    // Tentukan image_url baru
    let image_url = oldImageUrl;
    if (req.file) {
      // Ada file baru diupload — hapus file lama jika dari upload
      deleteOldImage(oldImageUrl);
      image_url = `/uploads/${req.file.filename}`;
    }
    // Jika tidak ada file baru, image_url tetap menggunakan yang lama

    await pool.query(
      'UPDATE products SET barcode = ?, name = ?, category = ?, price = ?, stock = ?, image_url = ? WHERE id = ?',
      [barcode, name, category, price, stock, image_url, req.params.id]
    );
    res.json({ success: true, message: 'Produk berhasil diperbarui', image_url });
  } catch (err) {
    if (req.file) {
      deleteOldImage(`/uploads/${req.file.filename}`);
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  try {
    // Mode DB_FALLBACK: kembalikan respon sukses dummy
    if (isDbFallback()) {
      return res.json({
        success: true,
        message: 'Produk berhasil dihapus (Demo Mode)'
      });
    }

    // Ambil data produk untuk hapus gambar
    const [existing] = await pool.query(
      'SELECT image_url FROM products WHERE id = ?',
      [req.params.id]
    );

    if (existing.length > 0) {
      deleteOldImage(existing[0].image_url);
    }

    await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Produk berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
