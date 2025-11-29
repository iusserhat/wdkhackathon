/**
 * 🤖 Gemini AI Davranış Analiz Modülü
 * Kullanıcı davranışlarını analiz eder ve anomali tespiti yapar
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// Gemini API Key - Environment variable'dan al
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

let genAI = null;
let model = null;

// Gemini'yi başlat
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

/**
 * Kullanıcı davranışını Gemini ile analiz et
 */
export async function analyzeUserBehavior(userProfile, currentTransaction) {
  const {
    averageDuration,
    totalTransactions,
    stats,
    recentTransactions
  } = userProfile;
  
  const {
    duration,
    amount,
    to,
    interactions
  } = currentTransaction;
  
  // Gemini yoksa fallback analiz kullan
  if (!model) {
    return fallbackAnalysis(userProfile, currentTransaction);
  }
  
  try {
    const prompt = `
Sen bir kripto cüzdan güvenlik analisti olarak çalışıyorsun. Kullanıcının davranış profilini ve mevcut işlemi analiz et.

## Kullanıcı Profili:
- Toplam işlem sayısı: ${totalTransactions}
- Ortalama işlem süresi: ${averageDuration?.toFixed(1) || 120} saniye
- Süre standart sapması: ${stats?.stdDeviation?.toFixed(1) || 0} saniye
- Minimum süre: ${stats?.minDuration || 0} saniye
- Maksimum süre: ${stats?.maxDuration || 0} saniye

## Mevcut İşlem:
- İşlem süresi: ${duration} saniye
- İşlem miktarı: ${amount}
- Etkileşim sayısı: ${interactions || 0}
- Alıcı adresi yeni mi: ${currentTransaction.isNewAddress ? 'Evet' : 'Hayır'}

## Son 5 İşlem:
${recentTransactions?.slice(0, 5).map((tx, i) => 
  `${i + 1}. ${tx.amount} ${tx.token} - ${tx.duration}sn - Risk: ${tx.riskScore || 'N/A'}`
).join('\n') || 'Henüz işlem yok'}

## Görev:
Bu işlemin riskini 0-100 arası bir skorla değerlendir ve JSON formatında yanıt ver:

{
  "riskScore": <0-100 arası sayı>,
  "riskLevel": "<low|medium|high|critical>",
  "isAnomaly": <true|false>,
  "requiresVerification": <true|false>,
  "reasons": ["<sebep1>", "<sebep2>"],
  "recommendation": "<öneri>"
}

Önemli kurallar:
- İşlem süresi ortalamanın %25'inden azsa (çok hızlı) → yüksek risk
- İşlem süresi ortalamanın %10'undan azsa → kritik risk, doğrulama gerekli
- Yeni adrese yüksek miktar → ekstra risk
- Düşük etkileşim sayısı (<3) → şüpheli, bot olabilir
- Gece saatleri (00:00-06:00) → ekstra risk

SADECE JSON döndür, başka açıklama ekleme.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // JSON parse et
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
    
  } catch (error) {
    console.error('Gemini analysis error:', error.message);
    return fallbackAnalysis(userProfile, currentTransaction);
  }
}

/**
 * Gemini yoksa veya hata olursa fallback analiz
 */
function fallbackAnalysis(userProfile, currentTransaction) {
  const { averageDuration, stats, totalTransactions } = userProfile;
  const { duration, amount, interactions, isNewAddress } = currentTransaction;
  
  const avgDuration = averageDuration || stats?.avgDuration || 120;
  const stdDev = stats?.stdDeviation || 30;
  
  let riskScore = 0;
  const reasons = [];
  
  console.log(`📊 Fallback Analysis Debug:`);
  console.log(`   Duration: ${duration}s, AvgDuration: ${avgDuration}s`);
  console.log(`   Interactions: ${interactions}, IsNewAddress: ${isNewAddress}`);
  console.log(`   TotalTransactions: ${totalTransactions}`);
  
  // 0. Modal session yoksa (duration = 0) → ÇOK ŞÜPHELİ
  if (duration === 0 || duration === undefined) {
    riskScore += 70;
    reasons.push('⚠️ Modal oturumu bulunamadı - doğrudan API çağrısı şüphesi');
  }
  
  // 1. Süre analizi - Mutlak eşikler (30 saniyeden az = şüpheli)
  if (duration > 0 && duration < 15) {
    // 15 saniyeden az - KESİNLİKLE çok hızlı
    riskScore += 60;
    reasons.push(`🚨 Çok hızlı: ${duration}sn (min: 15sn olmalı)`);
  } else if (duration > 0 && duration < 30) {
    // 30 saniyeden az - hızlı
    riskScore += 45;
    reasons.push(`⚠️ Hızlı: ${duration}sn (normal: 30sn+)`);
  } else if (duration > 0) {
    // Ortalamaya göre kontrol
    const speedRatio = duration / avgDuration;
    
    if (speedRatio <= 0.1) {
      riskScore += 50;
      reasons.push(`Çok hızlı: ${duration}sn (normal: ${avgDuration.toFixed(0)}sn)`);
    } else if (speedRatio <= 0.25) {
      riskScore += 35;
      reasons.push(`Hızlı: ${duration}sn (normal: ${avgDuration.toFixed(0)}sn)`);
    } else if (speedRatio <= 0.5) {
      riskScore += 15;
      reasons.push(`Normalden hızlı: ${duration}sn`);
    }
  }
  
  // 2. Z-score analizi (yeterli veri varsa)
  if (totalTransactions >= 3 && stdDev > 0) {
    const zScore = Math.abs((duration - avgDuration) / stdDev);
    if (zScore > 3) {
      riskScore += 25;
      reasons.push(`İstatistiksel anomali (z=${zScore.toFixed(1)})`);
    } else if (zScore > 2) {
      riskScore += 15;
      reasons.push(`Alışılmadık süre (z=${zScore.toFixed(1)})`);
    }
  }
  
  // 3. Yeni adres riski
  if (isNewAddress) {
    riskScore += 15;
    reasons.push('İlk kez etkileşilen adres');
  }
  
  // 4. Düşük etkileşim
  if (interactions !== undefined && interactions < 3) {
    riskScore += 15;
    reasons.push(`Düşük etkileşim sayısı (${interactions})`);
  }
  
  // 5. Gece saati kontrolü
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 6) {
    riskScore += 10;
    reasons.push('Gece saatlerinde işlem');
  }
  
  // Risk seviyesi belirle
  riskScore = Math.min(100, riskScore);
  
  console.log(`   Final Risk Score: ${riskScore}`);
  
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
  
  const recommendation = requiresVerification 
    ? 'E-posta doğrulaması gerekli'
    : riskLevel === 'medium' 
      ? 'Dikkatli olun'
      : 'İşlem güvenli görünüyor';
  
  return {
    success: true,
    source: 'fallback',
    riskScore,
    riskLevel,
    isAnomaly: riskScore >= 40,
    requiresVerification,
    reasons,
    recommendation
  };
}

/**
 * Ortalama süreyi güncelle (ağırlıklı ortalama)
 */
export function calculateNewAverage(currentAverage, newDuration, sampleSize) {
  if (sampleSize <= 1) {
    return newDuration;
  }
  
  // Ağırlıklı ortalama - son işlemlere daha fazla ağırlık
  const weight = Math.min(0.3, 1 / sampleSize);
  return currentAverage * (1 - weight) + newDuration * weight;
}

export default {
  initGemini,
  analyzeUserBehavior,
  calculateNewAverage
};

