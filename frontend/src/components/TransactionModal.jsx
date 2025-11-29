import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Loader2, CheckCircle2, XCircle, ExternalLink, Shield, Clock, Mail, AlertTriangle } from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import { useSecurityTiming, useInteractionListener } from '../hooks/useSecurityTiming'
import styles from './TransactionModal.module.css'

const API_BASE = 'http://localhost:3001'

export default function TransactionModal({ account, onClose }) {
  const { sendTransaction, isLoading, sessionId } = useWallet()
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [txResult, setTxResult] = useState(null)
  const [status, setStatus] = useState('form') // form, security_check, email_register, verification, sending, success, error
  
  // 📧 E-posta doğrulama state
  const [verificationCode, setVerificationCode] = useState('')
  const [securityWarning, setSecurityWarning] = useState(null)
  const [emailInput, setEmailInput] = useState('')
  const [analysisData, setAnalysisData] = useState(null)

  const { blockchain, config, address } = account

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
  } = useSecurityTiming(sessionId, 'transfer')

  // 👆 Etkileşimleri otomatik kaydet
  useInteractionListener(recordInteraction, isTracking)

  // ⏱️ Modal açıldığında zamanlayıcıyı başlat
  useEffect(() => {
    if (account && sessionId) {
      startTracking()
    }
    
    return () => {
      endTracking(false)
    }
  }, [account, sessionId])

  // E-posta doğrulaması gerektiğinde
  useEffect(() => {
    if (verificationRequired && verificationData) {
      setStatus('verification')
      setSecurityWarning(verificationData.message)
    }
  }, [verificationRequired, verificationData])

  const handleSend = async () => {
    setError('')
    
    if (!recipient.trim()) {
      setError('Lütfen alıcı adresini girin')
      return
    }
    
    if (!amount || parseFloat(amount) <= 0) {
      setError('Lütfen geçerli bir miktar girin')
      return
    }

    // 🛡️ Güvenlik kontrolü (Pre-sign hook)
    setStatus('security_check')
    
    try {
      const preSignResult = await checkPreSign({
        accountId: account.id,
        to: recipient.trim(),
        amount
      })

      // 📧 E-posta kaydı gerekiyor
      if (preSignResult.requiresEmailRegistration) {
        setStatus('email_register')
        setSecurityWarning(preSignResult.message)
        setAnalysisData(preSignResult.analysis)
        return
      }

      // 📧 E-posta doğrulaması gerekiyor
      if (preSignResult.requiresVerification) {
        setSecurityWarning(preSignResult.message)
        setAnalysisData(preSignResult.analysis)
        // verificationData otomatik olarak set ediliyor
        return
      }

      // İşlem onaylandı, devam et
      if (preSignResult.approved) {
        await executeTransaction()
      } else {
        setError(preSignResult.error || 'Güvenlik kontrolü başarısız')
        setStatus('form')
      }
      
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  // 📧 E-posta kaydet ve tekrar dene
  const handleRegisterEmail = async () => {
    if (!emailInput.trim()) {
      setError('Lütfen e-posta adresinizi girin')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(emailInput)) {
      setError('Geçerli bir e-posta adresi girin')
      return
    }

    setError('')
    setStatus('security_check')

    try {
      // E-postayı kaydet
      const response = await fetch(`${API_BASE}/api/security/email/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, email: emailInput.trim() })
      })

      const data = await response.json()

      if (!data.success) {
        setError(data.error)
        setStatus('email_register')
        return
      }

      // Tekrar pre-sign kontrolü yap
      const preSignResult = await checkPreSign({
        accountId: account.id,
        to: recipient.trim(),
        amount
      })

      if (preSignResult.requiresVerification) {
        setSecurityWarning(preSignResult.message)
        setAnalysisData(preSignResult.analysis)
        return
      }

      if (preSignResult.approved) {
        await executeTransaction()
      }

    } catch (err) {
      setError(err.message)
      setStatus('email_register')
    }
  }

  // 📧 Doğrulama kodunu kontrol et
  const handleVerifyCode = async () => {
    if (verificationCode.length !== 6) {
      setError('Lütfen 6 haneli kodu girin')
      return
    }

    setStatus('security_check')
    setError('')

    try {
      const result = await verifyCode(verificationCode)

      if (result.success) {
        // Doğrulama başarılı, işlemi onayla
        const confirmResult = await confirmAfterVerification()

        if (confirmResult.approved) {
          await executeTransaction()
        } else {
          setError('İşlem onaylanamadı')
          setStatus('verification')
        }
      } else {
        setError(result.error)
        if (result.attemptsLeft !== undefined) {
          setError(`${result.error} (${result.attemptsLeft} deneme kaldı)`)
        }
        setStatus('verification')
      }
    } catch (err) {
      setError(err.message)
      setStatus('verification')
    }
  }

  // Gerçek transfer işlemi
  const executeTransaction = async (riskScore = 0) => {
    setStatus('sending')
    
    try {
      const result = await sendTransaction(account.id, recipient.trim(), amount)
      setTxResult(result)
      setStatus('success')
      
      // Başarılı işlemi kaydet (txData ile)
      await endTracking(true, {
        amount: parseFloat(amount),
        to: recipient.trim(),
        token: config.symbol,
        riskScore: analysisData?.riskScore || riskScore
      })
    } catch (err) {
      setError(err.message)
      setStatus('error')
      await endTracking(false)
    }
  }

  const handleClose = () => {
    endTracking(false)
    onClose()
  }

  const getExplorerTxUrl = (hash) => {
    const explorers = {
      ethereum: `https://sepolia.etherscan.io/tx/${hash}`,
      bitcoin: `https://mempool.space/testnet/tx/${hash}`,
      tron: `https://shasta.tronscan.org/#/transaction/${hash}`
    }
    return txResult?.explorerUrl || explorers[blockchain] || '#'
  }

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleClose}
    >
      <motion.div
        className={styles.modal}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={{ '--chain-color': config.color }}
      >
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <div className={styles.chainIcon} style={{ background: config.color }}>
              <span>{config.icon}</span>
            </div>
            <div>
              <h2>{config.symbol} Gönder</h2>
              <span className={styles.chainName}>{config.name}</span>
            </div>
          </div>
          <motion.button
            className={styles.closeBtn}
            onClick={handleClose}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <X size={20} />
          </motion.button>
        </div>

        {/* ⏱️ Güvenlik Zamanlayıcı Badge */}
        {isTracking && status === 'form' && (
          <motion.div 
            className={styles.securityBadge}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Shield size={14} />
            <span>Güvenlik aktif</span>
            <span className={styles.timer}>
              <Clock size={12} />
              {elapsedTime}s
            </span>
            <span className={styles.interactions}>
              👆 {interactionCount}
            </span>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {status === 'form' && (
            <motion.div
              key="form"
              className={styles.content}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className={styles.fromInfo}>
                <span className={styles.label}>Gönderen</span>
                <code className={styles.address}>
                  {address.slice(0, 12)}...{address.slice(-8)}
                </code>
              </div>

              <div className={styles.field}>
                <label>Alıcı Adresi</label>
                <input
                  type="text"
                  placeholder={`${config.symbol} adresi girin`}
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label>Miktar</label>
                <div className={styles.amountInput}>
                  <input
                    type="number"
                    placeholder="0.0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    step="any"
                    min="0"
                  />
                  <span className={styles.symbol}>{config.symbol}</span>
                </div>
              </div>

              {error && (
                <motion.div 
                  className={styles.error}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {error}
                </motion.div>
              )}

              <motion.button
                className={styles.sendBtn}
                onClick={handleSend}
                disabled={isLoading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Shield size={18} />
                <span>Güvenli Gönder</span>
              </motion.button>
            </motion.div>
          )}

          {/* 🛡️ Güvenlik Kontrolü */}
          {status === 'security_check' && (
            <motion.div
              key="security"
              className={styles.statusContent}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Shield size={60} className={styles.securityIcon} />
              <h3>Güvenlik Kontrolü</h3>
              <p>Davranış analizi yapılıyor...</p>
              <Loader2 size={24} className={styles.spinner} />
            </motion.div>
          )}

          {/* 📧 E-posta Kayıtlı Değil Uyarısı */}
          {status === 'email_register' && (
            <motion.div
              key="email_register"
              className={styles.statusContent}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className={styles.warningIconWrapper}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.5 }}
              >
                <AlertTriangle size={50} className={styles.warningIcon} />
              </motion.div>
              
              <h3>🔒 Güvenlik E-postası Gerekli</h3>
              <p className={styles.warningText}>
                Riskli bir işlem tespit edildi ancak cüzdanınıza kayıtlı bir güvenlik e-postası bulunamadı.
              </p>

              <div className={styles.verificationBox}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                  Güvenliğiniz için lütfen önce bir güvenlik e-postası kaydedin.
                  E-posta kaydettikten sonra riskli işlemlerde size doğrulama kodu gönderilecek.
                </p>

                <div className={styles.emailInputWrapper}>
                  <Mail size={18} className={styles.emailIcon} />
                  <input
                    type="email"
                    className={styles.emailInput}
                    placeholder="ornek@email.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                  />
                </div>

                {error && (
                  <motion.div 
                    className={styles.error}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    {error}
                  </motion.div>
                )}

                <div className={styles.verificationActions}>
                  <motion.button
                    className={styles.verifyBtn}
                    onClick={handleRegisterEmail}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Mail size={18} />
                    <span>Kaydet ve Devam Et</span>
                  </motion.button>
                  
                  <button 
                    className={styles.cancelVerifyBtn}
                    onClick={() => {
                      setStatus('form')
                      setEmailInput('')
                      setError('')
                    }}
                  >
                    İptal
                  </button>
                </div>

                {/* Risk Analizi */}
                {analysisData && (
                  <div className={styles.analysisBox}>
                    <strong>Risk Analizi ({analysisData.source === 'gemini' ? '🤖 AI' : '📊 Sistem'})</strong>
                    <div className={styles.analysisGrid}>
                      <span>Risk Skoru:</span>
                      <span className={styles.riskScore}>
                        {analysisData.riskScore}/100
                      </span>
                      <span>Süre:</span>
                      <span>
                        {analysisData.duration}s 
                        (normal: {analysisData.averageDuration?.toFixed(0)}s)
                      </span>
                    </div>
                    {analysisData.reasons?.length > 0 && (
                      <div className={styles.reasonsList}>
                        {analysisData.reasons.map((reason, i) => (
                          <span key={i}>• {reason}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* 📧 E-posta Doğrulama */}
          {status === 'verification' && verificationData && (
            <motion.div
              key="verification"
              className={styles.statusContent}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className={styles.warningIconWrapper}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.5 }}
              >
                <AlertTriangle size={50} className={styles.warningIcon} />
              </motion.div>
              
              <h3>⏱️ Hızlı İşlem Algılandı</h3>
              <p className={styles.warningText}>{securityWarning}</p>

              <div className={styles.verificationBox}>
                <div className={styles.emailInfo}>
                  <Mail size={16} />
                  <span>Kod gönderildi: <strong>{verificationData.email}</strong></span>
                </div>

                {/* Demo: Kodu göster */}
                {verificationData._demoCode && (
                  <div className={styles.demoCode}>
                    🔑 Demo Kod: <code>{verificationData._demoCode}</code>
                  </div>
                )}

                <input
                  type="text"
                  className={styles.codeInput}
                  placeholder="6 haneli kod"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                />

                {error && (
                  <motion.div 
                    className={styles.error}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    {error}
                  </motion.div>
                )}

                <div className={styles.verificationActions}>
                  <motion.button
                    className={styles.verifyBtn}
                    onClick={handleVerifyCode}
                    disabled={verificationCode.length !== 6}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <CheckCircle2 size={18} />
                    <span>Doğrula ve Gönder</span>
                  </motion.button>
                  
                  <button 
                    className={styles.cancelVerifyBtn}
                    onClick={() => {
                      setStatus('form')
                      setVerificationCode('')
                      setError('')
                      resetVerification()
                    }}
                  >
                    İptal
                  </button>
                </div>

                {/* Risk Analizi */}
                {verificationData.analysis && (
                  <div className={styles.analysisBox}>
                    <strong>Risk Analizi</strong>
                    <div className={styles.analysisGrid}>
                      <span>Risk Skoru:</span>
                      <span className={styles.riskScore}>
                        {verificationData.analysis.totalRiskScore}/100
                      </span>
                      <span>Süre:</span>
                      <span>
                        {verificationData.analysis.timingDetails?.durationSeconds}s 
                        (normal: {verificationData.analysis.timingDetails?.averageDuration}s)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {status === 'sending' && (
            <motion.div
              key="sending"
              className={styles.statusContent}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Loader2 size={60} className={styles.spinner} />
              <h3>İşlem Gönderiliyor</h3>
              <p>Lütfen bekleyin...</p>
            </motion.div>
          )}

          {status === 'success' && (
            <motion.div
              key="success"
              className={styles.statusContent}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.5 }}
              >
                <CheckCircle2 size={60} className={styles.successIcon} />
              </motion.div>
              <h3>İşlem Başarılı!</h3>
              <p>İşleminiz blockchain'e gönderildi.</p>
              
              {txResult?.hash && (
                <a
                  href={getExplorerTxUrl(txResult.hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.txLink}
                >
                  <ExternalLink size={16} />
                  <span>Explorer'da Görüntüle</span>
                </a>
              )}
              
              <button className={styles.closeModalBtn} onClick={handleClose}>
                Kapat
              </button>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              key="error"
              className={styles.statusContent}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <XCircle size={60} className={styles.errorIcon} />
              <h3>İşlem Başarısız</h3>
              <p>{error}</p>
              
              <div className={styles.errorActions}>
                <button 
                  className={styles.retryBtn}
                  onClick={() => {
                    setStatus('form')
                    setError('')
                    resetVerification()
                    // Zamanlayıcıyı yeniden başlat
                    startTracking()
                  }}
                >
                  Tekrar Dene
                </button>
                <button className={styles.closeModalBtn} onClick={handleClose}>
                  Kapat
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
