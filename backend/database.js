/**
 * 🗄️ SQLite Database Module
 * Kullanıcı davranış verilerini kalıcı olarak saklar
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import fs from 'fs';

// Database dosyası
// Production'da: Disk varsa /data, yoksa local klasör
// Development'ta: local klasör
let dbPath;

if (process.env.NODE_ENV === 'production') {
  // Render.com disk mount path veya local
  if (fs.existsSync('/data')) {
    dbPath = '/data/security.db';
  } else {
    // Disk yoksa (Free tier) local klasör kullan
    dbPath = path.join(__dirname, 'security.db');
    console.log('⚠️ /data klasörü yok, local DB kullanılıyor (veriler deploy sonrası silinir)');
  }
} else {
  dbPath = path.join(__dirname, 'security.db');
}

console.log(`📁 Database path: ${dbPath}`);
const db = new Database(dbPath);

// WAL mode for better performance
db.pragma('journal_mode = WAL');

// ============================================
// TABLO OLUŞTURMA
// ============================================

db.exec(`
  -- Kullanıcı profilleri
  CREATE TABLE IF NOT EXISTS user_profiles (
    session_id TEXT PRIMARY KEY,
    email TEXT,
    email_verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_activity TEXT DEFAULT CURRENT_TIMESTAMP,
    average_duration REAL DEFAULT 120,
    total_transactions INTEGER DEFAULT 0
  );

  -- İşlem geçmişi
  CREATE TABLE IF NOT EXISTS transaction_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    tx_type TEXT DEFAULT 'transfer',
    amount REAL,
    to_address TEXT,
    token TEXT DEFAULT 'ETH',
    duration_seconds INTEGER,
    interaction_count INTEGER,
    risk_score INTEGER,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES user_profiles(session_id)
  );

  -- Etkileşilen adresler
  CREATE TABLE IF NOT EXISTS known_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    address TEXT NOT NULL,
    first_interaction TEXT DEFAULT CURRENT_TIMESTAMP,
    interaction_count INTEGER DEFAULT 1,
    UNIQUE(session_id, address)
  );

  -- E-posta doğrulama token'ları
  CREATE TABLE IF NOT EXISTS verification_tokens (
    token_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    transaction_data TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    verified INTEGER DEFAULT 0
  );

  -- Cüzdan-E-posta Eşlemesi (Kalıcı)
  CREATE TABLE IF NOT EXISTS wallet_emails (
    wallet_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- İndeksler
  CREATE INDEX IF NOT EXISTS idx_tx_session ON transaction_history(session_id);
  CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON transaction_history(timestamp);
  CREATE INDEX IF NOT EXISTS idx_known_addr ON known_addresses(session_id, address);
`);

console.log('✅ SQLite database initialized: security.db');

// ============================================
// KULLANICI PROFİLİ İŞLEMLERİ
// ============================================

export function getOrCreateProfile(sessionId) {
  const existing = db.prepare('SELECT * FROM user_profiles WHERE session_id = ?').get(sessionId);
  
  if (existing) {
    // Last activity güncelle
    db.prepare('UPDATE user_profiles SET last_activity = CURRENT_TIMESTAMP WHERE session_id = ?').run(sessionId);
    return existing;
  }
  
  // Yeni profil oluştur
  db.prepare(`
    INSERT INTO user_profiles (session_id, average_duration) 
    VALUES (?, 120)
  `).run(sessionId);
  
  return db.prepare('SELECT * FROM user_profiles WHERE session_id = ?').get(sessionId);
}

export function updateUserEmail(sessionId, email) {
  db.prepare(`
    UPDATE user_profiles 
    SET email = ?, email_verified = 1, last_activity = CURRENT_TIMESTAMP 
    WHERE session_id = ?
  `).run(email, sessionId);
}

export function getUserEmail(sessionId) {
  const profile = db.prepare('SELECT email FROM user_profiles WHERE session_id = ?').get(sessionId);
  return profile?.email || null;
}

// ============================================
// CÜZDAN-EPOSTA EŞLEMESİ (KALICI)
// ============================================

export function registerWalletEmail(walletHash, email) {
  db.prepare(`
    INSERT OR REPLACE INTO wallet_emails (wallet_hash, email, created_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run(walletHash, email);
  console.log(`📧 Wallet email registered: ${walletHash.slice(0, 8)}... → ${email}`);
}

export function getWalletEmail(walletHash) {
  const result = db.prepare('SELECT email FROM wallet_emails WHERE wallet_hash = ?').get(walletHash);
  return result?.email || null;
}

export function updateAverageDuration(sessionId, newAverage) {
  db.prepare(`
    UPDATE user_profiles 
    SET average_duration = ?, last_activity = CURRENT_TIMESTAMP 
    WHERE session_id = ?
  `).run(newAverage, sessionId);
}

// ============================================
// İŞLEM GEÇMİŞİ İŞLEMLERİ
// ============================================

export function recordTransaction(sessionId, txData) {
  const { type, amount, to, token, duration, interactions, riskScore } = txData;
  
  db.prepare(`
    INSERT INTO transaction_history 
    (session_id, tx_type, amount, to_address, token, duration_seconds, interaction_count, risk_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, type || 'transfer', amount, to, token || 'ETH', duration, interactions, riskScore);
  
  // Toplam işlem sayısını güncelle
  db.prepare(`
    UPDATE user_profiles 
    SET total_transactions = total_transactions + 1, last_activity = CURRENT_TIMESTAMP 
    WHERE session_id = ?
  `).run(sessionId);
}

export function getTransactionHistory(sessionId, limit = 20) {
  return db.prepare(`
    SELECT * FROM transaction_history 
    WHERE session_id = ? 
    ORDER BY timestamp DESC 
    LIMIT ?
  `).all(sessionId, limit);
}

export function getTransactionStats(sessionId) {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_count,
      AVG(amount) as avg_amount,
      AVG(duration_seconds) as avg_duration,
      MIN(duration_seconds) as min_duration,
      MAX(duration_seconds) as max_duration,
      AVG(interaction_count) as avg_interactions
    FROM transaction_history 
    WHERE session_id = ?
  `).get(sessionId);
  
  // Standart sapma hesapla
  const durations = db.prepare(`
    SELECT duration_seconds FROM transaction_history 
    WHERE session_id = ? AND duration_seconds IS NOT NULL
  `).all(sessionId).map(r => r.duration_seconds);
  
  let stdDev = 0;
  if (durations.length > 1 && stats.avg_duration) {
    const squareDiffs = durations.map(d => Math.pow(d - stats.avg_duration, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / durations.length;
    stdDev = Math.sqrt(avgSquareDiff);
  }
  
  return {
    ...stats,
    std_deviation: stdDev,
    sample_size: durations.length
  };
}

// ============================================
// BİLİNEN ADRESLER İŞLEMLERİ
// ============================================

export function isKnownAddress(sessionId, address) {
  const normalized = address.toLowerCase();
  const result = db.prepare(`
    SELECT * FROM known_addresses 
    WHERE session_id = ? AND address = ?
  `).get(sessionId, normalized);
  
  return !!result;
}

export function addKnownAddress(sessionId, address) {
  const normalized = address.toLowerCase();
  
  try {
    db.prepare(`
      INSERT INTO known_addresses (session_id, address) 
      VALUES (?, ?)
      ON CONFLICT(session_id, address) DO UPDATE SET 
        interaction_count = interaction_count + 1
    `).run(sessionId, normalized);
  } catch (e) {
    // Zaten var, interaction count güncelle
    db.prepare(`
      UPDATE known_addresses 
      SET interaction_count = interaction_count + 1 
      WHERE session_id = ? AND address = ?
    `).run(sessionId, normalized);
  }
}

export function getKnownAddressCount(sessionId) {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM known_addresses WHERE session_id = ?
  `).get(sessionId);
  return result?.count || 0;
}

// ============================================
// DOĞRULAMA TOKEN İŞLEMLERİ
// ============================================

export function createVerificationToken(tokenId, sessionId, email, code, txData, expiresAt) {
  // Eski token'ları temizle
  db.prepare(`
    DELETE FROM verification_tokens 
    WHERE session_id = ? AND verified = 0
  `).run(sessionId);
  
  db.prepare(`
    INSERT INTO verification_tokens 
    (token_id, session_id, email, code, transaction_data, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(tokenId, sessionId, email, code, JSON.stringify(txData), expiresAt);
}

export function getVerificationToken(tokenId) {
  const token = db.prepare(`
    SELECT * FROM verification_tokens WHERE token_id = ?
  `).get(tokenId);
  
  if (token && token.transaction_data) {
    token.transaction_data = JSON.parse(token.transaction_data);
  }
  
  return token;
}

export function incrementTokenAttempts(tokenId) {
  db.prepare(`
    UPDATE verification_tokens SET attempts = attempts + 1 WHERE token_id = ?
  `).run(tokenId);
}

export function markTokenVerified(tokenId) {
  db.prepare(`
    UPDATE verification_tokens SET verified = 1 WHERE token_id = ?
  `).run(tokenId);
}

export function deleteToken(tokenId) {
  db.prepare('DELETE FROM verification_tokens WHERE token_id = ?').run(tokenId);
}

export function cleanupExpiredTokens() {
  db.prepare(`
    DELETE FROM verification_tokens 
    WHERE expires_at < datetime('now')
  `).run();
}

// ============================================
// KULLANICI PROFİL ÖZETİ
// ============================================

export function getUserProfile(sessionId) {
  const profile = getOrCreateProfile(sessionId);
  const stats = getTransactionStats(sessionId);
  const knownAddresses = getKnownAddressCount(sessionId);
  const recentTx = getTransactionHistory(sessionId, 10); // Son 10 işlem
  
  return {
    sessionId,
    email: profile.email,
    emailVerified: !!profile.email_verified,
    createdAt: profile.created_at,
    lastActivity: profile.last_activity,
    averageDuration: profile.average_duration || stats.avg_duration || 120,
    averageAmount: stats.avg_amount || 0, // Ortalama miktar
    totalTransactions: profile.total_transactions,
    knownAddresses,
    stats: {
      avgAmount: stats.avg_amount,
      avgDuration: stats.avg_duration,
      stdDeviation: stats.std_deviation,
      minDuration: stats.min_duration,
      maxDuration: stats.max_duration,
      sampleSize: stats.sample_size
    },
    recentTransactions: recentTx.map(tx => ({
      type: tx.tx_type,
      amount: tx.amount,
      to: tx.to_address,
      token: tx.token,
      duration: tx.duration_seconds,
      riskScore: tx.risk_score,
      timestamp: tx.timestamp
    }))
  };
}

export default db;

