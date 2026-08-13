/* ============================================
   Gspro - Seed Script
   Mengisi data produk sampel ke database
   ============================================ */

const mysql = require('mysql2/promise');
require('dotenv').config();

const products = [
  // Makanan Ringan
  { barcode: '8991002101104', name: 'Chitato Sapi Panggang 68g', category: 'Makanan Ringan', price: 8500, stock: 50 },
  { barcode: '8991002101128', name: 'Chitato Ayam Bumbu 68g', category: 'Makanan Ringan', price: 8500, stock: 45 },
  { barcode: '8991002101340', name: 'Lays BBQ 68g', category: 'Makanan Ringan', price: 8500, stock: 40 },
  { barcode: '8991002101364', name: 'Lays Original 68g', category: 'Makanan Ringan', price: 8500, stock: 35 },
  { barcode: '8991002101449', name: 'Doritos Keju 68g', category: 'Makanan Ringan', price: 8500, stock: 30 },
  { barcode: '8991003101104', name: 'Qtela Singkong Balado 68g', category: 'Makanan Ringan', price: 7500, stock: 40 },
  { barcode: '8991003101128', name: 'Qtela Singkong Original 68g', category: 'Makanan Ringan', price: 7500, stock: 38 },
  { barcode: '8999909020504', name: 'Taro Snack Rumput Laut 60g', category: 'Makanan Ringan', price: 7000, stock: 45 },
  { barcode: '8999909020511', name: 'Taro Snack BBQ 60g', category: 'Makanan Ringan', price: 7000, stock: 42 },

  // Minuman
  { barcode: '8991002001104', name: 'Coca-Cola 250ml Kaleng', category: 'Minuman', price: 5000, stock: 60 },
  { barcode: '8991002001111', name: 'Sprite 250ml Kaleng', category: 'Minuman', price: 5000, stock: 55 },
  { barcode: '8991002001128', name: 'Fanta Strawberry 250ml Kaleng', category: 'Minuman', price: 5000, stock: 50 },
  { barcode: '8991002001135', name: 'Teh Botol Sosro 350ml', category: 'Minuman', price: 4000, stock: 70 },
  { barcode: '8991002001142', name: 'Pocari Sweat 350ml', category: 'Minuman', price: 6000, stock: 45 },
  { barcode: '8991002001159', name: 'Aqua 600ml', category: 'Minuman', price: 3000, stock: 100 },
  { barcode: '8991002001166', name: 'Mizone 500ml', category: 'Minuman', price: 5500, stock: 40 },
  { barcode: '8991002001173', name: 'Ultra Milk Coklat 250ml', category: 'Minuman', price: 6000, stock: 50 },
  { barcode: '8991002001180', name: 'Ultra Milk Strawberry 250ml', category: 'Minuman', price: 6000, stock: 48 },

  // Makanan Berat
  { barcode: '8991002102101', name: 'Indomie Goreng Rasa Ayam', category: 'Makanan Berat', price: 3500, stock: 80 },
  { barcode: '8991002102102', name: 'Indomie Kuah Rasa Ayam', category: 'Makanan Berat', price: 3500, stock: 75 },
  { barcode: '8991002102103', name: 'Mie Sedaap Goreng', category: 'Makanan Berat', price: 3200, stock: 65 },
  { barcode: '8991002102104', name: 'Nasi Goreng Instan ABC', category: 'Makanan Berat', price: 8000, stock: 30 },
  { barcode: '8991002102105', name: 'Roti Tawar Sari Roti', category: 'Makanan Berat', price: 12000, stock: 25 },

  // Alat Tulis
  { barcode: '8991002103101', name: 'Pensil 2B Faber-Castell', category: 'Alat Tulis', price: 4000, stock: 100 },
  { barcode: '8991002103102', name: 'Pulpen Standard V5', category: 'Alat Tulis', price: 5000, stock: 80 },
  { barcode: '8991002103103', name: 'Buku Tulis 38 Lembar Sinar Dunia', category: 'Alat Tulis', price: 5000, stock: 90 },
  { barcode: '8991002103104', name: 'Penghapus Joyko', category: 'Alat Tulis', price: 3000, stock: 60 },
  { barcode: '8991002103105', name: 'Penggaris 30cm Butterfly', category: 'Alat Tulis', price: 4000, stock: 50 },
  { barcode: '8991002103106', name: 'Spidol Snowman Hitam', category: 'Alat Tulis', price: 7000, stock: 40 },
  { barcode: '8991002103107', name: 'Cutter Joyko', category: 'Alat Tulis', price: 6000, stock: 35 },
  { barcode: '8991002103108', name: 'Lem Uhu', category: 'Alat Tulis', price: 5000, stock: 45 },
  { barcode: '8991002103109', name: 'Sticky Note 3M 3x3', category: 'Alat Tulis', price: 8000, stock: 30 },

  // Minuman Hangat
  { barcode: '8991002104101', name: 'Kopi Kapal Api Sachet', category: 'Minuman', price: 2000, stock: 100 },
  { barcode: '8991002104102', name: 'Teh Pucuk 250ml', category: 'Minuman', price: 3500, stock: 60 },
  { barcode: '8991002104103', name: 'Good Day Cappuccino Sachet', category: 'Minuman', price: 2500, stock: 80 },
  { barcode: '8991002104104', name: 'Milo Sachet', category: 'Minuman', price: 3000, stock: 70 },

  // Tambahan
  { barcode: '8991002105101', name: 'Permen Kopiko', category: 'Makanan Ringan', price: 2000, stock: 100 },
  { barcode: '8991002105102', name: 'Permen Relaxa', category: 'Makanan Ringan', price: 1000, stock: 120 },
  { barcode: '8991002105103', name: 'Coklat Silverqueen', category: 'Makanan Ringan', price: 15000, stock: 25 },
  { barcode: '8991002105104', name: 'Wafer Tango', category: 'Makanan Ringan', price: 7500, stock: 35 },
  { barcode: '8991002105105', name: 'Oreo 133g', category: 'Makanan Ringan', price: 12000, stock: 30 },
];

async function seed() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gspro_pos',
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log('🔄 Menyiapkan data produk...\n');

    // Hapus data lama
    await connection.query('DELETE FROM transaction_details');
    await connection.query('DELETE FROM transactions');
    await connection.query('DELETE FROM products');

    // Reset auto increment
    await connection.query('ALTER TABLE products AUTO_INCREMENT = 1');

    // Insert products
    for (const product of products) {
      await connection.query(
        'INSERT INTO products (barcode, name, category, price, stock) VALUES (?, ?, ?, ?, ?)',
        [product.barcode, product.name, product.category, product.price, product.stock]
      );
    }

    console.log(`✅ Berhasil menambahkan ${products.length} produk ke database!\n`);
    console.log('📊 Kategori produk:');
    
    const [categories] = await connection.query(
      'SELECT category, COUNT(*) as count FROM products GROUP BY category ORDER BY category'
    );
    
    categories.forEach(cat => {
      console.log(`   • ${cat.category}: ${cat.count} produk`);
    });

    console.log('\n🚀 Jalankan aplikasi dengan: npm start');
    console.log('   Buka http://localhost:3000\n');

  } catch (err) {
    console.error('❌ Error seeding database:', err.message);
  } finally {
    await connection.end();
  }
}

seed();
