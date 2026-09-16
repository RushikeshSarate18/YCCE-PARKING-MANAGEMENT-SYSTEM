// Check auth and admin role
if (!isLoggedIn()) {
  window.location.href = '/login.html';
}

const user = getUser();
if (user && user.role !== 'admin') {
  showToast('Admin access required', 'error');
  setTimeout(() => window.location.href = '/dashboard.html', 1000);
}

function switchTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));

  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById(`content-${tab}`).classList.add('active');
}

async function loadAdminData() {
  try {
    const data = await apiRequest('/api/admin/overview');
    const { spots, status, activeParking, recentLogs } = data;

    // Update stats
    document.getElementById('admin-zone-a').textContent = `${status.A.occupied}/${status.A.total}`;
    document.getElementById('admin-zone-b').textContent = `${status.B.occupied}/${status.B.total}`;
    document.getElementById('admin-zone-c').textContent = `${status.C.occupied}/${status.C.total}`;
    document.getElementById('admin-total').textContent =
      status.A.occupied + status.B.occupied + status.C.occupied;

    // Render parking grid
    renderParkingGrid(spots);

    // Render active parking
    renderActiveParking(activeParking);

    // Render logs
    renderLogs(recentLogs);

  } catch (err) {
    console.error('Admin load error:', err);
    if (err.message.includes('Admin access')) {
      window.location.href = '/dashboard.html';
    }
    showToast('Failed to load admin data: ' + err.message, 'error');
  }
}

function renderParkingGrid(spots) {
  const container = document.getElementById('parking-grid-container');

  // Group by zone
  const zones = { A: [], B: [], C: [] };
  spots.forEach(spot => {
    zones[spot.zone] = zones[spot.zone] || [];
    zones[spot.zone].push(spot);
  });

  const zoneNames = {
    A: { name: 'Zone A — Near Building', desc: 'Faculty & Authority Only', color: 'var(--primary)' },
    B: { name: 'Zone B — General Parking', desc: 'All Users', color: 'var(--accent)' },
    C: { name: 'Zone C — Two-Wheeler', desc: 'All Users', color: 'var(--success)' }
  };

  let html = '';

  for (const [zone, zoneSpots] of Object.entries(zones)) {
    const occupied = zoneSpots.filter(s => s.is_occupied).length;
    const total = zoneSpots.length;
    const info = zoneNames[zone];

    html += `
      <div class="card" style="margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div>
            <h3 style="color: ${info.color};">${info.name}</h3>
            <p style="color: var(--text-muted); font-size: 0.85rem;">${info.desc}</p>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 1.3rem; font-weight: 800;">${occupied}/${total}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Occupied</div>
          </div>
        </div>
        <div class="parking-grid">
    `;

    zoneSpots.forEach(spot => {
      const statusClass = spot.is_occupied ? 'occupied' : 'available';
      const tooltip = spot.is_occupied
        ? `${spot.vehicle_number} — ${spot.owner_name} (${spot.owner_role})`
        : 'Available';

      html += `
        <div class="parking-spot ${statusClass}" title="${tooltip}">
          ${spot.spot_label}
          <div class="spot-tooltip">${tooltip}</div>
        </div>
      `;
    });

    html += '</div></div>';
  }

  container.innerHTML = html;
}

function renderActiveParking(activeParking) {
  const container = document.getElementById('active-parking-container');

  if (activeParking.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏠</div>
        <p>No vehicles currently parked</p>
      </div>
    `;
    return;
  }

  let html = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Vehicle</th>
            <th>Type</th>
            <th>Owner</th>
            <th>Role</th>
            <th>Spot</th>
            <th>Zone</th>
            <th>Entry Time</th>
          </tr>
        </thead>
        <tbody>
  `;

  activeParking.forEach(p => {
    html += `
      <tr>
        <td style="font-weight: 700;">${p.vehicle_number}</td>
        <td>${p.vehicle_type === 'two-wheeler' ? '🏍️' : '🚗'} ${p.vehicle_type}</td>
        <td>${p.owner_name}</td>
        <td>${roleBadge(p.owner_role)}</td>
        <td style="font-weight: 700; color: var(--primary);">${p.spot_label}</td>
        <td>${p.zone}</td>
        <td>${formatDate(p.entry_time)}</td>
      </tr>
    `;
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function renderLogs(logs) {
  const container = document.getElementById('logs-container');

  if (logs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>No parking logs yet</p>
      </div>
    `;
    return;
  }

  let html = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Vehicle</th>
            <th>Type</th>
            <th>Owner</th>
            <th>Role</th>
            <th>Spot</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
  `;

  logs.forEach(log => {
    html += `
      <tr>
        <td style="font-weight: 700;">${log.vehicle_number}</td>
        <td>${log.vehicle_type === 'two-wheeler' ? '🏍️' : '🚗'}</td>
        <td>${log.owner_name}</td>
        <td>${roleBadge(log.owner_role)}</td>
        <td style="font-weight: 700;">${log.spot_label}</td>
        <td>${formatDate(log.entry_time)}</td>
        <td>${log.exit_time ? formatDate(log.exit_time) : '<span class="badge badge-authority">Active</span>'}</td>
        <td>${formatDuration(log.duration_minutes)}</td>
      </tr>
    `;
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

async function resetAllSpots() {
  if (!confirm('⚠️ Are you sure you want to reset ALL parking spots? This will mark all spots as empty.')) {
    return;
  }

  try {
    await apiRequest('/api/admin/reset', { method: 'PUT' });
    showToast('All parking spots have been reset! 🔄', 'success');
    loadAdminData();
  } catch (err) {
    showToast('Failed to reset: ' + err.message, 'error');
  }
}

// Load initial data
loadAdminData();

// Auto-refresh
setInterval(loadAdminData, 30000);
