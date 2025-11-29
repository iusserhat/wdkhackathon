/**
 * 📧 E-posta Gönderme Servisi
 * EmailJS ile doğrulama kodu gönderir (Domain gerektirmez!)
 */

// EmailJS REST API kullanıyoruz
const EMAILJS_API = 'https://api.emailjs.com/api/v1.0/email/send';

const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID || '';
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID || '';
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY || '';
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY || '';

let isConfigured = false;

/**
 * E-posta servisini başlat
 */
export function initEmailService() {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    console.log('⚠️ EmailJS credentials not set. Email service will use demo mode.');
    console.log('   Get your credentials from: https://www.emailjs.com/');
    console.log('   Required: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY');
    return false;
  }
  
  isConfigured = true;
  console.log('✅ Email service initialized (EmailJS)');
  return true;
}

/**
 * Doğrulama kodu e-postası gönder
 */
export async function sendVerificationEmail(to, code, transactionDetails) {
  const { amount, token, toAddress } = transactionDetails;

  console.log('📧 Attempting to send email...');
  console.log('   To:', to);
  console.log('   Code:', code);
  console.log('   Configured:', isConfigured);

  // Gerçek e-posta gönder veya demo modda logla
  if (isConfigured) {
    try {
      const requestBody = {
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        accessToken: EMAILJS_PRIVATE_KEY || undefined,
        template_params: {
          to_email: to,
          code: code,
          amount: amount,
          token: token || 'ETH',
          to_address: toAddress ? `${toAddress.slice(0, 10)}...${toAddress.slice(-8)}` : 'N/A'
        }
      };
      
      console.log('📧 EmailJS Request:', JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(EMAILJS_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      console.log('📧 EmailJS Response:', response.status, responseText);

      if (response.ok) {
        console.log(`✅ Email sent to ${to} via EmailJS`);
        return { success: true, messageId: 'emailjs-' + Date.now() };
      } else {
        console.error('❌ EmailJS error:', responseText);
        return { success: false, error: responseText, demoMode: true, code };
      }
    } catch (error) {
      console.error('❌ Email send error:', error.message);
      return { success: false, error: error.message, demoMode: true, code };
    }
  } else {
    // Demo mod - sadece logla
    console.log(`📧 [DEMO] Verification email to ${to}`);
    console.log(`   Code: ${code}`);
    console.log(`   Amount: ${amount} ${token || 'ETH'}`);
    console.log(`   To: ${toAddress}`);
    
    return { 
      success: true, 
      demoMode: true, 
      message: 'Email service not configured. Code logged to console.',
      code // Demo modda kodu döndür
    };
  }
}

/**
 * E-posta adresini doğrula (basit format kontrolü)
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export default {
  initEmailService,
  sendVerificationEmail,
  isValidEmail
};
