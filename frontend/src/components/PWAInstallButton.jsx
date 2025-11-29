import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone, CheckCircle2 } from 'lucide-react';
import styles from './PWAInstallButton.module.css';

export default function PWAInstallButton() {
  const [canInstall, setCanInstall] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Listen for install availability
    const handleInstallAvailable = () => {
      setCanInstall(true);
      // Show prompt after 30 seconds if user hasn't seen it
      const hasSeenPrompt = localStorage.getItem('pwa-prompt-seen');
      if (!hasSeenPrompt) {
        setTimeout(() => setShowPrompt(true), 30000);
      }
    };

    if (window.pwaInstallPrompt) {
      handleInstallAvailable();
    }

    window.addEventListener('pwa-install-available', handleInstallAvailable);

    return () => {
      window.removeEventListener('pwa-install-available', handleInstallAvailable);
    };
  }, []);

  const handleInstall = async () => {
    if (!window.pwaInstallPrompt) return;

    setIsInstalling(true);
    
    try {
      const result = await window.pwaInstallPrompt.prompt();
      console.log('Install prompt result:', result);
      
      if (result.outcome === 'accepted') {
        setIsInstalled(true);
        setCanInstall(false);
        setShowPrompt(false);
      }
    } catch (err) {
      console.error('Install error:', err);
    } finally {
      setIsInstalling(false);
    }
  };

  const dismissPrompt = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-prompt-seen', 'true');
  };

  // Already installed - show nothing
  if (isInstalled) return null;

  // Can't install - show nothing
  if (!canInstall) return null;

  return (
    <>
      {/* Floating install button */}
      <motion.button
        className={styles.floatingBtn}
        onClick={() => setShowPrompt(true)}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        title="Uygulamayı Yükle"
      >
        <Download size={20} />
      </motion.button>

      {/* Install prompt modal */}
      <AnimatePresence>
        {showPrompt && (
          <>
            <motion.div
              className={styles.overlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={dismissPrompt}
            />
            <motion.div
              className={styles.promptCard}
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.9 }}
            >
              <button className={styles.closeBtn} onClick={dismissPrompt}>
                <X size={20} />
              </button>

              <div className={styles.iconWrapper}>
                <Smartphone size={48} />
              </div>

              <h3>WDK Wallet'ı Yükle</h3>
              <p>
                Uygulamayı ana ekranınıza ekleyerek daha hızlı erişim ve çevrimdışı kullanım imkanı elde edin.
              </p>

              <ul className={styles.benefits}>
                <li>
                  <CheckCircle2 size={16} />
                  <span>Hızlı başlatma</span>
                </li>
                <li>
                  <CheckCircle2 size={16} />
                  <span>Çevrimdışı erişim</span>
                </li>
                <li>
                  <CheckCircle2 size={16} />
                  <span>Push bildirimleri</span>
                </li>
                <li>
                  <CheckCircle2 size={16} />
                  <span>Tam ekran deneyimi</span>
                </li>
              </ul>

              <div className={styles.actions}>
                <motion.button
                  className={styles.installBtn}
                  onClick={handleInstall}
                  disabled={isInstalling}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isInstalling ? (
                    <>
                      <div className={styles.spinner} />
                      <span>Yükleniyor...</span>
                    </>
                  ) : (
                    <>
                      <Download size={18} />
                      <span>Şimdi Yükle</span>
                    </>
                  )}
                </motion.button>
                
                <button className={styles.laterBtn} onClick={dismissPrompt}>
                  Daha Sonra
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

