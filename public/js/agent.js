/* ============================================================
   Empire Broker Pro — Real Estate Agent Module
   ============================================================ */

let currentProperties = [], currentBuyers = [], currentSellers = [], currentShowings = [], allProperties = [];
let listingsChart, buyerPropertyChart;

// ==================== Properties ====================
async function loadProperties() {
  try {
    showLoading('propertiesTable');
    currentProperties = await apiGet('/agent/properties') || [];
    renderProperties();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderProperties(filter = '') {
  const tbody = document.getElementById('propertiesBody');
  if (!tbody) return;
  let props = currentProperties;
  if (filter) { const f = filter.toLowerCase(); props = props.filter(p => (p.address || '').toLowerCase().includes(f) || (p.city || '').toLowerCase().includes(f)); }
  if (props.length === 0) { tbody.innerHTML = emptyState('🏠', 'No properties found', properties.length ? 'No properties match your search' : 'Add your first property listing'); return; }
  tbody.innerHTML = props.map(p => {
    const dom = p.listed_date ? daysAgo(p.listed_date) : 0;
    return '<tr><td><strong>' + p.address + '</strong><br><small>' + p.city + ', ' + p.state + ' ' + p.zip + '</small></td><td>' + formatCurrency(p.price) + '</td><td>' + (p.beds || '—') + '/' + (p.baths || '—') + '</td><td>' + (p.sqft ? formatNumber(p.sqft) : '—') + '</td><td>' + statusBadge(p.status) + '</td><td>' + dom + ' days</td><td class="actions"><button class="action-btn" onclick="viewProperty(' + p.id + ')">👁</button><button class="action-btn" onclick="editProperty(' + p.id + ')">✏</button><button class="action-btn delete" onclick="deleteProperty(' + p.id + ')">🗑</button></td></tr>';
  }).join('');
}

async function saveProperty() {
  const id = document.getElementById('propertyId')?.value;
  const body = {
    address: document.getElementById('propAddress').value,
    city: document.getElementById('propCity').value,
    state: document.getElementById('propState').value,
    zip: document.getElementById('propZip').value,
    price: parseFloat(document.getElementById('propPrice').value),
    beds: parseInt(document.getElementById('propBeds').value) || null,
    baths: parseFloat(document.getElementById('propBaths').value) || null,
    sqft: parseInt(document.getElementById('propSqft').value) || null,
    description: document.getElementById('propDesc').value || null,
    status: document.getElementById('propStatus').value
  };
  try {
    if (id) { await apiPut('/agent/properties/' + id, body); showToast('Property updated', 'success'); }
    else { await apiPost('/agent/properties', body); showToast('Property created', 'success'); }
    closeModal('propertyModal'); loadProperties(); loadDashboardStats();
  } catch (err) { showToast(err.message, 'error'); }
}

async function viewProperty(id) {
  try {
    const all = await apiGet('/properties/all');
    const p = all.find(x => x.id === id);
    if (!p) { showToast('Property not found', 'error'); return; }
    const history = await apiGet('/agent/properties/' + id + '/price-history');
    let html = '<div class="grid-2"><div><h4>Property Details</h4><p><strong>' + p.address + '</strong></p><p>' + p.city + ', ' + p.state + ' ' + p.zip + '</p><p><strong>Price:</strong> ' + formatCurrency(p.price) + '</p><p><strong>Beds/Baths:</strong> ' + (p.beds || '—') + '/' + (p.baths || '—') + '</p><p><strong>Sqft:</strong> ' + (p.sqft ? formatNumber(p.sqft) : '—') + '</p><p><strong>Status:</strong> ' + statusBadge(p.status) + '</p><p><strong>Agent:</strong> ' + (p.agent_name || '—') + '</p></div><div><h4>Price History</h4>';
    if (history && history.length) {
      html += '<ul style="list-style:none;padding:0">' + history.map(h => '<li>' + formatDate(h.change_date) + ': <span class="text-gold">' + formatCurrency(h.old_price) + '</span> → <span class="text-success">' + formatCurrency(h.new_price) + '</span></li>').join('') + '</ul>';
    } else { html += '<p>No price history</p>'; }
    html += '</div></div>';
    document.getElementById('viewPropertyContent').innerHTML = html;
    openModal('viewPropertyModal');
  } catch (err) { showToast(err.message, 'error'); }
}

function editProperty(id) {
  const p = currentProperties.find(x => x.id === id);
  if (!p) return;
  document.getElementById('propertyId').value = p.id;
  document.getElementById('propAddress').value = p.address;
  document.getElementById('propCity').value = p.city;
  document.getElementById('propState').value = p.state;
  document.getElementById('propZip').value = p.zip;
  document.getElementById('propPrice').value = p.price;
  document.getElementById('propBeds').value = p.beds || '';
  document.getElementById('propBaths').value = p.baths || '';
  document.getElementById('propSqft').value = p.sqft || '';
  document.getElementById('propDesc').value = p.description || '';
  document.getElementById('propStatus').value = p.status;
  document.getElementById('propertyModalTitle').textContent = 'Edit Property';
  openModal('propertyModal');
}

function newProperty() {
  document.getElementById('propertyId').value = '';
  document.getElementById('propAddress').value = '';
  document.getElementById('propCity').value = '';
  document.getElementById('propState').value = '';
  document.getElementById('propZip').value = '';
  document.getElementById('propPrice').value = '';
  document.getElementById('propBeds').value = '';
  document.getElementById('propBaths').value = '';
  document.getElementById('propSqft').value = '';
  document.getElementById('propDesc').value = '';
  document.getElementById('propStatus').value = 'active';
  document.getElementById('propertyModalTitle').textContent = 'Add Property';
  openModal('propertyModal');
}

async function deleteProperty(id) {
  if (!confirmAction('Delete this property permanently?')) return;
  try { await apiDelete('/agent/properties/' + id); showToast('Property deleted', 'success'); loadProperties(); } catch (err) { showToast(err.message, 'error'); }
}

// ==================== Buyers ====================
async function loadBuyers() {
  try {
    showLoading('buyersTable');
    currentBuyers = await apiGet('/agent/buyers') || [];
    renderBuyers();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderBuyers(filter = '') {
  const tbody = document.getElementById('buyersBody');
  if (!tbody) return;
  let buyers = currentBuyers;
  if (filter) { const f = filter.toLowerCase(); buyers = buyers.filter(b => b.name.toLowerCase().includes(f) || (b.location_preference || '').toLowerCase().includes(f)); }
  if (buyers.length === 0) { tbody.innerHTML = emptyState('🔑', 'No buyers found', buyers.length ? 'No buyers match your search' : 'Add your first buyer'); return; }
  tbody.innerHTML = buyers.map(b =>
    '<tr><td><strong>' + b.name + '</strong></td><td>' + formatCurrency(b.min_price) + ' - ' + formatCurrency(b.max_price) + '</td><td>' + (b.beds_needed || '—') + ' bed, ' + (b.baths_needed || '—') + ' bath</td><td>' + (b.location_preference || '—') + '</td><td>' + statusBadge(b.status) + '</td><td class="actions"><button class="action-btn" onclick="viewBuyer(' + b.id + ')">👁</button><button class="action-btn" onclick="editBuyer(' + b.id + ')">✏</button><button class="action-btn" onclick="matchBuyer(' + b.id + ')">🏠</button><button class="action-btn delete" onclick="deleteBuyer(' + b.id + ')">🗑</button></td></tr>'
  ).join('');
}

async function saveBuyer() {
  const id = document.getElementById('buyerId')?.value;
  const body = {
    name: document.getElementById('buyerName').value,
    email: document.getElementById('buyerEmail').value || null,
    phone: document.getElementById('buyerPhone').value || null,
    min_price: parseFloat(document.getElementById('buyerMinPrice').value) || null,
    max_price: parseFloat(document.getElementById('buyerMaxPrice').value) || null,
    beds_needed: parseInt(document.getElementById('buyerBeds').value) || null,
    baths_needed: parseFloat(document.getElementById('buyerBaths').value) || null,
    location_preference: document.getElementById('buyerLocation').value || null,
    notes: document.getElementById('buyerNotes').value || null,
    status: document.getElementById('buyerStatus').value
  };
  try {
    if (id) { await apiPut('/agent/buyers/' + id, body); showToast('Buyer updated', 'success'); }
    else { await apiPost('/agent/buyers', body); showToast('Buyer created', 'success'); }
    closeModal('buyerModal'); loadBuyers();
  } catch (err) { showToast(err.message, 'error'); }
}

async function viewBuyer(id) {
  try {
    const b = currentBuyers.find(x => x.id === id);
    if (!b) return;
    const saved = await apiGet('/agent/buyers/' + id + '/saved');
    let html = '<div class="grid-2"><div><h4>' + b.name + '</h4><p><strong>Email:</strong> ' + (b.email || '—') + '</p><p><strong>Phone:</strong> ' + (b.phone || '—') + '</p><p><strong>Budget:</strong> ' + formatCurrency(b.min_price) + ' - ' + formatCurrency(b.max_price) + '</p><p><strong>Requirements:</strong> ' + (b.beds_needed || '—') + ' bed / ' + (b.baths_needed || '—') + ' bath</p><p><strong>Location:</strong> ' + (b.location_preference || '—') + '</p></div><div><h4>Saved Properties (' + (saved.length) + ')</h4>';
    if (saved && saved.length) {
      html += '<ul style="list-style:none;padding:0">' + saved.map(s => '<li>' + s.address + ' - ' + formatCurrency(s.price) + ' <button class="btn btn-sm btn-danger" onclick="unsaveProperty(' + id + ',' + s.id + ')">Remove</button></li>').join('') + '</ul>';
    } else { html += '<p>No saved properties</p>'; }
    html += '</div></div>';
    document.getElementById('viewBuyerContent').innerHTML = html;
    openModal('viewBuyerModal');
  } catch (err) { showToast(err.message, 'error'); }
}

function editBuyer(id) {
  const b = currentBuyers.find(x => x.id === id);
  if (!b) return;
  document.getElementById('buyerId').value = b.id;
  document.getElementById('buyerName').value = b.name;
  document.getElementById('buyerEmail').value = b.email || '';
  document.getElementById('buyerPhone').value = b.phone || '';
  document.getElementById('buyerMinPrice').value = b.min_price || '';
  document.getElementById('buyerMaxPrice').value = b.max_price || '';
  document.getElementById('buyerBeds').value = b.beds_needed || '';
  document.getElementById('buyerBaths').value = b.baths_needed || '';
  document.getElementById('buyerLocation').value = b.location_preference || '';
  document.getElementById('buyerNotes').value = b.notes || '';
  document.getElementById('buyerStatus').value = b.status;
  document.getElementById('buyerModalTitle').textContent = 'Edit Buyer';
  openModal('buyerModal');
}

function newBuyer() {
  document.getElementById('buyerId').value = '';
  document.getElementById('buyerName').value = '';
  document.getElementById('buyerEmail').value = '';
  document.getElementById('buyerPhone').value = '';
  document.getElementById('buyerMinPrice').value = '';
  document.getElementById('buyerMaxPrice').value = '';
  document.getElementById('buyerBeds').value = '';
  document.getElementById('buyerBaths').value = '';
  document.getElementById('buyerLocation').value = '';
  document.getElementById('buyerNotes').value = '';
  document.getElementById('buyerStatus').value = 'active';
  document.getElementById('buyerModalTitle').textContent = 'Add Buyer';
  openModal('buyerModal');
}

async function deleteBuyer(id) {
  if (!confirmAction('Delete this buyer?')) return;
  try { await apiDelete('/agent/buyers/' + id); showToast('Buyer deleted', 'success'); loadBuyers(); } catch (err) { showToast(err.message, 'error'); }
}

async function unsaveProperty(buyerId, propertyId) {
  try { await apiDelete('/agent/buyers/' + buyerId + '/saved/' + propertyId); viewBuyer(buyerId); showToast('Property removed', 'success'); } catch (err) { showToast(err.message, 'error'); }
}

// ==================== Property Matching ====================
async function matchBuyer(buyerId) {
  const buyer = currentBuyers.find(b => b.id === buyerId);
  if (!buyer) return;
  try {
    allProperties = await apiGet('/properties/all') || currentProperties || [];
    const matches = allProperties.filter(p => {
      if (buyer.max_price && p.price > buyer.max_price) return false;
      if (buyer.min_price && p.price < buyer.min_price) return false;
      if (buyer.beds_needed && p.beds && p.beds < buyer.beds_needed) return false;
      if (buyer.baths_needed && p.baths && p.baths < buyer.baths_needed) return false;
      return true;
    });
    let html = '<h4>Properties matching "' + buyer.name + '" (' + matches.length + ')</h4><div class="mt-4">';
    if (matches.length === 0) { html += '<p>No matching properties found</p>'; }
    else {
      html += matches.map(p =>
        '<div class="card mb-4 flex-between"><div><strong>' + p.address + '</strong><br><small>' + p.city + ', ' + p.state + '</small><br><span class="text-gold">' + formatCurrency(p.price) + '</span></div><button class="btn btn-primary btn-sm" onclick="savePropertyForBuyer(' + buyerId + ',' + p.id + ')">Save</button></div>'
      ).join('');
    }
    html += '</div>';
    document.getElementById('matchBuyerContent').innerHTML = html;
    openModal('matchBuyerModal');
  } catch (err) { showToast(err.message, 'error'); }
}

async function savePropertyForBuyer(buyerId, propertyId) {
  try { await apiPost('/agent/buyers/' + buyerId + '/save-property', { property_id: propertyId }); showToast('Property saved for buyer', 'success'); closeModal('matchBuyerModal'); } catch (err) { showToast(err.message, 'error'); }
}

// ==================== Sellers ====================
async function loadSellers() {
  try {
    showLoading('sellersTable');
    currentSellers = await apiGet('/agent/sellers') || [];
    renderSellers();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderSellers(filter = '') {
  const tbody = document.getElementById('sellersBody');
  if (!tbody) return;
  let sellers = currentSellers;
  if (filter) { const f = filter.toLowerCase(); sellers = sellers.filter(s => s.name.toLowerCase().includes(f)); }
  if (sellers.length === 0) { tbody.innerHTML = emptyState('💼', 'No sellers found', sellers.length ? 'No sellers match your search' : 'Add your first seller'); return; }
  tbody.innerHTML = sellers.map(s =>
    '<tr><td><strong>' + s.name + '</strong></td><td>' + (s.email || '—') + '</td><td>' + (s.phone || '—') + '</td><td>' + formatCurrency(s.list_price) + '</td><td>' + s.commission_rate + '%</td><td>' + (s.property_id ? (s.address || 'Linked') : '—') + '</td><td class="actions"><button class="action-btn" onclick="editSeller(' + s.id + ')">✏</button><button class="action-btn delete" onclick="deleteSeller(' + s.id + ')">🗑</button></td></tr>'
  ).join('');
}

async function saveSeller() {
  const id = document.getElementById('sellerId')?.value;
  const body = {
    name: document.getElementById('sellerName').value,
    email: document.getElementById('sellerEmail').value || null,
    phone: document.getElementById('sellerPhone').value || null,
    property_id: parseInt(document.getElementById('sellerPropertyId').value) || null,
    list_price: parseFloat(document.getElementById('sellerListPrice').value) || null,
    commission_rate: parseFloat(document.getElementById('sellerCommission').value) || 6.0,
    agreement_date: document.getElementById('sellerAgreementDate').value || null,
    expiration_date: document.getElementById('sellerExpirationDate').value || null,
    notes: document.getElementById('sellerNotes').value || null
  };
  try {
    if (id) { await apiPut('/agent/sellers/' + id, body); showToast('Seller updated', 'success'); }
    else { await apiPost('/agent/sellers', body); showToast('Seller created', 'success'); }
    closeModal('sellerModal'); loadSellers();
  } catch (err) { showToast(err.message, 'error'); }
}

function editSeller(id) {
  const s = currentSellers.find(x => x.id === id);
  if (!s) return;
  document.getElementById('sellerId').value = s.id;
  document.getElementById('sellerName').value = s.name;
  document.getElementById('sellerEmail').value = s.email || '';
  document.getElementById('sellerPhone').value = s.phone || '';
  document.getElementById('sellerPropertyId').value = s.property_id || '';
  document.getElementById('sellerListPrice').value = s.list_price || '';
  document.getElementById('sellerCommission').value = s.commission_rate || 6;
  document.getElementById('sellerAgreementDate').value = s.agreement_date || '';
  document.getElementById('sellerExpirationDate').value = s.expiration_date || '';
  document.getElementById('sellerNotes').value = s.notes || '';
  document.getElementById('sellerModalTitle').textContent = 'Edit Seller';
  openModal('sellerModal');
}

function newSeller() {
  document.getElementById('sellerId').value = '';
  document.getElementById('sellerName').value = '';
  document.getElementById('sellerEmail').value = '';
  document.getElementById('sellerPhone').value = '';
  document.getElementById('sellerPropertyId').value = '';
  document.getElementById('sellerListPrice').value = '';
  document.getElementById('sellerCommission').value = '6';
  document.getElementById('sellerAgreementDate').value = '';
  document.getElementById('sellerExpirationDate').value = '';
  document.getElementById('sellerNotes').value = '';
  document.getElementById('sellerModalTitle').textContent = 'Add Seller';
  openModal('sellerModal');
}

async function deleteSeller(id) {
  if (!confirmAction('Delete this seller?')) return;
  try { await apiDelete('/agent/sellers/' + id); showToast('Seller deleted', 'success'); loadSellers(); } catch (err) { showToast(err.message, 'error'); }
}

// ==================== Showings ====================
async function loadShowings() {
  try {
    showLoading('showingsTable');
    currentShowings = await apiGet('/showings') || [];
    renderShowings();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderShowings(filter = '') {
  const tbody = document.getElementById('showingsBody');
  if (!tbody) return;
  let shows = currentShowings;
  if (filter) { const f = filter.toLowerCase(); shows = shows.filter(s => (s.property_address || '').toLowerCase().includes(f)); }
  if (shows.length === 0) { tbody.innerHTML = emptyState('🏡', 'No showings scheduled', 'Schedule your first property showing'); return; }
  tbody.innerHTML = shows.map(s =>
    '<tr><td><strong>' + s.property_address + '</strong><br><small>' + s.city + '</small></td><td>' + (s.buyer_name || '—') + '</td><td>' + formatDateTime(s.showing_date) + '</td><td>' + statusBadge(s.outcome || 'scheduled') + '</td><td class="actions"><button class="action-btn" onclick="editShowing(' + s.id + ')">✏</button><button class="action-btn delete" onclick="deleteShowing(' + s.id + ')">🗑</button></td></tr>'
  ).join('');
}

async function saveShowing() {
  const id = document.getElementById('showingId')?.value;
  const body = {
    property_id: parseInt(document.getElementById('showingPropertyId').value),
    buyer_id: parseInt(document.getElementById('showingBuyerId').value) || null,
    showing_date: document.getElementById('showingDate').value,
    feedback: document.getElementById('showingFeedback').value || null,
    agent_notes: document.getElementById('showingNotes').value || null,
    outcome: document.getElementById('showingOutcome').value || null
  };
  try {
    if (id) { await apiPut('/showings/' + id, body); showToast('Showing updated', 'success'); }
    else { await apiPost('/showings', body); showToast('Showing scheduled', 'success'); }
    closeModal('showingModal'); loadShowings();
  } catch (err) { showToast(err.message, 'error'); }
}

function editShowing(id) {
  const s = currentShowings.find(x => x.id === id);
  if (!s) return;
  document.getElementById('showingId').value = s.id;
  document.getElementById('showingPropertyId').value = s.property_id;
  document.getElementById('showingBuyerId').value = s.buyer_id || '';
  document.getElementById('showingDate').value = s.showing_date?.slice(0, 16) || '';
  document.getElementById('showingFeedback').value = s.feedback || '';
  document.getElementById('showingNotes').value = s.agent_notes || '';
  document.getElementById('showingOutcome').value = s.outcome || '';
  document.getElementById('showingModalTitle').textContent = 'Edit Showing';
  openModal('showingModal');
}

function newShowing() {
  document.getElementById('showingId').value = '';
  document.getElementById('showingPropertyId').value = '';
  document.getElementById('showingBuyerId').value = '';
  document.getElementById('showingDate').value = '';
  document.getElementById('showingFeedback').value = '';
  document.getElementById('showingNotes').value = '';
  document.getElementById('showingOutcome').value = '';
  document.getElementById('showingModalTitle').textContent = 'Schedule Showing';
  openModal('showingModal');
}

async function deleteShowing(id) {
  if (!confirmAction('Delete this showing?')) return;
  try { await apiDelete('/showings/' + id); showToast('Showing deleted', 'success'); loadShowings(); } catch (err) { showToast(err.message, 'error'); }
}

// ==================== Commissions ====================
async function loadAgentCommissions() {
  try {
    const data = await apiGet('/agent/commissions');
    const tbody = document.getElementById('agentCommissionsBody');
    if (tbody) tbody.innerHTML = (data.commissions || []).map(c =>
      '<tr><td>' + formatDate(c.commission_date) + '</td><td>' + c.client_name + '</td><td>' + (c.property_address || '—') + '</td><td>' + formatCurrency(c.sale_price) + '</td><td class="text-gold"><strong>' + formatCurrency(c.commission_amount) + '</strong></td><td>' + statusBadge(c.status) + '</td><td class="actions"><button class="action-btn delete" onclick="deleteAgentCommission(' + c.id + ')">🗑</button></td></tr>'
    ).join('');
    const s = data.summary || {};
    if (document.getElementById('agentCommTotal')) document.getElementById('agentCommTotal').textContent = formatCurrency(s.total || 0);
    if (document.getElementById('agentCommReceived')) document.getElementById('agentCommReceived').textContent = formatCurrency(s.received || 0);
    if (document.getElementById('agentCommPending')) document.getElementById('agentCommPending').textContent = formatCurrency(s.pending || 0);
    if (document.getElementById('agentCommYTD')) document.getElementById('agentCommYTD').textContent = formatCurrency(s.ytd || 0);
  } catch (err) { console.error(err); }
}

async function saveAgentCommission() {
  const body = { transaction_type: document.getElementById('agentCommType').value, client_name: document.getElementById('agentCommClient').value, property_address: document.getElementById('agentCommProperty').value || null, sale_price: parseFloat(document.getElementById('agentCommSalePrice').value) || null, commission_amount: parseFloat(document.getElementById('agentCommAmount').value), commission_date: document.getElementById('agentCommDate').value, status: document.getElementById('agentCommStatus').value, notes: document.getElementById('agentCommNotes').value || null };
  try { await apiPost('/agent/commissions', body); closeModal('agentCommissionModal'); loadAgentCommissions(); showToast('Commission added', 'success'); } catch (err) { showToast(err.message, 'error'); }
}

async function deleteAgentCommission(id) { if (!confirmAction('Delete this commission?')) return; try { await apiDelete('/agent/commissions/' + id); loadAgentCommissions(); showToast('Commission deleted', 'success'); } catch (err) { showToast(err.message, 'error'); } }

// ==================== Dashboard ====================
async function loadAgentDashboard() {
  try {
    const stats = await apiGet('/dashboard/stats');
    if (document.getElementById('statListings')) document.getElementById('statListings').textContent = formatNumber(stats.totalListings || 0);
    if (document.getElementById('statActiveListings')) document.getElementById('statActiveListings').textContent = formatNumber(stats.activeListings || 0);
    if (document.getElementById('statSold')) document.getElementById('statSold').textContent = formatNumber(stats.soldProperties || 0);
    if (document.getElementById('statBuyers')) document.getElementById('statBuyers').textContent = formatNumber(stats.totalBuyers || 0);
    if (document.getElementById('statSellers')) document.getElementById('statSellers').textContent = formatNumber(stats.totalSellers || 0);
    if (document.getElementById('statShowings')) document.getElementById('statShowings').textContent = formatNumber(stats.totalShowings || 0);
    if (document.getElementById('statVolume')) document.getElementById('statVolume').textContent = formatCurrencyShort(stats.salesVolume || 0);
    if (document.getElementById('statCommission')) document.getElementById('statCommission').textContent = formatCurrency(stats.totalCommission || 0);
    const props = await apiGet('/agent/properties');
    if (props && document.getElementById('recentListings')) {
      document.getElementById('recentListings').innerHTML = props.slice(0, 5).map(p =>
        '<tr><td><strong>' + p.address + '</strong></td><td>' + formatCurrency(p.price) + '</td><td>' + statusBadge(p.status) + '</td><td>' + daysAgo(p.listed_date) + ' days</td></tr>'
      ).join('');
    }
    const ctx = document.getElementById('listingsChart')?.getContext('2d');
    if (ctx && props) {
      const counts = { active: 0, pending: 0, sold: 0, withdrawn: 0 };
      props.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
      if (listingsChart) listingsChart.destroy();
      listingsChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ['Active', 'Pending', 'Sold', 'Withdrawn'], datasets: [{ data: [counts.active, counts.pending, counts.sold, counts.withdrawn], backgroundColor: ['#10b981', '#f59e0b', '#3b82f6', '#ef4444'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#e6e6e6' } } } }
      });
    }
  } catch (err) { console.error('Dashboard error:', err); }
}

function loadDashboardStats() {}

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  if (path.includes('/agent/dashboard.html')) { requireAuth(); loadAgentDashboard(); }
  if (path.includes('/agent/listings.html')) { requireAuth(); loadProperties(); }
  if (path.includes('/agent/buyers.html')) { requireAuth(); loadBuyers(); loadProperties().then(() => { allProperties = currentProperties; }); }
  if (path.includes('/agent/sellers.html')) { requireAuth(); loadSellers(); loadProperties().then(() => { allProperties = currentProperties; }); }
});
