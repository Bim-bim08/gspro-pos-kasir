/* ============================================
   Gspro POS — Fallback / Demo Data
   Data dummy yang ditampilkan saat MySQL tidak
   terkoneksi (DB_FALLBACK=true).
   ============================================ */

const MOCK_CATEGORIES = ['Makanan', 'Minuman', 'Snack'];

const MOCK_PRODUCTS = [
  { id: 1, barcode: 'MOCK001', name: 'Nasi Goreng',   category: 'Makanan',  price: 15000, stock: 20, image_url: '/images/nasgor.jpg.jfif' },
  { id: 2, barcode: 'MOCK002', name: 'Mie Ayam',      category: 'Makanan',  price: 12000, stock: 15, image_url: '/images/mie Ayam.jfif' },
  { id: 3, barcode: 'MOCK003', name: 'Aqua 600ml',    category: 'Minuman',  price:  3000, stock: 50, image_url: '/images/aqua.jfif' },
  { id: 4, barcode: 'MOCK004', name: 'Es Teh Manis',  category: 'Minuman',  price:  5000, stock: 40, image_url: '/images/esteh.jpg.jfif' },
  { id: 5, barcode: 'MOCK005', name: 'Kopi Susu',     category: 'Minuman',  price:  8000, stock: 30, image_url: '/images/kopisusu.jpg.jfif' },
  { id: 6, barcode: 'MOCK006', name: 'Chitato 68g',   category: 'Snack',    price:  8500, stock: 25, image_url: '/images/chitato.jpg.jfif' },
  { id: 7, barcode: 'MOCK007', name: 'Oreo 133g',     category: 'Snack',    price: 12000, stock: 20, image_url: '/images/oreo.jpg.jfif' },
  { id: 8, barcode: 'MOCK008', name: 'Silverqueen',   category: 'Snack',    price: 15000, stock: 18, image_url: '/images/silverqueen.jpg.jfif' },
];

// Transaksi contoh untuk demo (beberapa hari terakhir)
const MOCK_TRANSACTIONS = [
  {
    id: 1,
    invoice_number: `INV/${new Date().toISOString().slice(0,10).replace(/-/g, '')}/GS/0001`,
    payment_method: 'cash',
    subtotal: 33000,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    total_amount: 33000,
    cash_paid: 50000,
    change_amount: 17000,
    created_at: new Date().toISOString()
  },
  {
    id: 2,
    invoice_number: `INV/${new Date().toISOString().slice(0,10).replace(/-/g, '')}/GS/0002`,
    payment_method: 'qris',
    subtotal: 20000,
    discount_type: 'nominal',
    discount_value: 2000,
    discount_amount: 2000,
    total_amount: 18000,
    cash_paid: 18000,
    change_amount: 0,
    created_at: new Date(Date.now() - 3600000).toISOString()
  }
];

// Detail transaksi contoh
const MOCK_TRANSACTION_DETAILS = {
  1: [
    { id: 1, product_id: 1, product_name: 'Nasi Goreng',  qty: 1, price: 15000, subtotal: 15000 },
    { id: 2, product_id: 3, product_name: 'Aqua 600ml',   qty: 2, price:  3000, subtotal:  6000 },
    { id: 3, product_id: 6, product_name: 'Chitato 68g',  qty: 1, price:  8500, subtotal:  8500 }
  ],
  2: [
    { id: 4, product_id: 2, product_name: 'Mie Ayam',     qty: 1, price: 12000, subtotal: 12000 },
    { id: 5, product_id: 4, product_name: 'Es Teh Manis', qty: 1, price:  5000, subtotal:  5000 },
    { id: 6, product_id: 7, product_name: 'Oreo 133g',    qty: 1, price: 12000, subtotal: 12000 }
  ]
};

// Penyesuaian stok contoh
const MOCK_STOCK_ADJUSTMENTS = [
  {
    id: 1,
    product_id: 1,
    product_name: 'Nasi Goreng',
    product_price: 15000,
    qty_lost: 2,
    reason: 'Rusak/Kadaluarsa',
    note: 'Melewati batas waktu penyajian',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    estimated_loss: 30000
  }
];

module.exports = {
  MOCK_CATEGORIES,
  MOCK_PRODUCTS,
  MOCK_TRANSACTIONS,
  MOCK_TRANSACTION_DETAILS,
  MOCK_STOCK_ADJUSTMENTS
};
