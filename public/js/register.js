let currentStep = 1;

function goToStep(step) {
  // Validate current step before moving forward
  if (step > currentStep) {
    if (!validateStep(currentStep)) return;
  }

  // If going to review step, populate review data
  if (step === 3) {
    populateReview();
  }

  currentStep = step;

  // Update panels
  document.querySelectorAll('.form-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`step-${step}`).classList.add('active');

  // Update dots
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById(`dot-${i}`);
    dot.classList.remove('active', 'completed');
    if (i < step) dot.classList.add('completed');
    else if (i === step) dot.classList.add('active');
  }

  // Update lines
  for (let i = 1; i <= 2; i++) {
    const line = document.getElementById(`line-${i}`);
    line.classList.toggle('active', i < step);
  }
}

function validateStep(step) {
  const alert = document.getElementById('alert-container');
  alert.innerHTML = '';

  if (step === 1) {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm-password').value;

    if (!name || !email || !password) {
      showAlert('Please fill in all required fields (Name, Email, Password).', 'error');
      return false;
    }

    if (!email.includes('@')) {
      showAlert('Please enter a valid email address.', 'error');
      return false;
    }

    if (password.length < 6) {
      showAlert('Password must be at least 6 characters long.', 'error');
      return false;
    }

    if (password !== confirm) {
      showAlert('Passwords do not match.', 'error');
      return false;
    }
  }

  if (step === 2) {
    const vehicleNumber = document.getElementById('reg-vehicle-number').value.trim();
    if (!vehicleNumber) {
      showAlert('Please enter your vehicle number.', 'error');
      return false;
    }
  }

  return true;
}

function showAlert(message, type) {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const container = document.getElementById('alert-container');
  container.innerHTML = `
    <div class="alert alert-${type}">
      <span>${icons[type]}</span> ${message}
    </div>
  `;
  container.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function populateReview() {
  const role = document.querySelector('input[name="role"]:checked').value;
  const vehicleType = document.querySelector('input[name="vehicleType"]:checked').value;

  document.getElementById('review-name').textContent = document.getElementById('reg-name').value;
  document.getElementById('review-email').textContent = document.getElementById('reg-email').value;
  document.getElementById('review-role').innerHTML = `<span class="badge badge-${role}">${role.charAt(0).toUpperCase() + role.slice(1)}</span>`;
  document.getElementById('review-department').textContent = document.getElementById('reg-department').value || 'Not specified';
  document.getElementById('review-vehicle-type').textContent = vehicleType === 'two-wheeler' ? '🏍️ Two-Wheeler' : '🚗 Four-Wheeler';
  document.getElementById('review-vehicle-number').textContent = document.getElementById('reg-vehicle-number').value.toUpperCase();
  document.getElementById('review-vehicle-model').textContent = document.getElementById('reg-vehicle-model').value || 'Not specified';

  // Determine allowed zones
  let zones = '';
  if (role === 'student') {
    zones = vehicleType === 'two-wheeler' ? 'Zone C, Zone B' : 'Zone B';
  } else {
    zones = vehicleType === 'four-wheeler' ? 'Zone A, Zone B' : 'Zone C, Zone A, Zone B';
  }
  document.getElementById('review-zones').textContent = zones;
}

async function submitRegistration() {
  if (!validateStep(1) || !validateStep(2)) return;

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width: 20px; height: 20px; margin: 0;"></div> Registering...';

  try {
    const data = {
      name: document.getElementById('reg-name').value.trim(),
      email: document.getElementById('reg-email').value.trim(),
      password: document.getElementById('reg-password').value,
      role: document.querySelector('input[name="role"]:checked').value,
      department: document.getElementById('reg-department').value,
      phone: document.getElementById('reg-phone').value.trim(),
      vehicleType: document.querySelector('input[name="vehicleType"]:checked').value,
      vehicleNumber: document.getElementById('reg-vehicle-number').value.trim(),
      vehicleModel: document.getElementById('reg-vehicle-model').value.trim()
    };

    const result = await apiRequest('/api/register', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    // Save auth
    saveAuth(result.token, result.user);

    showAlert('Registration successful! Redirecting to dashboard...', 'success');
    showToast('Welcome to YCCE Parking! 🎉', 'success');

    setTimeout(() => {
      window.location.href = '/dashboard.html';
    }, 1500);

  } catch (err) {
    showAlert(err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '🚀 Complete Registration';
  }
}

// Redirect if already logged in
if (isLoggedIn()) {
  window.location.href = '/dashboard.html';
}
