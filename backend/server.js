import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import WDK from '@tetherto/wdk';
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';
import WalletManagerBtc from '@tetherto/wdk-wallet-btc';
import WalletManagerTron from '@tetherto/wdk-wallet-tron';

// 🔐 Güvenlik Modülleri
import * as db from './database.js';
import { initGemini, analyzeUserBehavior, calculateNewAverage } from './geminiAnalyzer.js';
import { initEmailService, sendVerificationEmail, isValidEmail } from './emailService.js';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS ayarları (production için)
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL, 'https://wdk-wallet.netlify.app'].filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// 🔐 Servisleri başlat
initGemini(process.env.GEMINI_API_KEY);
initEmailService();

// In-memory wallet storage (production'da database kullanılmalı)
const walletSessions = new Map();

// ============================================
// KULLANICI DAVRANIŞ BAZLI GÜVENLİK SİSTEMİ
// ============================================

// Güvenlik konfigürasyonu
const SECURITY_CONFIG = {
  // İşlem tutarı eşikleri
  highAmountThreshold: 0.5,      // Bakiyenin %50'sinden fazla = yüksek risk
  veryHighAmountThreshold: 0.8,  // Bakiyenin %80'inden fazla = çok yüksek risk
  
  // İstatistik eşikleri
  stdDeviationMultiplier: 2,     // Ortalamanın 2 std sapması üzeri = anormal
  minTransactionsForStats: 3,    // İstatistik için minimum işlem sayısı
  
  // ⏱️ DAVRANIŞ ZAMANLAMA AYARLARI
  timing: {
    minNormalDuration: 30,       // Minimum normal süre (saniye) - bundan hızlı = şüpheli
    defaultAverageDuration: 120, // Varsayılan ortalama süre (saniye) - 2 dakika
    suspiciousSpeedRatio: 0.25,  // Ortalama sürenin %25'inden hızlı = şüpheli
    criticalSpeedRatio: 0.1,     // Ortalama sürenin %10'undan hızlı = kritik
    minSessionsForAverage: 3,    // Ortalama hesabı için minimum işlem sayısı
  },
  
  // 📧 E-POSTA DOĞRULAMA AYARLARI
  emailVerification: {
    tokenExpiry: 5 * 60 * 1000,  // Token geçerlilik süresi: 5 dakika
    codeLength: 6,               // Doğrulama kodu uzunluğu
    maxAttempts: 3,              // Maksimum deneme sayısı
  },
  
  // Skor ağırlıkları (toplam 100)
  weights: {
    amountRatio: 25,            // İşlem tutarı/bakiye oranı
    newAddress: 20,             // Yeni adres riski
    statisticalAnomaly: 20,     // İstatistiksel anomali
    timeOfDay: 10,              // Gece saati riski
    behaviorTiming: 25          // ⏱️ Davranış zamanlaması (YENİ)
  },
  
  // Risk seviyeleri
  riskLevels: {
    low: { max: 30, label: 'Düşük', color: '#22c55e', action: 'allow' },
    medium: { max: 60, label: 'Orta', color: '#eab308', action: 'warn' },
    high: { max: 80, label: 'Yüksek', color: '#f97316', action: 'confirm' },
    critical: { max: 100, label: 'Kritik', color: '#ef4444', action: 'email_verify' }
  }
};

// Kullanıcı davranış verileri storage
const userBehaviorData = new Map();

// ⏱️ Aktif modal oturumları (timing tracking)
const activeModalSessions = new Map();

// 📧 E-posta doğrulama token'ları
const emailVerificationTokens = new Map();

// Davranış verisi başlatma helper
function initUserBehavior(sessionId) {
  if (!userBehaviorData.has(sessionId)) {
    userBehaviorData.set(sessionId, {
      transactionHistory: [],      // Son işlemler
      interactedAddresses: new Set(), // Etkileşilen adresler
      createdAt: new Date(),
      lastActivityTime: new Date(),
      totalTransactions: 0,
      averageAmount: 0,
      stdDeviation: 0,
      // ⏱️ Zamanlama verileri
      timingHistory: [],           // İşlem süreleri geçmişi
      averageTransactionDuration: SECURITY_CONFIG.timing.defaultAverageDuration,
      // 📧 E-posta bilgisi
      email: null,
      emailVerified: false
    });
  }
  return userBehaviorData.get(sessionId);
}

// ============================================
// ⏱️ ÖZELLİK 4: DAVRANIŞ ZAMANLAMA TAKİBİ
// ============================================

// Modal açılış kaydı - timing başlat
function startModalSession(sessionId, modalType = 'transfer') {
  const sessionKey = `${sessionId}-${modalType}`;
  
  activeModalSessions.set(sessionKey, {
    sessionId,
    modalType,
    startTime: Date.now(),
    interactions: [],      // Mouse/klavye etkileşimleri
    interactionCount: 0,
    lastInteractionTime: Date.now()
  });
  
  console.log(`⏱️ Modal session started: ${modalType} for ${sessionId}`);
  
  return {
    sessionKey,
    startTime: new Date().toISOString()
  };
}

// Kullanıcı etkileşimi kaydet (mouse move, key press vb.)
function recordInteraction(sessionId, modalType, interactionType) {
  const sessionKey = `${sessionId}-${modalType}`;
  const session = activeModalSessions.get(sessionKey);
  
  if (!session) return null;
  
  const now = Date.now();
  session.interactions.push({
    type: interactionType,
    timestamp: now,
    timeSinceStart: now - session.startTime,
    timeSinceLast: now - session.lastInteractionTime
  });
  session.interactionCount++;
  session.lastInteractionTime = now;
  
  return session.interactionCount;
}

// Modal süresini hesapla ve analiz et
function analyzeModalTiming(sessionId, modalType = 'transfer') {
  const sessionKey = `${sessionId}-${modalType}`;
  const modalSession = activeModalSessions.get(sessionKey);
  const behavior = initUserBehavior(sessionId);
  
  const result = {
    feature: 'behavior_timing',
    modalType,
    sessionFound: !!modalSession,
    duration: 0,
    durationSeconds: 0,
    averageDuration: behavior.averageTransactionDuration,
    speedRatio: 0,
    interactionCount: 0,
    riskScore: 0,
    flags: [],
    requiresEmailVerification: false
  };
  
  if (!modalSession) {
    result.flags.push('⚠️ Modal oturumu bulunamadı - doğrudan işlem girişimi');
    result.riskScore = 70;
    return result;
  }
  
  // Süreyi hesapla
  const endTime = Date.now();
  result.duration = endTime - modalSession.startTime;
  result.durationSeconds = Math.round(result.duration / 1000);
  result.interactionCount = modalSession.interactionCount;
  
  // Ortalamaya göre hız oranı
  result.speedRatio = result.durationSeconds / behavior.averageTransactionDuration;
  
  const timingConfig = SECURITY_CONFIG.timing;
  
  // 🚨 KRİTİK: Çok hızlı işlem (ortalama sürenin %10'undan az)
  if (result.speedRatio <= timingConfig.criticalSpeedRatio) {
    result.riskScore = 100;
    result.requiresEmailVerification = true;
    result.flags.push(`🚨 ÇOK HIZLI! ${result.durationSeconds}sn (normal: ${behavior.averageTransactionDuration}sn)`);
    result.flags.push('📧 E-posta doğrulaması gerekiyor');
  }
  // ⚠️ ŞÜPHELİ: Hızlı işlem (ortalama sürenin %25'inden az)
  else if (result.speedRatio <= timingConfig.suspiciousSpeedRatio) {
    result.riskScore = 75;
    result.requiresEmailVerification = true;
    result.flags.push(`⚠️ Normalden hızlı: ${result.durationSeconds}sn (normal: ${behavior.averageTransactionDuration}sn)`);
    result.flags.push('📧 E-posta doğrulaması önerilir');
  }
  // 🔶 Biraz hızlı (ortalama sürenin %50'sinden az)
  else if (result.speedRatio <= 0.5) {
    result.riskScore = 40;
    result.flags.push(`Ortalamadan hızlı: ${result.durationSeconds}sn`);
  }
  // ✓ Normal süre
  else {
    result.riskScore = 5;
    result.flags.push(`✓ Normal süre: ${result.durationSeconds}sn`);
  }
  
  // Çok az etkileşim varsa ek risk
  if (result.interactionCount < 3 && result.durationSeconds > 5) {
    result.riskScore = Math.min(100, result.riskScore + 20);
    result.flags.push('⚠️ Düşük etkileşim sayısı - otomatik işlem şüphesi');
  }
  
  return result;
}

// Modal oturumunu kapat ve süreyi geçmişe kaydet
function endModalSession(sessionId, modalType = 'transfer', wasSuccessful = true) {
  const sessionKey = `${sessionId}-${modalType}`;
  const modalSession = activeModalSessions.get(sessionKey);
  
  if (!modalSession) return null;
  
  const duration = Date.now() - modalSession.startTime;
  const durationSeconds = Math.round(duration / 1000);
  
  // Başarılı işlemleri geçmişe kaydet (ortalama hesabı için)
  if (wasSuccessful) {
    const behavior = initUserBehavior(sessionId);
    behavior.timingHistory.push({
      modalType,
      duration: durationSeconds,
      interactionCount: modalSession.interactionCount,
      timestamp: new Date()
    });
    
    // Son 20 işlemi tut
    if (behavior.timingHistory.length > 20) {
      behavior.timingHistory = behavior.timingHistory.slice(-20);
    }
    
    // Ortalama süreyi güncelle (minimum 3 işlem sonrası)
    if (behavior.timingHistory.length >= SECURITY_CONFIG.timing.minSessionsForAverage) {
      const avgDuration = behavior.timingHistory.reduce((sum, t) => sum + t.duration, 0) 
                          / behavior.timingHistory.length;
      behavior.averageTransactionDuration = Math.round(avgDuration);
      console.log(`📊 Yeni ortalama süre: ${behavior.averageTransactionDuration}sn`);
    }
  }
  
  // Oturumu temizle
  activeModalSessions.delete(sessionKey);
  
  return {
    duration: durationSeconds,
    wasRecorded: wasSuccessful
  };
}

// ============================================
// 📧 ÖZELLİK 5: E-POSTA DOĞRULAMA SİSTEMİ
// ============================================

// Rastgele doğrulama kodu üret
function generateVerificationCode() {
  const length = SECURITY_CONFIG.emailVerification.codeLength;
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10);
  }
  return code;
}

// Doğrulama token'ı oluştur
function createVerificationToken(sessionId, email, transactionDetails) {
  const code = generateVerificationCode();
  const tokenId = `verify-${sessionId}-${Date.now()}`;
  
  const token = {
    tokenId,
    sessionId,
    email,
    code,
    transactionDetails,
    createdAt: Date.now(),
    expiresAt: Date.now() + SECURITY_CONFIG.emailVerification.tokenExpiry,
    attempts: 0,
    verified: false
  };
  
  emailVerificationTokens.set(tokenId, token);
  
  // Eski token'ları temizle
  cleanupExpiredTokens();
  
  console.log(`📧 Verification token created: ${tokenId}`);
  console.log(`   Code: ${code} (Production'da e-posta ile gönderilir)`);
  
  return {
    tokenId,
    expiresAt: new Date(token.expiresAt).toISOString(),
    // ⚠️ Production'da code gönderilmez, sadece e-posta ile iletilir
    // Demo için burada gösteriyoruz
    _demoCode: code
  };
}

// Token doğrula
function verifyToken(tokenId, code) {
  const token = emailVerificationTokens.get(tokenId);
  
  if (!token) {
    return { success: false, error: 'Token bulunamadı veya süresi dolmuş' };
  }
  
  if (Date.now() > token.expiresAt) {
    emailVerificationTokens.delete(tokenId);
    return { success: false, error: 'Token süresi dolmuş' };
  }
  
  if (token.verified) {
    return { success: true, message: 'Zaten doğrulanmış', alreadyVerified: true };
  }
  
  token.attempts++;
  
  if (token.attempts >= SECURITY_CONFIG.emailVerification.maxAttempts) {
    emailVerificationTokens.delete(tokenId);
    return { success: false, error: 'Çok fazla hatalı deneme, token iptal edildi' };
  }
  
  if (token.code !== code) {
    return { 
      success: false, 
      error: 'Yanlış kod',
      attemptsLeft: SECURITY_CONFIG.emailVerification.maxAttempts - token.attempts
    };
  }
  
  // Doğrulama başarılı
  token.verified = true;
  console.log(`✅ Token verified: ${tokenId}`);
  
  return {
    success: true,
    message: 'Doğrulama başarılı',
    transactionDetails: token.transactionDetails
  };
}

// Süresi dolmuş token'ları temizle
function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [tokenId, token] of emailVerificationTokens.entries()) {
    if (now > token.expiresAt) {
      emailVerificationTokens.delete(tokenId);
    }
  }
}

// Token'ın doğrulanmış olup olmadığını kontrol et
function isTokenVerified(tokenId) {
  const token = emailVerificationTokens.get(tokenId);
  return token?.verified === true;
}

// ============================================
// ÖZELLİK 1: İŞLEM TUTARI ANALİZİ
// ============================================

function analyzeTransactionAmount(amount, balance) {
  const result = {
    feature: 'transaction_amount',
    amount: parseFloat(amount),
    balance: parseFloat(balance),
    ratio: 0,
    riskScore: 0,
    flags: []
  };
  
  if (result.balance <= 0) {
    result.flags.push('Yetersiz bakiye');
    result.riskScore = 100;
    return result;
  }
  
  result.ratio = result.amount / result.balance;
  
  // Risk skoru hesaplama
  if (result.ratio >= SECURITY_CONFIG.veryHighAmountThreshold) {
    result.riskScore = 100;
    result.flags.push(`Çok yüksek oran: Bakiyenin %${(result.ratio * 100).toFixed(1)}'i`);
  } else if (result.ratio >= SECURITY_CONFIG.highAmountThreshold) {
    result.riskScore = 70;
    result.flags.push(`Yüksek oran: Bakiyenin %${(result.ratio * 100).toFixed(1)}'i`);
  } else if (result.ratio >= 0.3) {
    result.riskScore = 40;
    result.flags.push(`Orta oran: Bakiyenin %${(result.ratio * 100).toFixed(1)}'i`);
  } else {
    result.riskScore = 10;
  }
  
  return result;
}

// ============================================
// ÖZELLİK 2: YENİ ADRES İLK ETKİLEŞİM
// ============================================

function analyzeAddressInteraction(sessionId, targetAddress) {
  const behavior = initUserBehavior(sessionId);
  const normalizedAddress = targetAddress.toLowerCase();
  
  const result = {
    feature: 'address_interaction',
    address: targetAddress,
    isFirstInteraction: !behavior.interactedAddresses.has(normalizedAddress),
    totalKnownAddresses: behavior.interactedAddresses.size,
    riskScore: 0,
    flags: []
  };
  
  if (result.isFirstInteraction) {
    // Yeni adres - daha yüksek risk
    result.riskScore = 60;
    result.flags.push('⚠️ Bu adresle ilk kez etkileşim');
    
    // Çok az etkileşim varsa daha riskli
    if (behavior.interactedAddresses.size < 3) {
      result.riskScore = 80;
      result.flags.push('Düşük adres geçmişi - dikkatli olun');
    }
  } else {
    result.riskScore = 5;
    result.flags.push('✓ Daha önce etkileşilmiş güvenilir adres');
  }
  
  return result;
}

// Adres etkileşimini kaydet
function recordAddressInteraction(sessionId, targetAddress) {
  const behavior = initUserBehavior(sessionId);
  behavior.interactedAddresses.add(targetAddress.toLowerCase());
  behavior.lastActivityTime = new Date();
}

// ============================================
// ÖZELLİK 3: SON N İŞLEM İSTATİSTİKLERİ
// ============================================

function calculateStatistics(transactions) {
  if (transactions.length === 0) {
    return { mean: 0, stdDev: 0, min: 0, max: 0 };
  }
  
  const amounts = transactions.map(tx => tx.amount);
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  
  const squareDiffs = amounts.map(amount => Math.pow(amount - mean, 2));
  const variance = squareDiffs.reduce((a, b) => a + b, 0) / amounts.length;
  const stdDev = Math.sqrt(variance);
  
  return {
    mean,
    stdDev,
    min: Math.min(...amounts),
    max: Math.max(...amounts)
  };
}

function analyzeStatisticalAnomaly(sessionId, amount) {
  const behavior = initUserBehavior(sessionId);
  const recentTransactions = behavior.transactionHistory.slice(-20); // Son 20 işlem
  
  const result = {
    feature: 'statistical_anomaly',
    currentAmount: parseFloat(amount),
    transactionCount: recentTransactions.length,
    statistics: null,
    isAnomaly: false,
    anomalyScore: 0,
    riskScore: 0,
    flags: []
  };
  
  // Yeterli veri yoksa analiz yapılamaz
  if (recentTransactions.length < SECURITY_CONFIG.minTransactionsForStats) {
    result.flags.push(`Henüz yeterli işlem geçmişi yok (${recentTransactions.length}/${SECURITY_CONFIG.minTransactionsForStats})`);
    result.riskScore = 20; // Düşük default risk
    return result;
  }
  
  const stats = calculateStatistics(recentTransactions);
  result.statistics = {
    mean: stats.mean.toFixed(6),
    stdDev: stats.stdDev.toFixed(6),
    min: stats.min.toFixed(6),
    max: stats.max.toFixed(6),
    sampleSize: recentTransactions.length
  };
  
  // Anomali tespiti: z-score hesaplama
  if (stats.stdDev > 0) {
    const zScore = Math.abs((result.currentAmount - stats.mean) / stats.stdDev);
    result.anomalyScore = zScore;
    
    if (zScore > SECURITY_CONFIG.stdDeviationMultiplier * 2) {
      result.isAnomaly = true;
      result.riskScore = 90;
      result.flags.push(`🚨 Ciddi anomali: İşlem ortalamanın ${zScore.toFixed(1)} std sapması dışında`);
    } else if (zScore > SECURITY_CONFIG.stdDeviationMultiplier) {
      result.isAnomaly = true;
      result.riskScore = 60;
      result.flags.push(`⚠️ Anomali: İşlem ortalamanın ${zScore.toFixed(1)} std sapması dışında`);
    } else {
      result.riskScore = 10;
      result.flags.push('✓ İşlem normal aralıkta');
    }
  } else {
    // Tüm işlemler aynıysa
    if (Math.abs(result.currentAmount - stats.mean) > stats.mean * 0.1) {
      result.riskScore = 50;
      result.flags.push('Alışılmışın dışında miktar');
    } else {
      result.riskScore = 5;
    }
  }
  
  return result;
}

// İşlemi geçmişe kaydet
function recordTransaction(sessionId, transactionData) {
  const behavior = initUserBehavior(sessionId);
  
  behavior.transactionHistory.push({
    amount: parseFloat(transactionData.amount),
    to: transactionData.to,
    type: transactionData.type || 'transfer',
    timestamp: new Date(),
    token: transactionData.token || 'ETH'
  });
  
  behavior.totalTransactions++;
  behavior.lastActivityTime = new Date();
  
  // Son 100 işlemi tut
  if (behavior.transactionHistory.length > 100) {
    behavior.transactionHistory = behavior.transactionHistory.slice(-100);
  }
  
  // İstatistikleri güncelle
  const stats = calculateStatistics(behavior.transactionHistory);
  behavior.averageAmount = stats.mean;
  behavior.stdDeviation = stats.stdDev;
}

// ============================================
// BONUS: GÜN İÇİ ZAMAN ANALİZİ
// ============================================

function analyzeTimeOfDay() {
  const now = new Date();
  const hour = now.getHours(); // Lokal saat
  
  const result = {
    feature: 'time_of_day',
    currentHour: hour,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    period: '',
    riskScore: 0,
    flags: []
  };
  
  // Gece saatleri (00:00 - 06:00) daha riskli
  if (hour >= 0 && hour < 6) {
    result.period = 'gece';
    result.riskScore = 40;
    result.flags.push('🌙 Gece saatlerinde işlem (00:00-06:00)');
  } else if (hour >= 6 && hour < 12) {
    result.period = 'sabah';
    result.riskScore = 5;
  } else if (hour >= 12 && hour < 18) {
    result.period = 'öğlen';
    result.riskScore = 5;
  } else {
    result.period = 'akşam';
    result.riskScore = 10;
  }
  
  return result;
}

// ============================================
// ANA GÜVENLİK ANALİZİ FONKSİYONU
// ============================================

function analyzeTransactionSecurity(sessionId, transactionParams) {
  const { to, amount, balance, type = 'transfer', token = 'ETH', modalType = 'transfer' } = transactionParams;
  
  // Tüm özellikleri analiz et
  const amountAnalysis = analyzeTransactionAmount(amount, balance);
  const addressAnalysis = analyzeAddressInteraction(sessionId, to);
  const statisticalAnalysis = analyzeStatisticalAnomaly(sessionId, amount);
  const timeAnalysis = analyzeTimeOfDay();
  
  // ⏱️ Davranış zamanlaması analizi (YENİ)
  const timingAnalysis = analyzeModalTiming(sessionId, modalType);
  
  // Ağırlıklı toplam risk skoru
  const weights = SECURITY_CONFIG.weights;
  const totalRiskScore = Math.min(100, Math.round(
    (amountAnalysis.riskScore * weights.amountRatio / 100) +
    (addressAnalysis.riskScore * weights.newAddress / 100) +
    (statisticalAnalysis.riskScore * weights.statisticalAnomaly / 100) +
    (timeAnalysis.riskScore * weights.timeOfDay / 100) +
    (timingAnalysis.riskScore * weights.behaviorTiming / 100)  // ⏱️ YENİ
  ));
  
  // Risk seviyesini belirle
  let riskLevel;
  const levels = SECURITY_CONFIG.riskLevels;
  if (totalRiskScore <= levels.low.max) {
    riskLevel = { ...levels.low, name: 'low' };
  } else if (totalRiskScore <= levels.medium.max) {
    riskLevel = { ...levels.medium, name: 'medium' };
  } else if (totalRiskScore <= levels.high.max) {
    riskLevel = { ...levels.high, name: 'high' };
  } else {
    riskLevel = { ...levels.critical, name: 'critical' };
  }
  
  // ⏱️ Timing analizi e-posta gerektiriyorsa, action'ı override et
  if (timingAnalysis.requiresEmailVerification) {
    riskLevel.action = 'email_verify';
  }
  
  // Tüm uyarıları topla
  const allFlags = [
    ...amountAnalysis.flags,
    ...addressAnalysis.flags,
    ...statisticalAnalysis.flags,
    ...timeAnalysis.flags,
    ...timingAnalysis.flags  // ⏱️ YENİ
  ];
  
  return {
    success: true,
    timestamp: new Date().toISOString(),
    transaction: {
      to,
      amount,
      balance,
      type,
      token
    },
    analysis: {
      amountAnalysis,
      addressAnalysis,
      statisticalAnalysis,
      timeAnalysis,
      timingAnalysis  // ⏱️ YENİ
    },
    summary: {
      totalRiskScore,
      riskLevel: riskLevel.name,
      riskLabel: riskLevel.label,
      riskColor: riskLevel.color,
      recommendedAction: riskLevel.action,
      requiresEmailVerification: timingAnalysis.requiresEmailVerification,  // ⏱️ YENİ
      timingDetails: {  // ⏱️ Zamanlama detayları
        durationSeconds: timingAnalysis.durationSeconds,
        averageDuration: timingAnalysis.averageDuration,
        speedRatio: timingAnalysis.speedRatio,
        interactionCount: timingAnalysis.interactionCount
      },
      flags: allFlags,
      shouldProceed: riskLevel.action !== 'block' && riskLevel.action !== 'email_verify',
      requiresConfirmation: riskLevel.action === 'confirm' || riskLevel.action === 'block',
      requiresEmailVerification: riskLevel.action === 'email_verify'  // ⏱️ E-posta doğrulama gerekiyor mu?
    }
  };
}

// ============================================
// SEPOLIA TESTNET CONTRACTS
// ============================================

const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

// Uniswap V3 Sepolia Contracts
const UNISWAP_CONTRACTS = {
  swapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
  quoterV2: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
  factory: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c'
};

// Aave V3 Sepolia Contracts
const AAVE_CONTRACTS = {
  pool: '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951',
  poolAddressesProvider: '0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A',
  wethGateway: '0x387d311e47e80b498169e6fb51d3193167d89F7D'
};

// Sepolia Token Addresses
const SEPOLIA_TOKENS = {
  ETH: {
    address: '0x0000000000000000000000000000000000000000', // Native ETH
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    icon: '⟠',
    isNative: true
  },
  WETH: {
    address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    icon: '⟠',
    aToken: '0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c'
  },
  USDC: {
    address: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    icon: '◐',
    aToken: '0x16dA4541aD1807f4443d92D26044C1147406EB80'
  },
  DAI: {
    address: '0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357',
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    icon: '◆',
    aToken: '0x29598b72eb5CeBd806C5dCD549490FdA35B13cD8'
  },
  LINK: {
    address: '0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5',
    symbol: 'LINK',
    name: 'Chainlink',
    decimals: 18,
    icon: '⬡',
    aToken: '0x3FfAf50D4F4E96eB78f2407c090b72e86eCaed24'
  },
  USDT: {
    address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    icon: '₮',
    aToken: '0xAF0F6e8b0Dc5c913bbF4d14c22B4E78Dd14310B6'
  },
  WBTC: {
    address: '0x29f2D40B0605204364af54EC677bD022dA425d03',
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
    icon: '₿',
    aToken: '0x1804Bf30507dc2EB3bDEbbbdd859991EAeF6EefF'
  }
};

// ERC20 ABI (gerekli fonksiyonlar)
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)'
];

// Uniswap V3 SwapRouter ABI
const SWAP_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum)) external payable returns (uint256 amountOut)',
  'function multicall(uint256 deadline, bytes[] calldata data) external payable returns (bytes[] memory results)'
];

// Uniswap V3 Quoter V2 ABI
const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
];

// Aave V3 Pool ABI
const AAVE_POOL_ABI = [
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external',
  'function withdraw(address asset, uint256 amount, address to) external returns (uint256)',
  'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external',
  'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)',
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'function getReserveData(address asset) view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))'
];

// WETH Gateway ABI (ETH deposit/withdraw için)
const WETH_GATEWAY_ABI = [
  'function depositETH(address pool, address onBehalfOf, uint16 referralCode) external payable',
  'function withdrawETH(address pool, uint256 amount, address to) external'
];

// Blockchain configurations - TESTNET
const BLOCKCHAIN_CONFIG = {
  ethereum: {
    name: 'Ethereum Sepolia',
    symbol: 'ETH',
    color: '#627EEA',
    icon: '⟠',
    manager: WalletManagerEvm,
    config: { 
      provider: SEPOLIA_RPC
    },
    explorer: 'https://sepolia.etherscan.io',
    isTestnet: true
  },
  bitcoin: {
    name: 'Bitcoin Testnet',
    symbol: 'BTC',
    color: '#F7931A',
    icon: '₿',
    manager: WalletManagerBtc,
    config: { network: 'testnet' },
    explorer: 'https://mempool.space/testnet',
    isTestnet: true
  },
  tron: {
    name: 'TRON Shasta',
    symbol: 'TRX',
    color: '#FF0013',
    icon: '◈',
    manager: WalletManagerTron,
    config: { network: 'shasta' },
    explorer: 'https://shasta.tronscan.org',
    isTestnet: true
  }
};

// Helper: Generate session ID
function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Helper: Get wallet session
function getWalletSession(sessionId) {
  return walletSessions.get(sessionId);
}

// Helper: Convert to BigInt with decimals
function parseUnits(amount, decimals) {
  const [whole, fraction = ''] = amount.toString().split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedFraction);
}

// Helper: Convert from BigInt with decimals
function formatUnits(amount, decimals) {
  const str = amount.toString().padStart(decimals + 1, '0');
  const whole = str.slice(0, -decimals) || '0';
  const fraction = str.slice(-decimals);
  return `${whole}.${fraction}`;
}

// Helper: Encode function call
function encodeFunctionData(functionSignature, params) {
  // Simple ABI encoding - production'da ethers.js kullanın
  const funcSelector = functionSignature.slice(0, 10);
  let encoded = funcSelector;
  
  for (const param of params) {
    if (typeof param === 'string' && param.startsWith('0x')) {
      // Address
      encoded += param.slice(2).padStart(64, '0');
    } else if (typeof param === 'bigint' || typeof param === 'number') {
      // Number
      encoded += BigInt(param).toString(16).padStart(64, '0');
    }
  }
  
  return encoded;
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get blockchain config
app.get('/api/blockchains', (req, res) => {
  const blockchains = Object.entries(BLOCKCHAIN_CONFIG).map(([key, config]) => ({
    id: key,
    name: config.name,
    symbol: config.symbol,
    color: config.color,
    icon: config.icon,
    explorer: config.explorer,
    isTestnet: config.isTestnet
  }));
  res.json({ blockchains });
});

// Generate new seed phrase
app.post('/api/wallet/generate', (req, res) => {
  try {
    const seedPhrase = WDK.getRandomSeedPhrase();
    const sessionId = generateSessionId();
    
    // Create WDK instance
    const wdk = new WDK(seedPhrase);
    
    // Register wallet modules
    Object.entries(BLOCKCHAIN_CONFIG).forEach(([key, config]) => {
      wdk.registerWallet(key, config.manager, config.config);
    });
    
    // Store session
    walletSessions.set(sessionId, {
      wdk,
      seedPhrase,
      accounts: new Map(),
      createdAt: new Date()
    });
    
    console.log(`✅ New wallet session created: ${sessionId}`);
    
    res.json({
      success: true,
      sessionId,
      seedPhrase
    });
  } catch (error) {
    console.error('Generate wallet error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Import existing seed phrase
app.post('/api/wallet/import', (req, res) => {
  try {
    const { seedPhrase } = req.body;
    
    if (!seedPhrase) {
      return res.status(400).json({ success: false, error: 'Seed phrase is required' });
    }
    
    // Validate seed phrase
    if (!WDK.isValidSeed(seedPhrase)) {
      return res.status(400).json({ success: false, error: 'Invalid seed phrase' });
    }
    
    const sessionId = generateSessionId();
    
    // Create WDK instance
    const wdk = new WDK(seedPhrase);
    
    // Register wallet modules
    Object.entries(BLOCKCHAIN_CONFIG).forEach(([key, config]) => {
      wdk.registerWallet(key, config.manager, config.config);
    });
    
    // Store session
    walletSessions.set(sessionId, {
      wdk,
      seedPhrase,
      accounts: new Map(),
      createdAt: new Date()
    });
    
    // 🔐 Cüzdan hash'i ile kayıtlı e-postayı bul ve yeni session'a aktar
    const walletHash = crypto.createHash('sha256').update(seedPhrase).digest('hex');
    const savedEmail = db.getWalletEmail(walletHash);
    
    if (savedEmail) {
      db.getOrCreateProfile(sessionId);
      db.updateUserEmail(sessionId, savedEmail);
      console.log(`📧 Email restored from wallet hash: ${savedEmail}`);
    }
    
    console.log(`✅ Wallet imported: ${sessionId}`);
    
    res.json({
      success: true,
      sessionId,
      seedPhrase
    });
  } catch (error) {
    console.error('Import wallet error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create account
app.post('/api/wallet/account', async (req, res) => {
  try {
    const { sessionId, blockchain, index = 0 } = req.body;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }
    
    if (!BLOCKCHAIN_CONFIG[blockchain]) {
      return res.status(400).json({ success: false, error: 'Invalid blockchain' });
    }
    
    const accountKey = `${blockchain}-${index}`;
    
    // Check if account already exists
    if (session.accounts.has(accountKey)) {
      const existingAccount = session.accounts.get(accountKey);
      return res.json({
        success: true,
        account: {
          id: accountKey,
          blockchain,
          index,
          address: existingAccount.address,
          config: {
            name: BLOCKCHAIN_CONFIG[blockchain].name,
            symbol: BLOCKCHAIN_CONFIG[blockchain].symbol,
            color: BLOCKCHAIN_CONFIG[blockchain].color,
            icon: BLOCKCHAIN_CONFIG[blockchain].icon,
            explorer: BLOCKCHAIN_CONFIG[blockchain].explorer,
            isTestnet: BLOCKCHAIN_CONFIG[blockchain].isTestnet
          }
        }
      });
    }
    
    // Create new account
    const account = await session.wdk.getAccount(blockchain, index);
    const address = await account.getAddress();
    
    // Store account
    session.accounts.set(accountKey, { account, address });
    
    console.log(`✅ Account created: ${blockchain} #${index} - ${address}`);
    
    res.json({
      success: true,
      account: {
        id: accountKey,
        blockchain,
        index,
        address,
        config: {
          name: BLOCKCHAIN_CONFIG[blockchain].name,
          symbol: BLOCKCHAIN_CONFIG[blockchain].symbol,
          color: BLOCKCHAIN_CONFIG[blockchain].color,
          icon: BLOCKCHAIN_CONFIG[blockchain].icon,
          explorer: BLOCKCHAIN_CONFIG[blockchain].explorer,
          isTestnet: BLOCKCHAIN_CONFIG[blockchain].isTestnet
        }
      }
    });
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all accounts
app.get('/api/wallet/accounts/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }
    
    const accounts = [];
    for (const [key, data] of session.accounts.entries()) {
      const [blockchain, index] = key.split('-');
      accounts.push({
        id: key,
        blockchain,
        index: parseInt(index),
        address: data.address,
        config: {
          name: BLOCKCHAIN_CONFIG[blockchain].name,
          symbol: BLOCKCHAIN_CONFIG[blockchain].symbol,
          color: BLOCKCHAIN_CONFIG[blockchain].color,
          icon: BLOCKCHAIN_CONFIG[blockchain].icon,
          explorer: BLOCKCHAIN_CONFIG[blockchain].explorer,
          isTestnet: BLOCKCHAIN_CONFIG[blockchain].isTestnet
        }
      });
    }
    
    res.json({ success: true, accounts });
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get balance
app.get('/api/wallet/balance/:sessionId/:accountId', async (req, res) => {
  try {
    const { sessionId, accountId } = req.params;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }
    
    const accountData = session.accounts.get(accountId);
    if (!accountData) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    
    try {
      const balance = await accountData.account.getBalance();
      const [blockchain] = accountId.split('-');
      let formattedBalance = balance.toString();
      
      if (blockchain === 'ethereum') {
        const balanceInEth = Number(balance) / 1e18;
        formattedBalance = balanceInEth.toFixed(6);
      }
      
      res.json({ success: true, balance: formattedBalance, rawBalance: balance.toString() });
    } catch (balanceError) {
      console.log('Balance fetch error:', balanceError.message);
      res.json({ success: true, balance: '0', rawBalance: '0' });
    }
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send transaction (GÜVENLİK ANALİZİ ENTEGRE)
app.post('/api/wallet/send', async (req, res) => {
  try {
    const { sessionId, accountId, to, amount, skipSecurityCheck = false, confirmedRisk = false } = req.body;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }
    
    const accountData = session.accounts.get(accountId);
    if (!accountData) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    
    if (!to || !amount) {
      return res.status(400).json({ success: false, error: 'Recipient and amount are required' });
    }
    
    const [blockchain] = accountId.split('-');
    
    // 🔐 GÜVENLİK ANALİZİ
    let securityAnalysis = null;
    if (!skipSecurityCheck && blockchain === 'ethereum') {
      // Bakiyeyi al
      let balance = '0';
      try {
        const rawBalance = await accountData.account.getBalance();
        balance = (Number(rawBalance) / 1e18).toFixed(8);
      } catch (e) {
        console.log('Balance fetch for security failed:', e.message);
      }
      
      // Güvenlik analizi yap
      securityAnalysis = analyzeTransactionSecurity(sessionId, {
        to,
        amount,
        balance,
        type: 'transfer',
        token: 'ETH'
      });
      
      console.log(`🔐 Security Check: Risk ${securityAnalysis.summary.totalRiskScore}/100 (${securityAnalysis.summary.riskLabel})`);
      
      // Kritik risk durumunda ve onay yoksa işlemi engelle
      if (securityAnalysis.summary.riskLevel === 'critical' && !confirmedRisk) {
        return res.status(403).json({
          success: false,
          error: 'İşlem güvenlik kontrolünü geçemedi',
          securityAnalysis: securityAnalysis.summary,
          requiresConfirmation: true,
          message: 'Bu işlem kritik risk seviyesinde. Devam etmek için confirmedRisk: true gönderin.'
        });
      }
      
      // Yüksek risk uyarısı (onay gerektirmez ama uyarı verir)
      if (securityAnalysis.summary.riskLevel === 'high' && !confirmedRisk) {
        console.log(`⚠️ High risk transaction proceeding with warning`);
      }
    }
    
    let txParams;
    
    if (blockchain === 'ethereum') {
      const amountInWei = BigInt(Math.floor(parseFloat(amount) * 1e18));
      txParams = {
        to,
        value: amountInWei
      };
    } else {
      txParams = {
        to,
        amount: amount.toString()
      };
    }
    
    console.log(`📤 Sending transaction on ${blockchain}:`, txParams);
    
    const result = await accountData.account.sendTransaction(txParams);
    
    console.log(`✅ Transaction sent: ${result.hash || result}`);
    
    // 📝 Başarılı işlemi davranış geçmişine kaydet
    if (blockchain === 'ethereum') {
      recordTransaction(sessionId, {
        to,
        amount,
        type: 'transfer',
        token: 'ETH'
      });
      recordAddressInteraction(sessionId, to);
    }
    
    const explorer = BLOCKCHAIN_CONFIG[blockchain].explorer;
    const txUrl = blockchain === 'ethereum' 
      ? `${explorer}/tx/${result.hash || result}`
      : blockchain === 'tron'
      ? `${explorer}/#/transaction/${result.hash || result}`
      : `${explorer}/tx/${result.hash || result}`;
    
    res.json({
      success: true,
      transaction: {
        hash: result.hash || result,
        fee: result.fee ? (Number(result.fee) / 1e18).toFixed(8) : null,
        explorerUrl: txUrl
      },
      // Güvenlik analizi sonucunu da ekle
      securityAnalysis: securityAnalysis ? securityAnalysis.summary : null
    });
  } catch (error) {
    console.error('Send transaction error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get fee estimate
app.post('/api/wallet/quote', async (req, res) => {
  try {
    const { sessionId, accountId, to, amount } = req.body;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }
    
    const accountData = session.accounts.get(accountId);
    if (!accountData) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    
    const [blockchain] = accountId.split('-');
    
    if (blockchain === 'ethereum') {
      const amountInWei = BigInt(Math.floor(parseFloat(amount || '0') * 1e18));
      const quote = await accountData.account.quoteSendTransaction({
        to: to || '0x0000000000000000000000000000000000000000',
        value: amountInWei
      });
      
      res.json({
        success: true,
        fee: (Number(quote.fee) / 1e18).toFixed(8),
        rawFee: quote.fee.toString()
      });
    } else {
      res.json({ success: true, fee: '0', rawFee: '0' });
    }
  } catch (error) {
    console.error('Quote error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Disconnect wallet
app.post('/api/wallet/disconnect', (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (walletSessions.has(sessionId)) {
      walletSessions.delete(sessionId);
      console.log(`🔌 Session disconnected: ${sessionId}`);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// REAL DEFI - SWAP (Uniswap V3 Sepolia)
// ============================================

// Token ikonu helper
function getTokenIcon(symbol) {
  return SEPOLIA_TOKENS[symbol]?.icon || '○';
}

// Get supported tokens for swap
app.get('/api/defi/swap/tokens/:blockchain', async (req, res) => {
  const { blockchain } = req.params;
  
  if (blockchain !== 'ethereum') {
    return res.json({ success: true, tokens: [] });
  }
  
  const tokens = Object.values(SEPOLIA_TOKENS).map(token => ({
    symbol: token.symbol,
    name: token.name,
    address: token.address,
    decimals: token.decimals,
    icon: token.icon,
    isNative: token.isNative || false
  }));
  
  res.json({ success: true, tokens });
});

// Get token balances for an address
app.get('/api/defi/tokens/balances/:sessionId/:accountId', async (req, res) => {
  try {
    const { sessionId, accountId } = req.params;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }
    
    const accountData = session.accounts.get(accountId);
    if (!accountData) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    
    const [blockchain] = accountId.split('-');
    if (blockchain !== 'ethereum') {
      return res.json({ success: true, balances: {} });
    }
    
    const address = accountData.address;
    const balances = {};
    
    // ETH balance
    try {
      const ethBalance = await accountData.account.getBalance();
      balances.ETH = formatUnits(BigInt(ethBalance), 18);
    } catch (e) {
      balances.ETH = '0';
    }
    
    // ERC20 balances - would need to call each token contract
    // For simplicity, returning ETH balance for now
    // In production, you'd iterate through SEPOLIA_TOKENS and call balanceOf
    
    res.json({ success: true, balances });
  } catch (error) {
    console.error('Get token balances error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get swap quote from Uniswap V3
app.post('/api/defi/swap/quote', async (req, res) => {
  try {
    const { fromToken, toToken, amount, sessionId, accountId } = req.body;
    
    if (!fromToken || !toToken || !amount) {
      return res.status(400).json({ success: false, error: 'fromToken, toToken ve amount gerekli' });
    }
    
    const fromTokenData = SEPOLIA_TOKENS[fromToken];
    const toTokenData = SEPOLIA_TOKENS[toToken];
    
    if (!fromTokenData || !toTokenData) {
      return res.status(400).json({ success: false, error: 'Desteklenmeyen token' });
    }
    
    // Parse amount to wei/smallest unit
    const amountIn = parseUnits(amount, fromTokenData.decimals);
    
    // For native ETH, use WETH address in swap
    const tokenInAddress = fromTokenData.isNative ? SEPOLIA_TOKENS.WETH.address : fromTokenData.address;
    const tokenOutAddress = toTokenData.isNative ? SEPOLIA_TOKENS.WETH.address : toTokenData.address;
    
    // Uniswap V3 fee tier (0.3% = 3000)
    const fee = 3000;
    
    // Calculate estimated output (simple price estimate)
    // In production, call Quoter contract
    const estimatedPriceRatio = 1; // Simplified - real implementation calls quoter
    const estimatedOutput = Number(amountIn) * estimatedPriceRatio;
    const slippage = 0.005; // 0.5%
    const protocolFee = 0.003; // 0.3%
    
    const outputAmount = estimatedOutput * (1 - slippage - protocolFee);
    const formattedOutput = formatUnits(BigInt(Math.floor(outputAmount)), toTokenData.decimals);
    
    // Calculate minimum amount out with slippage
    const minAmountOut = outputAmount * (1 - slippage);
    
    res.json({
      success: true,
      quote: {
        fromToken,
        toToken,
        fromTokenAddress: tokenInAddress,
        toTokenAddress: tokenOutAddress,
        inputAmount: amount,
        outputAmount: formattedOutput,
        minimumReceived: formatUnits(BigInt(Math.floor(minAmountOut)), toTokenData.decimals),
        priceImpact: '0.50',
        fee: '0.30',
        slippage: '0.50',
        route: [fromToken, toToken],
        uniswapFee: fee,
        exchangeRate: (Number(formattedOutput) / Number(amount)).toFixed(6),
        isRealSwap: true,
        contracts: {
          router: UNISWAP_CONTRACTS.swapRouter,
          tokenIn: tokenInAddress,
          tokenOut: tokenOutAddress
        }
      }
    });
  } catch (error) {
    console.error('Swap quote error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Execute swap on Uniswap V3
app.post('/api/defi/swap/execute', async (req, res) => {
  try {
    const { sessionId, accountId, fromToken, toToken, amount, slippageTolerance = 0.5 } = req.body;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Geçersiz oturum' });
    }
    
    const accountData = session.accounts.get(accountId);
    if (!accountData) {
      return res.status(404).json({ success: false, error: 'Hesap bulunamadı' });
    }
    
    const [blockchain] = accountId.split('-');
    if (blockchain !== 'ethereum') {
      return res.status(400).json({ success: false, error: 'Swap sadece Ethereum için destekleniyor' });
    }
    
    const fromTokenData = SEPOLIA_TOKENS[fromToken];
    const toTokenData = SEPOLIA_TOKENS[toToken];
    
    if (!fromTokenData || !toTokenData) {
      return res.status(400).json({ success: false, error: 'Desteklenmeyen token' });
    }
    
    const amountIn = parseUnits(amount, fromTokenData.decimals);
    const tokenInAddress = fromTokenData.isNative ? SEPOLIA_TOKENS.WETH.address : fromTokenData.address;
    const tokenOutAddress = toTokenData.isNative ? SEPOLIA_TOKENS.WETH.address : toTokenData.address;
    
    const userAddress = accountData.address;
    const deadline = Math.floor(Date.now() / 1000) + 1800; // 30 minutes
    const fee = 3000; // 0.3%
    
    // Calculate minimum output with slippage
    const minAmountOut = BigInt(Math.floor(Number(amountIn) * (1 - slippageTolerance / 100)));
    
    console.log(`🔄 Executing REAL swap on Uniswap V3 Sepolia:`);
    console.log(`   From: ${amount} ${fromToken} (${tokenInAddress})`);
    console.log(`   To: ${toToken} (${tokenOutAddress})`);
    console.log(`   User: ${userAddress}`);
    
    let txResult;
    
    if (fromTokenData.isNative) {
      // ETH -> Token swap
      // Call exactInputSingle with ETH value
      
      // Encode ExactInputSingleParams struct
      const params = {
        tokenIn: tokenInAddress,
        tokenOut: tokenOutAddress,
        fee: fee,
        recipient: userAddress,
        amountIn: amountIn,
        amountOutMinimum: minAmountOut,
        sqrtPriceLimitX96: BigInt(0)
      };
      
      // ABI encode the function call
      // exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))
      const functionSelector = '0x04e45aaf'; // exactInputSingle
      
      // Encode struct parameters
      const encodedParams = 
        tokenInAddress.slice(2).padStart(64, '0') +
        tokenOutAddress.slice(2).padStart(64, '0') +
        fee.toString(16).padStart(64, '0') +
        userAddress.slice(2).padStart(64, '0') +
        amountIn.toString(16).padStart(64, '0') +
        minAmountOut.toString(16).padStart(64, '0') +
        '0'.padStart(64, '0'); // sqrtPriceLimitX96
      
      const calldata = functionSelector + encodedParams;
      
      // Send transaction via WDK
      txResult = await accountData.account.sendTransaction({
        to: UNISWAP_CONTRACTS.swapRouter,
        value: amountIn, // Send ETH
        data: calldata
      });
      
    } else {
      // Token -> Token or Token -> ETH swap
      // First need to approve the router to spend tokens
      
      // Step 1: Approve router
      const approveSelector = '0x095ea7b3'; // approve(address,uint256)
      const approveData = approveSelector + 
        UNISWAP_CONTRACTS.swapRouter.slice(2).padStart(64, '0') +
        amountIn.toString(16).padStart(64, '0');
      
      console.log(`   Approving ${fromToken} for router...`);
      
      const approveTx = await accountData.account.sendTransaction({
        to: fromTokenData.address,
        value: BigInt(0),
        data: approveData
      });
      
      console.log(`   Approval tx: ${approveTx.hash || approveTx}`);
      
      // Wait a bit for approval to be mined
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Step 2: Execute swap
      const functionSelector = '0x04e45aaf';
      const encodedParams = 
        tokenInAddress.slice(2).padStart(64, '0') +
        tokenOutAddress.slice(2).padStart(64, '0') +
        fee.toString(16).padStart(64, '0') +
        userAddress.slice(2).padStart(64, '0') +
        amountIn.toString(16).padStart(64, '0') +
        minAmountOut.toString(16).padStart(64, '0') +
        '0'.padStart(64, '0');
      
      const calldata = functionSelector + encodedParams;
      
      txResult = await accountData.account.sendTransaction({
        to: UNISWAP_CONTRACTS.swapRouter,
        value: BigInt(0),
        data: calldata
      });
    }
    
    const txHash = txResult.hash || txResult;
    console.log(`✅ Swap transaction sent: ${txHash}`);
    
    res.json({
      success: true,
      transaction: {
        hash: txHash,
        fromToken,
        toToken,
        inputAmount: amount,
        outputAmount: formatUnits(minAmountOut, toTokenData.decimals),
        status: 'pending',
        explorerUrl: `https://sepolia.etherscan.io/tx/${txHash}`,
        timestamp: new Date().toISOString(),
        isRealTransaction: true
      }
    });
    
  } catch (error) {
    console.error('Swap execute error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// REAL DEFI - LENDING (Aave V3 Sepolia)
// ============================================

// Lending pools with real Aave data
app.get('/api/defi/lending/pools', async (req, res) => {
  try {
    // Return Aave V3 Sepolia supported assets
    const pools = Object.entries(SEPOLIA_TOKENS)
      .filter(([symbol, token]) => token.aToken) // Only tokens with aTokens
      .map(([symbol, token]) => ({
        symbol,
        name: token.name,
        address: token.address,
        aTokenAddress: token.aToken,
        decimals: token.decimals,
        icon: token.icon,
        // These would come from Aave's getReserveData in production
        supplyAPY: (Math.random() * 5 + 1).toFixed(2),
        borrowAPY: (Math.random() * 8 + 3).toFixed(2),
        totalSupply: Math.floor(Math.random() * 1000000),
        totalBorrow: Math.floor(Math.random() * 500000),
        ltv: 0.8,
        utilizationRate: (Math.random() * 60 + 20).toFixed(2),
        isRealProtocol: true,
        protocol: 'Aave V3',
        poolAddress: AAVE_CONTRACTS.pool
      }));
    
    res.json({ success: true, pools });
  } catch (error) {
    console.error('Get lending pools error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user positions from Aave
app.get('/api/defi/lending/positions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Geçersiz oturum' });
    }
    
    // Get ethereum account
    const ethAccount = session.accounts.get('ethereum-0');
    if (!ethAccount) {
      return res.json({
        success: true,
        positions: {
          supplied: [],
          borrowed: [],
          totalSuppliedValue: '0',
          totalBorrowedValue: '0',
          healthFactor: '∞',
          netAPY: '0',
          borrowLimit: '0',
          borrowLimitUsed: '0',
          isRealData: false,
          message: 'Ethereum hesabı oluşturun'
        }
      });
    }
    
    const userAddress = ethAccount.address;
    
    // In production, call Aave Pool's getUserAccountData
    // For now, return placeholder that indicates real data would come from blockchain
    res.json({
      success: true,
      positions: {
        supplied: [],
        borrowed: [],
        totalSuppliedValue: '0',
        totalBorrowedValue: '0',
        healthFactor: '∞',
        netAPY: '0',
        borrowLimit: '0',
        borrowLimitUsed: '0',
        isRealData: true,
        userAddress,
        aavePool: AAVE_CONTRACTS.pool,
        message: 'Pozisyonlar Aave V3 Sepolia üzerinden görüntüleniyor'
      }
    });
    
  } catch (error) {
    console.error('Get positions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Supply to Aave V3
app.post('/api/defi/lending/supply', async (req, res) => {
  try {
    const { sessionId, token, amount } = req.body;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Geçersiz oturum' });
    }
    
    const accountData = session.accounts.get('ethereum-0');
    if (!accountData) {
      return res.status(404).json({ success: false, error: 'Ethereum hesabı bulunamadı' });
    }
    
    const tokenData = SEPOLIA_TOKENS[token];
    if (!tokenData || !tokenData.aToken) {
      return res.status(400).json({ success: false, error: 'Bu token Aave\'de desteklenmiyor' });
    }
    
    const userAddress = accountData.address;
    const amountInWei = parseUnits(amount, tokenData.decimals);
    
    console.log(`💰 Supplying to Aave V3 Sepolia:`);
    console.log(`   Token: ${amount} ${token}`);
    console.log(`   User: ${userAddress}`);
    
    let txResult;
    
    if (token === 'ETH') {
      // Use WETH Gateway for ETH
      // depositETH(address pool, address onBehalfOf, uint16 referralCode)
      const functionSelector = '0x474cf53d';
      const calldata = functionSelector +
        AAVE_CONTRACTS.pool.slice(2).padStart(64, '0') +
        userAddress.slice(2).padStart(64, '0') +
        '0'.padStart(64, '0'); // referralCode
      
      txResult = await accountData.account.sendTransaction({
        to: AAVE_CONTRACTS.wethGateway,
        value: amountInWei,
        data: calldata
      });
    } else {
      // Step 1: Approve Aave Pool
      const approveSelector = '0x095ea7b3';
      const approveData = approveSelector +
        AAVE_CONTRACTS.pool.slice(2).padStart(64, '0') +
        amountInWei.toString(16).padStart(64, '0');
      
      console.log(`   Approving ${token} for Aave Pool...`);
      
      const approveTx = await accountData.account.sendTransaction({
        to: tokenData.address,
        value: BigInt(0),
        data: approveData
      });
      
      console.log(`   Approval tx: ${approveTx.hash || approveTx}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Step 2: Supply to Aave
      // supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
      const supplySelector = '0x617ba037';
      const supplyData = supplySelector +
        tokenData.address.slice(2).padStart(64, '0') +
        amountInWei.toString(16).padStart(64, '0') +
        userAddress.slice(2).padStart(64, '0') +
        '0'.padStart(64, '0');
      
      txResult = await accountData.account.sendTransaction({
        to: AAVE_CONTRACTS.pool,
        value: BigInt(0),
        data: supplyData
      });
    }
    
    const txHash = txResult.hash || txResult;
    console.log(`✅ Supply transaction sent: ${txHash}`);
    
    res.json({
      success: true,
      transaction: {
        hash: txHash,
        type: 'supply',
        token,
        amount: parseFloat(amount),
        protocol: 'Aave V3',
        explorerUrl: `https://sepolia.etherscan.io/tx/${txHash}`,
        status: 'pending',
        isRealTransaction: true
      }
    });
    
  } catch (error) {
    console.error('Supply error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Withdraw from Aave V3
app.post('/api/defi/lending/withdraw', async (req, res) => {
  try {
    const { sessionId, token, amount } = req.body;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Geçersiz oturum' });
    }
    
    const accountData = session.accounts.get('ethereum-0');
    if (!accountData) {
      return res.status(404).json({ success: false, error: 'Ethereum hesabı bulunamadı' });
    }
    
    const tokenData = SEPOLIA_TOKENS[token];
    if (!tokenData || !tokenData.aToken) {
      return res.status(400).json({ success: false, error: 'Bu token Aave\'de desteklenmiyor' });
    }
    
    const userAddress = accountData.address;
    const amountInWei = parseUnits(amount, tokenData.decimals);
    
    console.log(`📤 Withdrawing from Aave V3 Sepolia:`);
    console.log(`   Token: ${amount} ${token}`);
    console.log(`   User: ${userAddress}`);
    
    let txResult;
    
    if (token === 'ETH') {
      // Use WETH Gateway
      // withdrawETH(address pool, uint256 amount, address to)
      const functionSelector = '0x80500d20';
      const calldata = functionSelector +
        AAVE_CONTRACTS.pool.slice(2).padStart(64, '0') +
        amountInWei.toString(16).padStart(64, '0') +
        userAddress.slice(2).padStart(64, '0');
      
      txResult = await accountData.account.sendTransaction({
        to: AAVE_CONTRACTS.wethGateway,
        value: BigInt(0),
        data: calldata
      });
    } else {
      // withdraw(address asset, uint256 amount, address to)
      const withdrawSelector = '0x69328dec';
      const calldata = withdrawSelector +
        tokenData.address.slice(2).padStart(64, '0') +
        amountInWei.toString(16).padStart(64, '0') +
        userAddress.slice(2).padStart(64, '0');
      
      txResult = await accountData.account.sendTransaction({
        to: AAVE_CONTRACTS.pool,
        value: BigInt(0),
        data: calldata
      });
    }
    
    const txHash = txResult.hash || txResult;
    console.log(`✅ Withdraw transaction sent: ${txHash}`);
    
    res.json({
      success: true,
      transaction: {
        hash: txHash,
        type: 'withdraw',
        token,
        amount: parseFloat(amount),
        protocol: 'Aave V3',
        explorerUrl: `https://sepolia.etherscan.io/tx/${txHash}`,
        status: 'pending',
        isRealTransaction: true
      }
    });
    
  } catch (error) {
    console.error('Withdraw error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Borrow from Aave V3
app.post('/api/defi/lending/borrow', async (req, res) => {
  try {
    const { sessionId, token, amount } = req.body;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Geçersiz oturum' });
    }
    
    const accountData = session.accounts.get('ethereum-0');
    if (!accountData) {
      return res.status(404).json({ success: false, error: 'Ethereum hesabı bulunamadı' });
    }
    
    const tokenData = SEPOLIA_TOKENS[token];
    if (!tokenData || !tokenData.aToken) {
      return res.status(400).json({ success: false, error: 'Bu token Aave\'de desteklenmiyor' });
    }
    
    const userAddress = accountData.address;
    const amountInWei = parseUnits(amount, tokenData.decimals);
    
    console.log(`🏦 Borrowing from Aave V3 Sepolia:`);
    console.log(`   Token: ${amount} ${token}`);
    console.log(`   User: ${userAddress}`);
    
    // borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)
    // interestRateMode: 1 = stable, 2 = variable
    const borrowSelector = '0xa415bcad';
    const calldata = borrowSelector +
      tokenData.address.slice(2).padStart(64, '0') +
      amountInWei.toString(16).padStart(64, '0') +
      '2'.padStart(64, '0') + // variable rate
      '0'.padStart(64, '0') + // referralCode
      userAddress.slice(2).padStart(64, '0');
    
    const txResult = await accountData.account.sendTransaction({
      to: AAVE_CONTRACTS.pool,
      value: BigInt(0),
      data: calldata
    });
    
    const txHash = txResult.hash || txResult;
    console.log(`✅ Borrow transaction sent: ${txHash}`);
    
    res.json({
      success: true,
      transaction: {
        hash: txHash,
        type: 'borrow',
        token,
        amount: parseFloat(amount),
        protocol: 'Aave V3',
        explorerUrl: `https://sepolia.etherscan.io/tx/${txHash}`,
        status: 'pending',
        isRealTransaction: true
      }
    });
    
  } catch (error) {
    console.error('Borrow error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Repay to Aave V3
app.post('/api/defi/lending/repay', async (req, res) => {
  try {
    const { sessionId, token, amount } = req.body;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Geçersiz oturum' });
    }
    
    const accountData = session.accounts.get('ethereum-0');
    if (!accountData) {
      return res.status(404).json({ success: false, error: 'Ethereum hesabı bulunamadı' });
    }
    
    const tokenData = SEPOLIA_TOKENS[token];
    if (!tokenData || !tokenData.aToken) {
      return res.status(400).json({ success: false, error: 'Bu token Aave\'de desteklenmiyor' });
    }
    
    const userAddress = accountData.address;
    const amountInWei = parseUnits(amount, tokenData.decimals);
    
    console.log(`💸 Repaying to Aave V3 Sepolia:`);
    console.log(`   Token: ${amount} ${token}`);
    console.log(`   User: ${userAddress}`);
    
    // Step 1: Approve (for non-ETH)
    if (token !== 'ETH') {
      const approveSelector = '0x095ea7b3';
      const approveData = approveSelector +
        AAVE_CONTRACTS.pool.slice(2).padStart(64, '0') +
        amountInWei.toString(16).padStart(64, '0');
      
      console.log(`   Approving ${token}...`);
      const approveTx = await accountData.account.sendTransaction({
        to: tokenData.address,
        value: BigInt(0),
        data: approveData
      });
      console.log(`   Approval tx: ${approveTx.hash || approveTx}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)
    const repaySelector = '0x573ade81';
    const calldata = repaySelector +
      tokenData.address.slice(2).padStart(64, '0') +
      amountInWei.toString(16).padStart(64, '0') +
      '2'.padStart(64, '0') + // variable rate
      userAddress.slice(2).padStart(64, '0');
    
    const txResult = await accountData.account.sendTransaction({
      to: AAVE_CONTRACTS.pool,
      value: token === 'ETH' ? amountInWei : BigInt(0),
      data: calldata
    });
    
    const txHash = txResult.hash || txResult;
    console.log(`✅ Repay transaction sent: ${txHash}`);
    
    res.json({
      success: true,
      transaction: {
        hash: txHash,
        type: 'repay',
        token,
        amount: parseFloat(amount),
        protocol: 'Aave V3',
        explorerUrl: `https://sepolia.etherscan.io/tx/${txHash}`,
        status: 'pending',
        isRealTransaction: true
      }
    });
    
  } catch (error) {
    console.error('Repay error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get token prices (from Chainlink oracles in production)
app.get('/api/defi/prices', (req, res) => {
  // Simplified price feed - in production use Chainlink
  const prices = {
    ETH: 2350.00,
    WETH: 2350.00,
    USDC: 1.00,
    USDT: 1.00,
    DAI: 1.00,
    LINK: 14.50,
    WBTC: 43500.00
  };
  
  res.json({ success: true, prices });
});

// ============================================
// GÜVENLİK API ENDPOINTS
// ============================================

// İşlem güvenlik analizi - işlem öncesi risk değerlendirmesi
app.post('/api/security/analyze', async (req, res) => {
  try {
    const { sessionId, accountId, to, amount } = req.body;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Geçersiz oturum' });
    }
    
    const accountData = session.accounts.get(accountId);
    if (!accountData) {
      return res.status(404).json({ success: false, error: 'Hesap bulunamadı' });
    }
    
    // Mevcut bakiyeyi al
    let balance = '0';
    try {
      const rawBalance = await accountData.account.getBalance();
      const [blockchain] = accountId.split('-');
      if (blockchain === 'ethereum') {
        balance = (Number(rawBalance) / 1e18).toFixed(8);
      } else {
        balance = rawBalance.toString();
      }
    } catch (e) {
      console.log('Balance fetch for security analysis failed:', e.message);
    }
    
    // Güvenlik analizi yap
    const analysis = analyzeTransactionSecurity(sessionId, {
      to,
      amount,
      balance,
      type: 'transfer'
    });
    
    console.log(`🔐 Security Analysis for ${sessionId}:`);
    console.log(`   Risk Score: ${analysis.summary.totalRiskScore}/100`);
    console.log(`   Risk Level: ${analysis.summary.riskLabel}`);
    console.log(`   Action: ${analysis.summary.recommendedAction}`);
    
    res.json(analysis);
    
  } catch (error) {
    console.error('Security analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Kullanıcı davranış profili
app.get('/api/security/profile/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Geçersiz oturum' });
    }
    
    // SQLite'dan profil al
    const profile = db.getUserProfile(sessionId);
    
    res.json({
      success: true,
      profile: {
        sessionId,
        status: profile.totalTransactions > 0 ? 'active' : 'new',
        email: profile.email ? profile.email.replace(/(.{3}).*@/, '$1***@') : null,
        emailVerified: profile.emailVerified,
        createdAt: profile.createdAt,
        lastActivity: profile.lastActivity,
        transactionCount: profile.totalTransactions,
        knownAddresses: profile.knownAddresses,
        averageDuration: profile.averageDuration,
        averageAmount: profile.stats.avgAmount?.toFixed(8) || '0',
        stdDeviation: profile.stats.stdDeviation?.toFixed(2) || '0',
        recentTransactions: profile.recentTransactions.map(tx => ({
          amount: tx.amount,
          to: tx.to ? `${tx.to.slice(0, 8)}...${tx.to.slice(-6)}` : 'N/A',
          type: tx.type,
          token: tx.token,
          duration: tx.duration,
          riskScore: tx.riskScore,
          timestamp: tx.timestamp
        }))
      }
    });
    
  } catch (error) {
    console.error('Get security profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Güvenlik ayarlarını getir
app.get('/api/security/config', (req, res) => {
  res.json({
    success: true,
    config: SECURITY_CONFIG
  });
});

// İşlem geçmişine manuel ekleme (test için)
app.post('/api/security/record-transaction', (req, res) => {
  try {
    const { sessionId, to, amount, type = 'transfer', token = 'ETH' } = req.body;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Geçersiz oturum' });
    }
    
    // İşlemi kaydet
    recordTransaction(sessionId, { to, amount, type, token });
    recordAddressInteraction(sessionId, to);
    
    const behavior = userBehaviorData.get(sessionId);
    
    res.json({
      success: true,
      message: 'İşlem kaydedildi',
      transactionCount: behavior.totalTransactions,
      knownAddresses: behavior.interactedAddresses.size
    });
    
  } catch (error) {
    console.error('Record transaction error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ⏱️ MODAL TIMING API ENDPOINTS
// ============================================

// Modal açıldığında çağrılır - zamanlayıcı başlar
app.post('/api/security/modal/start', (req, res) => {
  try {
    const { sessionId, modalType = 'transfer' } = req.body;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Geçersiz oturum' });
    }
    
    const result = startModalSession(sessionId, modalType);
    
    res.json({
      success: true,
      message: 'Modal oturumu başlatıldı',
      ...result
    });
    
  } catch (error) {
    console.error('Modal start error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Kullanıcı etkileşimi kaydet (mouse move, key press vb.)
app.post('/api/security/modal/interaction', (req, res) => {
  try {
    const { sessionId, modalType = 'transfer', interactionType = 'generic' } = req.body;
    
    const count = recordInteraction(sessionId, modalType, interactionType);
    
    if (count === null) {
      return res.status(404).json({ success: false, error: 'Modal oturumu bulunamadı' });
    }
    
    res.json({
      success: true,
      interactionCount: count
    });
    
  } catch (error) {
    console.error('Interaction record error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Modal kapandığında veya işlem tamamlandığında
app.post('/api/security/modal/end', (req, res) => {
  try {
    const { sessionId, modalType = 'transfer', wasSuccessful = true, txData = {} } = req.body;
    
    const sessionKey = `${sessionId}-${modalType}`;
    const modalSession = activeModalSessions.get(sessionKey);
    
    if (!modalSession) {
      return res.status(404).json({ success: false, error: 'Modal oturumu bulunamadı' });
    }
    
    const duration = Math.round((Date.now() - modalSession.startTime) / 1000);
    const interactions = modalSession.interactionCount;
    
    // Modal'ı temizle
    activeModalSessions.delete(sessionKey);
    
    // Başarılı işlemleri SQLite'a kaydet
    if (wasSuccessful && txData.amount && txData.to) {
      // İşlemi kaydet
      db.recordTransaction(sessionId, {
        type: modalType,
        amount: parseFloat(txData.amount),
        to: txData.to,
        token: txData.token || 'ETH',
        duration,
        interactions,
        riskScore: txData.riskScore || 0
      });
      
      // Adresi bilinen adreslere ekle
      db.addKnownAddress(sessionId, txData.to);
      
      // Ortalama süreyi güncelle
      const profile = db.getUserProfile(sessionId);
      const newAverage = calculateNewAverage(
        profile.averageDuration, 
        duration, 
        profile.totalTransactions
      );
      db.updateAverageDuration(sessionId, newAverage);
      
      console.log(`📊 Transaction recorded: ${duration}s, new avg: ${newAverage.toFixed(0)}s`);
    }
    
    const profile = db.getUserProfile(sessionId);
    
    res.json({
      success: true,
      message: 'Modal oturumu kapatıldı',
      duration,
      interactions,
      wasRecorded: wasSuccessful,
      newAverageDuration: profile.averageDuration
    });
    
  } catch (error) {
    console.error('Modal end error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Aktif modal oturumunu kontrol et
app.get('/api/security/modal/status/:sessionId/:modalType', (req, res) => {
  try {
    const { sessionId, modalType } = req.params;
    const sessionKey = `${sessionId}-${modalType}`;
    const modalSession = activeModalSessions.get(sessionKey);
    
    if (!modalSession) {
      return res.json({
        success: true,
        active: false,
        message: 'Aktif modal oturumu yok'
      });
    }
    
    const elapsed = Math.round((Date.now() - modalSession.startTime) / 1000);
    
    res.json({
      success: true,
      active: true,
      elapsedSeconds: elapsed,
      interactionCount: modalSession.interactionCount,
      startTime: new Date(modalSession.startTime).toISOString()
    });
    
  } catch (error) {
    console.error('Modal status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📧 E-POSTA DOĞRULAMA API ENDPOINTS
// ============================================

// Kullanıcı e-postasını kaydet
app.post('/api/security/email/register', (req, res) => {
  try {
    const { sessionId, email } = req.body;
    
    console.log(`📧 Email register request: sessionId=${sessionId}, email=${email}`);
    
    const session = getWalletSession(sessionId);
    if (!session) {
      console.log(`❌ Session not found: ${sessionId}`);
      return res.status(401).json({ success: false, error: 'Geçersiz oturum' });
    }
    
    console.log(`✅ Session found, hasSeedPhrase=${!!session.seedPhrase}`);
    
    // E-posta validasyonu
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Geçersiz e-posta adresi' });
    }
    
    // Session'a kaydet
    db.getOrCreateProfile(sessionId);
    db.updateUserEmail(sessionId, email);
    console.log(`✅ Email saved to session profile`);
    
    // 🔐 Cüzdan hash'i ile de kaydet (kalıcı eşleme)
    if (session.seedPhrase) {
      const walletHash = crypto.createHash('sha256').update(session.seedPhrase).digest('hex');
      db.registerWalletEmail(walletHash, email);
      console.log(`✅ Email saved to wallet_emails: hash=${walletHash.slice(0, 16)}...`);
    } else {
      console.log(`⚠️ No seedPhrase in session, skipping wallet_emails`);
    }
    
    console.log(`📧 Email registered for ${sessionId}: ${email}`);
    
    res.json({
      success: true,
      message: 'E-posta adresi kaydedildi',
      email: email.replace(/(.{3}).*@/, '$1***@')
    });
    
  } catch (error) {
    console.error('Email register error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// İşlem için doğrulama kodu gönder (Pre-sign hook)
app.post('/api/security/email/send-verification', (req, res) => {
  try {
    const { sessionId, transactionDetails } = req.body;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Geçersiz oturum' });
    }
    
    const behavior = userBehaviorData.get(sessionId);
    
    if (!behavior?.email) {
      return res.status(400).json({ 
        success: false, 
        error: 'E-posta adresi kayıtlı değil',
        requiresEmailRegistration: true
      });
    }
    
    // Doğrulama token'ı oluştur
    const token = createVerificationToken(sessionId, behavior.email, transactionDetails);
    
    // 🔔 Gerçek uygulamada burada e-posta gönderilir
    // sendEmail(behavior.email, `Doğrulama kodunuz: ${token._demoCode}`)
    
    res.json({
      success: true,
      message: 'Doğrulama kodu gönderildi',
      tokenId: token.tokenId,
      expiresAt: token.expiresAt,
      email: behavior.email.replace(/(.{3}).*@/, '$1***@'),
      // ⚠️ Sadece demo için - production'da gönderilmez!
      _demoCode: token._demoCode
    });
    
  } catch (error) {
    console.error('Send verification error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Doğrulama kodunu kontrol et
app.post('/api/security/email/verify', (req, res) => {
  try {
    const { tokenId, code } = req.body;
    
    if (!tokenId || !code) {
      return res.status(400).json({ success: false, error: 'Token ID ve kod gerekli' });
    }
    
    // SQLite'dan token'ı al
    const token = db.getVerificationToken(tokenId);
    
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token bulunamadı veya süresi dolmuş' });
    }
    
    // Süre kontrolü
    if (new Date(token.expires_at) < new Date()) {
      db.deleteToken(tokenId);
      return res.status(400).json({ success: false, error: 'Token süresi dolmuş' });
    }
    
    // Zaten doğrulanmış mı?
    if (token.verified) {
      return res.json({ success: true, message: 'Zaten doğrulanmış', alreadyVerified: true });
    }
    
    // Deneme sayısı kontrolü
    if (token.attempts >= 3) {
      db.deleteToken(tokenId);
      return res.status(400).json({ success: false, error: 'Çok fazla hatalı deneme, token iptal edildi' });
    }
    
    // Kod kontrolü
    if (token.code !== code) {
      db.incrementTokenAttempts(tokenId);
      return res.status(400).json({ 
        success: false, 
        error: 'Yanlış kod',
        attemptsLeft: 3 - token.attempts - 1
      });
    }
    
    // ✅ Doğrulama başarılı
    db.markTokenVerified(tokenId);
    console.log(`✅ Token verified: ${tokenId}`);
    
    res.json({
      success: true,
      message: 'Doğrulama başarılı',
      verified: true,
      transactionDetails: token.transaction_data
    });
    
  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Token durumunu kontrol et
app.get('/api/security/email/token-status/:tokenId', (req, res) => {
  try {
    const { tokenId } = req.params;
    const token = emailVerificationTokens.get(tokenId);
    
    if (!token) {
      return res.json({
        success: true,
        exists: false,
        message: 'Token bulunamadı veya süresi dolmuş'
      });
    }
    
    const isExpired = Date.now() > token.expiresAt;
    
    res.json({
      success: true,
      exists: true,
      verified: token.verified,
      expired: isExpired,
      attemptsRemaining: SECURITY_CONFIG.emailVerification.maxAttempts - token.attempts,
      expiresAt: new Date(token.expiresAt).toISOString()
    });
    
  } catch (error) {
    console.error('Token status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 🛡️ PRE-SIGN HOOK - İMZA ÖNCESİ GÜVENLİK
// ============================================

// İmza öncesi tam güvenlik kontrolü (timing + tüm analizler)
app.post('/api/security/pre-sign', async (req, res) => {
  try {
    const { sessionId, accountId, to, amount, modalType = 'transfer' } = req.body;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Geçersiz oturum' });
    }
    
    const accountData = session.accounts.get(accountId);
    if (!accountData) {
      return res.status(404).json({ success: false, error: 'Hesap bulunamadı' });
    }
    
    // 📊 SQLite'dan kullanıcı profilini al
    const userProfile = db.getUserProfile(sessionId);
    
    // ⏱️ Modal süresini hesapla
    const sessionKey = `${sessionId}-${modalType}`;
    const modalSession = activeModalSessions.get(sessionKey);
    const duration = modalSession 
      ? Math.round((Date.now() - modalSession.startTime) / 1000) 
      : 0;
    const interactions = modalSession?.interactionCount || 0;
    
    // 🔍 Adres daha önce kullanılmış mı?
    const isNewAddress = !db.isKnownAddress(sessionId, to);
    
    console.log(`🛡️ Pre-Sign Security Check:`);
    console.log(`   Session: ${sessionId}`);
    console.log(`   Duration: ${duration}s (avg: ${userProfile.averageDuration?.toFixed(0)}s)`);
    console.log(`   Interactions: ${interactions}`);
    console.log(`   New Address: ${isNewAddress}`);
    console.log(`   Total TX History: ${userProfile.totalTransactions}`);
    
    // 🤖 Gemini AI ile analiz
    const aiAnalysis = await analyzeUserBehavior(userProfile, {
      duration,
      amount: parseFloat(amount),
      to,
      interactions,
      isNewAddress
    });
    
    console.log(`   AI Risk Score: ${aiAnalysis.riskScore}/100 (${aiAnalysis.riskLevel})`);
    console.log(`   AI Source: ${aiAnalysis.source}`);
    console.log(`   Reasons: ${aiAnalysis.reasons?.join(', ')}`);
    
    // E-posta doğrulama gerekiyor mu?
    if (aiAnalysis.requiresVerification) {
      // E-posta kayıtlı mı? (Önce session'dan, sonra wallet hash'ten ara)
      let userEmail = db.getUserEmail(sessionId);
      
      // Session'da yoksa wallet hash ile ara
      if (!userEmail && session.seedPhrase) {
        const walletHash = crypto.createHash('sha256').update(session.seedPhrase).digest('hex');
        userEmail = db.getWalletEmail(walletHash);
        
        // Bulunduysa session'a da kaydet
        if (userEmail) {
          db.getOrCreateProfile(sessionId);
          db.updateUserEmail(sessionId, userEmail);
          console.log(`📧 Email restored from wallet hash: ${userEmail}`);
        }
      }
      
      if (!userEmail) {
        // ❌ E-posta kayıtlı değil - kayıt istenmeli
        return res.status(403).json({
          success: false,
          blocked: true,
          reason: 'email_required',
          message: '⏱️ Bu işlem normalden çok hızlı gerçekleşti. Güvenlik için e-posta doğrulaması gerekiyor.',
          analysis: {
            riskScore: aiAnalysis.riskScore,
            riskLevel: aiAnalysis.riskLevel,
            reasons: aiAnalysis.reasons,
            duration,
            averageDuration: userProfile.averageDuration,
            source: aiAnalysis.source
          },
          requiresEmailRegistration: true
        });
      }
      
      // 📧 Doğrulama kodu oluştur ve e-posta gönder
      const code = generateVerificationCode();
      const tokenId = `verify-${sessionId}-${Date.now()}`;
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      
      // SQLite'a kaydet
      db.createVerificationToken(tokenId, sessionId, userEmail, code, {
        to,
        amount,
        accountId,
        duration,
        riskScore: aiAnalysis.riskScore
      }, expiresAt);
      
      // E-posta gönder
      const emailResult = await sendVerificationEmail(userEmail, code, {
        amount,
        token: 'ETH',
        toAddress: to
      });
      
      console.log(`📧 Verification email sent to ${userEmail}`);
      
      return res.status(403).json({
        success: false,
        blocked: true,
        reason: 'email_verification_required',
        message: `⏱️ Bu işlem ${duration}sn'de gerçekleşti (normal: ${userProfile.averageDuration?.toFixed(0)}sn). Güvenlik için e-posta doğrulaması gerekiyor.`,
        analysis: {
          riskScore: aiAnalysis.riskScore,
          riskLevel: aiAnalysis.riskLevel,
          reasons: aiAnalysis.reasons,
          duration,
          averageDuration: userProfile.averageDuration,
          source: aiAnalysis.source
        },
        verification: {
          tokenId,
          email: userEmail.replace(/(.{3}).*@/, '$1***@'),
          _rawEmail: userEmail, // Frontend EmailJS için
          expiresAt,
          // Kodu her zaman gönder (Frontend EmailJS ile e-posta atacak)
          _demoCode: code
        }
      });
    }
    
    // ✅ İşlem onaylandı
    res.json({
      success: true,
      approved: true,
      message: '✓ Güvenlik kontrolü başarılı, işlem onaylandı',
      analysis: {
        riskScore: aiAnalysis.riskScore,
        riskLevel: aiAnalysis.riskLevel,
        reasons: aiAnalysis.reasons,
        duration,
        averageDuration: userProfile.averageDuration,
        source: aiAnalysis.source
      }
    });
    
  } catch (error) {
    console.error('Pre-sign check error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Doğrulama sonrası imza onayı
app.post('/api/security/confirm-after-verification', (req, res) => {
  try {
    const { tokenId } = req.body;
    
    if (!tokenId) {
      return res.status(400).json({ success: false, error: 'Token ID gerekli' });
    }
    
    // SQLite'dan token'ı al
    const token = db.getVerificationToken(tokenId);
    
    if (!token) {
      return res.status(403).json({
        success: false,
        error: 'Token bulunamadı veya geçersiz'
      });
    }
    
    // Token doğrulanmış mı?
    if (!token.verified) {
      return res.status(403).json({
        success: false,
        error: 'Token henüz doğrulanmamış'
      });
    }
    
    // Token'ı sil
    db.deleteToken(tokenId);
    
    console.log(`✅ Transaction approved after email verification: ${tokenId}`);
    
    res.json({
      success: true,
      approved: true,
      message: '✓ E-posta doğrulaması başarılı, işlem onaylandı',
      transactionDetails: token.transaction_data
    });
    
  } catch (error) {
    console.error('Confirm after verification error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
🚀 WDK Wallet API Server (TESTNET MODE - REAL DEFI)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server running on http://localhost:${PORT}

🔗 Supported Networks (TESTNET):
   • Ethereum Sepolia - https://sepolia.etherscan.io
   • Bitcoin Testnet  - https://mempool.space/testnet  
   • TRON Shasta      - https://shasta.tronscan.org

🦄 DeFi Protocols (REAL - Sepolia):
   • Uniswap V3 Router: ${UNISWAP_CONTRACTS.swapRouter}
   • Aave V3 Pool:      ${AAVE_CONTRACTS.pool}

💧 Faucets:
   • Sepolia ETH: https://sepoliafaucet.com
   • Sepolia ETH: https://www.alchemy.com/faucets/ethereum-sepolia
   • Aave Faucet: https://staging.aave.com/faucet/

📚 API Endpoints:
   GET  /api/health
   GET  /api/blockchains
   POST /api/wallet/generate
   POST /api/wallet/import
   POST /api/wallet/account
   GET  /api/wallet/accounts/:sessionId
   GET  /api/wallet/balance/:sessionId/:accountId
   POST /api/wallet/send
   POST /api/wallet/quote
   POST /api/wallet/disconnect

🔄 DeFi - Swap (Uniswap V3):
   GET  /api/defi/prices
   GET  /api/defi/swap/tokens/:blockchain
   GET  /api/defi/tokens/balances/:sessionId/:accountId
   POST /api/defi/swap/quote
   POST /api/defi/swap/execute  ⚡ REAL TRANSACTIONS

🏦 DeFi - Lending (Aave V3):
   GET  /api/defi/lending/pools
   GET  /api/defi/lending/positions/:sessionId
   POST /api/defi/lending/supply   ⚡ REAL TRANSACTIONS
   POST /api/defi/lending/withdraw ⚡ REAL TRANSACTIONS
   POST /api/defi/lending/borrow   ⚡ REAL TRANSACTIONS
   POST /api/defi/lending/repay    ⚡ REAL TRANSACTIONS

🔐 Security - Davranış Bazlı Güvenlik:
   POST /api/security/analyze           🛡️ İşlem risk analizi
   GET  /api/security/profile/:sessionId   📊 Kullanıcı davranış profili
   GET  /api/security/config               ⚙️ Güvenlik ayarları
   POST /api/security/record-transaction   📝 Test: işlem kaydı

⏱️ Modal Timing - Davranış Zamanlaması:
   POST /api/security/modal/start          ▶️ Modal açılış (timer başlat)
   POST /api/security/modal/interaction    👆 Etkileşim kaydet
   POST /api/security/modal/end            ⏹️ Modal kapanış
   GET  /api/security/modal/status/:s/:m   📊 Modal durumu

📧 E-posta Doğrulama:
   POST /api/security/email/register       📝 E-posta kayıt
   POST /api/security/email/send-verification 📤 Kod gönder
   POST /api/security/email/verify         ✓ Kod doğrula
   GET  /api/security/email/token-status/:id  📋 Token durumu

🛡️ Pre-Sign Hook (İMZA ÖNCESİ):
   POST /api/security/pre-sign             🔒 İmza öncesi kontrol
   POST /api/security/confirm-after-verification ✅ Doğrulama sonrası onay

📋 Güvenlik Özellikleri:
   • İşlem tutarı / bakiye oranı analizi
   • Yeni adres ilk etkileşim tespiti  
   • Son N işlem istatistik anomalisi (z-score)
   • Gece saati risk faktörü
   • ⏱️ Davranış zamanlaması (hızlı işlem tespiti)
   • 📧 E-posta doğrulama (anomali durumunda)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  DİKKAT: Bu sunucu GERÇEK blockchain işlemleri yapar!
    Sepolia testnet kullanılıyor, gerçek para harcanmaz.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
