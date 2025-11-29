import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  TrendingUp, TrendingDown, Wallet, ArrowUpCircle, ArrowDownCircle, 
  Loader2, AlertCircle, Check, X, RefreshCw, Shield, Percent,
  PiggyBank, CreditCard, Info
} from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import { API_URL } from '../config/api'
import styles from './Lending.module.css'

export default function Lending() {
  const { sessionId } = useWallet()
  const [pools, setPools] = useState([])
  const [positions, setPositions] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [actionModal, setActionModal] = useState(null) // { type: 'supply' | 'withdraw' | 'borrow' | 'repay', token: {} }
  const [amount, setAmount] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [txResult, setTxResult] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('markets') // 'markets' | 'positions'

  useEffect(() => {
    fetchData()
  }, [sessionId])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [poolsRes, positionsRes] = await Promise.all([
        fetch(`${API_URL}/defi/lending/pools`),
        sessionId ? fetch(`${API_URL}/defi/lending/positions/${sessionId}`) : Promise.resolve({ json: () => ({ success: true, positions: null }) })
      ])

      const poolsData = await poolsRes.json()
      const positionsData = await positionsRes.json()

      if (poolsData.success) {
        setPools(poolsData.pools)
      }
      if (positionsData.success) {
        setPositions(positionsData.positions)
      }
    } catch (err) {
      console.error('Data fetch error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAction = async () => {
    if (!actionModal || !amount || parseFloat(amount) <= 0) return

    setIsProcessing(true)
    setError(null)

    const endpoint = `/defi/lending/${actionModal.type}`

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          token: actionModal.token.symbol,
          amount
        })
      })

      const data = await response.json()

      if (data.success) {
        setTxResult(data.transaction)
        setAmount('')
        fetchData() // Pozisyonları güncelle
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('İşlem başarısız')
    } finally {
      setIsProcessing(false)
    }
  }

  const closeModal = () => {
    setActionModal(null)
    setAmount('')
    setError(null)
    setTxResult(null)
  }

  const getActionTitle = (type) => {
    const titles = {
      supply: 'Token Yatır',
      withdraw: 'Token Çek',
      borrow: 'Borç Al',
      repay: 'Borç Öde'
    }
    return titles[type] || type
  }

  const getActionIcon = (type) => {
    const icons = {
      supply: <ArrowDownCircle size={20} />,
      withdraw: <ArrowUpCircle size={20} />,
      borrow: <CreditCard size={20} />,
      repay: <Check size={20} />
    }
    return icons[type]
  }

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Loader2 size={40} className={styles.spinner} />
        <p>Lending verileri yükleniyor...</p>
      </div>
    )
  }

  return (
    <div className={styles.lendingContainer}>
      {/* Header Stats */}
      {positions && (
        <motion.div 
          className={styles.statsGrid}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.2)' }}>
              <PiggyBank size={24} color="#10b981" />
            </div>
            <div className={styles.statContent}>
              <span className={styles.statLabel}>Toplam Yatırım</span>
              <span className={styles.statValue}>${positions.totalSuppliedValue}</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.2)' }}>
              <CreditCard size={24} color="#ef4444" />
            </div>
            <div className={styles.statContent}>
              <span className={styles.statLabel}>Toplam Borç</span>
              <span className={styles.statValue}>${positions.totalBorrowedValue}</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: 'rgba(168, 85, 247, 0.2)' }}>
              <Percent size={24} color="#a855f7" />
            </div>
            <div className={styles.statContent}>
              <span className={styles.statLabel}>Net APY</span>
              <span className={`${styles.statValue} ${parseFloat(positions.netAPY) >= 0 ? styles.positive : styles.negative}`}>
                {positions.netAPY}%
              </span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: 'rgba(0, 245, 255, 0.2)' }}>
              <Shield size={24} color="#00f5ff" />
            </div>
            <div className={styles.statContent}>
              <span className={styles.statLabel}>Sağlık Faktörü</span>
              <span className={`${styles.statValue} ${
                positions.healthFactor === '∞' || parseFloat(positions.healthFactor) > 1.5 
                  ? styles.positive 
                  : parseFloat(positions.healthFactor) > 1 
                    ? styles.warning 
                    : styles.negative
              }`}>
                {positions.healthFactor}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Tabs */}
      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${activeTab === 'markets' ? styles.active : ''}`}
          onClick={() => setActiveTab('markets')}
        >
          <TrendingUp size={18} />
          <span>Piyasalar</span>
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'positions' ? styles.active : ''}`}
          onClick={() => setActiveTab('positions')}
        >
          <Wallet size={18} />
          <span>Pozisyonlarım</span>
        </button>
        <button className={styles.refreshBtn} onClick={fetchData}>
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Markets Tab */}
      {activeTab === 'markets' && (
        <motion.div 
          className={styles.marketsTable}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className={styles.tableHeader}>
            <span>Token</span>
            <span>Toplam Yatırım</span>
            <span>Yatırım APY</span>
            <span>Borç APY</span>
            <span>Kullanım</span>
            <span>İşlemler</span>
          </div>

          {pools.map((pool, index) => (
            <motion.div 
              key={pool.symbol}
              className={styles.tableRow}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <div className={styles.tokenCell}>
                <span className={styles.tokenIcon}>{pool.icon}</span>
                <div>
                  <span className={styles.tokenSymbol}>{pool.symbol}</span>
                  <span className={styles.tokenPrice}>
                    {pool.isRealProtocol && <span className={styles.protocolBadge}>Aave V3</span>}
                  </span>
                </div>
              </div>

              <div className={styles.valueCell}>
                ${(pool.totalSupply * pool.price).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>

              <div className={`${styles.apyCell} ${styles.positive}`}>
                <TrendingUp size={14} />
                {pool.supplyAPY}%
              </div>

              <div className={`${styles.apyCell} ${styles.negative}`}>
                <TrendingDown size={14} />
                {pool.borrowAPY}%
              </div>

              <div className={styles.utilizationCell}>
                <div className={styles.utilizationBar}>
                  <div 
                    className={styles.utilizationFill}
                    style={{ width: `${pool.utilizationRate}%` }}
                  />
                </div>
                <span>{pool.utilizationRate}%</span>
              </div>

              <div className={styles.actionsCell}>
                <motion.button
                  className={styles.actionBtn}
                  onClick={() => setActionModal({ type: 'supply', token: pool })}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Yatır
                </motion.button>
                <motion.button
                  className={`${styles.actionBtn} ${styles.borrowBtn}`}
                  onClick={() => setActionModal({ type: 'borrow', token: pool })}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Borç Al
                </motion.button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Positions Tab */}
      {activeTab === 'positions' && positions && (
        <motion.div 
          className={styles.positionsContainer}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {/* Supplied Positions */}
          <div className={styles.positionSection}>
            <h3>
              <PiggyBank size={20} />
              Yatırılan Tokenlar
            </h3>
            {positions.supplied.length === 0 ? (
              <div className={styles.emptyState}>
                <Info size={24} />
                <p>Henüz token yatırmadınız</p>
              </div>
            ) : (
              <div className={styles.positionsList}>
                {positions.supplied.map(pos => {
                  const pool = pools.find(p => p.symbol === pos.symbol)
                  return (
                    <div key={pos.symbol} className={styles.positionCard}>
                      <div className={styles.positionInfo}>
                        <span className={styles.tokenIcon}>{pool?.icon}</span>
                        <div>
                          <span className={styles.posAmount}>{pos.amount} {pos.symbol}</span>
                          <span className={styles.posValue}>
                            ≈ ${(pos.amount * (pool?.price || 0)).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <div className={styles.posApy}>
                        <TrendingUp size={14} color="#10b981" />
                        <span>{pool?.supplyAPY}% APY</span>
                      </div>
                      <motion.button
                        className={styles.withdrawBtn}
                        onClick={() => setActionModal({ type: 'withdraw', token: pool })}
                        whileHover={{ scale: 1.05 }}
                      >
                        Çek
                      </motion.button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Borrowed Positions */}
          <div className={styles.positionSection}>
            <h3>
              <CreditCard size={20} />
              Borç Alınan Tokenlar
            </h3>
            {positions.borrowed.length === 0 ? (
              <div className={styles.emptyState}>
                <Info size={24} />
                <p>Aktif borcunuz yok</p>
              </div>
            ) : (
              <div className={styles.positionsList}>
                {positions.borrowed.map(pos => {
                  const pool = pools.find(p => p.symbol === pos.symbol)
                  return (
                    <div key={pos.symbol} className={styles.positionCard}>
                      <div className={styles.positionInfo}>
                        <span className={styles.tokenIcon}>{pool?.icon}</span>
                        <div>
                          <span className={styles.posAmount}>{pos.amount} {pos.symbol}</span>
                          <span className={styles.posValue}>
                            ≈ ${(pos.amount * (pool?.price || 0)).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <div className={`${styles.posApy} ${styles.negative}`}>
                        <TrendingDown size={14} color="#ef4444" />
                        <span>{pool?.borrowAPY}% APY</span>
                      </div>
                      <motion.button
                        className={styles.repayBtn}
                        onClick={() => setActionModal({ type: 'repay', token: pool })}
                        whileHover={{ scale: 1.05 }}
                      >
                        Öde
                      </motion.button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Borrow Limit Info */}
          <div className={styles.borrowLimitCard}>
            <div className={styles.borrowLimitHeader}>
              <Shield size={20} />
              <span>Borç Limiti</span>
            </div>
            <div className={styles.borrowLimitBar}>
              <div 
                className={styles.borrowLimitFill}
                style={{ width: `${Math.min(parseFloat(positions.borrowLimitUsed) || 0, 100)}%` }}
              />
            </div>
            <div className={styles.borrowLimitValues}>
              <span>${positions.totalBorrowedValue} kullanıldı</span>
              <span>${positions.borrowLimit} limit</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Action Modal */}
      <AnimatePresence>
        {actionModal && (
          <motion.div 
            className={styles.modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeModal}
          >
            <motion.div 
              className={styles.modal}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                {getActionIcon(actionModal.type)}
                <h3>{getActionTitle(actionModal.type)}</h3>
                <button className={styles.closeBtn} onClick={closeModal}>
                  <X size={20} />
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.tokenDisplay}>
                  <span className={styles.tokenIcon}>{actionModal.token.icon}</span>
                  <span>{actionModal.token.symbol}</span>
                </div>

                <div className={styles.inputWrapper}>
                  <input
                    type="number"
                    placeholder="0.0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min="0"
                    step="any"
                  />
                  <span className={styles.inputSuffix}>{actionModal.token.symbol}</span>
                </div>

                {amount && (
                  <div className={styles.inputValue}>
                    ≈ ${(parseFloat(amount) * actionModal.token.price).toFixed(2)}
                  </div>
                )}

                <div className={styles.modalInfo}>
                  {actionModal.type === 'supply' && (
                    <div className={styles.infoRow}>
                      <span>Yatırım APY</span>
                      <span className={styles.positive}>{actionModal.token.supplyAPY}%</span>
                    </div>
                  )}
                  {actionModal.type === 'borrow' && (
                    <>
                      <div className={styles.infoRow}>
                        <span>Borç APY</span>
                        <span className={styles.negative}>{actionModal.token.borrowAPY}%</span>
                      </div>
                      <div className={styles.infoRow}>
                        <span>LTV</span>
                        <span>{(actionModal.token.ltv * 100).toFixed(0)}%</span>
                      </div>
                    </>
                  )}
                </div>

                {error && (
                  <div className={styles.modalError}>
                    <AlertCircle size={16} />
                    <span>{error}</span>
                  </div>
                )}

                {txResult && (
                  <div className={styles.modalSuccess}>
                    <Check size={16} />
                    <div className={styles.txSuccessContent}>
                      <span>İşlem {txResult.status === 'pending' ? 'gönderildi' : 'başarılı'}!</span>
                      {txResult.isRealTransaction && (
                        <span className={styles.realBadge}>⚡ Gerçek TX</span>
                      )}
                      {txResult.explorerUrl && (
                        <a 
                          href={txResult.explorerUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className={styles.explorerLink}
                        >
                          Explorer'da Görüntüle ↗
                        </a>
                      )}
                    </div>
                  </div>
                )}

                <motion.button
                  className={styles.confirmBtn}
                  onClick={handleAction}
                  disabled={isProcessing || !amount || parseFloat(amount) <= 0}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={20} className={styles.spinner} />
                      <span>İşleniyor...</span>
                    </>
                  ) : (
                    <span>{getActionTitle(actionModal.type)}</span>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

