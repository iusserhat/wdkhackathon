import { WalletProvider, useWallet } from './hooks/useWallet'
import Header from './components/Header'
import Welcome from './components/Welcome'
import Dashboard from './components/Dashboard'
import { motion } from 'framer-motion'

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '20px'
    }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        style={{
          width: '50px',
          height: '50px',
          border: '3px solid rgba(0, 245, 255, 0.2)',
          borderTopColor: '#00f5ff',
          borderRadius: '50%'
        }}
      />
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ color: '#a0a0b0', fontSize: '0.9rem' }}
      >
        Cüzdan yükleniyor...
      </motion.p>
    </div>
  )
}

function WalletApp() {
  const { isInitialized, isLoading } = useWallet()

  // Show loading only on initial load
  if (isLoading && !isInitialized) {
    return <LoadingScreen />
  }

  return (
    <div className="app">
      <Header />
      {isInitialized ? <Dashboard /> : <Welcome />}
    </div>
  )
}

function App() {
  return (
    <WalletProvider>
      <WalletApp />
    </WalletProvider>
  )
}

export default App
