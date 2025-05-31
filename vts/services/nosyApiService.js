// NosyAPI ile iletişim servisi
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class NosyApiService {
  constructor() {
    this.baseUrl = config.nosyApi.baseUrl;
    this.apiKey = config.nosyApi.apiKey;
    this.requiredCurrencies = config.nosyApi.requiredCurrencies;
  }

  // Anlık döviz ve altın kurlarını çek
  async fetchLiveRates() {
    try {
      const url = `${this.baseUrl}/${config.nosyApi.endpoints.liveRates}?apiKey=${this.apiKey}`;
      
      logger.info('NosyAPI\'dan veri çekiliyor...', { url });
      
      const response = await axios.get(url, {
        timeout: 10000, // 10 saniye timeout
        headers: {
          'User-Agent': 'KurGozlem-VTS/1.0',
          'Accept': 'application/json'
        }
      });

      if (response.data && response.data.status === 'success') {
        logger.info('NosyAPI veri çekme başarılı', { 
          rowCount: response.data.rowCount,
          creditUsed: response.data.creditUsed
        });
        
        return this.filterRequiredCurrencies(response.data.data);
      } else {
        throw new Error(`NosyAPI hatası: ${response.data?.message || 'Bilinmeyen hata'}`);
      }

    } catch (error) {
      logger.error('NosyAPI veri çekme hatası:', error);
      throw error;
    }
  }

  // Sadece ihtiyacımız olan kurları filtrele
  filterRequiredCurrencies(allRates) {
    try {
      const filteredRates = {};
      
      for (const rate of allRates) {
        if (config.requiredCurrencies.includes(rate.currencyCode)) {
          filteredRates[rate.currencyCode] = {
            code: rate.currencyCode,
            description: rate.description,
            buy: rate.buy,
            sell: rate.sell,
            changeRate: rate.changeRate,
            dayHigh: rate.dayHigh,
            dayLow: rate.dayLow,
            prevClose: rate.prevClose,
            fetchTime: new Date().toISOString()
          };
        }
      }

      logger.info('Gerekli kurlar filtrelendi', { 
        found: Object.keys(filteredRates).length,
        required: config.requiredCurrencies.length
      });

      // Eksik kur var mı kontrol et
      const missingCurrencies = config.requiredCurrencies.filter(
        code => !filteredRates[code]
      );
      
      if (missingCurrencies.length > 0) {
        logger.warn('Eksik kurlar tespit edildi', { missing: missingCurrencies });
      }

      return filteredRates;

    } catch (error) {
      logger.error('Kur filtreleme hatası:', error);
      throw error;
    }
  }

  // API bağlantısını test et
  async testConnection() {
    try {
      const url = `${this.baseUrl}/${config.nosyApi.endpoints.ratesList}?apiKey=${this.apiKey}`;
      
      const response = await axios.get(url, {
        timeout: 5000
      });

      if (response.data && response.data.status === 'success') {
        logger.info('NosyAPI bağlantı testi başarılı');
        return true;
      } else {
        throw new Error('API yanıt hatası');
      }

    } catch (error) {
      logger.error('NosyAPI bağlantı testi başarısız:', error);
      return false;
    }
  }
}

module.exports = new NosyApiService(); 