// Check auth
if (!isLoggedIn()) {
  window.location.href = '/login.html';
}

let currentQrImage = null;

async function loadDashboard() {
  try {
    // Load profile
    const profileData = await apiRequest('/api/profile');
    const { user, vehicles, logs, currentParking } = profileData;

    // Greeting
    document.getElementById('dashboard-greeting').innerHTML = `Welcome, <span class="text-gradient-orange">${user.name}</span> 👋`;
    document.getElementById('dashboard-subtitle').innerHTML = `${roleBadge(user.role)} — ${user.department || 'YCCE Nagpur'}`;

    // Profile info
    document.getElementById('profile-info').innerHTML = `
      <div style="display: grid; gap: 16px;">
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--glass-border);">
          <span style="color: var(--text-muted);">Name</span>
          <span style="font-weight: 600;">${user.name}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--glass-border);">
          <span style="color: var(--text-muted);">Email</span>
          <span style="font-weight: 600;">${user.email}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--glass-border);">
          <span style="color: var(--text-muted);">Role</span>
          <span>${roleBadge(user.role)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--glass-border);">
          <span style="color: var(--text-muted);">Department</span>
          <span style="font-weight: 600;">${user.department || '—'}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0;">
          <span style="color: var(--text-muted);">Phone</span>
          <span style="font-weight: 600;">${user.phone || '—'}</span>
        </div>
      </div>
    `;

    // Vehicle info
    if (vehicles.length > 0) {
      const v = vehicles[0];
      document.getElementById('vehicle-info').innerHTML = `
        <div style="display: grid; gap: 16px;">
          <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--glass-border);">
            <span style="color: var(--text-muted);">Type</span>
            <span style="font-weight: 600;">${v.vehicle_type === 'two-wheeler' ? '🏍️ Two-Wheeler' : '🚗 Four-Wheeler'}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--glass-border);">
            <span style="color: var(--text-muted);">Number</span>
            <span style="font-weight: 800; color: var(--primary); letter-spacing: 0.05em;">${v.vehicle_number}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--glass-border);">
            <span style="color: var(--text-muted);">Model</span>
            <span style="font-weight: 600;">${v.vehicle_model || '—'}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 10px 0;">
            <span style="color: var(--text-muted);">Allowed Zones</span>
            <span style="font-weight: 600;">${getAllowedZones(user.role, v.vehicle_type)}</span>
          </div>
        </div>
      `;

      // Load QR code
      loadQRCode(v.qr_token);
    }

    // Current parking
    if (currentParking) {
      const statusEl = document.getElementById('current-parking');
      statusEl.className = 'current-parking parked';
      const zoneNames = { A: 'Near Building', B: 'General Parking', C: 'Two-Wheeler Zone' };
      statusEl.innerHTML = `
        <div class="spot-big">${currentParking.spot}</div>
        <h3 style="color: var(--primary); margin-top: 8px;">Currently Parked</h3>
        <p style="color: var(--text-secondary); margin-top: 4px;">
          ${zoneNames[currentParking.zone] || currentParking.zone} — ${currentParking.vehicleNumber}
        </p>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 8px;">
          Since: ${formatDate(currentParking.entryTime)}
        </p>
      `;
    }

    // Parking history
    if (logs.length > 0) {
      let historyHTML = `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Spot</th>
                <th>Zone</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
      `;
      logs.forEach(log => {
        historyHTML += `
          <tr>
            <td>${log.vehicle_number}</td>
            <td style="font-weight: 700;">${log.spot_label}</td>
            <td>${log.zone}</td>
            <td>${formatDate(log.entry_time)}</td>
            <td>${log.exit_time ? formatDate(log.exit_time) : '<span class="badge badge-authority">Active</span>'}</td>
            <td>${formatDuration(log.duration_minutes)}</td>
          </tr>
        `;
      });
      historyHTML += '</tbody></table></div>';
      document.getElementById('history-container').innerHTML = historyHTML;
    } else {
      document.getElementById('history-container').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <p>No parking history yet. Scan your QR at the entry gate to get started!</p>
        </div>
      `;
    }

    // Load parking stats
    loadParkingStats();

  } catch (err) {
    console.error('Dashboard load error:', err);
    if (err.message.includes('Access denied') || err.message.includes('Invalid')) {
      clearAuth();
      window.location.href = '/login.html';
    }
    showToast('Failed to load dashboard: ' + err.message, 'error');
  }
}

async function loadQRCode(qrToken) {
  try {
    const data = await apiRequest(`/api/qrcode/${qrToken}`);
    currentQrImage = data.qrImage;

    document.getElementById('qr-display').innerHTML = `
      <div class="qr-image">
        <img src="${data.qrImage}" alt="QR Code for ${data.vehicleNumber}" id="qr-img">
      </div>
      <div class="qr-vehicle-number">${data.vehicleNumber}</div>
      <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 8px;">
        Show this QR code at the entry/exit gate
      </p>
    `;
  } catch (err) {
    document.getElementById('qr-display').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Failed to load QR code</p>
      </div>
    `;
  }
}

async function loadParkingStats() {
  try {
    const status = await apiRequest('/api/parking/status');
    document.getElementById('stat-zone-a').textContent = status.A.available;
    document.getElementById('stat-zone-b').textContent = status.B.available;
    document.getElementById('stat-zone-c').textContent = status.C.available;
    document.getElementById('stat-total-available').textContent =
      status.A.available + status.B.available + status.C.available;
  } catch (err) {
    console.log('Could not load stats:', err.message);
  }
}

function downloadQR() {
  if (!currentQrImage) {
    showToast('QR code not loaded yet', 'error');
    return;
  }

  const link = document.createElement('a');
  link.download = 'ycce-parking-qr.png';
  link.href = currentQrImage;
  link.click();
  showToast('QR code downloaded! 📥', 'success');
}

function getAllowedZones(role, vehicleType) {
  if (role === 'student') {
    return vehicleType === 'two-wheeler' ? 'C, B' : 'B';
  }
  return vehicleType === 'four-wheeler' ? 'A, B' : 'C, A, B';
}

// Load dashboard
loadDashboard();

// Auto-refresh
setInterval(loadParkingStats, 30000);
