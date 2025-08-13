# CORS Sorunu Çözümü

## 🔧 Yapılan Değişiklikler

### 1. İyileştirilmiş CORS Ayarları (`src/index.ts`)
- Development modunda tüm origin'lere izin veriliyor
- Production modunda sadece belirlenen URL'lere izin veriliyor
- Tüm gerekli HTTP method'ları destekleniyor
- Credentials desteği aktif

### 2. Pre-flight OPTIONS Handler
```javascript
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});
```

### 3. Auth Route'larına Ekstra CORS Headers
Auth route'larına özel CORS middleware eklendi.

## 🚀 Kullanım

### Development Ortamı
```bash
# .env dosyası oluşturun
NODE_ENV=development
PORT=3000

# Server'ı başlatın
npm start
```

Development modunda sistem otomatik olarak tüm origin'lere izin verir.

### Production Ortamı
```bash
# .env dosyasında production ayarları
NODE_ENV=production
CORS_ORIGIN="https://yourdomain.com,https://www.yourdomain.com"
```

### Frontend Tarafından Test
```javascript
// Axios ile test
const response = await axios.post('http://localhost:3000/api/auth/login', {
  email: 'egehelvaci@gmail.com',
  password: 'your-password'
}, {
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Fetch ile test
const response = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'egehelvaci@gmail.com',
    password: 'your-password'
  })
});
```

## 🔍 CORS Hatası Debug

### 1. Browser Console Kontrol
- Network sekmesinde OPTIONS ve POST request'leri görünüyor mu?
- Response headers'da `Access-Control-Allow-Origin` var mı?

### 2. Server Logs Kontrol
```bash
# Server çalışırken console'da şu mesajları görmeli:
# "CORS policy tarafından engellendi" - varsa frontend URL'ini kontrol edin
```

### 3. Common Sorunlar ve Çözümler

**Problem**: `Access to fetch at 'localhost:3000' from origin 'localhost:3001' has been blocked by CORS`
**Çözüm**: Development modunda çalıştığınızdan emin olun veya CORS_ORIGIN'e frontend URL'inizi ekleyin.

**Problem**: OPTIONS request 404 döndürüyor
**Çözüm**: ✅ Çözüldü - Global OPTIONS handler eklendi.

**Problem**: Credentials gönderilmiyor
**Çözüm**: Frontend'de `withCredentials: true` veya `credentials: 'include'` kullanın.

## 📝 Environment Variables

`.env` dosyası oluşturun:
```bash
NODE_ENV=development
PORT=3000
CORS_ORIGIN="http://localhost:3000,http://localhost:3001,http://localhost:5173"
JWT_SECRET="your-jwt-secret"
DATABASE_URL="your-database-url"
```

## 🧪 Test

Server'ı başlatıp şu curl komutu ile test edin:
```bash
curl -X OPTIONS http://localhost:3000/api/auth/login \
  -H "Origin: http://localhost:3001" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" \
  -v
```

Başarılı response:
```
< HTTP/1.1 200 OK
< Access-Control-Allow-Origin: http://localhost:3001
< Access-Control-Allow-Credentials: true
< Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
< Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With
```
