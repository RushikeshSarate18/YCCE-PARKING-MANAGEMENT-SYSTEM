const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');

const db = require('./db');
const { generateToken, authenticateToken, requireAdmin, requireGateAccess } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Initialize database (async)
(async () => {
  await db.initDatabase();
  console.log('Database ready, starting server...');

// ─── Auth Routes ─────────────────────────────────────────

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, role, department, phone, vehicleType, vehicleNumber, vehicleModel } = req.body;

    // Validation
    if (!name || !email || !password || !role || !vehicleType || !vehicleNumber) {
      return res.status(400).json({ error: 'All required fields must be provided.' });
    }

    if (!['student', 'faculty', 'authority'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be student, faculty, or authority.' });
    }

    // Check if email already exists
    const existingUser = db.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    // Check if vehicle already exists
    const existingVehicle = db.getVehicleByNumber(vehicleNumber);
    if (existingVehicle) {
      return res.status(409).json({ error: 'Vehicle number already registered.' });
    }

    // Create user
    const userId = db.createUser(name, email, password, role, department, phone);

    // Create vehicle
    const vehicle = db.createVehicle(userId, vehicleType, vehicleNumber, vehicleModel);

    // Generate token
    const user = db.getUserById(userId);
    const token = generateToken(user);

    res.status(201).json({
      message: 'Registration successful!',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      vehicle: { id: vehicle.id, qrToken: vehicle.qrToken }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken(user);

    res.json({
      message: 'Login successful!',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─── User Routes ─────────────────────────────────────────

// Get profile
app.get('/api/profile', authenticateToken, (req, res) => {
  try {
    const user = db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const vehicles = db.getVehiclesByUserId(req.user.id);
    const logs = db.getParkingLogsByUserId(req.user.id);

    // Check current parking status
    let currentParking = null;
    for (const vehicle of vehicles) {
      const spot = db.getSpotByVehicleId(vehicle.id);
      if (spot) {
        const activeLog = db.getActiveParkingByVehicleId(vehicle.id);
        currentParking = {
          spot: spot.spot_label,
          zone: spot.zone,
          vehicleNumber: vehicle.vehicle_number,
          entryTime: activeLog ? activeLog.entry_time : spot.occupied_at
        };
        break;
      }
    }

    res.json({ user, vehicles, logs, currentParking });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

// Generate QR code image
app.get('/api/qrcode/:qrToken', async (req, res) => {
  try {
    const { qrToken } = req.params;
    const vehicle = db.getVehicleByQrToken(qrToken);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found.' });

    const qrData = JSON.stringify({
      token: qrToken,
      vehicleNumber: vehicle.vehicle_number,
      type: vehicle.vehicle_type
    });

    const qrImage = await QRCode.toDataURL(qrData, {
      width: 400,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' }
    });

    res.json({ qrImage, vehicleNumber: vehicle.vehicle_number });
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).json({ error: 'Failed to generate QR code.' });
  }
});

// ─── Parking Routes ──────────────────────────────────────

// Entry — Scan QR at gate
app.post('/api/entry', authenticateToken, (req, res) => {
  try {
    const { qrToken } = req.body;
    if (!qrToken) return res.status(400).json({ error: 'QR token is required.' });

    const vehicle = db.getVehicleByQrToken(qrToken);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not registered in system.' });

    // Check if already parked
    const existingSpot = db.getSpotByVehicleId(vehicle.id);
    if (existingSpot) {
      return res.status(409).json({
        error: `Vehicle ${vehicle.vehicle_number} is already parked at spot ${existingSpot.spot_label}.`
      });
    }

    // Determine allowed zones based on role
    const role = vehicle.owner_role;
    const vehicleType = vehicle.vehicle_type;
    let spot = null;

    if (role === 'student') {
      if (vehicleType === 'two-wheeler') {
        spot = db.getAvailableSpot('C', 'two-wheeler');
        if (!spot) spot = db.getAvailableSpot('B', 'four-wheeler'); // overflow
      } else {
        spot = db.getAvailableSpot('B', 'four-wheeler');
      }
    } else if (role === 'faculty' || role === 'authority' || role === 'admin') {
      if (vehicleType === 'four-wheeler') {
        spot = db.getAvailableSpot('A', 'four-wheeler');
        if (!spot) spot = db.getAvailableSpot('B', 'four-wheeler');
      } else {
        spot = db.getAvailableSpot('C', 'two-wheeler');
        if (!spot) spot = db.getAvailableSpot('B', 'four-wheeler');
      }
    }

    if (!spot) {
      return res.status(503).json({ error: 'No parking spots available. Parking is full!' });
    }

    // Assign spot
    db.assignSpot(spot.id, vehicle.id);
    db.createParkingLog(vehicle.id, vehicle.user_id, spot.id, spot.zone, spot.spot_label);

    const zoneNames = { A: 'Near Building (Faculty)', B: 'General Parking', C: 'Two-Wheeler Zone' };

    res.json({
      message: 'Entry recorded successfully!',
      spotLabel: spot.spot_label,
      zone: spot.zone,
      zoneName: zoneNames[spot.zone],
      vehicleNumber: vehicle.vehicle_number,
      ownerName: vehicle.owner_name,
      ownerRole: vehicle.owner_role
    });
  } catch (err) {
    console.error('Entry error:', err);
    res.status(500).json({ error: 'Failed to process entry.' });
  }
});

// Exit — Scan QR at gate
app.post('/api/exit', authenticateToken, (req, res) => {
  try {
    const { qrToken } = req.body;
    if (!qrToken) return res.status(400).json({ error: 'QR token is required.' });

    const vehicle = db.getVehicleByQrToken(qrToken);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not registered in system.' });

    // Check if vehicle is parked
    const spot = db.getSpotByVehicleId(vehicle.id);
    if (!spot) {
      return res.status(404).json({ error: `Vehicle ${vehicle.vehicle_number} is not currently parked.` });
    }

    // Complete parking log
    db.completeParkingLog(vehicle.id, spot.id);

    // Release spot
    db.releaseSpot(spot.id);

    // Get the log for duration
    const logs = db.getParkingLogsByUserId(vehicle.user_id);
    const latestLog = logs.find(l => l.spot_id === spot.id);

    res.json({
      message: 'Exit recorded successfully!',
      spotLabel: spot.spot_label,
      zone: spot.zone,
      vehicleNumber: vehicle.vehicle_number,
      ownerName: vehicle.owner_name,
      duration: latestLog ? latestLog.duration_minutes : null
    });
  } catch (err) {
    console.error('Exit error:', err);
    res.status(500).json({ error: 'Failed to process exit.' });
  }
});

// Get parking status
app.get('/api/parking/status', (req, res) => {
  try {
    const status = db.getParkingStatus();
    res.json(status);
  } catch (err) {
    console.error('Parking status error:', err);
    res.status(500).json({ error: 'Failed to get parking status.' });
  }
});

// ─── Admin Routes ────────────────────────────────────────

// Admin overview
app.get('/api/admin/overview', authenticateToken, requireAdmin, (req, res) => {
  try {
    const spots = db.getAllSpots();
    const status = db.getParkingStatus();
    const activeParking = db.getActiveParking();
    const recentLogs = db.getAllParkingLogs(50);

    res.json({ spots, status, activeParking, recentLogs });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: 'Failed to load admin overview.' });
  }
});

// Reset all spots
app.put('/api/admin/reset', authenticateToken, requireAdmin, (req, res) => {
  try {
    db.resetAllSpots();
    res.json({ message: 'All parking spots have been reset.' });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Failed to reset parking spots.' });
  }
});

// ─── Catch-all route for SPA ─────────────────────────────

app.get('*', (req, res) => {
  // Serve the requested HTML file or index.html
  const requestedFile = req.path.endsWith('.html') ? req.path : '/index.html';
  res.sendFile(path.join(__dirname, '..', 'public', requestedFile));
});

// ─── Start Server ────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚗 YCCE Smart Parking System running at http://localhost:${PORT}`);
  console.log(`📊 Admin: admin@ycce.edu / admin123\n`);
});

})(); // end async IIFE
