// ─── API Helper ─────────────────────────────────────
const API_BASE = '';

function getToken() {
  return localStorage.getItem('ycce_parking_token');
}

function getUser() {
  const data = localStorage.getItem('ycce_parking_user');
  return data ? JSON.parse(data) : null;
}

function saveAuth(token, user) {
  localStorage.setItem('ycce_parking_token', token);
  localStorage.setItem('ycce_parking_user', JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem('ycce_parking_token');
  localStorage.removeItem('ycce_parking_user');
}

function isLoggedIn() {
  return !!getToken();
}

async function apiRequest(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };

  try {
    const response = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong');
    }

    return data;
  } catch (err) {
    if (err.message === 'Failed to fetch') {
      throw new Error('Cannot connect to server. Please try again.');
    }
    throw err;
  }
}

// Toast notifications
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Update navbar based on auth state
function updateNavbar() {
  const user = getUser();
  const authLinks = document.getElementById('auth-links');
  if (!authLinks) return;

  if (user) {
    const roleColors = { student: '#3b82f6', faculty: '#8b5cf6', authority: '#f97316', admin: '#ef4444' };
    authLinks.innerHTML = `
      <a href="/dashboard.html" class="active">Dashboard</a>
      ${user.role === 'admin' ? '<a href="/admin.html">Admin</a>' : ''}
      <a href="/scan.html">Scanner</a>
      <span style="color: ${roleColors[user.role] || '#fff'}; font-weight: 600; padding: 8px 16px;">
        👤 ${user.name}
      </span>
      <a href="#" onclick="logout()" class="btn-nav">Logout</a>
    `;
  } else {
    authLinks.innerHTML = `
      <a href="/login.html">Login</a>
      <a href="/register.html" class="btn-nav">Register</a>
    `;
  }
}

function logout() {
  clearAuth();
  window.location.href = '/index.html';
}

// Scroll animations
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}

// Navbar scroll effect
function initNavbarScroll() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
}

// Mobile nav toggle
function toggleNav() {
  const navLinks = document.querySelector('.nav-links');
  if (navLinks) navLinks.classList.toggle('open');
}

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'Z');
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

// Format duration
function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

// Role badge HTML
function roleBadge(role) {
  return `<span class="badge badge-${role}">${role}</span>`;
}

// Init common
document.addEventListener('DOMContentLoaded', () => {
  updateNavbar();
  initNavbarScroll();
  initScrollAnimations();
});
