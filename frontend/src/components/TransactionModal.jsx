import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import styles from './TransactionModal.module.css'

export default function TransactionModal({ account, onClose }) {
  const { sendTransaction, isLoading } = useWallet()
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [txResult, setTxResult] = useState(null)
  const [status, setStatus] = useState('form') // form, sending, success, error

  const { blockchain, config, address } = account

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

    setStatus('sending')
    
    try {
      const result = await sendTransaction(account.id, recipient.trim(), amount)
      setTxResult(result)
      setStatus('success')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  const getExplorerTxUrl = (hash) => {
    // Testnet explorers
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
      onClick={onClose}
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
            onClick={onClose}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <X size={20} />
          </motion.button>
        </div>

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
                <Send size={18} />
                <span>İşlemi Gönder</span>
              </motion.button>
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
              
              <button className={styles.closeModalBtn} onClick={onClose}>
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
                  }}
                >
                  Tekrar Dene
                </button>
                <button className={styles.closeModalBtn} onClick={onClose}>
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

