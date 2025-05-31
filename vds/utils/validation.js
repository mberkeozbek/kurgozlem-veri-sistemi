// VDS Validation Utilities
const logger = require('./logger');

class ValidationUtils {
  
  // Tarih validation'ları
  validateSubscriptionDates(subscriptionStart, subscriptionEnd) {
    try {
      const now = new Date();
      const start = new Date(subscriptionStart);
      const end = new Date(subscriptionEnd);
      
      // Geçersiz tarih kontrolü
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Geçersiz tarih formatı');
      }
      
      // Bitiş tarihi bugünden önce olamaz
      if (end <= now) {
        throw new Error('Bitiş tarihi bugünden sonra olmalıdır');
      }
      
      // Bitiş tarihi başlangıçtan sonra olmalı
      if (end <= start) {
        throw new Error('Bitiş tarihi başlangıç tarihinden sonra olmalıdır');
      }
      
      // Başlangıç tarihi çok eski olamaz (1 yıldan fazla geriye)
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      
      if (start < oneYearAgo) {
        throw new Error('Başlangıç tarihi 1 yıldan daha eski olamaz');
      }
      
      // Abonelik süresi çok uzun olamaz (5 yıldan fazla)
      const fiveYearsFromStart = new Date(start);
      fiveYearsFromStart.setFullYear(fiveYearsFromStart.getFullYear() + 5);
      
      if (end > fiveYearsFromStart) {
        throw new Error('Abonelik süresi 5 yıldan uzun olamaz');
      }
      
      return { valid: true };
      
    } catch (error) {
      logger.warn('Tarih validation hatası', { error: error.message });
      return { valid: false, error: error.message };
    }
  }
  
  // Müşteri bilgileri validation
  validateCustomerData(customerData) {
    const errors = [];
    
    // Zorunlu alanlar
    if (!customerData.storeTitle || customerData.storeTitle.trim().length < 2) {
      errors.push('Mağaza adı en az 2 karakter olmalıdır');
    }
    
    if (!customerData.customerName || customerData.customerName.trim().length < 2) {
      errors.push('Müşteri adı en az 2 karakter olmalıdır');
    }
    
    // Telefon validation (Türkiye formatı)
    const phoneRegex = /^(\+90|0)?[5][0-9]{9}$/;
    if (!customerData.customerPhone || !phoneRegex.test(customerData.customerPhone.replace(/\s+/g, ''))) {
      errors.push('Geçerli bir Türkiye telefon numarası giriniz');
    }
    
    // Billing info structured validation
    if (customerData.billingInfo) {
      if (customerData.billingInfo.email && !this.validateEmail(customerData.billingInfo.email)) {
        errors.push('Geçerli bir e-posta adresi giriniz');
      }
      
      if (customerData.billingInfo.taxNumber && (customerData.billingInfo.taxNumber.length < 10 || customerData.billingInfo.taxNumber.length > 11)) {
        errors.push('Vergi/TC numarası 10-11 haneli olmalıdır');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
  
  // E-posta validation
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  // API key format validation
  validateApiKeyFormat(apiKey) {
    // UUID v4 format kontrolü
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(apiKey);
  }
  
  // Subscription quick date helpers
  getSubscriptionEndDate(duration) {
    const now = new Date();
    const endDate = new Date(now);
    
    switch (duration) {
      case '14_days':
        endDate.setDate(endDate.getDate() + 14);
        break;
      case '1_month':
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case '1_year':
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
      case '2_years':
        endDate.setFullYear(endDate.getFullYear() + 2);
        break;
      default:
        throw new Error('Geçersiz abonelik süresi');
    }
    
    return endDate;
  }
}

module.exports = new ValidationUtils(); 