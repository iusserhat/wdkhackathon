import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const WalletContext = createContext(null)

const API_URL = 'http://localhost:3001/api'
const STORAGE_KEY = 'wdk_wallet_session'
const ACCOUNTS_KEY = 'wdk_wallet_accounts'
const WALLETS_HISTORY_KEY = 'wdk_wallets_history'

const BLOCKCHAIN_CONFIG = {
  ethereum: {
    name: 'Ethereum Sepolia',
    symbol: 'ETH',
    color: '#627EEA',
    icon: '⟠'
  },
  bitcoin: {
    name: 'Bitcoin Testnet',
    symbol: 'BTC',
    color: '#F7931A',
    icon: '₿'
  },
  tron: {
    name: 'TRON Shasta',
    symbol: 'TRX',
    color: '#FF0013',
    icon: '◈'
  }
}

// LocalStorage helpers
const saveSession = (sessionId, seedPhrase) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, seedPhrase }))
  } catch (e) {
    console.error('Failed to save session:', e)
  }
}

const loadSession = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : null
  } catch (e) {
    console.error('Failed to load session:', e)
    return null
  }
}

const saveAccounts = (accounts) => {
  try {
    const accountsData = accounts.map(a => ({
      blockchain: a.blockchain,
      index: a.index
    }))
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accountsData))
  } catch (e) {
    console.error('Failed to save accounts:', e)
  }
}

const loadAccounts = () => {
  try {
    const data = localStorage.getItem(ACCOUNTS_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('Failed to load accounts:', e)
    return []
  }
}

// Wallet history functions
const saveWalletToHistory = (seedPhrase, name) => {
  try {
    const history = loadWalletsHistory()
    // Check if already exists
    const exists = history.some(w => w.seedPhrase === seedPhrase)
    if (!exists) {
      history.push({
        id: Date.now().toString(),
        seedPhrase,
        name: name || `Cüzdan ${history.length + 1}`,
        createdAt: new Date().toISOString()
      })
      localStorage.setItem(WALLETS_HISTORY_KEY, JSON.stringify(history))
    }
  } catch (e) {
    console.error('Failed to save wallet to history:', e)
  }
}

const loadWalletsHistory = () => {
  try {
    const data = localStorage.getItem(WALLETS_HISTORY_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('Failed to load wallets history:', e)
    return []
  }
}

const removeWalletFromHistory = (seedPhrase) => {
  try {
    const history = loadWalletsHistory()
    const filtered = history.filter(w => w.seedPhrase !== seedPhrase)
    localStorage.setItem(WALLETS_HISTORY_KEY, JSON.stringify(filtered))
  } catch (e) {
    console.error('Failed to remove wallet from history:', e)
  }
}

const clearCurrentSession = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(ACCOUNTS_KEY)
  } catch (e) {
    console.error('Failed to clear session:', e)
  }
}

export function WalletProvider({ children }) {
  const [sessionId, setSessionId] = useState(null)
  const [seedPhrase, setSeedPhrase] = useState('')
  const [accounts, setAccounts] = useState([])
  const [isInitialized, setIsInitialized] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [walletsHistory, setWalletsHistory] = useState([])

  // Load wallets history on mount
  useEffect(() => {
    setWalletsHistory(loadWalletsHistory())
  }, [])

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      const saved = loadSession()
      
      if (saved?.seedPhrase) {
        try {
          const response = await fetch(`${API_URL}/wallet/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seedPhrase: saved.seedPhrase })
          })
          
          const data = await response.json()
          
          if (data.success) {
            setSessionId(data.sessionId)
            setSeedPhrase(data.seedPhrase)
            setIsInitialized(true)
            
            saveSession(data.sessionId, data.seedPhrase)
            
            // Restore accounts
            const savedAccounts = loadAccounts()
            if (savedAccounts.length > 0) {
              for (const acc of savedAccounts) {
                try {
                  const accResponse = await fetch(`${API_URL}/wallet/account`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      sessionId: data.sessionId, 
                      blockchain: acc.blockchain, 
                      index: acc.index 
                    })
                  })
                  
                  const accData = await accResponse.json()
                  
                  if (accData.success) {
                    setAccounts(prev => {
                      const exists = prev.some(a => a.id === accData.account.id)
                      if (exists) return prev
                      return [...prev, accData.account]
                    })
                  }
                } catch (accErr) {
                  console.error('Failed to restore account:', accErr)
                }
              }
            }
            
            console.log('✅ Session restored')
          } else {
            clearCurrentSession()
          }
        } catch (err) {
          console.error('Failed to restore session:', err)
          clearCurrentSession()
        }
      }
      
      setIsLoading(false)
    }
    
    restoreSession()
  }, [])

  // Save accounts whenever they change
  useEffect(() => {
    if (isInitialized && accounts.length > 0) {
      saveAccounts(accounts)
    }
  }, [accounts, isInitialized])

  const initialize = useCallback(async (existingSeed = null) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const endpoint = existingSeed ? '/wallet/import' : '/wallet/generate'
      const body = existingSeed ? { seedPhrase: existingSeed } : {}
      
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Wallet initialization failed')
      }
      
      setSessionId(data.sessionId)
      setSeedPhrase(data.seedPhrase)
      setIsInitialized(true)
      setAccounts([])
      
      // Save to localStorage
      saveSession(data.sessionId, data.seedPhrase)
      
      // Save to history
      saveWalletToHistory(data.seedPhrase)
      setWalletsHistory(loadWalletsHistory())
      
      return data.seedPhrase
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Switch to a different wallet from history
  const switchWallet = useCallback(async (walletSeedPhrase) => {
    setIsLoading(true)
    setError(null)
    
    try {
      // Disconnect current session
      if (sessionId) {
        try {
          await fetch(`${API_URL}/wallet/disconnect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
          })
        } catch (err) {
          console.error('Disconnect error:', err)
        }
      }
      
      // Clear current session data
      clearCurrentSession()
      setAccounts([])
      
      // Import the selected wallet
      const response = await fetch(`${API_URL}/wallet/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedPhrase: walletSeedPhrase })
      })
      
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Wallet switch failed')
      }
      
      setSessionId(data.sessionId)
      setSeedPhrase(data.seedPhrase)
      setIsInitialized(true)
      
      saveSession(data.sessionId, data.seedPhrase)
      
      return data.seedPhrase
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  // Delete wallet from history
  const deleteWalletFromHistory = useCallback((walletSeedPhrase) => {
    removeWalletFromHistory(walletSeedPhrase)
    setWalletsHistory(loadWalletsHistory())
    
    // If deleting current wallet, reset
    if (walletSeedPhrase === seedPhrase) {
      clearCurrentSession()
      setSessionId(null)
      setSeedPhrase('')
      setAccounts([])
      setIsInitialized(false)
    }
  }, [seedPhrase])

  const createAccount = useCallback(async (blockchain, index = 0) => {
    if (!sessionId) {
      throw new Error('Wallet not initialized')
    }
    
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`${API_URL}/wallet/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, blockchain, index })
      })
      
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Account creation failed')
      }
      
      const newAccount = data.account
      
      setAccounts(prev => {
        const exists = prev.some(a => a.id === newAccount.id)
        if (exists) return prev
        return [...prev, newAccount]
      })
      
      return newAccount
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  const getBalance = useCallback(async (accountId) => {
    if (!sessionId) {
      throw new Error('Wallet not initialized')
    }
    
    try {
      const response = await fetch(`${API_URL}/wallet/balance/${sessionId}/${accountId}`)
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Balance fetch failed')
      }
      
      return data.balance
    } catch (err) {
      console.error('Balance error:', err)
      return '0'
    }
  }, [sessionId])

  const sendTransaction = useCallback(async (accountId, to, amount) => {
    if (!sessionId) {
      throw new Error('Wallet not initialized')
    }
    
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`${API_URL}/wallet/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, accountId, to, amount })
      })
      
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Transaction failed')
      }
      
      return data.transaction
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  const validateSeedPhrase = useCallback((phrase) => {
    const words = phrase.trim().split(/\s+/)
    return words.length === 12 || words.length === 24
  }, [])

  // Just go back to wallet selection (don't delete anything)
  const goToWalletSelection = useCallback(async () => {
    if (sessionId) {
      try {
        await fetch(`${API_URL}/wallet/disconnect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        })
      } catch (err) {
        console.error('Disconnect error:', err)
      }
    }
    
    clearCurrentSession()
    setSessionId(null)
    setSeedPhrase('')
    setAccounts([])
    setIsInitialized(false)
    setError(null)
  }, [sessionId])

  // Complete reset - delete everything
  const reset = useCallback(async () => {
    if (sessionId) {
      try {
        await fetch(`${API_URL}/wallet/disconnect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        })
      } catch (err) {
        console.error('Disconnect error:', err)
      }
    }
    
    // Clear everything including history
    clearCurrentSession()
    localStorage.removeItem(WALLETS_HISTORY_KEY)
    
    setSessionId(null)
    setSeedPhrase('')
    setAccounts([])
    setIsInitialized(false)
    setWalletsHistory([])
    setError(null)
  }, [sessionId])

  const value = {
    sessionId,
    seedPhrase,
    accounts,
    isInitialized,
    isLoading,
    error,
    blockchains: BLOCKCHAIN_CONFIG,
    walletsHistory,
    initialize,
    createAccount,
    getBalance,
    sendTransaction,
    validateSeedPhrase,
    switchWallet,
    deleteWalletFromHistory,
    goToWalletSelection,
    reset
  }

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}

export default useWallet
