import express from 'express';
import cors from 'cors';
import WDK from '@tetherto/wdk';
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';
import WalletManagerBtc from '@tetherto/wdk-wallet-btc';
import WalletManagerTron from '@tetherto/wdk-wallet-tron';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory wallet storage (production'da database kullanılmalı)
const walletSessions = new Map();

// Blockchain configurations - TESTNET
const BLOCKCHAIN_CONFIG = {
  ethereum: {
    name: 'Ethereum Sepolia',
    symbol: 'ETH',
    color: '#627EEA',
    icon: '⟠',
    manager: WalletManagerEvm,
    config: { 
      provider: 'https://ethereum-sepolia-rpc.publicnode.com',
      // Alternatif RPC'ler:
      // 'https://rpc.sepolia.org'
      // 'https://sepolia.drpc.org'
      // 'https://1rpc.io/sepolia'
    },
    explorer: 'https://sepolia.etherscan.io',
    isTestnet: true
  },
  bitcoin: {
    name: 'Bitcoin Testnet',
    symbol: 'BTC',
    color: '#F7931A',
    icon: '₿',
    manager: WalletManagerBtc,
    config: { network: 'testnet' },
    explorer: 'https://mempool.space/testnet',
    isTestnet: true
  },
  tron: {
    name: 'TRON Shasta',
    symbol: 'TRX',
    color: '#FF0013',
    icon: '◈',
    manager: WalletManagerTron,
    config: { network: 'shasta' },
    explorer: 'https://shasta.tronscan.org',
    isTestnet: true
  }
};

// Helper: Generate session ID
function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Helper: Get or create WDK instance
function getWalletSession(sessionId) {
  return walletSessions.get(sessionId);
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get blockchain config
app.get('/api/blockchains', (req, res) => {
  const blockchains = Object.entries(BLOCKCHAIN_CONFIG).map(([key, config]) => ({
    id: key,
    name: config.name,
    symbol: config.symbol,
    color: config.color,
    icon: config.icon,
    explorer: config.explorer,
    isTestnet: config.isTestnet
  }));
  res.json({ blockchains });
});

// Generate new seed phrase
app.post('/api/wallet/generate', (req, res) => {
  try {
    const seedPhrase = WDK.getRandomSeedPhrase();
    const sessionId = generateSessionId();
    
    // Create WDK instance
    const wdk = new WDK(seedPhrase);
    
    // Register wallet modules
    Object.entries(BLOCKCHAIN_CONFIG).forEach(([key, config]) => {
      wdk.registerWallet(key, config.manager, config.config);
    });
    
    // Store session
    walletSessions.set(sessionId, {
      wdk,
      seedPhrase,
      accounts: new Map(),
      createdAt: new Date()
    });
    
    console.log(`✅ New wallet session created: ${sessionId}`);
    
    res.json({
      success: true,
      sessionId,
      seedPhrase
    });
  } catch (error) {
    console.error('Generate wallet error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Import existing seed phrase
app.post('/api/wallet/import', (req, res) => {
  try {
    const { seedPhrase } = req.body;
    
    if (!seedPhrase) {
      return res.status(400).json({ success: false, error: 'Seed phrase is required' });
    }
    
    // Validate seed phrase
    if (!WDK.isValidSeed(seedPhrase)) {
      return res.status(400).json({ success: false, error: 'Invalid seed phrase' });
    }
    
    const sessionId = generateSessionId();
    
    // Create WDK instance
    const wdk = new WDK(seedPhrase);
    
    // Register wallet modules
    Object.entries(BLOCKCHAIN_CONFIG).forEach(([key, config]) => {
      wdk.registerWallet(key, config.manager, config.config);
    });
    
    // Store session
    walletSessions.set(sessionId, {
      wdk,
      seedPhrase,
      accounts: new Map(),
      createdAt: new Date()
    });
    
    console.log(`✅ Wallet imported: ${sessionId}`);
    
    res.json({
      success: true,
      sessionId,
      seedPhrase
    });
  } catch (error) {
    console.error('Import wallet error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create account
app.post('/api/wallet/account', async (req, res) => {
  try {
    const { sessionId, blockchain, index = 0 } = req.body;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }
    
    if (!BLOCKCHAIN_CONFIG[blockchain]) {
      return res.status(400).json({ success: false, error: 'Invalid blockchain' });
    }
    
    const accountKey = `${blockchain}-${index}`;
    
    // Check if account already exists
    if (session.accounts.has(accountKey)) {
      const existingAccount = session.accounts.get(accountKey);
      return res.json({
        success: true,
        account: {
          id: accountKey,
          blockchain,
          index,
          address: existingAccount.address,
          config: {
            name: BLOCKCHAIN_CONFIG[blockchain].name,
            symbol: BLOCKCHAIN_CONFIG[blockchain].symbol,
            color: BLOCKCHAIN_CONFIG[blockchain].color,
            icon: BLOCKCHAIN_CONFIG[blockchain].icon,
            explorer: BLOCKCHAIN_CONFIG[blockchain].explorer,
            isTestnet: BLOCKCHAIN_CONFIG[blockchain].isTestnet
          }
        }
      });
    }
    
    // Create new account
    const account = await session.wdk.getAccount(blockchain, index);
    const address = await account.getAddress();
    
    // Store account
    session.accounts.set(accountKey, { account, address });
    
    console.log(`✅ Account created: ${blockchain} #${index} - ${address}`);
    
    res.json({
      success: true,
      account: {
        id: accountKey,
        blockchain,
        index,
        address,
        config: {
          name: BLOCKCHAIN_CONFIG[blockchain].name,
          symbol: BLOCKCHAIN_CONFIG[blockchain].symbol,
          color: BLOCKCHAIN_CONFIG[blockchain].color,
          icon: BLOCKCHAIN_CONFIG[blockchain].icon,
          explorer: BLOCKCHAIN_CONFIG[blockchain].explorer,
          isTestnet: BLOCKCHAIN_CONFIG[blockchain].isTestnet
        }
      }
    });
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all accounts
app.get('/api/wallet/accounts/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }
    
    const accounts = [];
    for (const [key, data] of session.accounts.entries()) {
      const [blockchain, index] = key.split('-');
      accounts.push({
        id: key,
        blockchain,
        index: parseInt(index),
        address: data.address,
        config: {
          name: BLOCKCHAIN_CONFIG[blockchain].name,
          symbol: BLOCKCHAIN_CONFIG[blockchain].symbol,
          color: BLOCKCHAIN_CONFIG[blockchain].color,
          icon: BLOCKCHAIN_CONFIG[blockchain].icon,
          explorer: BLOCKCHAIN_CONFIG[blockchain].explorer,
          isTestnet: BLOCKCHAIN_CONFIG[blockchain].isTestnet
        }
      });
    }
    
    res.json({ success: true, accounts });
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get balance
app.get('/api/wallet/balance/:sessionId/:accountId', async (req, res) => {
  try {
    const { sessionId, accountId } = req.params;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }
    
    const accountData = session.accounts.get(accountId);
    if (!accountData) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    
    try {
      const balance = await accountData.account.getBalance();
      // Wei'den ETH'ye çevir (Ethereum için)
      const [blockchain] = accountId.split('-');
      let formattedBalance = balance.toString();
      
      if (blockchain === 'ethereum') {
        // Wei to ETH (18 decimals)
        const balanceInEth = Number(balance) / 1e18;
        formattedBalance = balanceInEth.toFixed(6);
      }
      
      res.json({ success: true, balance: formattedBalance, rawBalance: balance.toString() });
    } catch (balanceError) {
      console.log('Balance fetch error:', balanceError.message);
      res.json({ success: true, balance: '0', rawBalance: '0' });
    }
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send transaction
app.post('/api/wallet/send', async (req, res) => {
  try {
    const { sessionId, accountId, to, amount } = req.body;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }
    
    const accountData = session.accounts.get(accountId);
    if (!accountData) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    
    if (!to || !amount) {
      return res.status(400).json({ success: false, error: 'Recipient and amount are required' });
    }
    
    const [blockchain] = accountId.split('-');
    
    let txParams;
    
    if (blockchain === 'ethereum') {
      // ETH'yi Wei'ye çevir
      const amountInWei = BigInt(Math.floor(parseFloat(amount) * 1e18));
      txParams = {
        to,
        value: amountInWei
      };
    } else {
      txParams = {
        to,
        amount: amount.toString()
      };
    }
    
    console.log(`📤 Sending transaction on ${blockchain}:`, txParams);
    
    const result = await accountData.account.sendTransaction(txParams);
    
    console.log(`✅ Transaction sent: ${result.hash || result}`);
    
    const explorer = BLOCKCHAIN_CONFIG[blockchain].explorer;
    const txUrl = blockchain === 'ethereum' 
      ? `${explorer}/tx/${result.hash || result}`
      : blockchain === 'tron'
      ? `${explorer}/#/transaction/${result.hash || result}`
      : `${explorer}/tx/${result.hash || result}`;
    
    res.json({
      success: true,
      transaction: {
        hash: result.hash || result,
        fee: result.fee ? (Number(result.fee) / 1e18).toFixed(8) : null,
        explorerUrl: txUrl
      }
    });
  } catch (error) {
    console.error('Send transaction error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get fee estimate
app.post('/api/wallet/quote', async (req, res) => {
  try {
    const { sessionId, accountId, to, amount } = req.body;
    
    const session = getWalletSession(sessionId);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }
    
    const accountData = session.accounts.get(accountId);
    if (!accountData) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    
    const [blockchain] = accountId.split('-');
    
    if (blockchain === 'ethereum') {
      const amountInWei = BigInt(Math.floor(parseFloat(amount || '0') * 1e18));
      const quote = await accountData.account.quoteSendTransaction({
        to: to || '0x0000000000000000000000000000000000000000',
        value: amountInWei
      });
      
      res.json({
        success: true,
        fee: (Number(quote.fee) / 1e18).toFixed(8),
        rawFee: quote.fee.toString()
      });
    } else {
      res.json({ success: true, fee: '0', rawFee: '0' });
    }
  } catch (error) {
    console.error('Quote error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Disconnect wallet
app.post('/api/wallet/disconnect', (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (walletSessions.has(sessionId)) {
      walletSessions.delete(sessionId);
      console.log(`🔌 Session disconnected: ${sessionId}`);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
🚀 WDK Wallet API Server (TESTNET MODE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server running on http://localhost:${PORT}

🔗 Supported Networks (TESTNET):
   • Ethereum Sepolia - https://sepolia.etherscan.io
   • Bitcoin Testnet  - https://mempool.space/testnet  
   • TRON Shasta      - https://shasta.tronscan.org

💧 Faucets:
   • Sepolia ETH: https://sepoliafaucet.com
   • Sepolia ETH: https://www.alchemy.com/faucets/ethereum-sepolia
   • TRON Shasta: https://shasta.tronscan.org/#/wallet/faucet

📚 API Endpoints:
   GET  /api/health
   GET  /api/blockchains
   POST /api/wallet/generate
   POST /api/wallet/import
   POST /api/wallet/account
   GET  /api/wallet/accounts/:sessionId
   GET  /api/wallet/balance/:sessionId/:accountId
   POST /api/wallet/send
   POST /api/wallet/quote
   POST /api/wallet/disconnect
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
