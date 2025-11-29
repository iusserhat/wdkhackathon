# WDK Tether Wallet - Kripto Cüzdan Uygulaması

Bu proje, WDK (Wallet Development Kit) Tether Wallet SDK kullanılarak oluşturulmuş bir kripto cüzdan uygulamasıdır.

## Özellikler

- 🔐 Güvenli seed phrase oluşturma
- 📱 Çoklu blockchain desteği (Bitcoin, Ethereum, TRON)
- 💰 Bakiye sorgulama
- 📤 İşlem gönderme
- 🔄 Modüler yapı
- 🎯 Kolay kullanım API'si

## Kurulum

1. Bağımlılıkları yükleyin:

```bash
npm install
```

2. Uygulamayı çalıştırın:

```bash
npm start
```

Geliştirme modu için (otomatik yeniden başlatma):

```bash
npm run dev
```

## Kullanım

### Temel Kullanım

```javascript
import CryptoWallet from './index.js';

const wallet = new CryptoWallet();

// WDK'yı başlat (seed phrase otomatik oluşturulur)
await wallet.initialize();

// Ethereum hesabı oluştur
await wallet.createAccount('ethereum', 0);

// Bitcoin hesabı oluştur
await wallet.createAccount('bitcoin', 0);

// TRON hesabı oluştur
await wallet.createAccount('tron', 0);

// Bakiye sorgula
await wallet.getBalance('ethereum', 0);

// İşlem gönder
await wallet.sendTransaction('ethereum', '0x...', '0.1', 0);

// Tüm hesapları listele
await wallet.listAccounts();
```

### Mevcut Seed Phrase ile Kullanım

```javascript
import CryptoWallet from './index.js';

const wallet = new CryptoWallet();

// Mevcut seed phrase ile başlat
wallet.seedPhrase = 'your twelve word seed phrase here';
wallet.wdk = new WDK(wallet.seedPhrase);
wallet.registerWalletModules();

// Hesap oluştur
await wallet.createAccount('ethereum', 0);
```

### Seed Phrase Doğrulama

```javascript
import CryptoWallet from './index.js';

const isValid = CryptoWallet.validateSeedPhrase('your seed phrase here');
console.log(isValid); // true veya false
```

### Desteklenen Blockchain'ler

- **Ethereum (ETH)** - EVM uyumlu tüm blockchain'ler (Polygon, Arbitrum, vb.)
- **Bitcoin (BTC)** - Bitcoin mainnet ve testnet
- **TRON (TRX)** - TRON mainnet ve testnet

### Hesap Index'i

Her blockchain için birden fazla hesap oluşturabilirsiniz:

```javascript
// İlk Ethereum hesabı (index: 0)
await wallet.createAccount('ethereum', 0);

// İkinci Ethereum hesabı (index: 1)
await wallet.createAccount('ethereum', 1);

// Üçüncü Ethereum hesabı (index: 2)
await wallet.createAccount('ethereum', 2);
```

## API Referansı

### `CryptoWallet` Sınıfı

#### `async initialize()`
WDK'yı başlatır ve yeni bir seed phrase oluşturur.

#### `async createAccount(blockchain, index = 0)`
Belirtilen blockchain için yeni bir hesap oluşturur.

**Parametreler:**
- `blockchain` (string): Blockchain adı ('ethereum', 'bitcoin', 'tron')
- `index` (number): Hesap index'i (varsayılan: 0)

**Döndürür:** `Promise<IWalletAccount>`

#### `async getBalance(blockchain, index = 0)`
Hesap bakiyesini sorgular.

**Parametreler:**
- `blockchain` (string): Blockchain adı
- `index` (number): Hesap index'i (varsayılan: 0)

**Döndürür:** `Promise<string>` - Bakiye değeri

#### `async sendTransaction(blockchain, to, amount, index = 0)`
İşlem gönderir.

**Parametreler:**
- `blockchain` (string): Blockchain adı
- `to` (string): Alıcı adresi
- `amount` (string|number): Gönderilecek miktar
- `index` (number): Hesap index'i (varsayılan: 0)

**Döndürür:** `Promise<{hash: string, fee?: string}>`

#### `async listAccounts()`
Tüm oluşturulan hesapları listeler.

#### `static validateSeedPhrase(seedPhrase)`
Seed phrase'in geçerli olup olmadığını kontrol eder.

**Parametreler:**
- `seedPhrase` (string): Doğrulanacak seed phrase

**Döndürür:** `boolean`

## Güvenlik Uyarıları

⚠️ **ÖNEMLİ**: 
- Seed phrase'inizi **asla paylaşmayın**
- Seed phrase'inizi **güvenli bir yerde saklayın** (şifre yöneticisi, güvenli not defteri)
- Üretim ortamında seed phrase'i **güvenli bir şekilde yönetin**
- Seed phrase'inizi **yedekleyin** - kaybederseniz cüzdanınıza erişemezsiniz
- Testnet kullanırken bile gerçek seed phrase kullanmayın

## WDK Dokümantasyonu

Daha fazla bilgi ve gelişmiş özellikler için [WDK Resmi Dokümantasyonu](https://docs.wallet.tether.io/sdk) sayfasını ziyaret edin.

## Örnek Senaryolar

### Senaryo 1: Yeni Cüzdan Oluşturma

```javascript
const wallet = new CryptoWallet();
await wallet.initialize(); // Yeni seed phrase oluşturulur
await wallet.createAccount('ethereum', 0);
await wallet.createAccount('bitcoin', 0);
```

### Senaryo 2: Mevcut Cüzdanı Yükleme

```javascript
const wallet = new CryptoWallet();
wallet.seedPhrase = 'mevcut seed phrase buraya';
wallet.wdk = new WDK(wallet.seedPhrase);
wallet.registerWalletModules();
await wallet.createAccount('ethereum', 0);
```

### Senaryo 3: Çoklu Hesap Yönetimi

```javascript
const wallet = new CryptoWallet();
await wallet.initialize();

// Farklı blockchain'ler için hesaplar
await wallet.createAccount('ethereum', 0);
await wallet.createAccount('bitcoin', 0);
await wallet.createAccount('tron', 0);

// Aynı blockchain için birden fazla hesap
await wallet.createAccount('ethereum', 1);
await wallet.createAccount('ethereum', 2);

// Tüm hesapları listele
await wallet.listAccounts();
```

## Lisans

MIT

