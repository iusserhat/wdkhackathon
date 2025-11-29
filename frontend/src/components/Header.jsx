import { motion } from 'framer-motion'
import { Wallet, Power, ChevronDown } from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import styles from './Header.module.css'

export default function Header() {
  const { isInitialized, goToWalletSelection, accounts, walletsHistory } = useWallet()

  const handleLogoClick = () => {
    if (isInitialized) {
      goToWalletSelection()
    }
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
          style={{ cursor: isInitialized ? 'pointer' : 'default' }}
          whileHover={isInitialized ? { scale: 1.02 } : {}}
          whileTap={isInitialized ? { scale: 0.98 } : {}}
          title={isInitialized ? 'Cüzdan seçimine dön' : ''}
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
          {isInitialized && (
            <ChevronDown size={16} className={styles.dropdownIcon} />
          )}
        </motion.div>

        {isInitialized && (
          <div className={styles.actions}>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{accounts.length}</span>
                <span className={styles.statLabel}>Hesap</span>
              </div>
              {walletsHistory.length > 1 && (
                <div className={styles.stat}>
                  <span className={styles.statValue}>{walletsHistory.length}</span>
                  <span className={styles.statLabel}>Cüzdan</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.header>
  )
}
