// Veri Formatlama Utility'leri
const logger = require('./logger');

class Formatter {
  
  // Altın fiyatları için format: "X.XXX TL" (kuruş yok, binlik nokta)
  formatGoldPrice(value) {
    try {
      const roundedValue = Math.round(value);
      return new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(roundedValue) + ' TL';
    } catch (error) {
      logger.error('Altın fiyatı formatlarken hata:', error);
      return '0 TL';
    }
  }

  // Döviz kurları için format: "XX,XX TL" (2 basamak kuruş, ondalık virgül)
  formatCurrencyTRY(value) {
    try {
      return new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value) + ' TL';
    } catch (error) {
      logger.error('TL kuru formatlarken hata:', error);
      return '0,00 TL';
    }
  }

  // EUR/USD paritesi için format: "X,XXXX" (API'dan gelen hane sayısı korunur)
  formatParity(value) {
    try {
      // API'dan gelen hane sayısını tespit et
      const decimalPlaces = (value.toString().split('.')[1] || '').length;
      return new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces
      }).format(value);
    } catch (error) {
      logger.error('Parite formatlarken hata:', error);
      return '0,0000';
    }
  }

  // ONS için format: "X.XXX,XX $" (binlik nokta, kuruş virgül, $ sembolü)
  formatONS(value) {
    try {
      return new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value) + ' $';
    } catch (error) {
      logger.error('ONS formatlarken hata:', error);
      return '0,00 $';
    }
  }

  // HAS Altın için format: "X.XXX,XX TL" (binlik nokta, kuruş virgül)
  formatHAS(value) {
    try {
      return new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value) + ' TL';
    } catch (error) {
      logger.error('HAS formatlarken hata:', error);
      return '0,00 TL';
    }
  }
}

module.exports = new Formatter(); 