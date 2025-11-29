/**
 * 🔐 Davranış Bazlı Güvenlik Hook'u
 * 
 * Bu hook, transfer modal'ı açıldığında zamanlayıcı başlatır,
 * kullanıcı etkileşimlerini takip eder ve işlem öncesi güvenlik
 * kontrolü yapar.
 * 
 * Kullanım:
 * const { startTracking, recordInteraction, checkPreSign, endTracking } = useSecurityTiming(sessionId);
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import emailjs from '@emailjs/browser';
import { EMAILJS_CONFIG } from '../config/emailjs';

const API_BASE = 'http://localhost:3001';

// EmailJS başlat
emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);

export function useSecurityTiming(sessionId, modalType = 'transfer') {
  const [isTracking, setIsTracking] = useState(false);
  const [sessionKey, setSessionKey] = useState(null);
  const [interactionCount, setInteractionCount] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [verificationData, setVerificationData] = useState(null);
  
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  // 📧 EmailJS ile e-posta gönder
  const sendVerificationEmail = useCallback(async (toEmail, code, transactionDetails) => {
    try {
      console.log('📧 Sending verification email via EmailJS...');
      console.log('   To:', toEmail);
      console.log('   Code:', code);
      
      const result = await emailjs.send(
        EMAILJS_CONFIG.SERVICE_ID,
        EMAILJS_CONFIG.TEMPLATE_ID,
        {
          to_email: toEmail,
          code: code,
          amount: transactionDetails?.amount || '0',
          token: transactionDetails?.token || 'ETH',
          to_address: transactionDetails?.toAddress 
            ? `${transactionDetails.toAddress.slice(0, 10)}...${transactionDetails.toAddress.slice(-8)}`
            : 'N/A'
        }
      );
      
      console.log('✅ Email sent successfully:', result);
      return { success: true, result };
    } catch (error) {
      console.error('❌ EmailJS error:', error);
      return { success: false, error: error.text || error.message };
    }
  }, []);

  // ⏱️ Modal açıldığında zamanlayıcıyı başlat
  const startTracking = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/security/modal/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, modalType })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setIsTracking(true);
        setSessionKey(data.sessionKey);
        startTimeRef.current = Date.now();
        setInteractionCount(0);
        setElapsedTime(0);
        
        // Süre sayacını başlat
        timerRef.current = setInterval(() => {
          setElapsedTime(Math.round((Date.now() - startTimeRef.current) / 1000));
        }, 1000);
        
        console.log('⏱️ Security timing started');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Start tracking error:', error);
      return false;
    }
  }, [sessionId, modalType]);

  // 👆 Kullanıcı etkileşimini kaydet
  const recordInteraction = useCallback(async (interactionType = 'generic') => {
    if (!isTracking) return;
    
    try {
      const response = await fetch(`${API_BASE}/api/security/modal/interaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, modalType, interactionType })
      });
      
      const data = await response.json();
      if (data.success) {
        setInteractionCount(data.interactionCount);
      }
    } catch (error) {
      // Sessizce fail et, UX'i bozma
    }
  }, [sessionId, modalType, isTracking]);

  // 🛡️ İmza öncesi güvenlik kontrolü (PRE-SIGN HOOK)
  const checkPreSign = useCallback(async (transactionParams) => {
    const { accountId, to, amount } = transactionParams;
    
    try {
      const response = await fetch(`${API_BASE}/api/security/pre-sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          accountId,
          to,
          amount,
          modalType
        })
      });
      
      const data = await response.json();
      
      // 📧 E-posta kaydı gerekiyorsa
      if (data.blocked && data.requiresEmailRegistration) {
        return {
          approved: false,
          requiresEmailRegistration: true,
          message: data.message,
          analysis: data.analysis
        };
      }
      
      // 📧 E-posta doğrulaması gerekiyorsa
      if (data.blocked && data.verification) {
        // Frontend'den EmailJS ile e-posta gönder
        const emailResult = await sendVerificationEmail(
          data.verification._rawEmail, // Maskeli olmayan e-posta
          data.verification._demoCode, // Doğrulama kodu
          {
            amount: amount,
            token: 'ETH',
            toAddress: to
          }
        );
        
        console.log('📧 Email send result:', emailResult);
        
        setVerificationRequired(true);
        setVerificationData({
          tokenId: data.verification.tokenId,
          email: data.verification.email,
          expiresAt: data.verification.expiresAt,
          message: data.message,
          analysis: data.analysis,
          // Demo için (e-posta gönderilemediyse göster)
          _demoCode: !emailResult.success ? data.verification._demoCode : undefined,
          emailSent: emailResult.success
        });
        
        return {
          approved: false,
          requiresVerification: true,
          message: data.message,
          analysis: data.analysis,
          verification: data.verification,
          emailSent: emailResult.success
        };
      }
      
      // İşlem onaylandı
      if (data.approved) {
        return {
          approved: true,
          analysis: data.analysis
        };
      }
      
      return data;
      
    } catch (error) {
      console.error('Pre-sign check error:', error);
      return { approved: false, error: error.message };
    }
  }, [sessionId, modalType]);

  // 📧 Doğrulama kodunu gönder
  const verifyCode = useCallback(async (code) => {
    if (!verificationData?.tokenId) {
      return { success: false, error: 'Doğrulama token bulunamadı' };
    }
    
    try {
      const response = await fetch(`${API_BASE}/api/security/email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: verificationData.tokenId,
          code
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setVerificationRequired(false);
        setVerificationData(null);
        return { success: true, transactionDetails: data.transactionDetails };
      }
      
      return data;
      
    } catch (error) {
      console.error('Verify code error:', error);
      return { success: false, error: error.message };
    }
  }, [verificationData]);

  // ✅ Doğrulama sonrası işlemi onayla
  const confirmAfterVerification = useCallback(async () => {
    if (!verificationData?.tokenId) {
      return { success: false, error: 'Token bulunamadı' };
    }
    
    try {
      const response = await fetch(`${API_BASE}/api/security/confirm-after-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId: verificationData.tokenId })
      });
      
      return await response.json();
      
    } catch (error) {
      console.error('Confirm error:', error);
      return { success: false, error: error.message };
    }
  }, [verificationData]);

  // ⏹️ Modal kapandığında zamanlayıcıyı durdur
  const endTracking = useCallback(async (wasSuccessful = true, txData = {}) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (!isTracking) return;
    
    try {
      const response = await fetch(`${API_BASE}/api/security/modal/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId, 
          modalType, 
          wasSuccessful,
          txData // İşlem verileri (amount, to, token, riskScore)
        })
      });
      
      const data = await response.json();
      
      setIsTracking(false);
      setSessionKey(null);
      
      console.log(`⏹️ Security timing ended: ${data.duration}s`);
      
      return data;
    } catch (error) {
      console.error('End tracking error:', error);
      return null;
    }
  }, [sessionId, modalType, isTracking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return {
    // State
    isTracking,
    elapsedTime,
    interactionCount,
    verificationRequired,
    verificationData,
    
    // Actions
    startTracking,
    recordInteraction,
    checkPreSign,
    verifyCode,
    confirmAfterVerification,
    endTracking,
    
    // Helpers
    resetVerification: () => {
      setVerificationRequired(false);
      setVerificationData(null);
    }
  };
}

/**
 * 🎯 Etkileşim Event Listener Hook'u
 * 
 * Mouse ve klavye etkileşimlerini otomatik olarak kaydeder.
 * Modal açıkken kullanılır.
 */
export function useInteractionListener(recordInteraction, isActive = true) {
  useEffect(() => {
    if (!isActive) return;
    
    // Throttle için
    let lastRecord = 0;
    const throttleMs = 500; // 500ms'de bir kaydet
    
    const handleInteraction = (type) => () => {
      const now = Date.now();
      if (now - lastRecord > throttleMs) {
        lastRecord = now;
        recordInteraction(type);
      }
    };
    
    const handleMouseMove = handleInteraction('mouse_move');
    const handleClick = handleInteraction('click');
    const handleKeyPress = handleInteraction('key_press');
    const handleScroll = handleInteraction('scroll');
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('click', handleClick);
    document.addEventListener('keypress', handleKeyPress);
    document.addEventListener('scroll', handleScroll);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keypress', handleKeyPress);
      document.removeEventListener('scroll', handleScroll);
    };
  }, [recordInteraction, isActive]);
}

export default useSecurityTiming;

