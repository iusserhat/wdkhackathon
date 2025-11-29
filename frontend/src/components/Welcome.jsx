import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Key, ArrowRight, Shield, Zap, Globe, Loader2, AlertCircle, Wallet, Trash2, Clock } from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import styles from './Welcome.module.css'

export default function Welcome() {
  const { 
    initialize, 
    validateSeedPhrase, 
    isLoading, 
    error: walletError,
    walletsHistory,
    switchWallet,
    deleteWalletFromHistory
  } = useWallet()
  
  const [mode, setMode] = useState('select') // select, create, import
  const [importSeed, setImportSeed] = useState('')
  const [importError, setImportError] = useState('')
  const [createError, setCreateError] = useState('')

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
    
    try {
      await initialize(importSeed.trim())
    } catch (err) {
      console.error('Import wallet error:', err)
      setImportError(err.message || 'Cüzdan içe aktarılamadı')
    }
  }

  const handleSwitchWallet = async (seed) => {
    try {
      await switchWallet(seed)
    } catch (err) {
      console.error('Switch wallet error:', err)
      setCreateError(err.message || 'Cüzdan değiştirilemedi')
    }
  }

  const handleDeleteWallet = (e, seed) => {
    e.stopPropagation()
    if (window.confirm('Bu cüzdanı geçmişten silmek istediğinize emin misiniz?')) {
      deleteWalletFromHistory(seed)
    }
  }

  const truncateSeed = (seed) => {
    const words = seed.split(' ')
    return `${words[0]} ${words[1]} ... ${words[words.length - 1]}`
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
            {hasWallets ? (
              <>
                <span className={styles.gradientText}>Cüzdanlarınız</span>
              </>
            ) : (
              <>
                <span className={styles.gradientText}>Kripto Cüzdanınızı</span>
                <br />
                Oluşturun
              </>
            )}
          </h1>

          <p className={styles.subtitle}>
            {hasWallets 
              ? 'Mevcut bir cüzdanı seçin veya yeni bir tane oluşturun.'
              : 'WDK Tether Wallet SDK ile güvenli, kendi kendine saklama özellikli çoklu zincir kripto cüzdanı.'
            }
          </p>

          {!hasWallets && (
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
          )}

          {/* Saved Wallets List */}
          {hasWallets && (
            <div className={styles.savedWallets}>
              <h3 className={styles.savedWalletsTitle}>
                <Clock size={18} />
                <span>Kayıtlı Cüzdanlar</span>
              </h3>
              <div className={styles.walletsList}>
                {walletsHistory.map((wallet, index) => (
                  <motion.div
                    key={wallet.id}
                    className={styles.walletItem}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    onClick={() => handleSwitchWallet(wallet.seedPhrase)}
                  >
                    <div className={styles.walletIcon}>
                      <Wallet size={20} />
                    </div>
                    <div className={styles.walletInfo}>
                      <span className={styles.walletName}>{wallet.name}</span>
                      <code className={styles.walletSeed}>{truncateSeed(wallet.seedPhrase)}</code>
                    </div>
                    <motion.button
                      className={styles.deleteWalletBtn}
                      onClick={(e) => handleDeleteWallet(e, wallet.seedPhrase)}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      title="Cüzdanı sil"
                    >
                      <Trash2 size={16} />
                    </motion.button>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
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
                  onClick={handleCreate}
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
                        <span>İçe Aktar</span>
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
