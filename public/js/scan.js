// Check auth
if (!isLoggedIn()) {
  window.location.href = '/login.html';
}

let currentMode = 'entry';
let html5QrCode = null;
let isProcessing = false;

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`mode-${mode}`).classList.add('active');

  // Hide result
  document.getElementById('scan-result-card').style.display = 'none';
}

// Initialize QR Scanner
function initScanner() {
  try {
    html5QrCode = new Html5Qrcode("qr-reader");

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0
    };

    html5QrCode.start(
      { facingMode: "environment" },
      config,
      onScanSuccess,
      onScanFailure
    ).catch(err => {
      console.log('Camera not available:', err);
      document.getElementById('qr-reader').innerHTML = `
        <div class="empty-state" style="padding: 40px;">
          <div class="empty-icon">📷</div>
          <p style="color: var(--text-muted);">Camera not available or permission denied.</p>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 8px;">Use the manual input below to paste the QR token.</p>
        </div>
      `;
    });
  } catch (err) {
    console.error('Scanner init error:', err);
  }
}

async function onScanSuccess(decodedText) {
  if (isProcessing) return;
  isProcessing = true;

  // Vibrate if supported
  if (navigator.vibrate) navigator.vibrate(200);

  try {
    // Parse QR data
    let qrData;
    try {
      qrData = JSON.parse(decodedText);
    } catch {
      throw new Error('Invalid QR code format');
    }

    if (!qrData.token) {
      throw new Error('QR code does not contain a valid parking token');
    }

    await processEntry(qrData.token);
  } catch (err) {
    showScanResult('error', err.message);
  }

  // Cooldown before next scan
  setTimeout(() => {
    isProcessing = false;
  }, 3000);
}

function onScanFailure(error) {
  // Ignore - just means no QR detected in this frame
}

async function processManualToken() {
  const tokenInput = document.getElementById('manual-token');
  const token = tokenInput.value.trim();

  if (!token) {
    showToast('Please enter a QR token', 'error');
    return;
  }

  // Try to parse as JSON first (in case they pasted the full QR data)
  let qrToken = token;
  try {
    const parsed = JSON.parse(token);
    if (parsed.token) qrToken = parsed.token;
  } catch {
    // Not JSON, use as-is (raw token)
  }

  await processEntry(qrToken);
  tokenInput.value = '';
}

async function processEntry(qrToken) {
  try {
    const endpoint = currentMode === 'entry' ? '/api/entry' : '/api/exit';
    const result = await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({ qrToken })
    });

    if (currentMode === 'entry') {
      showScanResult('success', `
        <div class="scan-result">
          <div class="result-icon">✅</div>
          <h2 style="color: var(--success); margin-bottom: 8px;">Entry Recorded!</h2>
          <div class="result-spot">${result.spotLabel}</div>
          <div style="margin-top: 16px; color: var(--text-secondary);">
            <p><strong>Zone:</strong> ${result.zoneName}</p>
            <p><strong>Vehicle:</strong> ${result.vehicleNumber}</p>
            <p><strong>Owner:</strong> ${result.ownerName} ${roleBadge(result.ownerRole)}</p>
          </div>
        </div>
      `);
      showToast(`🚗 Assigned spot ${result.spotLabel} to ${result.vehicleNumber}`, 'success');
    } else {
      showScanResult('success', `
        <div class="scan-result">
          <div class="result-icon">👋</div>
          <h2 style="color: var(--accent-light); margin-bottom: 8px;">Exit Recorded!</h2>
          <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin: 12px 0;">
            Spot ${result.spotLabel} is now FREE
          </div>
          <div style="margin-top: 16px; color: var(--text-secondary);">
            <p><strong>Vehicle:</strong> ${result.vehicleNumber}</p>
            <p><strong>Owner:</strong> ${result.ownerName}</p>
            <p><strong>Duration:</strong> ${formatDuration(result.duration)}</p>
          </div>
        </div>
      `);
      showToast(`👋 ${result.vehicleNumber} exited from ${result.spotLabel}`, 'info');
    }

    // Refresh stats
    loadScannerStats();

  } catch (err) {
    showScanResult('error', `
      <div class="scan-result">
        <div class="result-icon">❌</div>
        <h2 style="color: var(--error); margin-bottom: 8px;">Error</h2>
        <p style="color: var(--text-secondary);">${err.message}</p>
      </div>
    `);
    showToast(err.message, 'error');
  }
}

function showScanResult(type, html) {
  const card = document.getElementById('scan-result-card');
  const result = document.getElementById('scan-result');
  card.style.display = 'block';

  if (type === 'error' && typeof html === 'string' && !html.includes('<div')) {
    result.innerHTML = `
      <div class="scan-result">
        <div class="result-icon">❌</div>
        <h2 style="color: var(--error); margin-bottom: 8px;">Error</h2>
        <p style="color: var(--text-secondary);">${html}</p>
      </div>
    `;
  } else {
    result.innerHTML = html;
  }

  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function loadScannerStats() {
  try {
    const status = await apiRequest('/api/parking/status');
    document.getElementById('scan-stat-a').textContent = status.A.available;
    document.getElementById('scan-stat-b').textContent = status.B.available;
    document.getElementById('scan-stat-c').textContent = status.C.available;
  } catch (err) {
    console.log('Stats load error:', err.message);
  }
}

// Initialize
initScanner();
loadScannerStats();
setInterval(loadScannerStats, 15000);
