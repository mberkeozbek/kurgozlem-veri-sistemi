// Anlık Veri Saklama Sistemi - Memory tabanlı (Cache düşmanı)
const logger = require('../utils/logger');

class DataStorage {
  constructor() {
    // Tek bir veri objesi - her güncellemede tamamen değişir
    this.currentData = null;
    this.lastUpdate = null;
    this.updateCount = 0;
  }

  // VTS'den gelen veriyi sakla (önceki veri tamamen silinir)
  updateData(newData) {
    try {
      // Eski veriyi tamamen sil
      this.currentData = null;
      
      // Yeni veriyi kaydet
      this.currentData = {
        ...newData,
        vdsTimestamp: new Date().toISOString(),
        dataSource: 'VTS'
      };
      
      this.lastUpdate = new Date();
      this.updateCount++;

      logger.info('Veri güncellendi', {
        updateCount: this.updateCount,
        timestamp: this.lastUpdate.toISOString(),
        goldCount: Object.keys(this.currentData.goldPrices || {}).length,
        exchangeCount: Object.keys(this.currentData.exchangeRates || {}).length
      });

      return true;

    } catch (error) {
      logger.error('Veri güncelleme hatası:', error);
      return false;
    }
  }

  // Mevcut veriyi döndür
  getCurrentData() {
    try {
      if (!this.currentData) {
        return null;
      }

      // Veri yaşını kontrol et (5 dakikadan eskiyse uyar)
      const now = new Date();
      const dataAge = now - this.lastUpdate;
      const maxAge = 5 * 60 * 1000; // 5 dakika

      if (dataAge > maxAge) {
        logger.warn('Veri eskimiş olabilir', {
          dataAge: Math.round(dataAge / 1000) + ' saniye',
          lastUpdate: this.lastUpdate.toISOString()
        });
      }

      return {
        ...this.currentData,
        vdsResponseTime: new Date().toISOString(),
        dataAge: Math.round(dataAge / 1000)
      };

    } catch (error) {
      logger.error('Veri okuma hatası:', error);
      return null;
    }
  }

  // Veri durumu bilgisi
  getDataStatus() {
    try {
      return {
        hasData: !!this.currentData,
        lastUpdate: this.lastUpdate ? this.lastUpdate.toISOString() : null,
        updateCount: this.updateCount,
        dataAge: this.lastUpdate ? Math.round((new Date() - this.lastUpdate) / 1000) : null
      };

    } catch (error) {
      logger.error('Veri durumu okuma hatası:', error);
      return {
        hasData: false,
        lastUpdate: null,
        updateCount: 0,
        dataAge: null,
        error: 'Durum okunamadı'
      };
    }
  }

  // Veriyi temizle (acil durum için)
  clearData() {
    try {
      this.currentData = null;
      logger.warn('Veri temizlendi');
      return true;

    } catch (error) {
      logger.error('Veri temizleme hatası:', error);
      return false;
    }
  }
}

module.exports = new DataStorage(); 