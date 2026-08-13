-- ============================================
-- Gspro POS / Kasir - Database Schema
-- SMK Jakarta Pusat 1
-- ============================================

CREATE DATABASE IF NOT EXISTS gspro_pos;
USE gspro_pos;

-- -------------------------------------------
-- Tabel: products
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barcode VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'Umum',
    price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    stock INT NOT NULL DEFAULT 0,
    image_url VARCHAR(500) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Tabel: transactions
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_number VARCHAR(20) NOT NULL UNIQUE,
    payment_method ENUM('cash', 'qris') NOT NULL DEFAULT 'cash',
    subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
    tax DECIMAL(12, 2) NOT NULL DEFAULT 0,
    discount_type ENUM('nominal', 'percent') DEFAULT NULL,
    discount_value DECIMAL(12, 2) DEFAULT NULL,
    discount_amount DECIMAL(12, 2) DEFAULT NULL,
    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    cash_paid DECIMAL(12, 2) DEFAULT NULL,
    change_amount DECIMAL(12, 2) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Tabel: transaction_details
-- -------------------------------------------
-- CATATAN: Nama produk diambil via JOIN dengan tabel products (p.name AS product_name)
-- sehingga tidak perlu kolom product_name terpisah
CREATE TABLE IF NOT EXISTS transaction_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id INT NOT NULL,
    product_id INT NOT NULL,
    qty INT NOT NULL DEFAULT 1,
    price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Tabel: stock_adjustments
-- Menyimpan catatan penyesuaian stok (Stok Opname)
-- untuk barang hilang, rusak, atau selisih
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    qty_lost INT NOT NULL DEFAULT 0,
    reason ENUM('Hilang/Kemalingan', 'Rusak/Kadaluarsa', 'Selisih Hitung', 'Lainnya') NOT NULL DEFAULT 'Lainnya',
    note TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------
-- Indexes
-- -------------------------------------------
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_transactions_created ON transactions(created_at);
CREATE INDEX idx_transaction_details_transaction ON transaction_details(transaction_id);
CREATE INDEX idx_stock_adjustments_product ON stock_adjustments(product_id);
CREATE INDEX idx_stock_adjustments_created ON stock_adjustments(created_at);
