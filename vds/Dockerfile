FROM node:18-alpine

WORKDIR /app

# Package files kopyala
COPY package*.json ./

# Dependencies kur
RUN npm ci --only=production

# Uygulama dosyalarını kopyala
COPY . .

# Port expose et
EXPOSE 3001

# Uygulama başlat
CMD ["npm", "start"] 