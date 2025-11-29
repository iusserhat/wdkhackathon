/**
 * 🔐 Güvenlik Ayarları Componenti
 * 
 * Kullanıcının e-posta adresini kaydetmesi ve güvenlik
 * profilini görüntülemesi için kullanılır.
 */

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Shield, Mail, Clock, Activity, CheckCircle2, AlertCircle } from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import styles from './SecuritySettings.module.css'

const API_BASE = 'http://localhost:3001'

export default function SecuritySettings({ onClose }) {
  const { sessionId } = useWallet()
  const [email, setEmail] = useState('')
  const [isEmailSaved, setIsEmailSaved] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [profile, setProfile] = useState(null)

  // Profil bilgilerini yükle
  useEffect(() => {
    if (sessionId) {
      loadSecurityProfile()
    }
  }, [sessionId])

  const loadSecurityProfile = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/security/profile/${sessionId}`)
      const data = await response.json()
      
      if (data.success) {
        setProfile(data.profile)
        if (data.profile.email) {
          setEmail(data.profile.email)
          setIsEmailSaved(true)
        }
      }
    } catch (err) {
      console.error('Profile load error:', err)
    }
  }

  const handleSaveEmail = async () => {
    if (!email.trim()) {
      setError('Lütfen e-posta adresinizi girin')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Geçerli bir e-posta adresi girin')
      return
    }

    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`${API_BASE}/api/security/email/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, email: email.trim() })
      })

      const data = await response.json()

      if (data.success) {
        setIsEmailSaved(true)
        setSuccess('E-posta adresi kaydedildi!')
        loadSecurityProfile()
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className={styles.modal}
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.headerIcon}>
            <Shield size={24} />
          </div>
          <div>
            <h2>Güvenlik Ayarları</h2>
            <p>Davranış bazlı güvenlik sistemi</p>
          </div>
        </div>

        <div className={styles.content}>
          {/* E-posta Kayıt Bölümü */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Mail size={18} />
              <h3>E-posta Doğrulama</h3>
            </div>
            <p className={styles.sectionDesc}>
              Şüpheli işlemler için e-posta ile doğrulama kodu gönderilir.
            </p>

            <div className={styles.emailForm}>
              <input
                type="email"
                placeholder="ornek@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isEmailSaved}
                className={isEmailSaved ? styles.savedEmail : ''}
              />
              {isEmailSaved ? (
                <div className={styles.savedBadge}>
                  <CheckCircle2 size={16} />
                  <span>Kayıtlı</span>
                </div>
              ) : (
                <button onClick={handleSaveEmail} disabled={isLoading}>
                  {isLoading ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              )}
            </div>

            {error && (
              <div className={styles.error}>
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            {success && (
              <div className={styles.success}>
                <CheckCircle2 size={14} />
                {success}
              </div>
            )}
          </div>

          {/* Güvenlik Profili */}
          {profile && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <Activity size={18} />
                <h3>Davranış Profili</h3>
              </div>

              <div className={styles.profileGrid}>
                <div className={styles.profileItem}>
                  <span className={styles.profileLabel}>Toplam İşlem</span>
                  <span className={styles.profileValue}>{profile.transactionCount || 0}</span>
                </div>
                <div className={styles.profileItem}>
                  <span className={styles.profileLabel}>Bilinen Adresler</span>
                  <span className={styles.profileValue}>{profile.knownAddresses || 0}</span>
                </div>
                <div className={styles.profileItem}>
                  <span className={styles.profileLabel}>Ort. İşlem Süresi</span>
                  <span className={styles.profileValue}>
                    <Clock size={14} />
                    {profile.averageTransactionDuration || 120}s
                  </span>
                </div>
                <div className={styles.profileItem}>
                  <span className={styles.profileLabel}>Durum</span>
                  <span className={`${styles.profileValue} ${styles.statusActive}`}>
                    {profile.status === 'active' ? '● Aktif' : '○ Yeni'}
                  </span>
                </div>
              </div>

              {profile.recentTransactions?.length > 0 && (
                <div className={styles.recentTx}>
                  <h4>Son İşlemler</h4>
                  <div className={styles.txList}>
                    {profile.recentTransactions.map((tx, i) => (
                      <div key={i} className={styles.txItem}>
                        <span>{tx.amount} {tx.token}</span>
                        <span className={styles.txTo}>{tx.to}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Güvenlik Özellikleri */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Shield size={18} />
              <h3>Aktif Güvenlik Özellikleri</h3>
            </div>

            <div className={styles.featureList}>
              <div className={styles.feature}>
                <CheckCircle2 size={16} className={styles.featureIcon} />
                <span>İşlem tutarı / bakiye oranı analizi</span>
              </div>
              <div className={styles.feature}>
                <CheckCircle2 size={16} className={styles.featureIcon} />
                <span>Yeni adres ilk etkileşim tespiti</span>
              </div>
              <div className={styles.feature}>
                <CheckCircle2 size={16} className={styles.featureIcon} />
                <span>İstatistiksel anomali tespiti (z-score)</span>
              </div>
              <div className={styles.feature}>
                <CheckCircle2 size={16} className={styles.featureIcon} />
                <span>⏱️ Davranış zamanlaması analizi</span>
              </div>
              <div className={styles.feature}>
                <CheckCircle2 size={16} className={styles.featureIcon} />
                <span>📧 E-posta doğrulama (hızlı işlemlerde)</span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.closeBtn} onClick={onClose}>
            Kapat
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

