/**
 * 🤖 Gelişmiş Davranış Analiz Modülü
 * Kullanıcı davranışlarını analiz eder ve anomali tespiti yapar
 * 
 * Risk Faktörleri:
 * - Süre anomalisi (çok hızlı işlem)
 * - Miktar anomalisi (normalden yüksek)
 * - Yeni/riskli adres
 * - Gece saati işlemi
 * - Art arda işlem (sweeping pattern)
 * - Düşük etkileşim
 * - IP/Cihaz değişikliği
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

let genAI = null;
let model = null;

// ============================================
// RİSK AĞIRLIKLARI
// ============================================
const RISK_WEIGHTS = {
  // Süre bazlı
  VERY_FAST: 60,           // < 15 saniye
  FAST: 45,                // < 30 saniye
  MODERATELY_FAST: 25,     // < ortalama/2
  
  // Miktar bazlı
  EXTREME_AMOUNT: 50,      // > ortalama * 10
  HIGH_AMOUNT: 35,         // > ortalama * 5
  ELEVATED_AMOUNT: 20,     // > ortalama * 2
  
  // Adres bazlı
  NEW_ADDRESS: 15,         // İlk kez kullanılan adres
  NEW_ADDRESS_HIGH_AMOUNT: 30, // Yeni adres + yüksek miktar
  
  // Zaman bazlı
  NIGHT_TIME: 15,          // 00:00 - 06:00
  LATE_NIGHT: 25,          // 02:00 - 05:00
  
  // Davranış bazlı
  LOW_INTERACTION: 15,     // < 3 etkileşim
  NO_INTERACTION: 25,      // 0 etkileşim
  NO_MODAL_SESSION: 70,    // Modal açılmadan işlem
  
  // Frekans bazlı
  RAPID_TRANSACTIONS: 40,  // Son 5 dk'da 3+ işlem
  SWEEPING_PATTERN: 60,    // Hızlı fon boşaltma paterni
  
  // Anomali
  STATISTICAL_ANOMALY: 25, // Z-score > 3
  BEHAVIORAL_ANOMALY: 20,  // Z-score > 2
};

// ============================================
// GEMİNİ BAŞLATMA
// ============================================
export function initGemini(apiKey = GEMINI_API_KEY) {
  if (!apiKey) {
    console.log('⚠️ GEMINI_API_KEY not set. AI analysis will use fallback mode.');
    return false;
  }
  
  try {
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    console.log('✅ Gemini AI initialized');
    return true;
  } catch (error) {
    console.error('❌ Gemini initialization failed:', error.message);
    return false;
  }
}

// ============================================
// ANA ANALİZ FONKSİYONU
// ============================================
export async function analyzeUserBehavior(userProfile, currentTransaction) {
  // Gemini yoksa gelişmiş fallback kullan
  if (!model) {
    return advancedFallbackAnalysis(userProfile, currentTransaction);
  }
  
  try {
    return await geminiAnalysis(userProfile, currentTransaction);
  } catch (error) {
    console.error('Gemini analysis error:', error.message);
    return advancedFallbackAnalysis(userProfile, currentTransaction);
  }
}

// ============================================
// GEMİNİ ANALİZİ
// ============================================
async function geminiAnalysis(userProfile, currentTransaction) {
  const {
    averageDuration,
    totalTransactions,
    stats,
    recentTransactions,
    averageAmount
  } = userProfile;
  
  const {
    duration,
    amount,
    to,
    interactions,
    isNewAddress
  } = currentTransaction;

  const prompt = `
Sen bir kripto cüzdan güvenlik analisti olarak çalışıyorsun. Gelişmiş davranış analizi yap.

## Kullanıcı Profili:
- Toplam işlem sayısı: ${totalTransactions}
- Ortalama işlem süresi: ${averageDuration?.toFixed(1) || 120} saniye
- Ortalama işlem miktarı: ${averageAmount || 'Bilinmiyor'}
- Süre standart sapması: ${stats?.stdDeviation?.toFixed(1) || 0} saniye

## Mevcut İşlem:
- İşlem süresi: ${duration} saniye
- İşlem miktarı: ${amount}
- Etkileşim sayısı: ${interactions || 0}
- Alıcı adresi yeni mi: ${isNewAddress ? 'Evet' : 'Hayır'}
- İşlem saati: ${new Date().toLocaleTimeString('tr-TR')}

## Son 5 İşlem:
${recentTransactions?.slice(0, 5).map((tx, i) => 
  `${i + 1}. ${tx.amount} ${tx.token} - ${tx.duration_seconds || tx.duration}sn - ${new Date(tx.timestamp).toLocaleTimeString('tr-TR')}`
).join('\n') || 'Henüz işlem yok'}

## Risk Faktörleri Kontrol Et:
1. 🕐 Süre anomalisi (15sn altı = kritik, 30sn altı = yüksek)
2. 💰 Miktar anomalisi (ortalamadan 5x fazla = yüksek)
3. 📍 Yeni adres + yüksek miktar = çok riskli
4. 🌙 Gece saati (00:00-06:00) = ekstra risk
5. ⚡ Art arda hızlı işlemler (sweeping pattern)
6. 🤖 Düşük etkileşim (bot şüphesi)

## Görev:
JSON formatında analiz döndür:

{
  "riskScore": <0-100>,
  "riskLevel": "<low|medium|high|critical>",
  "isAnomaly": <true|false>,
  "requiresVerification": <true|false>,
  "reasons": ["<sebep1>", "<sebep2>"],
  "detectedPatterns": ["<pattern1>", "<pattern2>"],
  "recommendation": "<öneri>"
}

Risk skoru 50+ = e-posta doğrulaması gerekli.
SADECE JSON döndür.
`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const analysis = JSON.parse(jsonMatch[0]);
    console.log('🤖 Gemini Analysis:', analysis);
    return {
      success: true,
      source: 'gemini',
      ...analysis
    };
  }
  
  throw new Error('Invalid JSON response');
}

// ============================================
// GELİŞMİŞ FALLBACK ANALİZ
// ============================================
function advancedFallbackAnalysis(userProfile, currentTransaction) {
  const { 
    averageDuration, 
    stats, 
    totalTransactions,
    recentTransactions,
    averageAmount
  } = userProfile;
  
  const { 
    duration, 
    amount, 
    interactions, 
    isNewAddress 
  } = currentTransaction;
  
  const avgDuration = averageDuration || stats?.avgDuration || 120;
  const stdDev = stats?.stdDeviation || 30;
  const avgAmount = averageAmount || 0;
  
  let riskScore = 0;
  const reasons = [];
  const detectedPatterns = [];
  
  console.log(`\n📊 Advanced Security Analysis:`);
  console.log(`   Duration: ${duration}s (avg: ${avgDuration}s)`);
  console.log(`   Amount: ${amount} (avg: ${avgAmount})`);
  console.log(`   Interactions: ${interactions}`);
  console.log(`   IsNewAddress: ${isNewAddress}`);
  console.log(`   TotalTx: ${totalTransactions}`);
  
  // ============================================
  // 1. MODAL SESSION KONTROLÜ
  // ============================================
  if (duration === 0 || duration === undefined) {
    riskScore += RISK_WEIGHTS.NO_MODAL_SESSION;
    reasons.push('⚠️ Modal oturumu bulunamadı - doğrudan API çağrısı şüphesi');
    detectedPatterns.push('direct_api_call');
  }
  
  // ============================================
  // 2. SÜRE ANALİZİ
  // ============================================
  if (duration > 0) {
    if (duration < 15) {
      riskScore += RISK_WEIGHTS.VERY_FAST;
      reasons.push(`🚨 Çok hızlı: ${duration}sn (min: 15sn olmalı)`);
      detectedPatterns.push('very_fast_transaction');
    } else if (duration < 30) {
      riskScore += RISK_WEIGHTS.FAST;
      reasons.push(`⚠️ Hızlı: ${duration}sn (normal: 30sn+)`);
      detectedPatterns.push('fast_transaction');
    } else {
      const speedRatio = duration / avgDuration;
      if (speedRatio <= 0.25) {
        riskScore += RISK_WEIGHTS.MODERATELY_FAST;
        reasons.push(`Normalden hızlı: ${duration}sn (ortalama: ${avgDuration.toFixed(0)}sn)`);
      }
    }
  }
  
  // ============================================
  // 3. MİKTAR ANALİZİ
  // ============================================
  if (avgAmount > 0 && amount) {
    const amountNum = parseFloat(amount);
    const amountRatio = amountNum / avgAmount;
    
    if (amountRatio >= 10) {
      riskScore += RISK_WEIGHTS.EXTREME_AMOUNT;
      reasons.push(`💰 Aşırı yüksek miktar: ${amountNum} (ortalama: ${avgAmount.toFixed(4)})`);
      detectedPatterns.push('extreme_amount');
    } else if (amountRatio >= 5) {
      riskScore += RISK_WEIGHTS.HIGH_AMOUNT;
      reasons.push(`💰 Yüksek miktar: ${amountNum} (ortalama: ${avgAmount.toFixed(4)})`);
      detectedPatterns.push('high_amount');
    } else if (amountRatio >= 2) {
      riskScore += RISK_WEIGHTS.ELEVATED_AMOUNT;
      reasons.push(`Normalden yüksek miktar: ${amountNum}`);
    }
  }
  
  // ============================================
  // 4. ADRESRİSKİ
  // ============================================
  if (isNewAddress) {
    const amountNum = parseFloat(amount) || 0;
    
    // Yeni adres + yüksek miktar = çok riskli
    if (avgAmount > 0 && amountNum > avgAmount * 2) {
      riskScore += RISK_WEIGHTS.NEW_ADDRESS_HIGH_AMOUNT;
      reasons.push(`📍 Yeni adrese yüksek miktar transferi`);
      detectedPatterns.push('new_address_high_amount');
    } else {
      riskScore += RISK_WEIGHTS.NEW_ADDRESS;
      reasons.push('📍 İlk kez etkileşilen adres');
    }
  }
  
  // ============================================
  // 5. ZAMAN ANALİZİ
  // ============================================
  const hour = new Date().getHours();
  
  if (hour >= 2 && hour < 5) {
    riskScore += RISK_WEIGHTS.LATE_NIGHT;
    reasons.push(`🌙 Geç gece işlemi (${hour}:00)`);
    detectedPatterns.push('late_night_transaction');
  } else if (hour >= 0 && hour < 6) {
    riskScore += RISK_WEIGHTS.NIGHT_TIME;
    reasons.push('🌙 Gece saatlerinde işlem');
    detectedPatterns.push('night_transaction');
  }
  
  // ============================================
  // 6. ETKİLEŞİM ANALİZİ
  // ============================================
  if (interactions !== undefined) {
    if (interactions === 0) {
      riskScore += RISK_WEIGHTS.NO_INTERACTION;
      reasons.push('🤖 Sıfır etkileşim - bot şüphesi');
      detectedPatterns.push('zero_interaction');
    } else if (interactions < 3) {
      riskScore += RISK_WEIGHTS.LOW_INTERACTION;
      reasons.push(`🤖 Düşük etkileşim sayısı (${interactions})`);
      detectedPatterns.push('low_interaction');
    }
  }
  
  // ============================================
  // 7. İŞLEM FREKANS ANALİZİ (Sweeping Pattern)
  // ============================================
  if (recentTransactions && recentTransactions.length > 0) {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    
    // Son 5 dakikadaki işlem sayısı
    const recentTxCount = recentTransactions.filter(tx => {
      const txTime = new Date(tx.timestamp).getTime();
      return txTime > fiveMinutesAgo;
    }).length;
    
    if (recentTxCount >= 3) {
      riskScore += RISK_WEIGHTS.RAPID_TRANSACTIONS;
      reasons.push(`⚡ Son 5 dakikada ${recentTxCount} işlem`);
      detectedPatterns.push('rapid_transactions');
    }
    
    // Sweeping pattern tespiti
    // Ardışık işlemler, toplam bakiyenin büyük kısmını boşaltıyorsa
    if (recentTxCount >= 2) {
      const recentAmounts = recentTransactions
        .slice(0, 5)
        .map(tx => parseFloat(tx.amount) || 0);
      
      const totalRecent = recentAmounts.reduce((a, b) => a + b, 0);
      const currentAmount = parseFloat(amount) || 0;
      
      // Son işlemler + mevcut işlem toplam çok yüksekse
      if (avgAmount > 0 && (totalRecent + currentAmount) > avgAmount * 20) {
        riskScore += RISK_WEIGHTS.SWEEPING_PATTERN;
        reasons.push('🧹 Olası fon boşaltma paterni (sweeping)');
        detectedPatterns.push('sweeping_pattern');
      }
    }
  }
  
  // ============================================
  // 8. İSTATİSTİKSEL ANOMALİ (Z-Score)
  // ============================================
  if (totalTransactions >= 3 && stdDev > 0 && duration > 0) {
    const zScore = Math.abs((duration - avgDuration) / stdDev);
    
    if (zScore > 3) {
      riskScore += RISK_WEIGHTS.STATISTICAL_ANOMALY;
      reasons.push(`📈 İstatistiksel anomali (z=${zScore.toFixed(1)})`);
      detectedPatterns.push('statistical_anomaly');
    } else if (zScore > 2) {
      riskScore += RISK_WEIGHTS.BEHAVIORAL_ANOMALY;
      reasons.push(`📈 Davranışsal anomali (z=${zScore.toFixed(1)})`);
    }
  }
  
  // ============================================
  // SONUÇ HESAPLAMA
  // ============================================
  riskScore = Math.min(100, riskScore);
  
  let riskLevel = 'low';
  let requiresVerification = false;
  
  if (riskScore >= 70) {
    riskLevel = 'critical';
    requiresVerification = true;
  } else if (riskScore >= 50) {
    riskLevel = 'high';
    requiresVerification = true;
  } else if (riskScore >= 30) {
    riskLevel = 'medium';
  }
  
  console.log(`   Risk Score: ${riskScore}/100 (${riskLevel})`);
  console.log(`   Patterns: ${detectedPatterns.join(', ') || 'none'}`);
  console.log(`   Requires Verification: ${requiresVerification}\n`);
  
  const recommendation = requiresVerification 
    ? '⛔ E-posta doğrulaması gerekli'
    : riskLevel === 'medium' 
      ? '⚠️ Dikkatli olun'
      : '✅ İşlem güvenli görünüyor';
  
  return {
    success: true,
    source: 'advanced_fallback',
    riskScore,
    riskLevel,
    isAnomaly: riskScore >= 40,
    requiresVerification,
    reasons,
    detectedPatterns,
    recommendation
  };
}

// ============================================
// ORTALAMA HESAPLAMA
// ============================================
export function calculateNewAverage(currentAverage, newValue, sampleSize) {
  if (sampleSize <= 1) {
    return newValue;
  }
  
  // Ağırlıklı ortalama - son değerlere daha fazla ağırlık
  const weight = Math.min(0.3, 1 / sampleSize);
  return currentAverage * (1 - weight) + newValue * weight;
}

export default {
  initGemini,
  analyzeUserBehavior,
  calculateNewAverage,
  RISK_WEIGHTS
};
