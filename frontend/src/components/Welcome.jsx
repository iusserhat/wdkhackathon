import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Key, ArrowRight, Shield, Zap, Globe, Loader2, AlertCircle, FolderOpen, Mail } from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import styles from './Welcome.module.css'

const API_BASE = 'http://localhost:3001'

export default function Welcome() {
  const { 
    initialize, 
    validateSeedPhrase, 
    isLoading, 
    error: walletError,
    walletsHistory,
    goToWallets
  } = useWallet()
  
  const [mode, setMode] = useState('select') // select, email, import
  const [importSeed, setImportSeed] = useState('')
  const [importError, setImportError] = useState('')
  const [createError, setCreateError] = useState('')
  
  // 📧 E-posta state
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [pendingAction, setPendingAction] = useState(null) // 'create' or 'import'

  // E-posta validasyonu
  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  // 📧 E-posta ekranına git
  const handleCreateClick = () => {
    setPendingAction('create')
    setMode('email')
    setEmailError('')
  }

  // 📧 E-posta ile cüzdan oluştur
  const handleEmailSubmit = async () => {
    setEmailError('')
    
    if (!email.trim()) {
      setEmailError('Lütfen e-posta adresinizi girin')
      return
    }
    
    if (!isValidEmail(email.trim())) {
      setEmailError('Geçerli bir e-posta adresi girin')
      return
    }
    
    try {
      console.log('📧 Creating wallet with email:', email.trim())
      
      // Cüzdan oluştur
      let newSessionId
      if (pendingAction === 'import') {
        newSessionId = await initialize(importSeed.trim())
      } else {
        newSessionId = await initialize()
      }
      
      console.log('📧 Wallet created, sessionId:', newSessionId)
      
      // E-postayı ayrıca kaydet (kesin çalışması için)
      if (newSessionId) {
        try {
          const emailRes = await fetch(`${API_BASE}/api/security/email/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              sessionId: newSessionId, 
              email: email.trim() 
            })
          })
          const emailResult = await emailRes.json()
          console.log('📧 Email registration result:', emailResult)
          
          // E-postayı localStorage'a da kaydet (session restore için)
          const sessionData = localStorage.getItem('wdk_wallet_session')
          if (sessionData) {
            const parsed = JSON.parse(sessionData)
            parsed.email = email.trim()
            localStorage.setItem('wdk_wallet_session', JSON.stringify(parsed))
            console.log('📧 Email saved to localStorage')
          }
        } catch (emailErr) {
          console.error('❌ Email registration error:', emailErr)
        }
      }
      
      console.log('✅ Wallet created with email')
      
    } catch (err) {
      console.error('Wallet creation error:', err)
      setEmailError(err.message || 'Cüzdan oluşturulamadı')
    }
  }

  const handleCreate = async () => {
    setCreateError('')
    try {
      await initialize()
    } catch (err) {
      console.error('Create wallet error:', err)
      setCreateError(err.message || 'Cüzdan oluşturulamadı. Backend çalışıyor mu?')
    }
  }

  const handleImport = async () => {
    setImportError('')
    
    if (!importSeed.trim()) {
      setImportError('Lütfen seed phrase girin')
      return
    }
    
    if (!validateSeedPhrase(importSeed.trim())) {
      setImportError('Geçersiz seed phrase')
      return
    }
    
    // E-posta ekranına git
    setPendingAction('import')
    setMode('email')
    setEmailError('')
  }

  const features = [
    { icon: Shield, title: 'Self-Custody', desc: 'Anahtarlarınız sizde kalır' },
    { icon: Zap, title: 'Çoklu Zincir', desc: 'BTC, ETH, TRON desteği' },
    { icon: Globe, title: 'Açık Kaynak', desc: 'Tether WDK altyapısı' }
  ]

  const hasWallets = walletsHistory.length > 0

  return (
    <div className={styles.welcome}>
      <div className={styles.container}>
        <motion.div 
          className={styles.hero}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div 
            className={styles.badge}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Sparkles size={14} />
            <span>Powered by Tether WDK</span>
          </motion.div>

          <h1 className={styles.title}>
            <span className={styles.gradientText}>Kripto Cüzdanınızı</span>
            <br />
            Oluşturun
          </h1>

          <p className={styles.subtitle}>
            WDK Tether Wallet SDK ile güvenli, kendi kendine saklama özellikli 
            çoklu zincir kripto cüzdanı.
          </p>

          <div className={styles.features}>
            {features.map((feature, i) => (
              <motion.div 
                key={feature.title}
                className={styles.feature}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
              >
                <feature.icon size={20} />
                <div>
                  <h4>{feature.title}</h4>
                  <p>{feature.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div 
          className={styles.actions}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <AnimatePresence mode="wait">
            {mode === 'select' && (
              <motion.div
                key="select"
                className={styles.selectMode}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: -20 }}
              >
                {(createError || walletError) && (
                  <motion.div 
                    className={styles.errorBox}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <AlertCircle size={18} />
                    <span>{createError || walletError}</span>
                  </motion.div>
                )}

                <motion.button
                  className={styles.primaryBtn}
                  onClick={handleCreateClick}
                  disabled={isLoading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isLoading ? (
                    <Loader2 className={styles.spinner} size={20} />
                  ) : (
                    <Sparkles size={20} />
                  )}
                  <span>Yeni Cüzdan Oluştur</span>
                  <ArrowRight size={18} />
                </motion.button>

                <div className={styles.divider}>
                  <span>veya</span>
                </div>

                <motion.button
                  className={styles.secondaryBtn}
                  onClick={() => setMode('import')}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Key size={20} />
                  <span>Seed Phrase ile İçe Aktar</span>
                </motion.button>

                {/* Show "My Wallets" button if there are saved wallets */}
                {hasWallets && (
                  <>
                    <div className={styles.divider}>
                      <span>veya</span>
                    </div>
                    
                    <motion.button
                      className={styles.walletsBtn}
                      onClick={goToWallets}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <FolderOpen size={20} />
                      <span>Cüzdanlarım</span>
                      <span className={styles.walletCount}>{walletsHistory.length}</span>
                    </motion.button>
                  </>
                )}
              </motion.div>
            )}

            {mode === 'import' && (
              <motion.div
                key="import"
                className={styles.importMode}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h3>Seed Phrase Girin</h3>
                <p>12 kelimelik seed phrase'inizi girin</p>
                
                <textarea
                  className={styles.seedInput}
                  placeholder="abandon ability able about above absent absorb abstract absurd abuse access accident..."
                  value={importSeed}
                  onChange={(e) => setImportSeed(e.target.value)}
                  rows={4}
                />
                
                {importError && (
                  <motion.p 
                    className={styles.error}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    {importError}
                  </motion.p>
                )}

                <div className={styles.importActions}>
                  <button 
                    className={styles.backBtn}
                    onClick={() => {
                      setMode('select')
                      setImportSeed('')
                      setImportError('')
                    }}
                  >
                    Geri
                  </button>
                  
                  <motion.button
                    className={styles.primaryBtn}
                    onClick={handleImport}
                    disabled={isLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isLoading ? (
                      <Loader2 className={styles.spinner} size={20} />
                    ) : (
                      <>
                        <span>Devam Et</span>
                        <ArrowRight size={18} />
                      </>
                    )}
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* 📧 E-posta Kayıt Ekranı */}
            {mode === 'email' && (
              <motion.div
                key="email"
                className={styles.importMode}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className={styles.emailHeader}>
                  <Mail size={32} className={styles.emailIcon} />
                  <h3>Güvenlik E-postası</h3>
                </div>
                <p>Riskli işlemlerde doğrulama kodu bu adrese gönderilecek</p>
                
                <input
                  type="email"
                  className={styles.emailInput}
                  placeholder="ornek@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                
                {emailError && (
                  <motion.p 
                    className={styles.error}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    {emailError}
                  </motion.p>
                )}

                <div className={styles.emailNote}>
                  <Shield size={14} />
                  <span>E-postanız güvenli bir şekilde saklanır ve sadece güvenlik doğrulaması için kullanılır.</span>
                </div>

                <div className={styles.importActions}>
                  <button 
                    className={styles.backBtn}
                    onClick={() => {
                      setMode(pendingAction === 'import' ? 'import' : 'select')
                      setEmail('')
                      setEmailError('')
                    }}
                  >
                    Geri
                  </button>
                  
                  <motion.button
                    className={styles.primaryBtn}
                    onClick={handleEmailSubmit}
                    disabled={isLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isLoading ? (
                      <Loader2 className={styles.spinner} size={20} />
                    ) : (
                      <>
                        <span>Cüzdan Oluştur</span>
                        <ArrowRight size={18} />
                      </>
                    )}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Decorative elements */}
      <div className={styles.decorations}>
        <motion.div 
          className={styles.orb1}
          animate={{ 
            y: [0, -20, 0],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ duration: 6, repeat: Infinity }}
        />
        <motion.div 
          className={styles.orb2}
          animate={{ 
            y: [0, 20, 0],
            opacity: [0.2, 0.4, 0.2]
          }}
          transition={{ duration: 8, repeat: Infinity }}
        />
      </div>
    </div>
  )
}
