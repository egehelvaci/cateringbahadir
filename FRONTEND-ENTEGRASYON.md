# 🌐 Frontend Entegrasyon Rehberi - Gemi-Yük Eşleştirme API

## 📡 API Endpoint Bilgileri

- **URL**: `POST http://localhost:3001/api/auto-match`
- **Content-Type**: `multipart/form-data`
- **CORS**: Açık (tüm origin'lere izin var)

---

## 🚀 JavaScript/TypeScript ile Kullanım

### 1. **Vanilla JavaScript**

```javascript
// HTML form element
const fileInput = document.getElementById('fileInput');
const uploadButton = document.getElementById('uploadButton');
const resultsDiv = document.getElementById('results');

uploadButton.addEventListener('click', async () => {
  const file = fileInput.files[0];
  
  if (!file) {
    alert('Lütfen bir dosya seçin');
    return;
  }

  // FormData oluştur
  const formData = new FormData();
  formData.append('file', file);
  formData.append('minMatchScore', '70');
  formData.append('maxLaycanGapDays', '3');

  try {
    // Loading göster
    resultsDiv.innerHTML = '⏳ İşleniyor...';

    // API çağrısı
    const response = await fetch('http://localhost:3001/api/auto-match', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      displayResults(result.data);
    } else {
      resultsDiv.innerHTML = `❌ Hata: ${result.message}`;
    }

  } catch (error) {
    resultsDiv.innerHTML = `💥 Bağlantı hatası: ${error.message}`;
  }
});

function displayResults(data) {
  const { summary, vessels, cargos, matches } = data;
  
  let html = `
    <h3>📊 Sonuç Özeti</h3>
    <p>📁 Dosya: ${summary.fileName}</p>
    <p>⚡ İşlem Süresi: ${summary.processingTime}</p>
    <p>🚢 Gemiler: ${summary.vesselsFound}</p>
    <p>📦 Yükler: ${summary.cargosFound}</p>
    <p>🎯 Eşleştirmeler: ${summary.totalMatches}</p>
    <hr>
  `;

  if (matches.length > 0) {
    html += '<h3>🎯 Eşleştirme Sonuçları</h3>';
    matches.forEach((match, index) => {
      html += `
        <div class="match-item" style="border: 1px solid #ddd; padding: 10px; margin: 10px 0;">
          <h4>${index + 1}. ${match.vessel.name} ↔ ${match.cargo.reference}</h4>
          <p><strong>Skor:</strong> ${match.matchScore}/100</p>
          <p><strong>Öneri:</strong> ${match.recommendation}</p>
          <p><strong>Gerekçe:</strong> ${match.reason}</p>
        </div>
      `;
    });
  } else {
    html += '<p>❌ Hiç eşleştirme bulunamadı</p>';
  }

  resultsDiv.innerHTML = html;
}
```

### 2. **React Hook ile**

```tsx
import React, { useState } from 'react';

interface MatchResult {
  vessel: { name: string; dwt: number };
  cargo: { reference: string; quantity: number };
  matchScore: number;
  recommendation: string;
  reason: string;
}

interface ApiResponse {
  success: boolean;
  message: string;
  data: {
    summary: {
      fileName: string;
      processingTime: string;
      vesselsFound: number;
      cargosFound: number;
      totalMatches: number;
    };
    matches: MatchResult[];
  };
}

const VesselCargoMatcher: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string>('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setError('Lütfen bir dosya seçin');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('minMatchScore', '70');
      formData.append('maxLaycanGapDays', '3');

      const response = await fetch('http://localhost:3001/api/auto-match', {
        method: 'POST',
        body: formData,
      });

      const result: ApiResponse = await response.json();

      if (result.success) {
        setResults(result);
      } else {
        setError(result.message);
      }

    } catch (err) {
      setError('API çağrısı başarısız: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="vessel-cargo-matcher">
      <h2>🚢 Gemi-Yük Otomatik Eşleştirme</h2>
      
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="file">Mail Export Dosyası (TXT/DOCX):</label>
          <input
            type="file"
            id="file"
            accept=".txt,.docx,.doc"
            onChange={handleFileChange}
            disabled={loading}
          />
        </div>
        
        <button type="submit" disabled={loading || !file}>
          {loading ? '⏳ İşleniyor...' : '🎯 Eşleştir'}
        </button>
      </form>

      {error && (
        <div className="error" style={{ color: 'red', margin: '10px 0' }}>
          ❌ {error}
        </div>
      )}

      {results && (
        <div className="results">
          <h3>📊 Sonuçlar</h3>
          <div className="summary">
            <p>📁 <strong>Dosya:</strong> {results.data.summary.fileName}</p>
            <p>⚡ <strong>İşlem Süresi:</strong> {results.data.summary.processingTime}</p>
            <p>🚢 <strong>Gemiler:</strong> {results.data.summary.vesselsFound}</p>
            <p>📦 <strong>Yükler:</strong> {results.data.summary.cargosFound}</p>
            <p>🎯 <strong>Eşleştirmeler:</strong> {results.data.summary.totalMatches}</p>
          </div>

          {results.data.matches.length > 0 ? (
            <div className="matches">
              <h4>🎯 Eşleştirme Sonuçları</h4>
              {results.data.matches.map((match, index) => (
                <div key={index} className="match-card" style={{
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '15px',
                  margin: '10px 0',
                  backgroundColor: match.matchScore >= 80 ? '#e8f5e8' : '#f9f9f9'
                }}>
                  <h5>{match.vessel.name} ↔ {match.cargo.reference}</h5>
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <span className="score" style={{
                      fontSize: '1.2em',
                      fontWeight: 'bold',
                      color: match.matchScore >= 80 ? '#28a745' : '#ffc107'
                    }}>
                      {match.matchScore}/100
                    </span>
                    <span className="recommendation">
                      {match.recommendation}
                    </span>
                  </div>
                  <p><small>{match.reason}</small></p>
                </div>
              ))}
            </div>
          ) : (
            <p>❌ Hiç eşleştirme bulunamadı</p>
          )}
        </div>
      )}
    </div>
  );
};

export default VesselCargoMatcher;
```

### 3. **Vue.js ile**

```vue
<template>
  <div class="vessel-cargo-matcher">
    <h2>🚢 Gemi-Yük Otomatik Eşleştirme</h2>
    
    <form @submit.prevent="handleSubmit">
      <div>
        <label for="file">Mail Export Dosyası:</label>
        <input
          type="file"
          id="file"
          accept=".txt,.docx,.doc"
          @change="handleFileChange"
          :disabled="loading"
        />
      </div>
      
      <button type="submit" :disabled="loading || !file">
        {{ loading ? '⏳ İşleniyor...' : '🎯 Eşleştir' }}
      </button>
    </form>

    <div v-if="error" class="error">
      ❌ {{ error }}
    </div>

    <div v-if="results" class="results">
      <h3>📊 Sonuçlar</h3>
      <div class="summary">
        <p>📁 <strong>Dosya:</strong> {{ results.data.summary.fileName }}</p>
        <p>⚡ <strong>İşlem Süresi:</strong> {{ results.data.summary.processingTime }}</p>
        <p>🚢 <strong>Gemiler:</strong> {{ results.data.summary.vesselsFound }}</p>
        <p>📦 <strong>Yükler:</strong> {{ results.data.summary.cargosFound }}</p>
        <p>🎯 <strong>Eşleştirmeler:</strong> {{ results.data.summary.totalMatches }}</p>
      </div>

      <div v-if="results.data.matches.length > 0" class="matches">
        <h4>🎯 Eşleştirme Sonuçları</h4>
        <div
          v-for="(match, index) in results.data.matches"
          :key="index"
          class="match-card"
          :class="{ 'high-score': match.matchScore >= 80 }"
        >
          <h5>{{ match.vessel.name }} ↔ {{ match.cargo.reference }}</h5>
          <div class="match-info">
            <span class="score">{{ match.matchScore }}/100</span>
            <span class="recommendation">{{ match.recommendation }}</span>
          </div>
          <p><small>{{ match.reason }}</small></p>
        </div>
      </div>
      <p v-else>❌ Hiç eşleştirme bulunamadı</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const file = ref<File | null>(null);
const loading = ref(false);
const results = ref(null);
const error = ref('');

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  const selectedFile = target.files?.[0];
  if (selectedFile) {
    file.value = selectedFile;
    error.value = '';
  }
};

const handleSubmit = async () => {
  if (!file.value) {
    error.value = 'Lütfen bir dosya seçin';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    const formData = new FormData();
    formData.append('file', file.value);
    formData.append('minMatchScore', '70');
    formData.append('maxLaycanGapDays', '3');

    const response = await fetch('http://localhost:3001/api/auto-match', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (result.success) {
      results.value = result;
    } else {
      error.value = result.message;
    }

  } catch (err) {
    error.value = 'API çağrısı başarısız: ' + (err as Error).message;
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.match-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 15px;
  margin: 10px 0;
  background-color: #f9f9f9;
}

.match-card.high-score {
  background-color: #e8f5e8;
  border-color: #28a745;
}

.match-info {
  display: flex;
  gap: 20px;
  align-items: center;
  margin: 10px 0;
}

.score {
  font-size: 1.2em;
  font-weight: bold;
  color: #28a745;
}

.error {
  color: red;
  margin: 10px 0;
}
</style>
```

### 4. **Next.js App Router ile**

```tsx
'use client';

import { useState } from 'react';

export default function VesselCargoMatcherPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setError('Lütfen bir dosya seçin');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('minMatchScore', '70');

      const response = await fetch('/api/vessel-cargo/auto-match', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setResults(result.data);
      } else {
        setError(result.message);
      }

    } catch (err) {
      setError('API çağrısı başarısız');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">🚢 Gemi-Yük Eşleştirme</h1>
      
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Mail Export Dosyası (TXT/DOCX):
          </label>
          <input
            type="file"
            accept=".txt,.docx,.doc"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            disabled={loading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>
        
        <button
          type="submit"
          disabled={loading || !file}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          {loading ? '⏳ İşleniyor...' : '🎯 Eşleştir'}
        </button>
      </form>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          ❌ {error}
        </div>
      )}

      {results && (
        <div className="results">
          <div className="bg-gray-100 p-4 rounded mb-4">
            <h3 className="text-xl font-semibold mb-2">📊 Özet</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>📁 {results.summary.fileName}</div>
              <div>⚡ {results.summary.processingTime}</div>
              <div>🚢 {results.summary.vesselsFound} gemi</div>
              <div>📦 {results.summary.cargosFound} yük</div>
              <div>🎯 {results.summary.totalMatches} eşleşme</div>
            </div>
          </div>

          {results.matches.length > 0 ? (
            <div>
              <h3 className="text-xl font-semibold mb-4">🎯 Eşleştirmeler</h3>
              <div className="space-y-4">
                {results.matches.map((match: MatchResult, index: number) => (
                  <div
                    key={index}
                    className={`border rounded-lg p-4 ${
                      match.matchScore >= 80 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <h4 className="font-semibold text-lg mb-2">
                      {match.vessel.name} ↔ {match.cargo.reference}
                    </h4>
                    <div className="flex items-center gap-4 mb-2">
                      <span className={`text-lg font-bold ${
                        match.matchScore >= 80 ? 'text-green-600' : 'text-yellow-600'
                      }`}>
                        {match.matchScore}/100
                      </span>
                      <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {match.recommendation}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{match.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              ❌ Hiç eşleştirme bulunamadı
            </div>
          )}
        </div>
      )}
    </div>
  );
};
```

### 5. **Axios ile (Alternative)**

```javascript
import axios from 'axios';

const uploadFile = async (file, options = {}) => {
  const formData = new FormData();
  formData.append('file', file);
  
  // Opsiyonel parametreler
  Object.entries(options).forEach(([key, value]) => {
    formData.append(key, value);
  });

  try {
    const response = await axios.post(
      'http://localhost:3001/api/auto-match',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000, // 30 saniye timeout
      }
    );

    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(error.response.data.message || 'API hatası');
    } else if (error.request) {
      throw new Error('Server\'a ulaşılamıyor');
    } else {
      throw new Error('İstek oluşturulurken hata');
    }
  }
};

// Kullanım örneği
const handleFileUpload = async (file) => {
  try {
    const result = await uploadFile(file, {
      minMatchScore: 70,
      maxLaycanGapDays: 3
    });
    
    console.log('Eşleştirme sonuçları:', result.data.matches);
  } catch (error) {
    console.error('Hata:', error.message);
  }
};
```

---

## 🎨 CSS Stilleri

```css
/* Genel stiller */
.vessel-cargo-matcher {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

/* Dosya input stili */
.file-input {
  display: block;
  width: 100%;
  padding: 10px;
  border: 2px dashed #ccc;
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.3s;
}

.file-input:hover {
  border-color: #007bff;
}

/* Button stili */
.submit-button {
  background: linear-gradient(135deg, #007bff, #0056b3);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
  transition: transform 0.2s;
}

.submit-button:hover {
  transform: translateY(-2px);
}

.submit-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

/* Sonuç kartları */
.match-card {
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  padding: 20px;
  margin: 15px 0;
  background: white;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.match-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}

.match-card.high-score {
  background: linear-gradient(135deg, #e8f5e8, #f0f8f0);
  border-color: #28a745;
}

.score-badge {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 20px;
  font-weight: bold;
  font-size: 1.1em;
}

.score-high { background: #28a745; color: white; }
.score-medium { background: #ffc107; color: #333; }
.score-low { background: #6c757d; color: white; }

/* Loading spinner */
.loading {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```

---

## 🔧 Özelleştirme Parametreleri

```javascript
// API çağrısında kullanabileceğiniz parametreler
const formData = new FormData();
formData.append('file', file);

// Eşleştirme kriterleri
formData.append('minMatchScore', '70');        // Min skor (0-100)
formData.append('maxLaycanGapDays', '3');      // Max laycan farkı (gün)
formData.append('maxDistanceDays', '2.0');     // Max seyir süresi (gün)
formData.append('maxOversizeRatio', '0.35');   // Max gemi büyüklük oranı
formData.append('routeFactor', '1.20');        // Rota faktörü
```

---

## ⚠️ Önemli Notlar

1. **CORS**: API tüm origin'lere açık
2. **Dosya Boyutu**: Maksimum 50MB
3. **Timeout**: 30 saniye önerilir
4. **Error Handling**: Her zaman try-catch kullanın
5. **File Validation**: Frontend'de de dosya tipini kontrol edin

---

## 🧪 Test için cURL

```bash
# Basit test
curl -X POST http://localhost:3001/api/auto-match \
  -F "file=@mail-export.txt" \
  -F "minMatchScore=70"

# Detaylı test
curl -X POST http://localhost:3001/api/auto-match \
  -F "file=@real-mail-export.txt" \
  -F "minMatchScore=60" \
  -F "maxLaycanGapDays=5" \
  -F "maxDistanceDays=3.0"
```

Bu şekilde frontend'inizde kolayca entegre edebilirsiniz! 🚀
