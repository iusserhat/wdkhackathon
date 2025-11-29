import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowDownUp, Loader2, ChevronDown, AlertCircle, Check, X, RefreshCw, Zap } from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import styles from './Swap.module.css'

const API_URL = 'http://localhost:3001/api'

export default function Swap() {
  const { sessionId, accounts } = useWallet()
  const [tokens, setTokens] = useState([])
  const [fromToken, setFromToken] = useState(null)
  const [toToken, setToToken] = useState(null)
  const [fromAmount, setFromAmount] = useState('')
  const [quote, setQuote] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isQuoting, setIsQuoting] = useState(false)
  const [showFromDropdown, setShowFromDropdown] = useState(false)
  const [showToDropdown, setShowToDropdown] = useState(false)
  const [txResult, setTxResult] = useState(null)
  const [error, setError] = useState(null)
  const [slippage, setSlippage] = useState(0.5)

  // Aktif hesabın blockchain'ine göre tokenları getir
  const activeBlockchain = accounts.length > 0 ? accounts[0].blockchain : 'ethereum'

  useEffect(() => {
    fetchTokens()
  }, [activeBlockchain])

  const fetchTokens = async () => {
    try {
      const response = await fetch(`${API_URL}/defi/swap/tokens/${activeBlockchain}`)
      const data = await response.json()
      if (data.success) {
        setTokens(data.tokens)
        if (data.tokens.length >= 2) {
          setFromToken(data.tokens[0])
          setToToken(data.tokens[1])
        }
      }
    } catch (err) {
      console.error('Token fetch error:', err)
    }
  }

  const fetchQuote = useCallback(async () => {
    if (!fromToken || !toToken || !fromAmount || parseFloat(fromAmount) <= 0) {
      setQuote(null)
      return
    }

    setIsQuoting(true)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/defi/swap/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromToken: fromToken.symbol,
          toToken: toToken.symbol,
          amount: fromAmount
        })
      })

      const data = await response.json()
      if (data.success) {
        setQuote(data.quote)
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Quote alınamadı')
    } finally {
      setIsQuoting(false)
    }
  }, [fromToken, toToken, fromAmount])

  // Debounced quote fetch
  useEffect(() => {
    const timer = setTimeout(fetchQuote, 500)
    return () => clearTimeout(timer)
  }, [fetchQuote])

  const handleSwapTokens = () => {
    const temp = fromToken
    setFromToken(toToken)
    setToToken(temp)
    setFromAmount('')
    setQuote(null)
  }

  const handleExecuteSwap = async () => {
    if (!quote || !sessionId || accounts.length === 0) return

    setIsLoading(true)
    setError(null)
    setTxResult(null)

    try {
      const response = await fetch(`${API_URL}/defi/swap/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          accountId: accounts[0].id,
          fromToken: fromToken.symbol,
          toToken: toToken.symbol,
          amount: fromAmount,
          slippageTolerance: slippage
        })
      })

      const data = await response.json()
      if (data.success) {
        setTxResult(data.transaction)
        setFromAmount('')
        setQuote(null)
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('İşlem başarısız')
    } finally {
      setIsLoading(false)
    }
  }

  const selectFromToken = (token) => {
    if (token.symbol === toToken?.symbol) {
      handleSwapTokens()
    } else {
      setFromToken(token)
    }
    setShowFromDropdown(false)
  }

  const selectToToken = (token) => {
    if (token.symbol === fromToken?.symbol) {
      handleSwapTokens()
    } else {
      setToToken(token)
    }
    setShowToDropdown(false)
  }

  return (
    <motion.div 
      className={styles.swapContainer}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className={styles.swapCard}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <Zap className={styles.icon} />
            <h2>Swap</h2>
          </div>
          <div className={styles.slippageControl}>
            <span>Slippage:</span>
            <div className={styles.slippageButtons}>
              {[0.1, 0.5, 1].map(val => (
                <button
                  key={val}
                  className={`${styles.slippageBtn} ${slippage === val ? styles.active : ''}`}
                  onClick={() => setSlippage(val)}
                >
                  {val}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* From Token */}
        <div className={styles.inputGroup}>
          <label>Gönder</label>
          <div className={styles.tokenInput}>
            <input
              type="number"
              placeholder="0.0"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              min="0"
              step="any"
            />
            <div className={styles.tokenSelectWrapper}>
              <button 
                className={styles.tokenSelect}
                onClick={() => setShowFromDropdown(!showFromDropdown)}
              >
                {fromToken && (
                  <>
                    <span className={styles.tokenIcon}>{fromToken.icon}</span>
                    <span>{fromToken.symbol}</span>
                  </>
                )}
                <ChevronDown size={16} />
              </button>
              
              <AnimatePresence>
                {showFromDropdown && (
                  <motion.div 
                    className={styles.dropdown}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    {tokens.map(token => (
                      <button
                        key={token.symbol}
                        className={styles.dropdownItem}
                        onClick={() => selectFromToken(token)}
                      >
                        <span className={styles.tokenIcon}>{token.icon}</span>
                        <span>{token.symbol}</span>
                        <span className={styles.tokenPrice}>${token.price?.toFixed(2)}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          {fromToken && fromAmount && (
            <div className={styles.valueHint}>
              ≈ ${(parseFloat(fromAmount || 0) * fromToken.price).toFixed(2)}
            </div>
          )}
        </div>

        {/* Swap Button */}
        <motion.button 
          className={styles.swapArrow}
          onClick={handleSwapTokens}
          whileHover={{ scale: 1.1, rotate: 180 }}
          whileTap={{ scale: 0.9 }}
        >
          <ArrowDownUp size={20} />
        </motion.button>

        {/* To Token */}
        <div className={styles.inputGroup}>
          <label>Al</label>
          <div className={styles.tokenInput}>
            <input
              type="text"
              placeholder="0.0"
              value={quote ? quote.outputAmount : ''}
              readOnly
              className={styles.outputInput}
            />
            <div className={styles.tokenSelectWrapper}>
              <button 
                className={styles.tokenSelect}
                onClick={() => setShowToDropdown(!showToDropdown)}
              >
                {toToken && (
                  <>
                    <span className={styles.tokenIcon}>{toToken.icon}</span>
                    <span>{toToken.symbol}</span>
                  </>
                )}
                <ChevronDown size={16} />
              </button>
              
              <AnimatePresence>
                {showToDropdown && (
                  <motion.div 
                    className={styles.dropdown}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    {tokens.map(token => (
                      <button
                        key={token.symbol}
                        className={styles.dropdownItem}
                        onClick={() => selectToToken(token)}
                      >
                        <span className={styles.tokenIcon}>{token.icon}</span>
                        <span>{token.symbol}</span>
                        <span className={styles.tokenPrice}>${token.price?.toFixed(2)}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          {quote && toToken && (
            <div className={styles.valueHint}>
              ≈ ${(parseFloat(quote.outputAmount) * toToken.price).toFixed(2)}
            </div>
          )}
        </div>

        {/* Quote Details */}
        <AnimatePresence>
          {quote && (
            <motion.div 
              className={styles.quoteDetails}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className={styles.quoteRow}>
                <span>Kur</span>
                <span>1 {fromToken?.symbol} = {quote.exchangeRate} {toToken?.symbol}</span>
              </div>
              <div className={styles.quoteRow}>
                <span>Fiyat Etkisi</span>
                <span className={parseFloat(quote.priceImpact) > 1 ? styles.warning : ''}>
                  {quote.priceImpact}%
                </span>
              </div>
              <div className={styles.quoteRow}>
                <span>İşlem Ücreti</span>
                <span>{quote.fee}%</span>
              </div>
              <div className={styles.quoteRow}>
                <span>Minimum Alınacak</span>
                <span>{quote.minimumReceived} {toToken?.symbol}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Message */}
        {error && (
          <motion.div 
            className={styles.error}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </motion.div>
        )}

        {/* Execute Button */}
        <motion.button
          className={styles.executeBtn}
          onClick={handleExecuteSwap}
          disabled={!quote || isLoading || accounts.length === 0}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {isLoading ? (
            <>
              <Loader2 size={20} className={styles.spinner} />
              <span>İşlem yapılıyor...</span>
            </>
          ) : isQuoting ? (
            <>
              <RefreshCw size={20} className={styles.spinner} />
              <span>Quote alınıyor...</span>
            </>
          ) : accounts.length === 0 ? (
            <span>Önce hesap oluşturun</span>
          ) : (
            <span>Swap Yap</span>
          )}
        </motion.button>

        {/* Success Result */}
        <AnimatePresence>
          {txResult && (
            <motion.div 
              className={styles.success}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <div className={styles.successHeader}>
                <Check size={24} />
                <span>Swap {txResult.status === 'pending' ? 'Gönderildi!' : 'Başarılı!'}</span>
                <button onClick={() => setTxResult(null)}>
                  <X size={18} />
                </button>
              </div>
              <div className={styles.successDetails}>
                <p>
                  <strong>{txResult.inputAmount} {txResult.fromToken}</strong>
                  {' → '}
                  <strong>{txResult.outputAmount} {txResult.toToken}</strong>
                </p>
                {txResult.isRealTransaction && (
                  <div className={styles.realTxBadge}>
                    <Zap size={14} />
                    <span>Gerçek Blockchain İşlemi (Sepolia)</span>
                  </div>
                )}
                <a 
                  href={txResult.explorerUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={styles.txHash}
                >
                  {txResult.hash.slice(0, 16)}...{txResult.hash.slice(-8)} ↗
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

