const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'app.db');

let db = null;

function getDatabase() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
    }
    return db;
}

function initDatabase() {
    const db = getDatabase();
    
    // Crear tabla de usuarios
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Crear tabla de hallazgos
    db.exec(`
        CREATE TABLE IF NOT EXISTS findings (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            price TEXT,
            barcode TEXT,
            location TEXT,
            lat REAL,
            lng REAL,
            tags TEXT,
            photo_url TEXT,
            created_by TEXT,
            user_id TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            location_data TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);
    
    console.log('✅ Base de datos SQLite inicializada');
    return db;
}

function migrateFromJSON() {
    const db = getDatabase();
    
    // Migrar usuarios
    const usersPath = path.join(__dirname, '..', 'data', 'users.json');
    if (fs.existsSync(usersPath)) {
        const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO users (id, username, password_hash, is_admin, created_at)
            VALUES (?, ?, ?, ?, ?)
        `);
        
        for (const user of users) {
            stmt.run(
                user.id,
                user.username,
                user.passwordHash,
                user.isAdmin ? 1 : 0,
                user.createdAt
            );
        }
        console.log(`✅ Migrados ${users.length} usuarios`);
    }
    
    // Migrar hallazgos
    const findingsPath = path.join(__dirname, '..', 'data', 'findings.json');
    if (fs.existsSync(findingsPath)) {
        const findings = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO findings (
                id, title, description, price, barcode, location, lat, lng,
                tags, photo_url, created_by, user_id, created_at, location_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        for (const finding of findings) {
            stmt.run(
                finding.id,
                finding.title,
                finding.description,
                finding.price,
                finding.barcode,
                finding.location,
                finding.lat,
                finding.lng,
                JSON.stringify(finding.tags || []),
                finding.photoUrl,
                finding.createdBy,
                finding.userId,
                finding.createdAt,
                JSON.stringify(finding.locationData || {})
            );
        }
        console.log(`✅ Migrados ${findings.length} hallazgos`);
    }
}

module.exports = {
    getDatabase,
    initDatabase,
    migrateFromJSON
};
