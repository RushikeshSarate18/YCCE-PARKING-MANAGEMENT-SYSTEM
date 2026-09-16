const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'parking.db');

let db;

async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'faculty', 'authority', 'admin')),
      department TEXT,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('two-wheeler', 'four-wheeler')),
      vehicle_number TEXT UNIQUE NOT NULL,
      vehicle_model TEXT,
      qr_token TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS parking_spots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zone TEXT NOT NULL CHECK(zone IN ('A', 'B', 'C')),
      spot_number TEXT NOT NULL,
      spot_label TEXT NOT NULL,
      allowed_vehicle_type TEXT,
      is_occupied INTEGER DEFAULT 0,
      occupied_by INTEGER,
      occupied_at DATETIME,
      FOREIGN KEY (occupied_by) REFERENCES vehicles(id) ON DELETE SET NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS parking_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      spot_id INTEGER NOT NULL,
      zone TEXT NOT NULL,
      spot_label TEXT NOT NULL,
      entry_time DATETIME NOT NULL,
      exit_time DATETIME,
      duration_minutes INTEGER,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (spot_id) REFERENCES parking_spots(id)
    )
  `);

  // Seed parking spots if empty
  const spotCount = getOne('SELECT COUNT(*) as count FROM parking_spots');
  if (spotCount.count === 0) {
    seedParkingSpots();
  }

  // Seed admin account if no admin exists
  const adminCount = getOne("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
  if (adminCount.count === 0) {
    seedAdmin();
  }

  saveDb();
  console.log('✅ Database initialized successfully');
  return db;
}

// Helper: run query and return one row as object
function getOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let row = null;
  if (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    row = {};
    cols.forEach((col, i) => { row[col] = vals[i]; });
  }
  stmt.free();
  return row;
}

// Helper: run query and return all rows as array of objects
function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    const row = {};
    cols.forEach((col, i) => { row[col] = vals[i]; });
    rows.push(row);
  }
  stmt.free();
  return rows;
}

// Helper: run insert/update and return changes info
function runSql(sql, params = []) {
  db.run(sql, params);
  const lastId = getOne('SELECT last_insert_rowid() as id');
  const changes = getOne('SELECT changes() as count');
  saveDb();
  return { lastInsertRowid: lastId ? lastId.id : 0, changes: changes ? changes.count : 0 };
}

// Persist database to file
function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function seedParkingSpots() {
  // Zone A — Near Building (Faculty/Authority only) — 20 spots for four-wheelers
  for (let i = 1; i <= 20; i++) {
    db.run('INSERT INTO parking_spots (zone, spot_number, spot_label, allowed_vehicle_type) VALUES (?, ?, ?, ?)',
      ['A', String(i), `A-${i}`, 'four-wheeler']);
  }

  // Zone B — General Parking — 50 spots for four-wheelers
  for (let i = 1; i <= 50; i++) {
    db.run('INSERT INTO parking_spots (zone, spot_number, spot_label, allowed_vehicle_type) VALUES (?, ?, ?, ?)',
      ['B', String(i), `B-${i}`, 'four-wheeler']);
  }

  // Zone C — Two-Wheeler Parking — 80 spots
  for (let i = 1; i <= 80; i++) {
    db.run('INSERT INTO parking_spots (zone, spot_number, spot_label, allowed_vehicle_type) VALUES (?, ?, ?, ?)',
      ['C', String(i), `C-${i}`, 'two-wheeler']);
  }

  saveDb();
  console.log('🅿️ Seeded 150 parking spots (A:20, B:50, C:80)');
}

function seedAdmin() {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.run('INSERT INTO users (name, email, password, role, department) VALUES (?, ?, ?, ?, ?)',
    ['Admin', 'admin@ycce.edu', hashedPassword, 'admin', 'Administration']);
  saveDb();
  console.log('👤 Admin account created: admin@ycce.edu / admin123');
}

// ─── User Queries ────────────────────────────────────────

function createUser(name, email, password, role, department, phone) {
  const hashedPassword = bcrypt.hashSync(password, 10);
  const result = runSql(
    'INSERT INTO users (name, email, password, role, department, phone) VALUES (?, ?, ?, ?, ?, ?)',
    [name, email, hashedPassword, role, department, phone]
  );
  return result.lastInsertRowid;
}

function getUserByEmail(email) {
  return getOne('SELECT * FROM users WHERE email = ?', [email]);
}

function getUserById(id) {
  return getOne('SELECT id, name, email, role, department, phone, created_at FROM users WHERE id = ?', [id]);
}

// ─── Vehicle Queries ─────────────────────────────────────

function createVehicle(userId, vehicleType, vehicleNumber, vehicleModel) {
  const qrToken = uuidv4();
  const result = runSql(
    'INSERT INTO vehicles (user_id, vehicle_type, vehicle_number, vehicle_model, qr_token) VALUES (?, ?, ?, ?, ?)',
    [userId, vehicleType, vehicleNumber.toUpperCase(), vehicleModel, qrToken]
  );
  return { id: result.lastInsertRowid, qrToken };
}

function getVehiclesByUserId(userId) {
  return getAll('SELECT * FROM vehicles WHERE user_id = ?', [userId]);
}

function getVehicleByQrToken(qrToken) {
  return getOne(`
    SELECT v.*, u.name as owner_name, u.role as owner_role, u.department as owner_department
    FROM vehicles v
    JOIN users u ON v.user_id = u.id
    WHERE v.qr_token = ?
  `, [qrToken]);
}

function getVehicleByNumber(vehicleNumber) {
  return getOne('SELECT * FROM vehicles WHERE vehicle_number = ?', [vehicleNumber.toUpperCase()]);
}

// ─── Parking Spot Queries ────────────────────────────────

function getAvailableSpot(zone, vehicleType) {
  return getOne(`
    SELECT * FROM parking_spots
    WHERE zone = ? AND allowed_vehicle_type = ? AND is_occupied = 0
    ORDER BY CAST(spot_number AS INTEGER) ASC
    LIMIT 1
  `, [zone, vehicleType]);
}

function assignSpot(spotId, vehicleId) {
  return runSql(`
    UPDATE parking_spots
    SET is_occupied = 1, occupied_by = ?, occupied_at = datetime('now')
    WHERE id = ?
  `, [vehicleId, spotId]);
}

function releaseSpot(spotId) {
  return runSql(`
    UPDATE parking_spots
    SET is_occupied = 0, occupied_by = NULL, occupied_at = NULL
    WHERE id = ?
  `, [spotId]);
}

function getSpotByVehicleId(vehicleId) {
  return getOne('SELECT * FROM parking_spots WHERE occupied_by = ? AND is_occupied = 1', [vehicleId]);
}

function getParkingStatus() {
  const zones = ['A', 'B', 'C'];
  const status = {};
  for (const zone of zones) {
    const total = getOne('SELECT COUNT(*) as count FROM parking_spots WHERE zone = ?', [zone]).count;
    const occupied = getOne('SELECT COUNT(*) as count FROM parking_spots WHERE zone = ? AND is_occupied = 1', [zone]).count;
    status[zone] = { total, occupied, available: total - occupied };
  }
  return status;
}

function getAllSpots() {
  return getAll(`
    SELECT ps.*, v.vehicle_number, v.vehicle_model, v.vehicle_type as parked_vehicle_type,
           u.name as owner_name, u.role as owner_role
    FROM parking_spots ps
    LEFT JOIN vehicles v ON ps.occupied_by = v.id
    LEFT JOIN users u ON v.user_id = u.id
    ORDER BY ps.zone, CAST(ps.spot_number AS INTEGER)
  `);
}

function resetAllSpots() {
  return runSql('UPDATE parking_spots SET is_occupied = 0, occupied_by = NULL, occupied_at = NULL');
}

// ─── Parking Log Queries ─────────────────────────────────

function createParkingLog(vehicleId, userId, spotId, zone, spotLabel) {
  return runSql(`
    INSERT INTO parking_logs (vehicle_id, user_id, spot_id, zone, spot_label, entry_time)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `, [vehicleId, userId, spotId, zone, spotLabel]);
}

function completeParkingLog(vehicleId, spotId) {
  return runSql(`
    UPDATE parking_logs
    SET exit_time = datetime('now'),
        duration_minutes = CAST((julianday('now') - julianday(entry_time)) * 24 * 60 AS INTEGER)
    WHERE vehicle_id = ? AND spot_id = ? AND exit_time IS NULL
  `, [vehicleId, spotId]);
}

function getParkingLogsByUserId(userId) {
  return getAll(`
    SELECT pl.*, v.vehicle_number
    FROM parking_logs pl
    JOIN vehicles v ON pl.vehicle_id = v.id
    WHERE pl.user_id = ?
    ORDER BY pl.entry_time DESC
    LIMIT 20
  `, [userId]);
}

function getActiveParkingByVehicleId(vehicleId) {
  return getOne('SELECT * FROM parking_logs WHERE vehicle_id = ? AND exit_time IS NULL', [vehicleId]);
}

function getAllParkingLogs(limit = 50) {
  return getAll(`
    SELECT pl.*, v.vehicle_number, v.vehicle_type, u.name as owner_name, u.role as owner_role
    FROM parking_logs pl
    JOIN vehicles v ON pl.vehicle_id = v.id
    JOIN users u ON pl.user_id = u.id
    ORDER BY pl.entry_time DESC
    LIMIT ?
  `, [limit]);
}

function getActiveParking() {
  return getAll(`
    SELECT pl.*, v.vehicle_number, v.vehicle_type, u.name as owner_name, u.role as owner_role
    FROM parking_logs pl
    JOIN vehicles v ON pl.vehicle_id = v.id
    JOIN users u ON pl.user_id = u.id
    WHERE pl.exit_time IS NULL
    ORDER BY pl.entry_time DESC
  `);
}

module.exports = {
  initDatabase,
  createUser,
  getUserByEmail,
  getUserById,
  createVehicle,
  getVehiclesByUserId,
  getVehicleByQrToken,
  getVehicleByNumber,
  getAvailableSpot,
  assignSpot,
  releaseSpot,
  getSpotByVehicleId,
  getParkingStatus,
  getAllSpots,
  resetAllSpots,
  createParkingLog,
  completeParkingLog,
  getParkingLogsByUserId,
  getActiveParkingByVehicleId,
  getAllParkingLogs,
  getActiveParking
};
