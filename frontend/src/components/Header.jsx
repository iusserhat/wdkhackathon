import { motion } from 'framer-motion'
import { Wallet, LogOut, FolderOpen } from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import styles from './Header.module.css'

export default function Header() {
  const { isInitialized, logout, accounts, walletsHistory, goToWallets, goToWelcome, currentPage } = useWallet()

  const handleLogoClick = () => {
    goToWelcome()
  }

  return (
    <motion.header 
      className={styles.header}
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className={styles.container}>
        <motion.div 
          className={styles.logo}
          onClick={handleLogoClick}
          style={{ cursor: 'pointer' }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          title="Ana sayfaya dön"
        >
          <motion.div 
            className={styles.logoIcon}
            whileHover={{ rotate: 360, scale: 1.1 }}
            transition={{ duration: 0.6 }}
          >
            <Wallet size={28} />
          </motion.div>
          <div className={styles.logoText}>
            <span className={styles.logoTitle}>WDK</span>
            <span className={styles.logoSubtitle}>Tether Wallet</span>
          </div>
        </motion.div>

        <div className={styles.actions}>
          {/* My Wallets button - always visible if there are wallets */}
          {walletsHistory.length > 0 && currentPage !== 'wallets' && (
            <motion.button
              className={styles.walletsBtn}
              onClick={goToWallets}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <FolderOpen size={18} />
              <span>Cüzdanlarım</span>
              <span className={styles.walletCount}>{walletsHistory.length}</span>
            </motion.button>
          )}

          {isInitialized && (
            <>
              <div className={styles.stats}>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{accounts.length}</span>
                  <span className={styles.statLabel}>Hesap</span>
                </div>
              </div>
              
              <motion.button
                className={styles.logoutBtn}
                onClick={logout}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Çıkış Yap"
              >
                <LogOut size={18} />
                <span>Çıkış</span>
              </motion.button>
            </>
          )}
        </div>
      </div>
    </motion.header>
  )
}
