# KurGözlem Production Deployment

## Servisler
- **VDS** (Veri Dağıtım Sistemi): Port 3001
- **VTS** (Veri Toplama Sistemi): Port 3002

## Deployment

### GitHub Actions (Otomatik)
```bash
git push origin main  # Otomatik deploy
```

### Manual Docker Deploy
```bash
# 1. Environment dosyalarını ayarla
cp vds/.env.example vds/.env
cp vts/.env.example vts/.env

# 2. Docker Compose ile başlat
docker-compose up -d
```

### Environment Variables
VDS ve VTS .env dosyalarını production değerleriyle doldur.
