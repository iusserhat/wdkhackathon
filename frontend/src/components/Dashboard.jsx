import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, Eye, EyeOff, Plus, AlertTriangle, Wallet, ArrowLeftRight, Landmark, Zap } from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import AccountCard from './AccountCard'
import CreateAccount from './CreateAccount'
import Swap from './Swap'
import Lending from './Lending'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const { seedPhrase, accounts } = useWallet()
  const [showSeed, setShowSeed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [activeTab, setActiveTab] = useState('wallet') // 'wallet' | 'swap' | 'lending'

  const handleCopy = async () => {
    await navigator.clipboard.writeText(seedPhrase)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const seedWords = seedPhrase.split(' ')

  const tabs = [
    { id: 'wallet', label: 'Cüzdan', icon: <Wallet size={18} /> },
    { id: 'swap', label: 'Swap', icon: <ArrowLeftRight size={18} /> },
    { id: 'lending', label: 'Lending', icon: <Landmark size={18} /> }
  ]

  return (
    <div className={styles.dashboard}>
      <div className={styles.container}>
        {/* Navigation Tabs */}
        <motion.div 
          className={styles.tabsContainer}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {tabs.map((tab) => (
            <motion.button
              key={tab.id}
              className={`${styles.tabBtn} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => setActiveTab(tab.id)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.id === 'swap' && <span className={styles.newBadge}>DeFi</span>}
            </motion.button>
          ))}
        </motion.div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'wallet' && (
            <motion.div
              key="wallet"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Seed Phrase Section */}
              <motion.section 
                className={styles.seedSection}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className={styles.seedHeader}>
                  <div className={styles.seedTitle}>
                    <AlertTriangle size={20} className={styles.warningIcon} />
                    <h3>Seed Phrase</h3>
                  </div>
                  <div className={styles.seedActions}>
                    <motion.button
                      className={styles.iconBtn}
                      onClick={() => setShowSeed(!showSeed)}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      {showSeed ? <EyeOff size={18} /> : <Eye size={18} />}
                    </motion.button>
                    <motion.button
                      className={styles.iconBtn}
                      onClick={handleCopy}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      {copied ? <Check size={18} className={styles.success} /> : <Copy size={18} />}
                    </motion.button>
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {showSeed ? (
                    <motion.div 
                      className={styles.seedGrid}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      {seedWords.map((word, index) => (
                        <motion.div 
                          key={index}
                          className={styles.seedWord}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.03 }}
                        >
                          <span className={styles.wordIndex}>{index + 1}</span>
                          <span className={styles.wordText}>{word}</span>
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : (
                    <motion.div 
                      className={styles.seedHidden}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <p>Seed phrase gizli. Görüntülemek için göz ikonuna tıklayın.</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <p className={styles.seedWarning}>
                  ⚠️ Bu seed phrase'i asla paylaşmayın. Güvenli bir yerde saklayın!
                </p>
              </motion.section>

              {/* Accounts Section */}
              <motion.section 
                className={styles.accountsSection}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <div className={styles.sectionHeader}>
                  <h2>Hesaplarım</h2>
                  <motion.button
                    className={styles.addBtn}
                    onClick={() => setShowCreate(true)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Plus size={18} />
                    <span>Hesap Ekle</span>
                  </motion.button>
                </div>

                {accounts.length === 0 ? (
                  <motion.div 
                    className={styles.emptyState}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className={styles.emptyIcon}>📦</div>
                    <h3>Henüz hesap yok</h3>
                    <p>İlk hesabınızı oluşturmak için "Hesap Ekle" butonuna tıklayın.</p>
                  </motion.div>
                ) : (
                  <div className={styles.accountsGrid}>
                    {accounts.map((account, index) => (
                      <AccountCard key={account.id} account={account} index={index} />
                    ))}
                  </div>
                )}
              </motion.section>
            </motion.div>
          )}

          {activeTab === 'swap' && (
            <motion.div
              key="swap"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <Swap />
            </motion.div>
          )}

          {activeTab === 'lending' && (
            <motion.div
              key="lending"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <Lending />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Create Account Modal */}
        <AnimatePresence>
          {showCreate && (
            <CreateAccount onClose={() => setShowCreate(false)} />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
