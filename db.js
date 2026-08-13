const mysql = require('mysql2/promise');
require('dotenv').config();

// ============================================
// Konfigurasi Database MySQL (XAMPP default)
// Host: localhost | User: root | Password: ''
// Database: gspro_pos | Port: 3306
// ============================================

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gspro_pos',
  port: parseInt(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
};

console.log('');
console.log('📦 Database Configuration:');
console.log(`   Host     : ${dbConfig.host}`);
console.log(`   Port     : ${dbConfig.port}`);
console.log(`   User     : ${dbConfig.user}`);
console.log(`   Database : ${dbConfig.database}`);
console.log(`   Password : ${dbConfig.password ? '********' : '(kosong)'}`);
console.log('');

const pool = mysql.createPool(dbConfig);

// ============================================
// Uji Koneksi Database saat Startup
// ============================================
async function testConnection() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.ping();
    console.log('✅ Koneksi MySQL berhasil!');
    
    const [rows] = await connection.query(
      'SELECT COUNT(*) as count FROM products'
    );
    console.log(`   Produk terdaftar: ${rows[0].count} item\n`);
    
    connection.release();
    return true;
  } catch (err) {
    console.error('❌ Gagal terhubung ke MySQL!');
    console.error('');
    console.error('   ⚠️  Pastikan:');
    console.error('      1. XAMPP / MySQL server sudah dijalankan');
    console.error('      2. Database "gspro_pos" sudah dibuat');
    console.error('         Jalankan: source sql/schema.sql');
    console.error('      3. Data produk sudah diisi: node seed.js');
    console.error('');
    console.error('   📋 Detail Error:');
    console.error('      Code    :', err.code || 'N/A');
    console.error('      Errno   :', err.errno || 'N/A');
    console.error('      Message :', err.message);
    console.error('      SQL State:', err.sqlState || 'N/A');
    
    if (err.code === 'ECONNREFUSED') {
      console.error('');
      console.error('   💡 Solusi: Nyalakan MySQL di XAMPP Control Panel');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('');
      console.error('   💡 Solusi: Buat database dulu:');
      console.error('      mysql -u root -e "CREATE DATABASE gspro_pos"');
      console.error('      atau import sql/schema.sql via phpMyAdmin');
    }
    console.error('');
    
    if (connection) connection.release();
    return false;
  }
}

// Jalankan test koneksi (tidak blocking server startup)
testConnection().then(success => {
  if (!success) {
    console.warn('⚠️  Server tetap berjalan, tetapi fitur database tidak akan berfungsi');
    console.warn('   sampai koneksi MySQL berhasil.\n');
  }
});

module.exports = pool;
module.exports.testConnection = testConnection;
