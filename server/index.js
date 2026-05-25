require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { db, initDatabase } = require('./db');
const { generateToken, authenticateToken, requireRole } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 200,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// ==================== AUTH ROUTES ====================

app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, name, role, phone } = req.body;
    if (!email || !password || !name || !role) return res.status(400).json({ error: 'Missing required fields' });
    const validRoles = ['mortgage_broker', 'agent', 'broker'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (email, password_hash, name, role, phone) VALUES (?, ?, ?, ?, ?)').run(email, hash, name, role, phone || null);
    const user = db.prepare('SELECT id, email, name, role, phone, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = generateToken(user);
    res.status(201).json({ message: 'Registration successful', token, user });
  } catch (err) { console.error('Register error:', err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = generateToken(user);
    res.json({ message: 'Login successful', token, user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone } });
  } catch (err) { console.error('Login error:', err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, email, name, role, phone, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

app.put('/api/auth/profile', authenticateToken, (req, res) => {
  try {
    const { name, phone, current_password, new_password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (new_password) {
      if (!current_password || !bcrypt.compareSync(current_password, user.password_hash)) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      const hash = bcrypt.hashSync(new_password, 10);
      db.prepare('UPDATE users SET name = ?, phone = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name || user.name, phone || user.phone, hash, req.user.id);
    } else {
      db.prepare('UPDATE users SET name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name || user.name, phone || user.phone, req.user.id);
    }
    const updated = db.prepare('SELECT id, email, name, role, phone FROM users WHERE id = ?').get(req.user.id);
    res.json({ message: 'Profile updated', user: updated });
  } catch (err) { console.error('Profile update error:', err); res.status(500).json({ error: 'Server error' }); }
});

// ==================== DASHBOARD STATS ====================

app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    let stats = {};

    if (role === 'mortgage_broker') {
      const clients = db.prepare('SELECT COUNT(*) as count FROM mortgage_clients WHERE user_id = ?').get(userId);
      const activeClients = db.prepare("SELECT COUNT(*) as count FROM mortgage_clients WHERE user_id = ? AND status NOT IN ('closed', 'denied')").get(userId);
      const calcs = db.prepare('SELECT COUNT(*) as count FROM loan_calculations WHERE user_id = ?').get(userId);
      const commTotal = db.prepare("SELECT COALESCE(SUM(commission_amount), 0) as total FROM commissions WHERE user_id = ? AND transaction_type = 'mortgage'").get(userId);
      const commYTD = db.prepare("SELECT COALESCE(SUM(commission_amount), 0) as total FROM commissions WHERE user_id = ? AND transaction_type = 'mortgage' AND strftime('%Y', commission_date) = strftime('%Y', 'now')").get(userId);
      const upcoming = db.prepare("SELECT COUNT(*) as count FROM appointments WHERE user_id = ? AND appointment_date >= datetime('now') AND status = 'scheduled'").get(userId);
      const pipeline = db.prepare(`SELECT status, COUNT(*) as count FROM mortgage_clients WHERE user_id = ? GROUP BY status`).all(userId);
      stats = { totalClients: clients.count, activeClients: activeClients.count, totalCalculations: calcs.count, totalCommission: commTotal.total, ytdCommission: commYTD.total, upcomingAppointments: upcoming.count, pipeline };
    } else if (role === 'agent') {
      const listings = db.prepare('SELECT COUNT(*) as count FROM properties WHERE agent_id = ?').get(userId);
      const active = db.prepare("SELECT COUNT(*) as count FROM properties WHERE agent_id = ? AND status = 'active'").get(userId);
      const sold = db.prepare("SELECT COUNT(*) as count FROM properties WHERE agent_id = ? AND status = 'sold'").get(userId);
      const buyers = db.prepare('SELECT COUNT(*) as count FROM buyers WHERE agent_id = ?').get(userId);
      const sellers = db.prepare('SELECT COUNT(*) as count FROM sellers WHERE agent_id = ?').get(userId);
      const showings = db.prepare('SELECT COUNT(*) as count FROM showings WHERE agent_id = ?').get(userId);
      const commTotal = db.prepare("SELECT COALESCE(SUM(commission_amount), 0) as total FROM commissions WHERE user_id = ? AND transaction_type IN ('listing', 'buyer')").get(userId);
      const volume = db.prepare("SELECT COALESCE(SUM(price), 0) as total FROM properties WHERE agent_id = ? AND status = 'sold'").get(userId);
      stats = { totalListings: listings.count, activeListings: active.count, soldProperties: sold.count, totalBuyers: buyers.count, totalSellers: sellers.count, totalShowings: showings.count, totalCommission: commTotal.total, salesVolume: volume.total };
    } else if (role === 'broker' || role === 'admin') {
      const agents = db.prepare('SELECT COUNT(*) as count FROM agents WHERE broker_id = ?').get(userId);
      const activeAgents = db.prepare('SELECT COUNT(*) as count FROM agents WHERE broker_id = ? AND active = 1').get(userId);
      stats = { totalAgents: agents.count, activeAgents: activeAgents.count };
    }

    res.json(stats);
  } catch (err) { console.error('Dashboard stats error:', err); res.status(500).json({ error: 'Server error' }); }
});

// ==================== MORTGAGE CLIENT ROUTES ====================

app.get('/api/mortgage/clients', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    const clients = db.prepare(`
      SELECT mc.*,
        (SELECT COUNT(*) FROM mortgage_documents WHERE client_id = mc.id) as doc_count,
        (SELECT COUNT(*) FROM mortgage_documents WHERE client_id = mc.id AND status IN ('received','reviewed','approved')) as docs_received
      FROM mortgage_clients mc WHERE mc.user_id = ? ORDER BY mc.updated_at DESC
    `).all(req.user.id);
    res.json(clients);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/mortgage/clients/:id', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    const client = db.prepare('SELECT * FROM mortgage_clients WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const documents = db.prepare('SELECT * FROM mortgage_documents WHERE client_id = ? ORDER BY uploaded_at DESC').all(client.id);
    const rateLocks = db.prepare('SELECT * FROM rate_locks WHERE client_id = ? ORDER BY lock_date DESC').all(client.id);
    res.json({ ...client, documents, rateLocks });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/mortgage/clients', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    const { name, email, phone, pre_approval_amount, credit_score, status, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Client name is required' });
    const result = db.prepare('INSERT INTO mortgage_clients (user_id, name, email, phone, pre_approval_amount, credit_score, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(req.user.id, name, email || null, phone || null, pre_approval_amount || null, credit_score || null, status || 'pre-qualified', notes || null);
    const client = db.prepare('SELECT * FROM mortgage_clients WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(client);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/mortgage/clients/:id', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    const { name, email, phone, pre_approval_amount, credit_score, status, notes } = req.body;
    const existing = db.prepare('SELECT * FROM mortgage_clients WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Client not found' });
    db.prepare('UPDATE mortgage_clients SET name=?, email=?, phone=?, pre_approval_amount=?, credit_score=?, status=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name, email || null, phone || null, pre_approval_amount || null, credit_score || null, status, notes || null, req.params.id);
    const client = db.prepare('SELECT * FROM mortgage_clients WHERE id = ?').get(req.params.id);
    res.json(client);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/mortgage/clients/:id', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM mortgage_clients WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Client not found' });
    db.prepare('DELETE FROM mortgage_clients WHERE id = ?').run(req.params.id);
    res.json({ message: 'Client deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ==================== MORTGAGE DOCUMENTS ====================

app.get('/api/mortgage/clients/:id/documents', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    const docs = db.prepare('SELECT * FROM mortgage_documents WHERE client_id = ? ORDER BY uploaded_at DESC').all(req.params.id);
    res.json(docs);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/mortgage/documents', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    const { client_id, doc_type, status, notes } = req.body;
    const result = db.prepare('INSERT INTO mortgage_documents (client_id, doc_type, status, notes) VALUES (?, ?, ?, ?)').run(client_id, doc_type, status || 'pending', notes || null);
    const doc = db.prepare('SELECT * FROM mortgage_documents WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(doc);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/mortgage/documents/:id', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    const { status, notes } = req.body;
    db.prepare('UPDATE mortgage_documents SET status=?, notes=? WHERE id=?').run(status, notes || null, req.params.id);
    const doc = db.prepare('SELECT * FROM mortgage_documents WHERE id = ?').get(req.params.id);
    res.json(doc);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/mortgage/documents/:id', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM mortgage_documents WHERE id = ?').run(req.params.id);
    res.json({ message: 'Document deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ==================== LOAN CALCULATIONS ====================

app.get('/api/mortgage/calculations', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    const calcs = db.prepare('SELECT lc.*, mc.name as client_name FROM loan_calculations lc LEFT JOIN mortgage_clients mc ON lc.client_id = mc.id WHERE lc.user_id = ? ORDER BY lc.created_at DESC').all(req.user.id);
    res.json(calcs);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/mortgage/calculations', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    const { client_id, name, purchase_price, down_payment, interest_rate, loan_term, monthly_payment, monthly_tax, monthly_insurance, monthly_pmi, total_monthly } = req.body;
    const result = db.prepare('INSERT INTO loan_calculations (user_id, client_id, name, purchase_price, down_payment, interest_rate, loan_term, monthly_payment, monthly_tax, monthly_insurance, monthly_pmi, total_monthly) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(req.user.id, client_id || null, name || null, purchase_price, down_payment, interest_rate, loan_term, monthly_payment, monthly_tax || 0, monthly_insurance || 0, monthly_pmi || 0, total_monthly);
    const calc = db.prepare('SELECT * FROM loan_calculations WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(calc);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/mortgage/calculations/:id', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM loan_calculations WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ message: 'Calculation deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ==================== RATES ====================

app.get('/api/mortgage/rates', authenticateToken, (req, res) => {
  try {
    const rates = db.prepare('SELECT * FROM rates ORDER BY lender_name').all();
    res.json(rates);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/mortgage/rates', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    const { lender_name, rate_30yr, rate_15yr, rate_arm, arm_term, points } = req.body;
    const result = db.prepare('INSERT INTO rates (lender_name, rate_30yr, rate_15yr, rate_arm, arm_term, points) VALUES (?,?,?,?,?,?)').run(lender_name, rate_30yr, rate_15yr || null, rate_arm || null, arm_term || null, points || 0);
    const rate = db.prepare('SELECT * FROM rates WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(rate);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/mortgage/rates/:id', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    const { lender_name, rate_30yr, rate_15yr, rate_arm, arm_term, points } = req.body;
    db.prepare('UPDATE rates SET lender_name=?, rate_30yr=?, rate_15yr=?, rate_arm=?, arm_term=?, points=?, last_updated=CURRENT_TIMESTAMP WHERE id=?').run(lender_name, rate_30yr, rate_15yr || null, rate_arm || null, arm_term || null, points || 0, req.params.id);
    const rate = db.prepare('SELECT * FROM rates WHERE id = ?').get(req.params.id);
    res.json(rate);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/mortgage/rates/:id', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM rates WHERE id = ?').run(req.params.id);
    res.json({ message: 'Rate deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Rate locks
app.get('/api/mortgage/rate-locks', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    const locks = db.prepare('SELECT rl.*, mc.name as client_name FROM rate_locks rl JOIN mortgage_clients mc ON rl.client_id = mc.id WHERE mc.user_id = ? ORDER BY rl.expiration_date ASC').all(req.user.id);
    res.json(locks);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/mortgage/rate-locks', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    const { client_id, lender_name, rate, loan_type, expiration_date, notes } = req.body;
    const result = db.prepare('INSERT INTO rate_locks (client_id, lender_name, rate, loan_type, expiration_date, notes) VALUES (?,?,?,?,?,?)').run(client_id, lender_name, rate, loan_type, expiration_date, notes || null);
    const lock = db.prepare('SELECT * FROM rate_locks WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(lock);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/mortgage/rate-locks/:id', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM rate_locks WHERE id = ?').run(req.params.id);
    res.json({ message: 'Rate lock deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Mortgage commissions
app.get('/api/mortgage/commissions', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    const commissions = db.prepare("SELECT * FROM commissions WHERE user_id = ? AND transaction_type = 'mortgage' ORDER BY commission_date DESC").all(req.user.id);
    const summary = db.prepare("SELECT COALESCE(SUM(commission_amount),0) as total, COALESCE(SUM(CASE WHEN status='received' THEN commission_amount ELSE 0 END),0) as received, COALESCE(SUM(CASE WHEN status='pending' THEN commission_amount ELSE 0 END),0) as pending FROM commissions WHERE user_id = ? AND transaction_type = 'mortgage'").get(req.user.id);
    const ytd = db.prepare("SELECT COALESCE(SUM(commission_amount),0) as total FROM commissions WHERE user_id = ? AND transaction_type = 'mortgage' AND strftime('%Y', commission_date) = strftime('%Y', 'now')").get(req.user.id);
    res.json({ commissions, summary: { ...summary, ytd: ytd.total } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/mortgage/commissions', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    const { client_name, property_address, sale_price, commission_amount, commission_date, status, notes } = req.body;
    const result = db.prepare("INSERT INTO commissions (user_id, transaction_type, client_name, property_address, sale_price, commission_amount, commission_date, status, notes) VALUES (?, 'mortgage', ?,?,?,?,?,?,?)").run(req.user.id, client_name, property_address || null, sale_price || null, commission_amount, commission_date || new Date().toISOString(), status || 'pending', notes || null);
    const comm = db.prepare('SELECT * FROM commissions WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(comm);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/mortgage/commissions/:id', authenticateToken, requireRole('mortgage_broker', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM commissions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ message: 'Commission deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ==================== PROPERTY ROUTES ====================

app.get('/api/agent/properties', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    const properties = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM showings WHERE property_id = p.id) as showing_count,
        (SELECT COUNT(*) FROM buyer_saved_properties WHERE property_id = p.id) as save_count
      FROM properties p WHERE p.agent_id = ? ORDER BY p.created_at DESC
    `).all(req.user.id);
    res.json(properties);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/properties/all', authenticateToken, (req, res) => {
  try {
    const properties = db.prepare(`
      SELECT p.*, u.name as agent_name
      FROM properties p JOIN users u ON p.agent_id = u.id
      WHERE p.status IN ('active','pending')
      ORDER BY p.created_at DESC
    `).all();
    res.json(properties);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/agent/properties', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    const { address, city, state, zip, price, beds, baths, sqft, description, status } = req.body;
    if (!address || !city || !state || !zip || !price) return res.status(400).json({ error: 'Missing required fields' });
    const result = db.prepare('INSERT INTO properties (agent_id, address, city, state, zip, price, beds, baths, sqft, description, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(req.user.id, address, city, state, zip, price, beds || null, baths || null, sqft || null, description || null, status || 'active');
    const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(prop);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/agent/properties/:id', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    const { address, city, state, zip, price, beds, baths, sqft, description, status } = req.body;
    const existing = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Property not found' });
    if (existing.agent_id !== req.user.id && req.user.role === 'agent') return res.status(403).json({ error: 'Unauthorized' });
    if (price && price !== existing.price) {
      db.prepare('INSERT INTO price_history (property_id, old_price, new_price, reason) VALUES (?,?,?,?)').run(req.params.id, existing.price, price, 'Price adjustment');
    }
    if (status === 'sold' && existing.status !== 'sold') {
      db.prepare('UPDATE properties SET address=?, city=?, state=?, zip=?, price=?, beds=?, baths=?, sqft=?, description=?, status=?, sold_date=CURRENT_TIMESTAMP WHERE id=?').run(address, city, state, zip, price, beds||null, baths||null, sqft||null, description||null, status, req.params.id);
    } else {
      db.prepare('UPDATE properties SET address=?, city=?, state=?, zip=?, price=?, beds=?, baths=?, sqft=?, description=?, status=? WHERE id=?').run(address, city, state, zip, price, beds||null, baths||null, sqft||null, description||null, status, req.params.id);
    }
    const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
    res.json(prop);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/agent/properties/:id', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    const existing = db.prepare('SELECT agent_id FROM properties WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Property not found' });
    if (existing.agent_id !== req.user.id && req.user.role === 'agent') return res.status(403).json({ error: 'Unauthorized' });
    db.prepare('DELETE FROM properties WHERE id = ?').run(req.params.id);
    res.json({ message: 'Property deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/agent/properties/:id/price-history', authenticateToken, (req, res) => {
  try {
    const history = db.prepare('SELECT * FROM price_history WHERE property_id = ? ORDER BY change_date DESC').all(req.params.id);
    res.json(history);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ==================== BUYER ROUTES ====================

app.get('/api/agent/buyers', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    const buyers = db.prepare('SELECT b.*, (SELECT COUNT(*) FROM buyer_saved_properties WHERE buyer_id = b.id) as saved_count FROM buyers b WHERE b.agent_id = ? ORDER BY b.created_at DESC').all(req.user.id);
    res.json(buyers);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/agent/buyers', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    const { name, email, phone, min_price, max_price, beds_needed, baths_needed, location_preference, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Buyer name is required' });
    const result = db.prepare('INSERT INTO buyers (agent_id, name, email, phone, min_price, max_price, beds_needed, baths_needed, location_preference, notes) VALUES (?,?,?,?,?,?,?,?,?,?)').run(req.user.id, name, email||null, phone||null, min_price||null, max_price||null, beds_needed||null, baths_needed||null, location_preference||null, notes||null);
    const buyer = db.prepare('SELECT * FROM buyers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(buyer);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/agent/buyers/:id', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    const { name, email, phone, min_price, max_price, beds_needed, baths_needed, location_preference, notes, status } = req.body;
    db.prepare('UPDATE buyers SET name=?, email=?, phone=?, min_price=?, max_price=?, beds_needed=?, baths_needed=?, location_preference=?, notes=?, status=? WHERE id=? AND agent_id=?').run(name, email||null, phone||null, min_price||null, max_price||null, beds_needed||null, baths_needed||null, location_preference||null, notes||null, status||'active', req.params.id, req.user.id);
    const buyer = db.prepare('SELECT * FROM buyers WHERE id = ?').get(req.params.id);
    res.json(buyer);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/agent/buyers/:id', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM buyers WHERE id = ? AND agent_id = ?').run(req.params.id, req.user.id);
    res.json({ message: 'Buyer deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/agent/buyers/:id/saved', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    const saved = db.prepare('SELECT p.*, bsp.saved_at, bsp.notes as save_notes FROM buyer_saved_properties bsp JOIN properties p ON bsp.property_id = p.id WHERE bsp.buyer_id = ? ORDER BY bsp.saved_at DESC').all(req.params.id);
    res.json(saved);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/agent/buyers/:id/save-property', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    const { property_id, notes } = req.body;
    db.prepare('INSERT OR IGNORE INTO buyer_saved_properties (buyer_id, property_id, notes) VALUES (?,?,?)').run(req.params.id, property_id, notes||null);
    res.json({ message: 'Property saved for buyer' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/agent/buyers/:buyerId/saved/:propertyId', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM buyer_saved_properties WHERE buyer_id = ? AND property_id = ?').run(req.params.buyerId, req.params.propertyId);
    res.json({ message: 'Saved property removed' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ==================== SELLER ROUTES ====================

app.get('/api/agent/sellers', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    const sellers = db.prepare('SELECT s.*, p.address, p.city, p.state, p.price as current_price, p.status as property_status FROM sellers s LEFT JOIN properties p ON s.property_id = p.id WHERE s.agent_id = ? ORDER BY s.created_at DESC').all(req.user.id);
    res.json(sellers);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/agent/sellers', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    const { name, email, phone, property_id, list_price, commission_rate, agreement_date, expiration_date, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Seller name is required' });
    const result = db.prepare('INSERT INTO sellers (agent_id, name, email, phone, property_id, list_price, commission_rate, agreement_date, expiration_date, notes) VALUES (?,?,?,?,?,?,?,?,?,?)').run(req.user.id, name, email||null, phone||null, property_id||null, list_price||null, commission_rate||6.0, agreement_date||null, expiration_date||null, notes||null);
    const seller = db.prepare('SELECT * FROM sellers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(seller);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/agent/sellers/:id', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    const { name, email, phone, property_id, list_price, commission_rate, agreement_date, expiration_date, notes } = req.body;
    db.prepare('UPDATE sellers SET name=?, email=?, phone=?, property_id=?, list_price=?, commission_rate=?, agreement_date=?, expiration_date=?, notes=? WHERE id=? AND agent_id=?').run(name, email||null, phone||null, property_id||null, list_price||null, commission_rate||6.0, agreement_date||null, expiration_date||null, notes||null, req.params.id, req.user.id);
    const seller = db.prepare('SELECT * FROM sellers WHERE id = ?').get(req.params.id);
    res.json(seller);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/agent/sellers/:id', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM sellers WHERE id = ? AND agent_id = ?').run(req.params.id, req.user.id);
    res.json({ message: 'Seller deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ==================== SHOWINGS ====================

app.get('/api/showings', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    const showings = db.prepare('SELECT s.*, p.address as property_address, p.city, b.name as buyer_name FROM showings s JOIN properties p ON s.property_id = p.id LEFT JOIN buyers b ON s.buyer_id = b.id WHERE s.agent_id = ? ORDER BY s.showing_date DESC').all(req.user.id);
    res.json(showings);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/showings', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    const { property_id, buyer_id, showing_date, feedback, agent_notes, outcome } = req.body;
    const result = db.prepare('INSERT INTO showings (property_id, buyer_id, agent_id, showing_date, feedback, agent_notes, outcome) VALUES (?,?,?,?,?,?,?)').run(property_id, buyer_id||null, req.user.id, showing_date, feedback||null, agent_notes||null, outcome||null);
    const showing = db.prepare('SELECT * FROM showings WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(showing);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/showings/:id', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    const { showing_date, feedback, agent_notes, outcome } = req.body;
    db.prepare('UPDATE showings SET showing_date=?, feedback=?, agent_notes=?, outcome=? WHERE id=? AND agent_id=?').run(showing_date, feedback||null, agent_notes||null, outcome||null, req.params.id, req.user.id);
    const showing = db.prepare('SELECT * FROM showings WHERE id = ?').get(req.params.id);
    res.json(showing);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/showings/:id', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM showings WHERE id = ? AND agent_id = ?').run(req.params.id, req.user.id);
    res.json({ message: 'Showing deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ==================== AGENT COMMISSIONS ====================

app.get('/api/agent/commissions', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    const commissions = db.prepare("SELECT * FROM commissions WHERE user_id = ? AND transaction_type IN ('listing','buyer','referral') ORDER BY commission_date DESC").all(req.user.id);
    const summary = db.prepare("SELECT COALESCE(SUM(commission_amount),0) as total, COALESCE(SUM(CASE WHEN status='received' THEN commission_amount ELSE 0 END),0) as received, COALESCE(SUM(CASE WHEN status='pending' THEN commission_amount ELSE 0 END),0) as pending FROM commissions WHERE user_id = ? AND transaction_type IN ('listing','buyer','referral')").get(req.user.id);
    const ytd = db.prepare("SELECT COALESCE(SUM(commission_amount),0) as total FROM commissions WHERE user_id = ? AND transaction_type IN ('listing','buyer','referral') AND strftime('%Y', commission_date) = strftime('%Y', 'now')").get(req.user.id);
    res.json({ commissions, summary: { ...summary, ytd: ytd.total } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/agent/commissions', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    const { transaction_type, client_name, property_address, sale_price, commission_amount, commission_date, status, notes } = req.body;
    const result = db.prepare('INSERT INTO commissions (user_id, transaction_type, client_name, property_address, sale_price, commission_amount, commission_date, status, notes) VALUES (?,?,?,?,?,?,?,?,?)').run(req.user.id, transaction_type||'listing', client_name, property_address||null, sale_price||null, commission_amount, commission_date||new Date().toISOString(), status||'pending', notes||null);
    const comm = db.prepare('SELECT * FROM commissions WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(comm);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/agent/commissions/:id', authenticateToken, requireRole('agent', 'broker', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM commissions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ message: 'Commission deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ==================== BROKER ROUTES ====================

app.get('/api/broker/agents', authenticateToken, requireRole('broker', 'admin'), (req, res) => {
  try {
    const agents = db.prepare('SELECT * FROM agents WHERE broker_id = ? ORDER BY name').all(req.user.id);
    res.json(agents);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/broker/agents', authenticateToken, requireRole('broker', 'admin'), (req, res) => {
  try {
    const { name, email, phone, license_number, commission_split } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
    const result = db.prepare('INSERT INTO agents (broker_id, name, email, phone, license_number, commission_split) VALUES (?,?,?,?,?,?)').run(req.user.id, name, email, phone||null, license_number||null, commission_split||50.0);
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(agent);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Agent with this email or license already exists' });
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/broker/agents/:id', authenticateToken, requireRole('broker', 'admin'), (req, res) => {
  try {
    const { name, phone, license_number, commission_split, active } = req.body;
    db.prepare('UPDATE agents SET name=?, phone=?, license_number=?, commission_split=?, active=? WHERE id=? AND broker_id=?').run(name, phone||null, license_number||null, commission_split||50.0, active !== undefined ? (active ? 1 : 0) : 1, req.params.id, req.user.id);
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    res.json(agent);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/broker/agents/:id', authenticateToken, requireRole('broker', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM agents WHERE id = ? AND broker_id = ?').run(req.params.id, req.user.id);
    res.json({ message: 'Agent deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Agent performance
app.get('/api/broker/agents/:id/performance', authenticateToken, requireRole('broker', 'admin'), (req, res) => {
  try {
    const perf = db.prepare('SELECT * FROM agent_performance WHERE agent_id = ? ORDER BY year DESC, month DESC').all(req.params.id);
    res.json(perf);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/broker/agents/:id/performance', authenticateToken, requireRole('broker', 'admin'), (req, res) => {
  try {
    const { month, year, listings_count, sales_count, volume, commission_earned } = req.body;
    db.prepare('INSERT OR REPLACE INTO agent_performance (agent_id, month, year, listings_count, sales_count, volume, commission_earned) VALUES (?,?,?,?,?,?,?)').run(req.params.id, month, year, listings_count||0, sales_count||0, volume||0, commission_earned||0);
    res.json({ message: 'Performance updated' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Broker reports
app.get('/api/broker/reports', authenticateToken, requireRole('broker', 'admin'), (req, res) => {
  try {
    const agentCount = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) as active FROM agents WHERE broker_id = ?').get(req.user.id);
    const allAgentPerf = db.prepare('SELECT ap.*, a.name as agent_name FROM agent_performance ap JOIN agents a ON ap.agent_id = a.id WHERE a.broker_id = ? ORDER BY ap.year DESC, ap.month DESC').all(req.user.id);
    const topAgents = db.prepare('SELECT a.name, SUM(ap.volume) as total_volume, SUM(ap.commission_earned) as total_commission, SUM(ap.sales_count) as total_sales FROM agent_performance ap JOIN agents a ON ap.agent_id = a.id WHERE a.broker_id = ? GROUP BY a.id ORDER BY total_volume DESC LIMIT 10').all(req.user.id);
    const monthlyTotals = db.prepare('SELECT ap.month, ap.year, SUM(ap.listings_count) as listings, SUM(ap.sales_count) as sales, SUM(ap.volume) as volume, SUM(ap.commission_earned) as commission FROM agent_performance ap JOIN agents a ON ap.agent_id = a.id WHERE a.broker_id = ? GROUP BY ap.year, ap.month ORDER BY ap.year DESC, ap.month DESC LIMIT 12').all(req.user.id);
    res.json({ agentCount, allAgentPerf, topAgents, monthlyTotals });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ==================== APPOINTMENTS ====================

app.get('/api/appointments', authenticateToken, (req, res) => {
  try {
    const appointments = db.prepare('SELECT * FROM appointments WHERE user_id = ? ORDER BY appointment_date ASC').all(req.user.id);
    res.json(appointments);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/appointments', authenticateToken, (req, res) => {
  try {
    const { title, client_type, client_id, client_name, appointment_date, duration_minutes, location, notes } = req.body;
    if (!title || !appointment_date) return res.status(400).json({ error: 'Title and date required' });
    const result = db.prepare('INSERT INTO appointments (user_id, client_type, client_id, client_name, title, appointment_date, duration_minutes, location, notes) VALUES (?,?,?,?,?,?,?,?,?)').run(req.user.id, client_type||null, client_id||null, client_name||null, title, appointment_date, duration_minutes||60, location||null, notes||null);
    const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(appt);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/appointments/:id', authenticateToken, (req, res) => {
  try {
    const { title, appointment_date, duration_minutes, location, notes, status } = req.body;
    db.prepare('UPDATE appointments SET title=?, appointment_date=?, duration_minutes=?, location=?, notes=?, status=? WHERE id=? AND user_id=?').run(title, appointment_date, duration_minutes||60, location||null, notes||null, status||'scheduled', req.params.id, req.user.id);
    const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    res.json(appt);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/appointments/:id', authenticateToken, (req, res) => {
  try {
    db.prepare('DELETE FROM appointments WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ message: 'Appointment deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ==================== INITIALIZE & START ====================

initDatabase();

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint not found' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║          \u{1f3db}  EMPIRE BROKER PRO                               ║`);
  console.log(`║          Mortgage & Real Estate Platform                     ║`);
  console.log(`║          Server running on http://0.0.0.0:${PORT}              ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
});
