import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Copy, Check, ExternalLink, Send, RefreshCw, Loader2, Droplets } from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import TransactionModal from './TransactionModal'
import styles from './AccountCard.module.css'

export default function AccountCard({ account, index }) {
  const { getBalance } = useWallet()
  const [balance, setBalance] = useState(null)
  const [isLoadingBalance, setIsLoadingBalance] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showTx, setShowTx] = useState(false)

  const { blockchain, address, config } = account

  useEffect(() => {
    fetchBalance()
  }, [account.id])

  const fetchBalance = async () => {
    setIsLoadingBalance(true)
    try {
      const bal = await getBalance(account.id)
      setBalance(bal)
    } catch (err) {
      console.error('Balance fetch error:', err)
      setBalance('0')
    } finally {
      setIsLoadingBalance(false)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const truncateAddress = (addr) => {
    if (!addr) return ''
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`
  }

  const getExplorerUrl = () => {
    // Testnet explorers
    const explorers = {
      ethereum: `https://sepolia.etherscan.io/address/${address}`,
      bitcoin: `https://mempool.space/testnet/address/${address}`,
      tron: `https://shasta.tronscan.org/#/address/${address}`
    }
    return explorers[blockchain] || '#'
  }

  const getFaucetUrl = () => {
    const faucets = {
      ethereum: 'https://sepoliafaucet.com',
      bitcoin: 'https://coinfaucet.eu/en/btc-testnet/',
      tron: 'https://shasta.tronscan.org/#/wallet/faucet'
    }
    return faucets[blockchain] || '#'
  }

  return (
    <>
      <motion.div
        className={styles.card}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1 }}
        style={{ '--accent-color': config.color }}
      >
        <div className={styles.cardGlow} />
        
        <div className={styles.header}>
          <div className={styles.chainInfo}>
            <div className={styles.chainIcon} style={{ background: config.color }}>
              <span>{config.icon}</span>
            </div>
            <div className={styles.chainText}>
              <h3>{config.name}</h3>
              <div className={styles.chainMeta}>
                <span className={styles.chainSymbol}>{config.symbol}</span>
                <span className={styles.testnetBadge}>TESTNET</span>
              </div>
            </div>
          </div>
          <div className={styles.accountIndex}>#{account.index}</div>
        </div>

        <div className={styles.address}>
          <div className={styles.addressText}>
            <span className={styles.label}>Adres</span>
            <code>{truncateAddress(address)}</code>
          </div>
          <div className={styles.addressActions}>
            <motion.button
              className={styles.miniBtn}
              onClick={handleCopy}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Adresi kopyala"
            >
              {copied ? <Check size={14} className={styles.success} /> : <Copy size={14} />}
            </motion.button>
            <motion.a
              className={styles.miniBtn}
              href={getExplorerUrl()}
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Explorer'da görüntüle"
            >
              <ExternalLink size={14} />
            </motion.a>
          </div>
        </div>

        <div className={styles.balance}>
          <span className={styles.label}>Bakiye</span>
          <div className={styles.balanceValue}>
            {isLoadingBalance ? (
              <Loader2 size={20} className={styles.spinner} />
            ) : (
              <>
                <span className={styles.amount}>{balance || '0'}</span>
                <span className={styles.symbol}>{config.symbol}</span>
              </>
            )}
            <motion.button
              className={styles.refreshBtn}
              onClick={fetchBalance}
              disabled={isLoadingBalance}
              whileHover={{ rotate: 180 }}
              transition={{ duration: 0.3 }}
              title="Bakiyeyi yenile"
            >
              <RefreshCw size={14} />
            </motion.button>
          </div>
        </div>

        <div className={styles.actions}>
          <motion.a
            className={styles.faucetBtn}
            href={getFaucetUrl()}
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Droplets size={16} />
            <span>Faucet</span>
          </motion.a>
          <motion.button
            className={styles.sendBtn}
            onClick={() => setShowTx(true)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Send size={16} />
            <span>Gönder</span>
          </motion.button>
        </div>
      </motion.div>

      {showTx && (
        <TransactionModal account={account} onClose={() => setShowTx(false)} />
      )}
    </>
  )
}
