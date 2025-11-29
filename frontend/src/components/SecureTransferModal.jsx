/**
 * 🔐 Güvenli Transfer Modal Örneği
 * 
 * Bu component, davranış bazlı güvenlik sistemiyle entegre
 * transfer modal'ı göstermektedir.
 */

import React, { useState, useEffect } from 'react';
import { useSecurityTiming, useInteractionListener } from '../hooks/useSecurityTiming';

function SecureTransferModal({ 
  isOpen, 
  onClose, 
  sessionId, 
  accountId, 
  onTransferComplete 
}) {
  // Form state
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Doğrulama state
  const [showVerification, setShowVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  
  // 🔐 Güvenlik hook'u
  const {
    isTracking,
    elapsedTime,
    interactionCount,
    verificationRequired,
    verificationData,
    startTracking,
    recordInteraction,
    checkPreSign,
    verifyCode,
    confirmAfterVerification,
    endTracking,
    resetVerification
  } = useSecurityTiming(sessionId, 'transfer');
  
  // 👆 Etkileşimleri otomatik kaydet
  useInteractionListener(recordInteraction, isOpen && isTracking);

  // Modal açıldığında zamanlayıcıyı başlat
  useEffect(() => {
    if (isOpen) {
      startTracking();
    } else {
      endTracking(false);
      resetForm();
    }
  }, [isOpen]);

  // E-posta doğrulaması gerektiğinde modal göster
  useEffect(() => {
    if (verificationRequired && verificationData) {
      setShowVerification(true);
    }
  }, [verificationRequired, verificationData]);

  const resetForm = () => {
    setRecipient('');
    setAmount('');
    setError(null);
    setShowVerification(false);
    setVerificationCode('');
    resetVerification();
  };

  // 🛡️ Transfer işlemi - Pre-sign hook ile
  const handleTransfer = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      // 1️⃣ Pre-sign güvenlik kontrolü
      const preSignResult = await checkPreSign({
        accountId,
        to: recipient,
        amount
      });
      
      // 2️⃣ E-posta doğrulaması gerekiyorsa
      if (preSignResult.requiresVerification) {
        setIsLoading(false);
        // verificationData otomatik olarak set ediliyor
        return;
      }
      
      // 3️⃣ İşlem onaylandıysa devam et
      if (preSignResult.approved) {
        await executeTransfer();
      } else {
        setError(preSignResult.error || 'Güvenlik kontrolü başarısız');
      }
      
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 📧 Doğrulama kodunu gönder
  const handleVerifyCode = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await verifyCode(verificationCode);
      
      if (result.success) {
        // Doğrulama başarılı, işlemi tamamla
        const confirmResult = await confirmAfterVerification();
        
        if (confirmResult.approved) {
          await executeTransfer();
        } else {
          setError('İşlem onaylanamadı');
        }
      } else {
        setError(result.error);
        if (result.attemptsLeft !== undefined) {
          setError(`${result.error} (${result.attemptsLeft} deneme hakkı kaldı)`);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Gerçek transfer işlemi
  const executeTransfer = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/wallet/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          accountId,
          to: recipient,
          amount,
          skipSecurityCheck: true // Zaten pre-sign'da kontrol ettik
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Başarılı işlemi kaydet ve modal'ı kapat
        await endTracking(true);
        onTransferComplete?.(data.transaction);
        onClose();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setError(err.message);
      await endTracking(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={styles.overlay}>
      <div className="modal-content" style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>
            {showVerification ? '📧 E-posta Doğrulaması' : '💸 Transfer'}
          </h2>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>
        
        {/* Zamanlama göstergesi */}
        {isTracking && (
          <div style={styles.timingBadge}>
            ⏱️ {elapsedTime}s | 👆 {interactionCount} etkileşim
          </div>
        )}
        
        {/* Hata mesajı */}
        {error && (
          <div style={styles.error}>
            ⚠️ {error}
          </div>
        )}
        
        {/* Doğrulama ekranı */}
        {showVerification && verificationData ? (
          <div style={styles.verificationBox}>
            <div style={styles.warningIcon}>⏱️🔐</div>
            <p style={styles.warningText}>{verificationData.message}</p>
            
            <div style={styles.emailInfo}>
              📧 Kod gönderildi: <strong>{verificationData.email}</strong>
            </div>
            
            {/* Demo: Kodu göster */}
            {verificationData._demoCode && (
              <div style={styles.demoCode}>
                🔑 Demo Kod: <code>{verificationData._demoCode}</code>
              </div>
            )}
            
            <input
              type="text"
              placeholder="6 haneli kodu girin"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              maxLength={6}
              style={styles.codeInput}
            />
            
            <div style={styles.buttonRow}>
              <button 
                onClick={handleVerifyCode}
                disabled={verificationCode.length !== 6 || isLoading}
                style={styles.verifyBtn}
              >
                {isLoading ? 'Doğrulanıyor...' : '✓ Doğrula ve Gönder'}
              </button>
              <button 
                onClick={() => {
                  setShowVerification(false);
                  resetVerification();
                }}
                style={styles.cancelBtn}
              >
                İptal
              </button>
            </div>
            
            {/* Risk analizi */}
            {verificationData.analysis && (
              <div style={styles.analysis}>
                <strong>Risk Analizi:</strong>
                <div>Skor: {verificationData.analysis.totalRiskScore}/100</div>
                <div>Süre: {verificationData.analysis.timingDetails?.durationSeconds}s 
                  (normal: {verificationData.analysis.timingDetails?.averageDuration}s)</div>
              </div>
            )}
          </div>
        ) : (
          /* Normal transfer formu */
          <form onSubmit={handleTransfer} style={styles.form}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Alıcı Adresi</label>
              <input
                type="text"
                placeholder="0x..."
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                style={styles.input}
                required
              />
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Miktar (ETH)</label>
              <input
                type="number"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="0.0001"
                min="0"
                style={styles.input}
                required
              />
            </div>
            
            <button 
              type="submit" 
              disabled={isLoading || !recipient || !amount}
              style={styles.submitBtn}
            >
              {isLoading ? '🔄 İşleniyor...' : '📤 Gönder'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    backgroundColor: '#1a1a2e',
    borderRadius: '16px',
    padding: '24px',
    width: '100%',
    maxWidth: '420px',
    border: '1px solid #2d2d44'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  title: {
    margin: 0,
    color: '#fff',
    fontSize: '20px'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: '20px',
    cursor: 'pointer'
  },
  timingBadge: {
    backgroundColor: '#2d2d44',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#888',
    marginBottom: '16px',
    textAlign: 'center'
  },
  error: {
    backgroundColor: '#3d1f1f',
    color: '#ff6b6b',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '16px'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  label: {
    color: '#888',
    fontSize: '14px'
  },
  input: {
    backgroundColor: '#2d2d44',
    border: '1px solid #3d3d55',
    borderRadius: '8px',
    padding: '12px',
    color: '#fff',
    fontSize: '16px'
  },
  submitBtn: {
    backgroundColor: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '14px',
    fontSize: '16px',
    cursor: 'pointer',
    marginTop: '8px'
  },
  verificationBox: {
    textAlign: 'center'
  },
  warningIcon: {
    fontSize: '48px',
    marginBottom: '16px'
  },
  warningText: {
    color: '#fbbf24',
    fontSize: '14px',
    marginBottom: '20px',
    lineHeight: 1.5
  },
  emailInfo: {
    color: '#888',
    fontSize: '14px',
    marginBottom: '16px'
  },
  demoCode: {
    backgroundColor: '#2d2d44',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '16px',
    color: '#22c55e'
  },
  codeInput: {
    backgroundColor: '#2d2d44',
    border: '2px solid #6366f1',
    borderRadius: '8px',
    padding: '16px',
    color: '#fff',
    fontSize: '24px',
    textAlign: 'center',
    letterSpacing: '8px',
    width: '100%',
    marginBottom: '16px'
  },
  buttonRow: {
    display: 'flex',
    gap: '12px'
  },
  verifyBtn: {
    flex: 1,
    backgroundColor: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '14px',
    fontSize: '14px',
    cursor: 'pointer'
  },
  cancelBtn: {
    backgroundColor: '#3d3d55',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '14px 20px',
    fontSize: '14px',
    cursor: 'pointer'
  },
  analysis: {
    marginTop: '20px',
    padding: '12px',
    backgroundColor: '#2d2d44',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#888',
    textAlign: 'left'
  }
};

export default SecureTransferModal;

