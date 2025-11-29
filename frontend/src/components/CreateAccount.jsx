import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Plus, Loader2 } from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import styles from './CreateAccount.module.css'

export default function CreateAccount({ onClose }) {
  const { blockchains, accounts, createAccount, isLoading } = useWallet()
  const [selectedChain, setSelectedChain] = useState('ethereum')
  const [accountIndex, setAccountIndex] = useState(0)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    setError('')
    
    const exists = accounts.some(
      a => a.blockchain === selectedChain && a.index === accountIndex
    )
    
    if (exists) {
      setError('Bu hesap zaten mevcut')
      return
    }
    
    try {
      await createAccount(selectedChain, accountIndex)
      onClose()
    } catch (err) {
      setError(err.message)
    }
  }

  // Get next available index for selected chain
  const getNextIndex = (chain) => {
    const chainAccounts = accounts.filter(a => a.blockchain === chain)
    if (chainAccounts.length === 0) return 0
    return Math.max(...chainAccounts.map(a => a.index)) + 1
  }

  const handleChainSelect = (chain) => {
    setSelectedChain(chain)
    setAccountIndex(getNextIndex(chain))
    setError('')
  }

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className={styles.modal}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2>Yeni Hesap Oluştur</h2>
          <motion.button
            className={styles.closeBtn}
            onClick={onClose}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <X size={20} />
          </motion.button>
        </div>

        <div className={styles.content}>
          <div className={styles.field}>
            <label>Blockchain Seçin</label>
            <div className={styles.chainGrid}>
              {Object.entries(blockchains).map(([key, chain]) => (
                <motion.button
                  key={key}
                  className={`${styles.chainOption} ${selectedChain === key ? styles.selected : ''}`}
                  onClick={() => handleChainSelect(key)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{ '--chain-color': chain.color }}
                >
                  <div className={styles.chainIcon} style={{ background: chain.color }}>
                    <span>{chain.icon}</span>
                  </div>
                  <div className={styles.chainInfo}>
                    <span className={styles.chainName}>{chain.name}</span>
                    <span className={styles.chainSymbol}>{chain.symbol}</span>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label>Hesap Index</label>
            <div className={styles.indexInput}>
              <motion.button
                className={styles.indexBtn}
                onClick={() => setAccountIndex(Math.max(0, accountIndex - 1))}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                −
              </motion.button>
              <input
                type="number"
                value={accountIndex}
                onChange={(e) => setAccountIndex(Math.max(0, parseInt(e.target.value) || 0))}
                min="0"
              />
              <motion.button
                className={styles.indexBtn}
                onClick={() => setAccountIndex(accountIndex + 1)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                +
              </motion.button>
            </div>
            <p className={styles.hint}>
              Aynı blockchain için farklı index'ler kullanarak birden fazla hesap oluşturabilirsiniz.
            </p>
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
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>
            İptal
          </button>
          <motion.button
            className={styles.createBtn}
            onClick={handleCreate}
            disabled={isLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {isLoading ? (
              <Loader2 size={18} className={styles.spinner} />
            ) : (
              <>
                <Plus size={18} />
                <span>Hesap Oluştur</span>
              </>
            )}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}

