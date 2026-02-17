const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'findings.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Asegurar que existe el directorio data
async function ensureDataDir() {
    const dataDir = path.join(__dirname, 'data');
    try {
        await fs.mkdir(dataDir, { recursive: true });
    } catch (err) {
        console.error('Error creating data dir:', err);
    }
}

// Leer hallazgos
async function readFindings() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

// Guardar hallazgos
async function saveFindings(findings) {
    await fs.writeFile(DATA_FILE, JSON.stringify(findings, null, 2));
}

// Configurar multer para uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public', 'uploads');
        fs.mkdir(uploadDir, { recursive: true }).then(() => {
            cb(null, uploadDir);
        });
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

// ==================== ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Listar KMLs desde GitHub
app.get('/api/kmls', async (req, res) => {
    try {
        const response = await axios.get('https://api.github.com/repos/finalquest/tokyo2026/contents/maps');
        const kmls = response.data
            .filter(file => file.type === 'file' && file.name.endsWith('.kml'))
            .map(file => ({
                name: file.name,
                url: file.download_url
            }));
        res.json(kmls);
    } catch (err) {
        console.error('Error fetching KMLs:', err.message);
        res.status(500).json({ error: 'Failed to fetch KMLs' });
    }
});

// Obtener un KML específico
app.get('/api/kml/:name', async (req, res) => {
    try {
        const name = req.params.name;
        const url = `https://raw.githubusercontent.com/finalquest/tokyo2026/master/maps/${encodeURIComponent(name)}`;
        const response = await axios.get(url);
        res.set('Content-Type', 'application/vnd.google-earth.kml+xml');
        res.send(response.data);
    } catch (err) {
        console.error('Error fetching KML:', err.message);
        res.status(404).json({ error: 'KML not found' });
    }
});

// Lookup de barcode (proxy a go-upc)
app.get('/api/lookup-barcode', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        return res.status(400).json({ error: 'Barcode code is required' });
    }
    
    try {
        const response = await axios.get(`https://go-upc.com/search?q=${encodeURIComponent(code)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        
        const name = $('h1').first().text().trim() || 
                    $('.product-name').first().text().trim() ||
                    $('[itemprop="name"]').first().text().trim();
        
        const image = $('.product-image img').first().attr('src') ||
                     $('img').first().attr('src');
        
        const description = $('meta[name="description"]').attr('content') ||
                           $('.description').first().text().trim();
        
        res.json({
            barcode: code,
            name: name || null,
            image: image || null,
            description: description || null,
            found: !!name
        });
        
    } catch (err) {
        console.error('Error looking up barcode:', err.message);
        res.status(500).json({ error: 'Failed to lookup barcode' });
    }
});

// Obtener todos los hallazgos
app.get('/api/findings', async (req, res) => {
    try {
        const findings = await readFindings();
        res.json(findings);
    } catch (err) {
        console.error('Error reading findings:', err.message);
        res.status(500).json({ error: 'Failed to read findings' });
    }
});

// Crear un hallazgo
app.post('/api/findings', upload.single('photo'), async (req, res) => {
    try {
        const { title, description, location, lat, lng, tags } = req.body;
        
        const finding = {
            id: uuidv4(),
            title,
            description,
            location,
            lat: lat ? parseFloat(lat) : null,
            lng: lng ? parseFloat(lng) : null,
            tags: tags ? tags.split(',') : [],
            photoUrl: req.file ? `/uploads/${req.file.filename}` : null,
            createdAt: new Date().toISOString()
        };
        
        const findings = await readFindings();
        findings.unshift(finding);
        await saveFindings(findings);
        
        res.status(201).json(finding);
    } catch (err) {
        console.error('Error creating finding:', err.message);
        res.status(500).json({ error: 'Failed to create finding' });
    }
});

// Eliminar un hallazgo
app.delete('/api/findings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let findings = await readFindings();
        
        const finding = findings.find(f => f.id === id);
        if (!finding) {
            return res.status(404).json({ error: 'Finding not found' });
        }
        
        // Borrar archivo de foto si existe
        if (finding.photoUrl) {
            const photoPath = path.join(__dirname, 'public', finding.photoUrl);
            try {
                await fs.unlink(photoPath);
            } catch (e) {
                console.log('Could not delete photo file:', e.message);
            }
        }
        
        findings = findings.filter(f => f.id !== id);
        await saveFindings(findings);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting finding:', err.message);
        res.status(500).json({ error: 'Failed to delete finding' });
    }
});

// Iniciar servidor
async function start() {
    await ensureDataDir();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Network access: http://${require('os').hostname()}:${PORT}`);
        console.log(`API endpoints:`);
        console.log(`  GET  /api/health`);
        console.log(`  GET  /api/kmls`);
        console.log(`  GET  /api/kml/:name`);
        console.log(`  GET  /api/lookup-barcode?code=...`);
        console.log(`  GET  /api/findings`);
        console.log(`  POST /api/findings`);
        console.log(`  DELETE /api/findings/:id`);
    });
}

start();
