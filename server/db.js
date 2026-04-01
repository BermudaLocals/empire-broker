const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'empire_broker.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  console.log('Initializing database...');
  
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'mortgage_broker', 'agent', 'broker')),
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Mortgage clients table
  db.exec(`
    CREATE TABLE IF NOT EXISTS mortgage_clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      pre_approval_amount REAL,
      credit_score INTEGER,
      status TEXT DEFAULT 'pre-qualified' CHECK(status IN ('pre-qualified', 'application', 'processing', 'underwriting', 'closing', 'closed', 'denied')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Mortgage documents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS mortgage_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      doc_type TEXT NOT NULL CHECK(doc_type IN ('w2', 'tax_return', 'bank_statement', 'pay_stub', 'id', 'purchase_agreement', 'appraisal', 'other')),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'received', 'reviewed', 'approved', 'rejected')),
      notes TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES mortgage_clients(id) ON DELETE CASCADE
    )
  `);

  // Loan calculations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS loan_calculations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      client_id INTEGER,
      name TEXT,
      purchase_price REAL NOT NULL,
      down_payment REAL NOT NULL,
      interest_rate REAL NOT NULL,
      loan_term INTEGER NOT NULL,
      monthly_payment REAL NOT NULL,
      monthly_tax REAL DEFAULT 0,
      monthly_insurance REAL DEFAULT 0,
      monthly_pmi REAL DEFAULT 0,
      total_monthly REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES mortgage_clients(id) ON DELETE SET NULL
    )
  `);

  // Rates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lender_name TEXT NOT NULL,
      rate_30yr REAL,
      rate_15yr REAL,
      rate_arm REAL,
      arm_term TEXT,
      points REAL DEFAULT 0,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Rate locks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_locks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      lender_name TEXT NOT NULL,
      rate REAL NOT NULL,
      loan_type TEXT NOT NULL,
      lock_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      expiration_date DATETIME NOT NULL,
      notes TEXT,
      FOREIGN KEY (client_id) REFERENCES mortgage_clients(id) ON DELETE CASCADE
    )
  `);

  // Properties table
  db.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      zip TEXT NOT NULL,
      price REAL NOT NULL,
      beds INTEGER,
      baths REAL,
      sqft INTEGER,
      description TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'pending', 'sold', 'withdrawn', 'expired')),
      list_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      sold_date DATETIME,
      days_on_market INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Price history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL,
      old_price REAL NOT NULL,
      new_price REAL NOT NULL,
      change_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      reason TEXT,
      FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
    )
  `);

  // Buyers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS buyers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      min_price REAL,
      max_price REAL,
      beds_needed INTEGER,
      baths_needed REAL,
      location_preference TEXT,
      notes TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'under_contract', 'closed', 'inactive')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Buyer saved properties
  db.exec(`
    CREATE TABLE IF NOT EXISTS buyer_saved_properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
      UNIQUE(buyer_id, property_id)
    )
  `);

  // Showings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS showings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL,
      buyer_id INTEGER,
      agent_id INTEGER NOT NULL,
      showing_date DATETIME NOT NULL,
      feedback TEXT,
      agent_notes TEXT,
      outcome TEXT CHECK(outcome IN ('interested', 'not_interested', 'thinking', 'made_offer', 'no_show')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
      FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE SET NULL,
      FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Sellers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sellers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      property_id INTEGER,
      list_price REAL,
      commission_rate REAL DEFAULT 6.0,
      agreement_date DATETIME,
      expiration_date DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL
    )
  `);

  // Commission records table
  db.exec(`
    CREATE TABLE IF NOT EXISTS commissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('mortgage', 'listing', 'buyer', 'referral')),
      client_name TEXT,
      property_address TEXT,
      sale_price REAL,
      commission_amount REAL NOT NULL,
      commission_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'received', 'split')),
      notes TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Agents table (for broker management)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      broker_id INTEGER NOT NULL,
      user_id INTEGER UNIQUE,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      license_number TEXT UNIQUE,
      commission_split REAL DEFAULT 50.0,
      active BOOLEAN DEFAULT 1,
      date_joined DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (broker_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Agent performance table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      year INTEGER NOT NULL,
      listings_count INTEGER DEFAULT 0,
      sales_count INTEGER DEFAULT 0,
      volume REAL DEFAULT 0,
      commission_earned REAL DEFAULT 0,
      UNIQUE(agent_id, month, year),
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    )
  `);

  // Appointments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      client_type TEXT CHECK(client_type IN ('mortgage_client', 'buyer', 'seller')),
      client_id INTEGER,
      client_name TEXT,
      title TEXT NOT NULL,
      appointment_date DATETIME NOT NULL,
      duration_minutes INTEGER DEFAULT 60,
      location TEXT,
      notes TEXT,
      status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_clients_user_id ON mortgage_clients(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_properties_agent_id ON properties(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_buyers_agent_id ON buyers(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_showings_property_id ON showings(property_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_commissions_user_id ON commissions(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON appointments(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_loan_calcs_user_id ON loan_calculations(user_id)`);

  insertDemoData();
  console.log('Database initialized successfully!');
}

function insertDemoData() {
  const demoUsers = [
    { email: 'demo@mortgage.com', password: 'demo123', name: 'Demo Mortgage Broker', role: 'mortgage_broker', phone: '555-0101' },
    { email: 'demo@agent.com', password: 'demo123', name: 'Demo Real Estate Agent', role: 'agent', phone: '555-0102' },
    { email: 'demo@broker.com', password: 'demo123', name: 'Demo Real Estate Broker', role: 'broker', phone: '555-0103' },
    { email: 'admin@empire.com', password: 'admin123', name: 'System Admin', role: 'admin', phone: '555-0000' }
  ];

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (email, password_hash, name, role, phone)
    VALUES (?, ?, ?, ?, ?)
  `);

  demoUsers.forEach(user => {
    const hashedPassword = bcrypt.hashSync(user.password, 10);
    insertUser.run(user.email, hashedPassword, user.name, user.role, user.phone);
  });

  // Insert sample mortgage rates
  const insertRate = db.prepare(`
    INSERT OR IGNORE INTO rates (lender_name, rate_30yr, rate_15yr, rate_arm, arm_term, points)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertRate.run('Wells Fargo', 6.875, 6.125, 6.5, '5/1 ARM', 0.5);
  insertRate.run('Chase Bank', 6.99, 6.25, 6.625, '7/1 ARM', 0.25);
  insertRate.run('Quicken Loans', 6.75, 6.0, 6.375, '10/1 ARM', 0.75);
  insertRate.run('Bank of America', 6.875, 6.125, 6.5, '5/1 ARM', 0.0);
  insertRate.run('US Bank', 6.825, 6.075, 6.45, '5/1 ARM', 0.5);

  console.log('Demo data inserted!');
}

module.exports = { db, initDatabase };
