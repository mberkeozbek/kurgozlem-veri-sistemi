// VDS Cleanup Service - Süresi dolan API key'leri deaktive eder
const cron = require('node-cron');
const logger = require('../utils/logger');

class CleanupService {
  constructor() {
    this.isRunning = false;
    this.apiKeyManager = null;
  }

  // API Key Manager'ı inject et
  setApiKeyManager(apiKeyManager) {
    this.apiKeyManager = apiKeyManager;
  }

  // Cleanup servisini başlat
  start() {
    try {
      logger.info('Cleanup Service başlatılıyor...');

      // Her gün gece 02:00'da çalış
      cron.schedule('0 2 * * *', () => {
        this.performCleanup();
      });

      // Her 4 saatte bir kontrol et (ek güvenlik)
      cron.schedule('0 */4 * * *', () => {
        this.performCleanup();
      });

      // İlk başlatmada bir kez çalıştır
      setTimeout(() => {
        this.performCleanup();
      }, 5000); // 5 saniye sonra

      logger.info('Cleanup Service başlatıldı - Her gün 02:00 ve 4 saatte bir çalışacak');

    } catch (error) {
      logger.error('Cleanup Service başlatma hatası:', error);
      throw error;
    }
  }

  // Ana cleanup işlemi
  async performCleanup() {
    if (this.isRunning) {
      logger.warn('Cleanup işlemi zaten çalışıyor, atlanıyor...');
      return;
    }

    this.isRunning = true;

    try {
      logger.info('Cleanup işlemi başlatıldı');

      if (!this.apiKeyManager) {
        throw new Error('API Key Manager set edilmemiş');
      }

      // Süresi dolan API key'leri bul ve deaktive et
      const deactivatedCount = await this.deactivateExpiredKeys();

      // Cleanup istatistiklerini logla
      logger.info('Cleanup işlemi tamamlandı', {
        deactivatedCount: deactivatedCount,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Cleanup işlemi hatası:', error);
    } finally {
      this.isRunning = false;
    }
  }

  // Süresi dolan key'leri deaktive et
  async deactivateExpiredKeys() {
    try {
      let deactivatedCount = 0;
      const now = new Date();

      // Tüm API key'leri Redis'den al
      const apiKeys = await this.apiKeyManager.listApiKeys();

      for (const keyData of apiKeys) {
        // Sadece aktif key'leri kontrol et
        if (!keyData.isActive) {
          continue;
        }

        const expiryDate = new Date(keyData.subscriptionEnd);

        // Süresi dolmuş mu?
        if (now > expiryDate) {
          // Deaktive et
          const success = await this.apiKeyManager.deactivateApiKey(keyData.fullKey);
          
          if (success) {
            deactivatedCount++;
            logger.info('Süresi dolan API key deaktive edildi', {
              key: keyData.key,
              storeTitle: keyData.storeTitle,
              customerName: keyData.customerName,
              expiryDate: expiryDate.toISOString(),
              daysPastExpiry: Math.floor((now - expiryDate) / (1000 * 60 * 60 * 24))
            });
          }
        }
      }

      return deactivatedCount;

    } catch (error) {
      logger.error('Expired key deactivation hatası:', error);
      return 0;
    }
  }

  // Manuel cleanup tetikleme (admin için)
  async manualCleanup() {
    logger.info('Manuel cleanup tetiklendi');
    return await this.performCleanup();
  }

  // Cleanup istatistikleri
  async getCleanupStats() {
    try {
      const now = new Date();
      let totalKeys = 0;
      let activeKeys = 0;
      let expiredButActiveKeys = 0;
      let soonToExpireKeys = 0; // 7 gün içinde

      const apiKeys = await this.apiKeyManager.listApiKeys();

      for (const keyData of apiKeys) {
        totalKeys++;
        
        if (keyData.isActive) {
          activeKeys++;
          
          const expiryDate = new Date(keyData.subscriptionEnd);
          
          // Süresi dolmuş ama hala aktif
          if (now > expiryDate) {
            expiredButActiveKeys++;
          }
          
          // 7 gün içinde süresi dolacak
          const sevenDaysFromNow = new Date(now);
          sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
          
          if (expiryDate <= sevenDaysFromNow && expiryDate > now) {
            soonToExpireKeys++;
          }
        }
      }

      return {
        totalKeys,
        activeKeys,
        expiredButActiveKeys,
        soonToExpireKeys,
        lastCleanupCheck: new Date().toISOString(),
        cleanupRunning: this.isRunning
      };

    } catch (error) {
      logger.error('Cleanup stats hatası:', error);
      return { error: 'Stats alınamadı' };
    }
  }
}

module.exports = new CleanupService(); 