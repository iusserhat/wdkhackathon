import WDK from '@tetherto/wdk';
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';
import WalletManagerBtc from '@tetherto/wdk-wallet-btc';
import WalletManagerTron from '@tetherto/wdk-wallet-tron';

/**
 * WDK Tether Wallet SDK kullanarak kripto cüzdan oluşturma
 */
class CryptoWallet {
  constructor() {
    this.wdk = null;
    this.seedPhrase = null;
    this.accounts = new Map();
  }

  /**
   * WDK'yı başlatır ve seed phrase oluşturur
   */
  async initialize() {
    try {
      console.log('🚀 WDK başlatılıyor...');
      
      // Seed phrase oluştur (veya mevcut bir seed phrase kullanabilirsiniz)
      this.seedPhrase = WDK.getRandomSeedPhrase();
      
      console.log('✅ Seed phrase oluşturuldu:');
      console.log(this.seedPhrase);
      console.log('\n⚠️  ÖNEMLİ: Bu seed phrase\'i güvenli bir yerde saklayın!');
      
      // WDK instance'ını oluştur (seed phrase string olarak geçirilir)
      this.wdk = new WDK(this.seedPhrase);

      // Wallet modüllerini kaydet
      this.registerWalletModules();

      console.log('✅ WDK başarıyla başlatıldı!');
      return true;
    } catch (error) {
      console.error('❌ WDK başlatılırken hata oluştu:', error);
      throw error;
    }
  }

  /**
   * Wallet modüllerini kaydeder
   */
  registerWalletModules() {
    try {
      // Ethereum/EVM blockchain'leri için
      this.wdk.registerWallet('ethereum', WalletManagerEvm, {
        network: 'mainnet' // veya 'sepolia', 'goerli' gibi testnet'ler
      });

      // Bitcoin için
      this.wdk.registerWallet('bitcoin', WalletManagerBtc, {
        network: 'mainnet' // veya 'testnet'
      });

      // TRON için
      this.wdk.registerWallet('tron', WalletManagerTron, {
        network: 'mainnet' // veya 'shasta' (testnet)
      });

      console.log('✅ Wallet modülleri kaydedildi: Ethereum, Bitcoin, TRON');
    } catch (error) {
      console.error('❌ Wallet modülleri kaydedilirken hata oluştu:', error);
      throw error;
    }
  }

  /**
   * Belirli bir blockchain için hesap oluşturur
   * @param {string} blockchain - Blockchain adı (ethereum, bitcoin, tron)
   * @param {number} index - Hesap index'i (varsayılan: 0)
   */
  async createAccount(blockchain, index = 0) {
    try {
      if (!this.wdk) {
        throw new Error('WDK henüz başlatılmadı. Önce initialize() metodunu çağırın.');
      }

      console.log(`\n📱 ${blockchain.toUpperCase()} hesabı oluşturuluyor (index: ${index})...`);

      // Hesap oluştur
      const account = await this.wdk.getAccount(blockchain, index);
      
      // Hesabı kaydet
      const key = `${blockchain}-${index}`;
      this.accounts.set(key, account);

      // Hesap adresini al
      const address = await account.getAddress();
      
      console.log(`✅ ${blockchain.toUpperCase()} hesabı başarıyla oluşturuldu!`);
      console.log(`📍 Adres: ${address}`);

      return account;
    } catch (error) {
      console.error(`❌ ${blockchain} hesabı oluşturulurken hata oluştu:`, error);
      throw error;
    }
  }

  /**
   * Hesap bakiyesini sorgular
   * @param {string} blockchain - Blockchain adı
   * @param {number} index - Hesap index'i (varsayılan: 0)
   */
  async getBalance(blockchain, index = 0) {
    try {
      const key = `${blockchain}-${index}`;
      const account = this.accounts.get(key);
      
      if (!account) {
        // Hesap yoksa oluştur
        await this.createAccount(blockchain, index);
        return await this.getBalance(blockchain, index);
      }

      console.log(`\n💰 ${blockchain.toUpperCase()} bakiyesi sorgulanıyor...`);
      const balance = await account.getBalance();
      
      console.log(`✅ Bakiye: ${balance}`);
      return balance;
    } catch (error) {
      console.error(`❌ Bakiye sorgulanırken hata oluştu:`, error);
      throw error;
    }
  }

  /**
   * İşlem gönderir
   * @param {string} blockchain - Blockchain adı
   * @param {string} to - Alıcı adresi
   * @param {string|number} amount - Gönderilecek miktar
   * @param {number} index - Hesap index'i (varsayılan: 0)
   */
  async sendTransaction(blockchain, to, amount, index = 0) {
    try {
      const key = `${blockchain}-${index}`;
      let account = this.accounts.get(key);
      
      if (!account) {
        // Hesap yoksa oluştur
        account = await this.createAccount(blockchain, index);
      }

      console.log(`\n📤 ${blockchain.toUpperCase()} işlemi gönderiliyor...`);
      console.log(`   Alıcı: ${to}`);
      console.log(`   Miktar: ${amount}`);

      const result = await account.sendTransaction({
        to: to,
        amount: amount
      });

      console.log(`✅ İşlem başarıyla gönderildi!`);
      console.log(`   İşlem Hash: ${result.hash || result}`);
      if (result.fee) {
        console.log(`   İşlem Ücreti: ${result.fee}`);
      }
      return result;
    } catch (error) {
      console.error(`❌ İşlem gönderilirken hata oluştu:`, error);
      throw error;
    }
  }

  /**
   * Tüm hesapların bilgilerini listeler
   */
  async listAccounts() {
    console.log('\n📋 Oluşturulan Hesaplar:');
    console.log('='.repeat(50));
    
    if (this.accounts.size === 0) {
      console.log('Henüz hesap oluşturulmamış.');
      console.log('='.repeat(50));
      return;
    }

    for (const [key, account] of this.accounts.entries()) {
      try {
        const [blockchain, index] = key.split('-');
        const address = await account.getAddress();
        const balance = await account.getBalance();
        console.log(`\n${blockchain.toUpperCase()} (Index: ${index}):`);
        console.log(`  Adres: ${address}`);
        console.log(`  Bakiye: ${balance}`);
      } catch (error) {
        console.error(`  ${key} için bilgi alınamadı:`, error.message);
      }
    }
    console.log('='.repeat(50));
  }

  /**
   * Seed phrase'i doğrular
   * @param {string} seedPhrase - Doğrulanacak seed phrase
   */
  static validateSeedPhrase(seedPhrase) {
    return WDK.isValidSeed(seedPhrase);
  }
}

// Ana uygulama
async function main() {
  try {
    const wallet = new CryptoWallet();
    
    // WDK'yı başlat
    await wallet.initialize();
    
    // Örnek: Ethereum hesabı oluştur
    // await wallet.createAccount('ethereum', 0);
    
    // Örnek: Bitcoin hesabı oluştur
    // await wallet.createAccount('bitcoin', 0);
    
    // Örnek: TRON hesabı oluştur
    // await wallet.createAccount('tron', 0);
    
    // Örnek: Bakiye sorgula
    // await wallet.getBalance('ethereum', 0);
    
    // Örnek: İşlem gönder
    // await wallet.sendTransaction('ethereum', '0x...', '0.1', 0);
    
    // Tüm hesapları listele
    // await wallet.listAccounts();
    
    console.log('\n✨ Cüzdan uygulaması hazır!');
    console.log('💡 İstediğiniz blockchain için createAccount() metodunu çağırabilirsiniz.');
    console.log('💡 Örnek: await wallet.createAccount("ethereum", 0);');
    
  } catch (error) {
    console.error('❌ Uygulama hatası:', error);
    process.exit(1);
  }
}

// Uygulamayı çalıştır
main();
