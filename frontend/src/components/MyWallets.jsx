import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wallet, Trash2, Users, ArrowLeft, Plus, Key, ArrowRight, Loader2, Sparkles } from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import styles from './MyWallets.module.css'

export default function MyWallets() {
  const { 
    walletsHistory, 
    switchWallet, 
    deleteWalletFromHistory, 
    goToWelcome,
    initialize,
    validateSeedPhrase,
    isLoading
  } = useWallet()

  const [showImport, setShowImport] = useState(false)
  const [importSeed, setImportSeed] = useState('')
  const [importError, setImportError] = useState('')
  const [error, setError] = useState('')

  const handleSwitchWallet = async (seed) => {
    setError('')
    try {
      await switchWallet(seed)
    } catch (err) {
      console.error('Switch wallet error:', err)
      setError(err.message || 'Cüzdan değiştirilemedi')
    }
  }

  const handleDeleteWallet = (e, seed) => {
    e.stopPropagation()
    if (window.confirm('Bu cüzdanı geçmişten silmek istediğinize emin misiniz?')) {
      deleteWalletFromHistory(seed)
    }
  }

  const handleCreate = async () => {
    setError('')
    try {
      await initialize()
    } catch (err) {
      console.error('Create wallet error:', err)
      setError(err.message || 'Cüzdan oluşturulamadı')
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

  const truncateSeed = (seed) => {
    const words = seed.split(' ')
    return `${words[0]} ${words[1]} ... ${words[words.length - 1]}`
  }

  return (
    <div className={styles.container}>
      <motion.div 
        className={styles.header}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <motion.button
          className={styles.backBtn}
          onClick={goToWelcome}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft size={20} />
          <span>Geri</span>
        </motion.button>

        <div className={styles.titleSection}>
          <h1>
            <span className={styles.gradientText}>Cüzdanlarım</span>
          </h1>
          <p>{walletsHistory.length} kayıtlı cüzdan</p>
        </div>
      </motion.div>

      {error && (
        <motion.div 
          className={styles.errorBox}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {error}
        </motion.div>
      )}

      <motion.div 
        className={styles.walletsGrid}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {/* Existing Wallets */}
        {walletsHistory.map((wallet, index) => (
          <motion.div
            key={wallet.id}
            className={styles.walletCard}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => handleSwitchWallet(wallet.seedPhrase)}
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className={styles.walletCardIcon}>
              <Wallet size={28} />
            </div>
            <div className={styles.walletCardInfo}>
              <span className={styles.walletCardName}>{wallet.name}</span>
              <code className={styles.walletCardSeed}>{truncateSeed(wallet.seedPhrase)}</code>
              
              {wallet.accounts && wallet.accounts.length > 0 && (
                <div className={styles.walletAccountsBadge}>
                  <Users size={12} />
                  <span>{wallet.accounts.length} hesap</span>
                </div>
              )}
              
              <span className={styles.walletCardDate}>
                {new Date(wallet.createdAt).toLocaleDateString('tr-TR')}
              </span>
            </div>
            <motion.button
              className={styles.deleteWalletBtn}
              onClick={(e) => handleDeleteWallet(e, wallet.seedPhrase)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Cüzdanı sil"
            >
              <Trash2 size={18} />
            </motion.button>
          </motion.div>
        ))}

        {/* New Wallet Card */}
        <motion.div
          className={`${styles.walletCard} ${styles.newWalletCard}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: walletsHistory.length * 0.1 }}
          onClick={handleCreate}
          whileHover={{ scale: 1.02, y: -4 }}
          whileTap={{ scale: 0.98 }}
        >
          {isLoading ? (
            <Loader2 size={32} className={styles.spinner} />
          ) : (
            <>
              <div className={styles.newWalletIcon}>
                <Plus size={32} />
              </div>
              <span className={styles.newWalletText}>Yeni Cüzdan Oluştur</span>
            </>
          )}
        </motion.div>

        {/* Import Wallet Card */}
        <motion.div
          className={`${styles.walletCard} ${styles.importWalletCard}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: (walletsHistory.length + 1) * 0.1 }}
          onClick={() => setShowImport(true)}
          whileHover={{ scale: 1.02, y: -4 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className={styles.importWalletIcon}>
            <Key size={28} />
          </div>
          <span className={styles.importWalletText}>Seed Phrase ile İçe Aktar</span>
        </motion.div>
      </motion.div>

      {/* Import Modal */}
      <AnimatePresence>
        {showImport && (
          <motion.div
            className={styles.modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowImport(false)}
          >
            <motion.div
              className={styles.modal}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
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

              <div className={styles.modalActions}>
                <button 
                  className={styles.cancelBtn}
                  onClick={() => {
                    setShowImport(false)
                    setImportSeed('')
                    setImportError('')
                  }}
                >
                  İptal
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
          </motion.div>
        )}
      </AnimatePresence>

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

