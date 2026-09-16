async function handleLogin(e) {
  e.preventDefault();

  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width: 20px; height: 20px; margin: 0; display: inline-block;"></div> Logging in...';

  const alertContainer = document.getElementById('alert-container');
  alertContainer.innerHTML = '';

  try {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      throw new Error('Please enter both email and password.');
    }

    const result = await apiRequest('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    saveAuth(result.token, result.user);

    showToast(`Welcome back, ${result.user.name}! 👋`, 'success');

    // Redirect based on role
    setTimeout(() => {
      if (result.user.role === 'admin') {
        window.location.href = '/admin.html';
      } else {
        window.location.href = '/dashboard.html';
      }
    }, 800);

  } catch (err) {
    alertContainer.innerHTML = `
      <div class="alert alert-error">
        <span>❌</span> ${err.message}
      </div>
    `;
    btn.disabled = false;
    btn.innerHTML = '🔓 Login';
  }
}

// Redirect if already logged in
if (isLoggedIn()) {
  const user = getUser();
  window.location.href = user.role === 'admin' ? '/admin.html' : '/dashboard.html';
}
