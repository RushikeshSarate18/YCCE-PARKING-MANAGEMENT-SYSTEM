const jwt = require('jsonwebtoken');

const JWT_SECRET = 'ycce-parking-secret-key-2026';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

function requireGateAccess(req, res, next) {
  if (!['admin', 'faculty', 'authority'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Gate access requires faculty/admin privileges.' });
  }
  next();
}

module.exports = { generateToken, authenticateToken, requireAdmin, requireGateAccess, JWT_SECRET };
