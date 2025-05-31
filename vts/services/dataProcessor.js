// Veri İşleme ve Hesaplama Servisi
const config = require('../config');
const formatter = require('../utils/formatter');
const logger = require('../utils/logger');

class DataProcessor {

  // NosyAPI'dan gelen ham veriyi işleyip KurGözlem formatına çevir
  processRawData(rawRates) {
    try {
      logger.info('Ham veri işleme başlatıldı');

      // Ham veriden temel kurları çıkar
      const baseRates = this.extractBaseRates(rawRates);
      
      // Hesaplanmış kurları üret
      const calculatedRates = this.calculateDerivedRates(baseRates);
      
      // Formatlanmış son veriyi oluştur
      const processedData = this.formatFinalData(baseRates, calculatedRates);

      logger.info('Veri işleme tamamlandı', { 
        processedCount: Object.keys(processedData).length 
      });

      return processedData;

    } catch (error) {
      logger.error('Veri işleme hatası:', error);
      throw error;
    }
  }

  // NosyAPI'dan temel kurları çıkar
  extractBaseRates(rawRates) {
    const rates = {};

    // 22 Ayar Gram
    if (rawRates['22AYAR']) {
      rates.gram_22 = rawRates['22AYAR'].sell * config.calculations.gram22Multiplier; // Satış fiyatı + çarpan
    }

    // 24 Ayar Gram (Gram Altın)
    if (rawRates['gramaltin']) {
      rates.gram_24 = rawRates['gramaltin'].sell;
    }

    // ONS (API'da 'onstry' diye geliyor ama aslında ONS/USD değeri)
    if (rawRates['onstry']) {
      // Direkt kullan - zaten USD cinsinden geliyor
      rates.ons_usd = rawRates['onstry'].sell;
    }

    // USD/TRY
    if (rawRates['USDTRY']) {
      rates.usd_try = rawRates['USDTRY'].sell;
    }

    // EUR/TRY
    if (rawRates['EURTRY']) {
      rates.eur_try = rawRates['EURTRY'].sell;
    }

    // EUR/USD
    if (rawRates['EURUSD']) {
      rates.eur_usd = rawRates['EURUSD'].sell;
    }

    // HAS Altın
    if (rawRates['altintry']) {
      rates.has_altin = rawRates['altintry'].sell;
    }

    logger.debug('Temel kurlar çıkarıldı', rates);
    return rates;
  }

  // Hesaplanmış kurları üret
  calculateDerivedRates(baseRates) {
    const calculated = {};

    try {
      // Çeyrek Altın = 22 Ayar * 1.77090092338
      if (baseRates.gram_22) {
        calculated.ceyrek_altin = baseRates.gram_22 * config.calculations.ceyrekMultiplier;
      }

      // Yarım Altın = Çeyrek * 2
      if (calculated.ceyrek_altin) {
        calculated.yarim_altin = calculated.ceyrek_altin * 2;
      }

      // Tam Altın = Yarım * 2
      if (calculated.yarim_altin) {
        calculated.tam_altin = calculated.yarim_altin * 2;
      }

      // Cumhuriyet Altın = Tam * 1.02941072875
      if (calculated.tam_altin) {
        calculated.cumhuriyet_altin = calculated.tam_altin * config.calculations.cumhuriyetMultiplier;
      }

      logger.debug('Hesaplanmış kurlar oluşturuldu', calculated);
      return calculated;

    } catch (error) {
      logger.error('Kur hesaplama hatası:', error);
      throw error;
    }
  }

  // Final formatlanmış veriyi oluştur
  formatFinalData(baseRates, calculatedRates) {
    const finalData = {
      timestamp: new Date().toISOString(),
      lastUpdate: new Date().toLocaleString('tr-TR'),
      
      // Altın Tablosu Verileri
      goldPrices: {},
      
      // Döviz Şeridi Verileri  
      exchangeRates: {}
    };

    try {
      // ALTIN FİYATLARI
      
      // 22 Ayar Gram
      if (baseRates.gram_22) {
        finalData.goldPrices.gram_22 = {
          value: baseRates.gram_22,
          formatted: formatter.formatGoldPrice(baseRates.gram_22),
          title: '22 Ayar Altın'
        };
      }

      // 24 Ayar Gram
      if (baseRates.gram_24) {
        finalData.goldPrices.gram_24 = {
          value: baseRates.gram_24,
          formatted: formatter.formatGoldPrice(baseRates.gram_24),
          title: '24 Ayar Altın'
        };
      }

      // Çeyrek Altın
      if (calculatedRates.ceyrek_altin) {
        finalData.goldPrices.ceyrek_altin = {
          value: calculatedRates.ceyrek_altin,
          formatted: formatter.formatGoldPrice(calculatedRates.ceyrek_altin),
          title: 'Çeyrek Altın'
        };
      }

      // Yarım Altın
      if (calculatedRates.yarim_altin) {
        finalData.goldPrices.yarim_altin = {
          value: calculatedRates.yarim_altin,
          formatted: formatter.formatGoldPrice(calculatedRates.yarim_altin),
          title: 'Yarım Altın'
        };
      }

      // Tam Altın
      if (calculatedRates.tam_altin) {
        finalData.goldPrices.tam_altin = {
          value: calculatedRates.tam_altin,
          formatted: formatter.formatGoldPrice(calculatedRates.tam_altin),
          title: 'Tam Altın'
        };
      }

      // Cumhuriyet Altın
      if (calculatedRates.cumhuriyet_altin) {
        finalData.goldPrices.cumhuriyet_altin = {
          value: calculatedRates.cumhuriyet_altin,
          formatted: formatter.formatGoldPrice(calculatedRates.cumhuriyet_altin),
          title: 'Cumhuriyet Altını'
        };
      }

      // DÖVİZ KURLARI

      // ONS/USD
      if (baseRates.ons_usd) {
        finalData.exchangeRates.ons_usd = {
          value: baseRates.ons_usd,
          formatted: formatter.formatONS(baseRates.ons_usd),
          title: 'ONS/USD'
        };
      }

      // USD/TRY
      if (baseRates.usd_try) {
        finalData.exchangeRates.usd_try = {
          value: baseRates.usd_try,
          formatted: formatter.formatCurrencyTRY(baseRates.usd_try),
          title: 'USD'
        };
      }

      // EUR/TRY
      if (baseRates.eur_try) {
        finalData.exchangeRates.eur_try = {
          value: baseRates.eur_try,
          formatted: formatter.formatCurrencyTRY(baseRates.eur_try),
          title: 'EUR'
        };
      }

      // EUR/USD
      if (baseRates.eur_usd) {
        finalData.exchangeRates.eur_usd = {
          value: baseRates.eur_usd,
          formatted: formatter.formatParity(baseRates.eur_usd),
          title: 'EUR/USD'
        };
      }

      // HAS Altın
      if (baseRates.has_altin) {
        finalData.exchangeRates.has_altin = {
          value: baseRates.has_altin,
          formatted: formatter.formatHAS(baseRates.has_altin),
          title: 'HAS'
        };
      }

      logger.info('Final veri formatlandı', {
        goldCount: Object.keys(finalData.goldPrices).length,
        exchangeCount: Object.keys(finalData.exchangeRates).length
      });

      return finalData;

    } catch (error) {
      logger.error('Veri formatlama hatası:', error);
      throw error;
    }
  }
}

module.exports = new DataProcessor(); 