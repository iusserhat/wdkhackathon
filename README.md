# 🛡️ WDK Crypto Wallet

**Yapay Zeka Destekli Güvenli Kripto Cüzdanı**

Tether WDK (Wallet Development Kit) altyapısı üzerine inşa edilmiş, **davranışsal güvenlik sistemi** içeren yenilikçi bir kripto cüzdan uygulaması.

## 🌐 Canlı Demo

[![Live Demo](https://img.shields.io/badge/🚀_Canlı_Demo-Netlify-00C7B7?style=for-the-badge)](https://ephemeral-buttercream-951b17.netlify.app/)

**👉 [https://ephemeral-buttercream-951b17.netlify.app/](https://ephemeral-buttercream-951b17.netlify.app/)**

---

## 📸 Ekran Görüntüleri

<p align="center">
  <img src="frontend/public/1.jpeg" width="250" alt="Cüzdan Oluşturma"/>
  <img src="frontend/public/2.jpeg" width="250" alt="Dashboard"/>
  <img src="frontend/public/3.jpeg" width="250" alt="Hesap Detayları"/>
</p>

<p align="center">
  <img src="frontend/public/4.jpeg" width="250" alt="Transfer"/>
  <img src="frontend/public/5.jpeg" width="250" alt="Güvenlik Uyarısı"/>
  <img src="frontend/public/6.jpeg" width="250" alt="E-posta Doğrulaması"/>
</p>

<p align="center">
  <img src="frontend/public/7.jpeg" width="250" alt="Risk Analizi"/>
  <img src="frontend/public/8.jpeg" width="250" alt="İşlem Onayı"/>
  <img src="frontend/public/9.jpeg" width="250" alt="Başarılı İşlem"/>
</p>

---

## ✨ Özellikler

### 🔐 Güvenlik
- **AI Destekli Davranış Analizi** - Google Gemini ile anormal aktivite tespiti
- **E-posta Doğrulaması** - Şüpheli işlemlerde 2FA
- **Sweeping Pattern Tespiti** - Fon boşaltma girişimlerini engelleme
- **Gece Saati Koruması** - Olağandışı saatlerde ekstra güvenlik

### 💼 Cüzdan
- **Çoklu Zincir Desteği** - Ethereum, Bitcoin, TRON
- **Self-Custody** - Anahtarlar tamamen kullanıcıda
- **12 Kelime Seed Phrase** - BIP39 standardı

### 📱 Kullanıcı Deneyimi
- **PWA Desteği** - Mobil uygulama gibi kullanım
- **Modern UI** - Karanlık tema, animasyonlar
- **Responsive Tasarım** - Her cihazda mükemmel görünüm

---

## 🛡️ Davranışsal Güvenlik Sistemi

Sistem kullanıcının normal davranış paternlerini öğrenir ve anormal aktiviteleri tespit eder:

| Risk Faktörü | Açıklama | Risk Seviyesi |
|--------------|----------|---------------|
| ⚡ Çok Hızlı İşlem | < 15 saniye | Kritik |
| 💰 Yüksek Miktar | > 10x ortalama | Kritik |
| 📍 Yeni Adres | İlk kez gönderim | Orta-Yüksek |
| 🌙 Gece Saati | 00:00-06:00 | Orta-Yüksek |
| 🧹 Sweeping | Hızlı fon boşaltma | Kritik |
| 🤖 Bot Şüphesi | Sıfır etkileşim | Kritik |

**Risk Skoru 50+ = E-posta doğrulaması zorunlu**

---

## 🚀 Kurulum

### Gereksinimler
- Node.js 18+
- npm veya yarn

### Backend

```bash
cd backend
npm install
cp .env.example .env
# .env dosyasını düzenle
npm start
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

**Backend (.env):**
```env
NODE_ENV=production
PORT=3001
GEMINI_API_KEY=your_gemini_api_key
EMAILJS_SERVICE_ID=your_service_id
EMAILJS_TEMPLATE_ID=your_template_id
EMAILJS_PUBLIC_KEY=your_public_key
FRONTEND_URL=https://your-frontend.netlify.app
```

**Frontend (.env):**
```env
VITE_API_URL=https://your-backend.onrender.com
VITE_EMAILJS_SERVICE_ID=your_service_id
VITE_EMAILJS_TEMPLATE_ID=your_template_id
VITE_EMAILJS_PUBLIC_KEY=your_public_key
```

---

## 🏗️ Teknik Altyapı

| Katman | Teknoloji |
|--------|-----------|
| **Frontend** | React 18, Vite, Framer Motion |
| **Backend** | Node.js, Express, SQLite |
| **AI** | Google Gemini |
| **Blockchain** | Tether WDK SDK |
| **E-posta** | EmailJS |

### Desteklenen Zincirler
- Ethereum (Sepolia Testnet)
- Bitcoin (Testnet)
- TRON (Testnet)

---

## 🔒 Güvenlik Senaryosu

### Hesap Ele Geçirildi
Saldırgan seed phrase'i ele geçirdi ve hızlıca fonları boşaltmak istiyor:

1. ⚠️ Sistem 5 saniyede yapılan işlemi tespit eder
2. ⚠️ Bilinmeyen adrese yüksek miktar transfer algılar
3. 🔴 Risk skoru: 85/100
4. 📧 E-posta doğrulaması zorunlu hale gelir
5. ❌ Saldırgan, cüzdan sahibinin e-postasına erişemez
6. ✅ Fonlar korunur!

---

## 🌐 Deploy

| Platform | Klasör | Komut |
|----------|--------|-------|
| **Render.com** | backend | `node server.js` |
| **Netlify** | frontend | `npm run build` |

---

## 📄 Lisans

MIT License

---

**🛡️ Anahtarlarınız sizde, güvenliğiniz yapay zekada.**
