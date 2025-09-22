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

// Gelişmiş mail parser
function parseMailContent(content) {
  const vessels = [];
  const cargos = [];

  // Mail'leri ayır (MAIL 1, MAIL 2, etc.)
  const mailSections = content.split(/MAIL \d+/i).filter(section => section.trim().length > 50);
  
  // Her mail section'ını işle
  for (let mailIndex = 0; mailIndex < mailSections.length; mailIndex++) {
    const mailContent = mailSections[mailIndex];
    const lines = mailContent.split('\n');
  
    // Mail bilgilerini çıkar
    const mailInfo = extractMailInfo(mailContent, mailIndex);
    
    // Gemi parsing - çoklu pattern'ler
    const vesselPatterns = [
    // Gemi adları
    { pattern: /(?:M[\/.]?V\s+|mv\s+|VESSEL\s+)?([A-Z\s\d]+)(?:\s*-|\s*DWT|\s*twn)/i, type: 'name' },
    { pattern: /([A-Z]+)\s*(?:twn|bulk carrier|SID\/BOX)/i, type: 'name' },
    
    // DWT
    { pattern: /(\d{1,3}[,.]?\d{3})\s*(?:MT\s+)?DWT/i, type: 'dwt' },
    { pattern: /DWT[:\s]*(\d{1,3}[,.]?\d{3})/i, type: 'dwt' },
    
    // Limanlar
    { pattern: /OPEN[:\s@]+([A-Z\s]+?)(?:\s*O\/A|\s*\d|\s*$)/i, type: 'port' },
    { pattern: /open\s+@?\s*([A-Z\s]+?)(?:\s*\d|\s*$)/i, type: 'port' },
    
    // Laycan
    { pattern: /(\d{1,2}[-\/]\d{1,2})\s*[-\/]\s*(\d{1,2}[-\/]\d{1,2})/i, type: 'laycan' },
    { pattern: /(\d{1,2}[-\/]\d{1,2})\s*(?:OCT|NOV|SEP|DEC)/i, type: 'laycan_single' },
    { pattern: /O\/A\s*(\d{1,2}(?:st|nd|rd|th)?\s*(?:OCT|NOV|SEP|DEC))/i, type: 'laycan_single' },
    
    // Kapasiteler
    { pattern: /(\d{1,3}[,.]?\d{3})\s*(?:cbm|CBM|cuft|CUFT)/i, type: 'capacity' },
    { pattern: /(\d{1,6})\s*cbft/i, type: 'capacity' },
    
    // Hız
    { pattern: /(\d{1,2}(?:\.\d)?)\s*(?:knots|KNOTS|KTS)/i, type: 'speed' }
  ];

  // Yük parsing pattern'leri
  const cargoPatterns = [
    // Yük miktarları
    { pattern: /(\d{1,3}[,.]?\d{3})\s*(?:mt|mts|MT|MTS)\s*(?:\+?-?\d+%?)?\s*([a-z\s]+)/i, type: 'cargo' },
    { pattern: /(\d{1,3}[,.]?\d{3})\s*(?:ts|TS)\s*(?:\d+%\s*)?([a-z\s]+)/i, type: 'cargo' },
    
    // Rotalar
    { pattern: /([A-Z\s]+?)\s*[\/\\]\s*([A-Z\s]+?)(?:\s|$)/i, type: 'route' },
    { pattern: /(?:EX|FROM)[:\s]+([A-Z\s]+)/i, type: 'load_port' },
    
    // SF
    { pattern: /sf\s*(?:abt\s*)?(\d+(?:\.\d+)?)/i, type: 'sf' },
    { pattern: /STW\s*(\d+)/i, type: 'sf' },
    
    // Laycan
    { pattern: /(\d{1,2}[-\/]\d{1,2})\s*(?:[-\/]\s*(\d{1,2}[-\/]\d{1,2}))?/i, type: 'laycan' }
  ];

  // Her satırı analiz et
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length < 5) continue;

    let currentVessel = null;
    let currentCargo = null;

    // Gemi bilgilerini çıkar
    for (const vp of vesselPatterns) {
      const match = line.match(vp.pattern);
      if (match) {
        if (vp.type === 'name' && match[1]) {
          const name = match[1].trim();
          if (name.length > 2 && name.length < 30) {
            currentVessel = currentVessel || { name: name, features: [] };
            currentVessel.name = name;
          }
        }
        else if (vp.type === 'dwt' && match[1]) {
          const dwt = parseFloat(match[1].replace(/[,]/g, ''));
          if (dwt > 100 && dwt < 500000) {
            currentVessel = currentVessel || { features: [] };
            currentVessel.dwt = dwt;
          }
        }
        else if (vp.type === 'port' && match[1]) {
          const port = match[1].trim();
          if (port.length > 2 && port.length < 20) {
            currentVessel = currentVessel || { features: [] };
            currentVessel.currentPort = port;
          }
        }
        else if (vp.type === 'capacity' && match[1]) {
          const capacity = parseFloat(match[1].replace(/[,]/g, ''));
          currentVessel = currentVessel || { features: [] };
          currentVessel.grainCuft = capacity;
        }
        else if (vp.type === 'speed' && match[1]) {
          const speed = parseFloat(match[1]);
          currentVessel = currentVessel || { features: [] };
          currentVessel.speedKnots = speed;
        }
      }
    }

    // Yük bilgilerini çıkar
    for (const cp of cargoPatterns) {
      const match = line.match(cp.pattern);
      if (match) {
        if (cp.type === 'cargo' && match[1] && match[2]) {
          const quantity = parseFloat(match[1].replace(/[,]/g, ''));
          const commodity = match[2].trim();
          if (quantity > 100 && quantity < 500000 && commodity.length > 2) {
            currentCargo = currentCargo || {};
            currentCargo.quantity = quantity;
            currentCargo.reference = `${quantity} MT ${commodity}`;
          }
        }
        else if (cp.type === 'route' && match[1] && match[2]) {
          const from = match[1].trim();
          const to = match[2].trim();
          if (from.length > 2 && to.length > 2) {
            currentCargo = currentCargo || {};
            currentCargo.loadPort = from;
            currentCargo.dischargePort = to;
          }
        }
        else if (cp.type === 'load_port' && match[1]) {
          const port = match[1].trim();
          if (port.length > 2 && port.length < 20) {
            currentCargo = currentCargo || {};
            currentCargo.loadPort = port;
          }
        }
        else if (cp.type === 'sf' && match[1]) {
          const sf = parseFloat(match[1]);
          if (sf > 10 && sf < 200) {
            currentCargo = currentCargo || {};
            currentCargo.stowageFactorValue = sf;
          }
        }
      }
    }

    // Özellikler
    if (line.toLowerCase().includes('geared') || line.toLowerCase().includes('crane')) {
      if (currentVessel) currentVessel.features.push('geared');
      if (currentCargo) {
        currentCargo.requirements = currentCargo.requirements || [];
        if (!currentCargo.requirements.includes('geared')) {
          currentCargo.requirements.push('geared');
        }
      }
    }

    if (line.toLowerCase().includes('open hatch')) {
      if (currentVessel) currentVessel.features.push('open_hatch');
    }

    if (line.toLowerCase().includes('box')) {
      if (currentVessel) currentVessel.features.push('box');
    }

    // Geçerli gemi/yük varsa ekle
    if (currentVessel && currentVessel.name && currentVessel.dwt) {
      // Daha önce aynı gemi eklendi mi kontrol et
      const existing = vessels.find(v => v.name === currentVessel.name);
      if (!existing) {
        vessels.push({
          name: currentVessel.name,
          dwt: currentVessel.dwt || 0,
          currentPort: currentVessel.currentPort || 'Unknown',
          grainCuft: currentVessel.grainCuft || null,
          speedKnots: currentVessel.speedKnots || 12,
          features: currentVessel.features || [],
          sourceMailInfo: mailInfo
        });
      }
    }

    if (currentCargo && currentCargo.quantity && currentCargo.reference) {
      // Daha önce aynı yük eklendi mi kontrol et
      const existing = cargos.find(c => c.reference === currentCargo.reference);
      if (!existing) {
        cargos.push({
          reference: currentCargo.reference,
          quantity: currentCargo.quantity,
          loadPort: currentCargo.loadPort || 'Unknown',
          stowageFactorValue: currentCargo.stowageFactorValue || null,
          requirements: currentCargo.requirements || [],
          sourceMailInfo: mailInfo
        });
      }
    }
  }
  }

  return { vessels, cargos };
}

// Mail bilgilerini çıkarır
function extractMailInfo(mailContent, mailIndex) {
  const lines = mailContent.split('\n');
  let subject = '';
  let sender = '';
  let date = '';
  
  // Mail başlığı bilgilerini ara
  for (const line of lines) {
    if (line.includes('Gönderen:') || line.includes('From:')) {
      sender = line.replace(/.*(?:Gönderen:|From:)\s*/, '').replace(/[<>]/g, '').trim();
    }
    if (line.includes('Konu:') || line.includes('Subject:')) {
      subject = line.replace(/.*(?:Konu:|Subject:)\s*/, '').trim();
    }
    if (line.includes('Alındığı Tarih:') || line.includes('Date:')) {
      date = line.replace(/.*(?:Alındığı Tarih:|Date:)\s*/, '').trim();
    }
  }
  
  return {
    mailIndex: mailIndex + 1,
    subject: subject || `Mail ${mailIndex + 1}`,
    sender: sender || 'Bilinmeyen',
    date: date || 'Tarih yok',
    preview: mailContent.substring(0, 200).replace(/\n/g, ' ').trim() + '...'
  };
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
          matchId: `${vessel.name.replace(/\s/g, '')}-${cargo.reference.replace(/\s/g, '').substring(0, 10)}`,
          matchScore: score,
          recommendation: score >= 90 ? 'Mükemmel Eşleşme' :
                         score >= 80 ? 'Çok İyi Eşleşme' :
                         score >= 70 ? 'İyi Eşleşme' : 'Kabul Edilebilir',
          reason: reasons.join('; '),
          vessel: {
            name: vessel.name,
            dwt: vessel.dwt,
            currentPort: vessel.currentPort,
            speedKnots: vessel.speedKnots,
            features: vessel.features,
            capacity: {
              grain: vessel.grainCuft,
              bale: vessel.baleCuft
            },
            sourceMail: {
              subject: vessel.sourceMailInfo.subject,
              sender: vessel.sourceMailInfo.sender,
              date: vessel.sourceMailInfo.date,
              mailNumber: vessel.sourceMailInfo.mailIndex,
              preview: vessel.sourceMailInfo.preview
            }
          },
          cargo: {
            reference: cargo.reference,
            quantity: cargo.quantity,
            loadPort: cargo.loadPort,
            dischargePort: cargo.dischargePort || 'Belirtilmemiş',
            stowageFactor: cargo.stowageFactorValue,
            requirements: cargo.requirements,
            sourceMail: {
              subject: cargo.sourceMailInfo.subject,
              sender: cargo.sourceMailInfo.sender,
              date: cargo.sourceMailInfo.date,
              mailNumber: cargo.sourceMailInfo.mailIndex,
              preview: cargo.sourceMailInfo.preview
            }
          },
          compatibility: {
            tonnage: {
              suitable: cargo.quantity <= vessel.dwt && (cargo.quantity / vessel.dwt) >= 0.65,
              utilization: `${Math.round((cargo.quantity / vessel.dwt) * 100)}%`,
              cargoSize: `${cargo.quantity.toLocaleString()} MT`,
              vesselCapacity: `${vessel.dwt.toLocaleString()} DWT`
            },
            requirements: {
              suitable: cargo.requirements.length === 0 || cargo.requirements.every(req => vessel.features.includes(req)),
              cargoNeeds: cargo.requirements,
              vesselFeatures: vessel.features,
              missing: cargo.requirements.filter(req => !vessel.features.includes(req))
            },
            volume: cargo.stowageFactorValue && vessel.grainCuft ? {
              suitable: (cargo.quantity * cargo.stowageFactorValue * 1.05) <= vessel.grainCuft,
              utilization: `${Math.round(((cargo.quantity * cargo.stowageFactorValue * 1.05) / vessel.grainCuft) * 100)}%`,
              needed: Math.round(cargo.quantity * cargo.stowageFactorValue * 1.05),
              available: vessel.grainCuft
            } : null
          }
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
