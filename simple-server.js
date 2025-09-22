const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001; // Farklı port kullan

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

app.use(express.json());

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = path.extname(file.originalname);
    cb(null, `mail-${timestamp}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.txt', '.docx', '.doc'];
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(extension)) {
      cb(null, true);
    } else {
      cb(new Error('Sadece TXT, DOC ve DOCX dosyaları desteklenir'));
    }
  }
});

// Basit mail parser
function parseMailContent(content) {
  const vessels = [];
  const cargos = [];

  // Gemi pattern'leri
  const vesselNameMatch = content.match(/M[\/.]?V\s+([A-Z\s\d]+)/i);
  const dwtMatch = content.match(/(\d{1,3}[,.]?\d{3})\s*(?:MT|DWT)/i);
  const openPortMatch = content.match(/OPEN[:\s]+([A-Z\s]+)/i);
  const laycanMatch = content.match(/(\d{1,2}[-\/]\d{1,2})\s*[-\/]\s*(\d{1,2}[-\/]\d{1,2})/i);
  const grainMatch = content.match(/GRAIN[:\s]+(\d{1,3}[,.]?\d{3})\s*CUFT/i);
  const speedMatch = content.match(/(\d{1,2}(?:\.\d)?)\s*KNOTS/i);

  if (vesselNameMatch) {
    const vessel = {
      name: vesselNameMatch[1].trim(),
      dwt: dwtMatch ? parseFloat(dwtMatch[1].replace(/[,]/g, '')) : 0,
      currentPort: openPortMatch ? openPortMatch[1].trim() : null,
      laycanStart: laycanMatch ? laycanMatch[1] : null,
      laycanEnd: laycanMatch ? laycanMatch[2] : null,
      grainCuft: grainMatch ? parseFloat(grainMatch[1].replace(/[,]/g, '')) : null,
      speedKnots: speedMatch ? parseFloat(speedMatch[1]) : 12,
      features: content.toLowerCase().includes('geared') ? ['geared'] : []
    };
    vessels.push(vessel);
  }

  // Yük pattern'leri
  const cargoMatch = content.match(/(\d{1,3}[,.]?\d{3})\s*MT\s+([A-Z]+)/i);
  const loadPortMatch = content.match(/(?:EX|FROM)[:\s]+([A-Z\s]+)/i);
  const sfMatch = content.match(/SF[:\s]+(\d+)\s*CUFT\/MT/i);

  if (cargoMatch) {
    const cargo = {
      reference: `${cargoMatch[1]} MT ${cargoMatch[2]}`,
      quantity: parseFloat(cargoMatch[1].replace(/[,]/g, '')),
      loadPort: loadPortMatch ? loadPortMatch[1].trim() : null,
      laycanStart: laycanMatch ? laycanMatch[1] : null,
      laycanEnd: laycanMatch ? laycanMatch[2] : null,
      stowageFactorValue: sfMatch ? parseFloat(sfMatch[1]) : null,
      requirements: content.toLowerCase().includes('geared') ? ['geared'] : []
    };
    cargos.push(cargo);
  }

  return { vessels, cargos };
}

// Basit eşleştirme algoritması
function matchVesselsCargos(vessels, cargos) {
  const matches = [];

  for (const vessel of vessels) {
    for (const cargo of cargos) {
      let score = 0;
      const reasons = [];

      // Tonaj kontrolü
      if (cargo.quantity <= vessel.dwt) {
        const utilization = (cargo.quantity / vessel.dwt) * 100;
        if (utilization >= 65) {
          score += 30;
          reasons.push(`Tonaj uyumu: ${utilization.toFixed(1)}%`);
        }
      }

      // Liman uyumu (basit kontrol)
      if (vessel.currentPort && cargo.loadPort) {
        if (vessel.currentPort.toLowerCase().includes(cargo.loadPort.toLowerCase()) ||
            cargo.loadPort.toLowerCase().includes(vessel.currentPort.toLowerCase())) {
          score += 25;
          reasons.push('Liman uyumu');
        }
      }

      // Laycan uyumu (basit kontrol)
      if (vessel.laycanStart && cargo.laycanStart) {
        score += 20;
        reasons.push('Laycan mevcut');
      }

      // Gereksinimler
      if (cargo.requirements.length === 0 || 
          cargo.requirements.every(req => vessel.features.includes(req))) {
        score += 15;
        reasons.push('Gereksinimler uygun');
      }

      // SF kontrolü
      if (cargo.stowageFactorValue && vessel.grainCuft) {
        const neededCuft = cargo.quantity * cargo.stowageFactorValue * 1.05;
        if (neededCuft <= vessel.grainCuft) {
          score += 10;
          reasons.push('Hacim uyumu');
        }
      }

      if (score >= 60) {
        matches.push({
          vessel: vessel,
          cargo: cargo,
          matchScore: score,
          recommendation: score >= 90 ? 'Mükemmel Eşleşme' :
                         score >= 80 ? 'Çok İyi Eşleşme' :
                         score >= 70 ? 'İyi Eşleşme' : 'Kabul Edilebilir',
          reason: reasons.join('; ')
        });
      }
    }
  }

  return matches.sort((a, b) => b.matchScore - a.matchScore);
}

// API Endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/auto-match/test', (req, res) => {
  res.json({
    success: true,
    message: 'Basit Gemi-Yük Eşleştirme API hazır',
    usage: 'POST /api/auto-match ile TXT dosyası yükleyebilirsiniz'
  });
});

app.post('/api/auto-match', upload.single('file'), (req, res) => {
  const startTime = Date.now();
  let uploadedFilePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Dosya yüklenmedi'
      });
    }

    uploadedFilePath = req.file.path;
    console.log(`📁 Dosya işleniyor: ${req.file.originalname}`);

    // Dosyayı oku
    const content = fs.readFileSync(uploadedFilePath, 'utf8');

    // Parse et
    const { vessels, cargos } = parseMailContent(content);
    console.log(`🚢 ${vessels.length} gemi, 📦 ${cargos.length} yük bulundu`);

    // Eşleştir
    const matches = matchVesselsCargos(vessels, cargos);
    console.log(`🎯 ${matches.length} eşleşme bulundu`);

    const processingTime = Date.now() - startTime;

    res.json({
      success: true,
      message: `${matches.length} eşleşme bulundu`,
      data: {
        summary: {
          fileName: req.file.originalname,
          processingTime: `${processingTime}ms`,
          vesselsFound: vessels.length,
          cargosFound: cargos.length,
          totalMatches: matches.length
        },
        vessels: vessels,
        cargos: cargos,
        matches: matches,
        recommendations: {
          bestMatches: matches.slice(0, 3).map(m => ({
            vessel: m.vessel.name,
            cargo: m.cargo.reference,
            score: m.matchScore,
            reason: m.reason
          }))
        }
      }
    });

  } catch (error) {
    console.error('❌ Hata:', error.message);
    res.status(500).json({
      success: false,
      message: 'İşlem hatası',
      error: error.message
    });
  } finally {
    // Geçici dosyayı temizle
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      try {
        fs.unlinkSync(uploadedFilePath);
        console.log('🗑️ Geçici dosya temizlendi');
      } catch (cleanupError) {
        console.error('Temizleme hatası:', cleanupError.message);
      }
    }
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Basit API Server çalışıyor: http://localhost:${PORT}`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/auto-match/test`);
  console.log(`📤 Ana endpoint: POST http://localhost:${PORT}/api/auto-match`);
});
