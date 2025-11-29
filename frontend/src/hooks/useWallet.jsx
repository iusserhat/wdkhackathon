import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const WalletContext = createContext(null)

const API_URL = 'http://localhost:3001/api'
const STORAGE_KEY = 'wdk_wallet_session'
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

// Wallet history with accounts
const loadWalletsHistory = () => {
  try {
    const data = localStorage.getItem(WALLETS_HISTORY_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('Failed to load wallets history:', e)
    return []
  }
}

const saveWalletsHistory = (history) => {
  try {
    localStorage.setItem(WALLETS_HISTORY_KEY, JSON.stringify(history))
  } catch (e) {
    console.error('Failed to save wallets history:', e)
  }
}

const saveWalletToHistory = (seedPhrase, name) => {
  const history = loadWalletsHistory()
  const exists = history.find(w => w.seedPhrase === seedPhrase)
  if (!exists) {
    history.push({
      id: Date.now().toString(),
      seedPhrase,
      name: name || `Cüzdan ${history.length + 1}`,
      createdAt: new Date().toISOString(),
      accounts: []
    })
    saveWalletsHistory(history)
  }
  return history
}

const updateWalletAccounts = (seedPhrase, accounts) => {
  const history = loadWalletsHistory()
  const wallet = history.find(w => w.seedPhrase === seedPhrase)
  if (wallet) {
    wallet.accounts = accounts.map(a => ({
      blockchain: a.blockchain,
      index: a.index
    }))
    saveWalletsHistory(history)
  }
}

const getWalletAccounts = (seedPhrase) => {
  const history = loadWalletsHistory()
  const wallet = history.find(w => w.seedPhrase === seedPhrase)
  return wallet?.accounts || []
}

const removeWalletFromHistory = (seedPhrase) => {
  const history = loadWalletsHistory()
  const filtered = history.filter(w => w.seedPhrase !== seedPhrase)
  saveWalletsHistory(filtered)
}

const clearCurrentSession = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
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
  
  // Page navigation: 'welcome' | 'wallets' | 'dashboard'
  const [currentPage, setCurrentPage] = useState('welcome')

  // Load wallets history on mount
  useEffect(() => {
    setWalletsHistory(loadWalletsHistory())
  }, [])

  // Save accounts to wallet history whenever they change
  useEffect(() => {
    if (isInitialized && seedPhrase && accounts.length > 0) {
      updateWalletAccounts(seedPhrase, accounts)
      setWalletsHistory(loadWalletsHistory())
    }
  }, [accounts, isInitialized, seedPhrase])

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
            setCurrentPage('dashboard')
            
            saveSession(data.sessionId, data.seedPhrase)
            
            // Restore accounts for this wallet
            const savedAccounts = getWalletAccounts(data.seedPhrase)
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

  const initialize = useCallback(async (existingSeed = null, email = null) => {
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
      
      // 📧 E-postayı kaydet (varsa)
      if (email && data.sessionId) {
        try {
          console.log('📧 Registering email for session:', data.sessionId, email.trim())
          const emailResponse = await fetch(`${API_URL}/security/email/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              sessionId: data.sessionId, 
              email: email.trim() 
            })
          })
          const emailResult = await emailResponse.json()
          console.log('📧 Email registration result:', emailResult)
          
          if (!emailResult.success) {
            console.error('❌ Email registration failed:', emailResult.error)
          }
        } catch (emailErr) {
          console.error('❌ Email registration error:', emailErr)
        }
      }
      
      setSessionId(data.sessionId)
      setSeedPhrase(data.seedPhrase)
      setIsInitialized(true)
      setAccounts([])
      setCurrentPage('dashboard')
      
      saveSession(data.sessionId, data.seedPhrase)
      
      // Save to history
      const updatedHistory = saveWalletToHistory(data.seedPhrase)
      setWalletsHistory(updatedHistory)
      
      return data.sessionId // sessionId döndür
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
      setCurrentPage('dashboard')
      
      saveSession(data.sessionId, data.seedPhrase)
      
      // Restore accounts for this wallet
      const savedAccounts = getWalletAccounts(walletSeedPhrase)
      if (savedAccounts.length > 0) {
        console.log('🔄 Restoring wallet accounts...')
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
      setCurrentPage('welcome')
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

  // Navigate to wallets page
  const goToWallets = useCallback(() => {
    setCurrentPage('wallets')
  }, [])

  // Navigate to welcome page
  const goToWelcome = useCallback(() => {
    setCurrentPage('welcome')
  }, [])

  // Logout from current wallet but keep in history
  const logout = useCallback(async () => {
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
    setCurrentPage('welcome')
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
    
    clearCurrentSession()
    localStorage.removeItem(WALLETS_HISTORY_KEY)
    
    setSessionId(null)
    setSeedPhrase('')
    setAccounts([])
    setIsInitialized(false)
    setWalletsHistory([])
    setError(null)
    setCurrentPage('welcome')
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
    currentPage,
    initialize,
    createAccount,
    getBalance,
    sendTransaction,
    validateSeedPhrase,
    switchWallet,
    deleteWalletFromHistory,
    goToWallets,
    goToWelcome,
    logout,
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
