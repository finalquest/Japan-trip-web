const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const fsSync = require('fs');
const https = require('https');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const OpenAI = require('openai');
const { parseItinerary } = require('./lib/itinerary-parser');
const { getDatabase, initDatabase, migrateFromJSON } = require('./lib/database');

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const MOONSHOT_API_KEY = process.env.MOONSHOT_API_KEY;

// Cliente OpenAI configurado para Moonshot
const moonshotClient = MOONSHOT_API_KEY ? new OpenAI({
    apiKey: MOONSHOT_API_KEY,
    baseURL: 'https://api.moonshot.ai/v1'
}) : null;

// Configuración SSL
const SSL_CERT_PATH = process.env.SSL_CERT_PATH;
const SSL_KEY_PATH = process.env.SSL_KEY_PATH;
const ENABLE_HTTP = process.env.ENABLE_HTTP === 'true';
const HAS_SSL = SSL_CERT_PATH && SSL_KEY_PATH;
const GITHUB_REPO = 'finalquest/tokyo2026';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

function setNoStore(res) {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
    });
}

function getGithubRequestConfig(req, extraConfig = {}) {
    const refreshToken = req.query.refresh || req.query._ts || Date.now().toString();

    return {
        ...extraConfig,
        headers: {
            'Accept': 'application/vnd.github+json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'X-Refresh-Token': refreshToken,
            ...(extraConfig.headers || {})
        }
    };
}

function appendRefreshToken(url, refreshToken) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}refresh=${encodeURIComponent(refreshToken)}`;
}

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Asegurar que existe el directorio data
async function ensureDataDir() {
    const dataDir = path.join(__dirname, 'data');
    try {
        await fs.mkdir(dataDir, { recursive: true });
    } catch (err) {
        console.error('Error creating data dir:', err);
    }
}

// Funciones de base de datos SQLite
function readFindings() {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM findings ORDER BY created_at DESC');
    const rows = stmt.all();
    return rows.map(row => ({
        id: row.id,
        title: row.title,
        description: row.description,
        price: row.price,
        barcode: row.barcode,
        location: row.location,
        lat: row.lat,
        lng: row.lng,
        tags: JSON.parse(row.tags || '[]'),
        photoUrl: row.photo_url,
        createdBy: row.created_by,
        userId: row.user_id,
        createdAt: row.created_at,
        locationData: JSON.parse(row.location_data || '{}')
    }));
}

function readUsers() {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM users');
    const rows = stmt.all();
    return rows.map(row => ({
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        isAdmin: row.is_admin === 1,
        createdAt: row.created_at
    }));
}

function createFinding(finding) {
    const db = getDatabase();
    const stmt = db.prepare(`
        INSERT INTO findings (id, title, description, price, barcode, location, lat, lng, tags, photo_url, created_by, user_id, created_at, location_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
        finding.id,
        finding.title,
        finding.description,
        finding.price,
        finding.barcode,
        finding.location,
        finding.lat,
        finding.lng,
        JSON.stringify(finding.tags || []),
        finding.photoUrl,
        finding.createdBy,
        finding.userId,
        finding.createdAt,
        JSON.stringify(finding.locationData || {})
    );
}

function deleteFinding(id) {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM findings WHERE id = ?');
    stmt.run(id);
}

function createUser(user) {
    const db = getDatabase();
    const stmt = db.prepare(`
        INSERT INTO users (id, username, password_hash, is_admin, created_at)
        VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(user.id, user.username, user.passwordHash, user.isAdmin ? 1 : 0, user.createdAt);
}

function deleteUser(id) {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    stmt.run(id);
}

// Crear usuario admin inicial
async function createAdminUser() {
    const db = getDatabase();
    const stmt = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?');
    const result = stmt.get(ADMIN_USER);
    
    if (result.count === 0) {
        const hashedPassword = await bcrypt.hash(ADMIN_PASS, 10);
        const admin = {
            id: uuidv4(),
            username: ADMIN_USER,
            passwordHash: hashedPassword,
            isAdmin: true,
            createdAt: new Date().toISOString()
        };
        createUser(admin);
        console.log(`Admin user '${ADMIN_USER}' created successfully`);
    }
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

// Multer para OCR (sin guardar archivo)
const uploadMemory = multer({ storage: multer.memoryStorage() });

// ==================== AUTH ROUTES ====================

// Login
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    try {
        const users = readUsers();
        const user = users.find(u => u.username === username);
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const validPassword = await bcrypt.compare(password, user.passwordHash);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { userId: user.id, username: user.username, isAdmin: user.isAdmin },
            JWT_SECRET
        );
        
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    res.json({
        userId: req.user.userId,
        username: req.user.username,
        isAdmin: req.user.isAdmin
    });
});

// ==================== USER ROUTES ====================

// Listar usuarios
app.get('/api/users', authenticateToken, (req, res) => {
    try {
        const users = readUsers();
        const safeUsers = users.map(u => ({
            id: u.id,
            username: u.username,
            isAdmin: u.isAdmin,
            createdAt: u.createdAt
        }));
        res.json(safeUsers);
    } catch (err) {
        console.error('Error reading users:', err);
        res.status(500).json({ error: 'Failed to read users' });
    }
});

// Crear usuario
app.post('/api/users', authenticateToken, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    try {
        const users = readUsers();

        if (users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: uuidv4(),
            username,
            passwordHash: hashedPassword,
            isAdmin: false,
            createdAt: new Date().toISOString()
        };

        createUser(newUser);

        res.status(201).json({
            id: newUser.id,
            username: newUser.username,
            isAdmin: newUser.isAdmin,
            createdAt: newUser.createdAt
        });
    } catch (err) {
        console.error('Error creating user:', err);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Eliminar usuario
app.delete('/api/users/:id', authenticateToken, (req, res) => {
    const { id } = req.params;

    try {
        const users = readUsers();
        const user = users.find(u => u.id === id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.isAdmin) {
            return res.status(403).json({ error: 'Cannot delete admin user' });
        }

        deleteUser(id);

        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// ==================== PROTECTED ROUTES ====================

// Health check (público)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Listar KMLs desde GitHub
app.get('/api/kmls', authenticateToken, async (req, res) => {
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
app.get('/api/kml/:name', authenticateToken, async (req, res) => {
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

// Lookup de barcode
app.get('/api/lookup-barcode', authenticateToken, async (req, res) => {
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
app.get('/api/findings', authenticateToken, (req, res) => {
    try {
        const findings = readFindings();
        res.json(findings);
    } catch (err) {
        console.error('Error reading findings:', err.message);
        res.status(500).json({ error: 'Failed to read findings' });
    }
});

// Crear un hallazgo
app.post('/api/findings', authenticateToken, upload.single('photo'), async (req, res) => {
    try {
        const { title, description, price, barcode, location, placeId, placeName, placeAddress, lat, lng, tags } = req.body;

        const finding = {
            id: uuidv4(),
            title,
            description,
            price: price || null,
            barcode: barcode || null,
            location,
            lat: lat ? parseFloat(lat) : null,
            lng: lng ? parseFloat(lng) : null,
            tags: tags ? tags.split(',') : [],
            photoUrl: req.file ? `/uploads/${req.file.filename}` : null,
            createdBy: req.user.username,
            userId: req.user.userId,
            createdAt: new Date().toISOString()
        };

        // Agregar datos estructurados de ubicación si existen
        if (placeId || placeName) {
            finding.locationData = {
                placeId: placeId || null,
                name: placeName || null,
                address: placeAddress || null,
                lat: lat ? parseFloat(lat) : null,
                lng: lng ? parseFloat(lng) : null
            };
        }
        
        createFinding(finding);
        
        res.status(201).json(finding);
    } catch (err) {
        console.error('Error creating finding:', err.message);
        res.status(500).json({ error: 'Failed to create finding' });
    }
});

// Eliminar un hallazgo
app.delete('/api/findings/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const findings = readFindings();
        
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
        
        deleteFinding(id);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting finding:', err.message);
        res.status(500).json({ error: 'Failed to delete finding' });
    }
});

// Función para formatear datos extraídos en texto legible
function formatExtractedData(data) {
    const lines = [];
    
    if (data.productName) lines.push(`📦 Producto: ${data.productName}`);
    if (data.brand) lines.push(`🏭 Marca: ${data.brand}`);
    if (data.model) lines.push(`🔢 Modelo: ${data.model}`);
    if (data.price) lines.push(`💰 Precio: ${data.price}`);
    if (data.condition) lines.push(`📋 Estado: ${data.condition}`);
    if (data.warranty) lines.push(`🛡️ Garantía: ${data.warranty}`);
    
    if (data.features && Array.isArray(data.features) && data.features.length > 0) {
        lines.push(`✨ Características:`);
        data.features.forEach(feature => lines.push(`  • ${feature}`));
    }
    
    if (data.rawTranslation && lines.length === 0) {
        lines.push(data.rawTranslation);
    }
    
    return lines.join('\n');
}

// Extraer texto de imagen usando Moonshot OCR
app.post('/api/extract-text', authenticateToken, uploadMemory.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image provided' });
        }

        if (!moonshotClient) {
            return res.status(500).json({ error: 'Moonshot API key not configured' });
        }

        // Convertir imagen a base64
        const base64Image = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;

        // Llamar a Moonshot API usando OpenAI SDK
        const completion = await moonshotClient.chat.completions.create({
            model: 'moonshot-v1-8k-vision-preview',
            messages: [
                {
                    role: 'system',
                    content: `Eres un asistente que extrae información de etiquetas de productos japonesas y la devuelve en formato JSON estructurado.
                    Analiza la imagen y extrae la información traduciendo TODO al español:
                    - productName: nombre del producto traducido al español
                    - price: precio (con símbolo ¥ si está presente)
                    - brand: marca/fabricante
                    - model: modelo/número de modelo
                    - condition: estado/condición traducido (nuevo, usado, reacondicionado, etc.)
                    - warranty: período de garantía traducido
                    - features: características principales traducidas al español (array)
                    
                    IMPORTANTE: Todos los valores deben estar en español, excepto números de modelo y precios.
                    Responde SOLO con un JSON válido, sin texto adicional.`
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`
                            }
                        },
                        {
                            type: 'text',
                            text: 'Extrae la información de esta etiqueta de producto japonés y devuélvela en formato JSON estructurado.'
                        }
                    ]
                }
            ],
            temperature: 0.3,
            max_completion_tokens: 2048,
            response_format: { type: 'json_object' }
        });

        const responseContent = completion.choices[0]?.message?.content?.trim();
        
        if (!responseContent) {
            return res.status(500).json({ error: 'No text extracted' });
        }

        // Parsear el JSON de la respuesta
        let extractedData;
        try {
            extractedData = JSON.parse(responseContent);
        } catch (parseErr) {
            console.error('Error parsing JSON response:', parseErr);
            // Si no es JSON válido, devolver el texto crudo
            extractedData = { rawTranslation: responseContent };
        }

        res.json({ 
            success: true,
            data: extractedData,
            // También devolver un texto formateado para mostrar en el textarea
            formattedText: formatExtractedData(extractedData)
        });
    } catch (err) {
        console.error('Error extracting text:', err.message);
        if (err.error) {
            console.error('Moonshot API error:', err.error);
        }
        res.status(500).json({ error: 'Failed to extract text from image', details: err.message });
    }
});

// ==================== ITINERARY VISUALIZER ROUTES ====================

// Listar todos los itinerarios disponibles desde GitHub
app.get('/api/itineraries', authenticateToken, async (req, res) => {
    try {
        setNoStore(res);
        const response = await axios.get(
            `https://api.github.com/repos/${GITHUB_REPO}/contents/itinerarios`,
            getGithubRequestConfig(req)
        );
        const itineraries = response.data
            .filter(file => file.type === 'file' && file.name.endsWith('.md'))
            .map(file => ({
                id: file.name.replace(/\.md$/, '').replace(/^itinerario-2026-primavera-/, '').toLowerCase(),
                name: file.name.replace(/\.md$/, '').replace(/^itinerario-2026-primavera-/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                file: file.name
            }));
        res.json({ itineraries });
    } catch (err) {
        console.error('Error loading itineraries from GitHub:', err.message);
        res.status(500).json({ error: 'Failed to load itineraries' });
    }
});

// Obtener un itinerario específico con sus días desde GitHub
app.get('/api/itinerary/:id', authenticateToken, async (req, res) => {
    try {
        setNoStore(res);
        const { id } = req.params;
        const refreshToken = req.query.refresh || req.query._ts || Date.now().toString();
        
        // Listar archivos para encontrar el correcto
        const listResponse = await axios.get(
            `https://api.github.com/repos/${GITHUB_REPO}/contents/itinerarios`,
            getGithubRequestConfig(req)
        );
        const file = listResponse.data.find(f => f.name.endsWith('.md') && 
            f.name.replace(/\.md$/, '').replace(/^itinerario-2026-primavera-/, '').toLowerCase() === id);
        
        if (!file) {
            return res.status(404).json({ error: 'Itinerary not found' });
        }
        
        // Descargar contenido del archivo
        const contentResponse = await axios.get(
            appendRefreshToken(file.download_url, refreshToken),
            getGithubRequestConfig(req)
        );
        const parsed = parseItinerary(contentResponse.data);
        
        res.json({
            id: id,
            name: file.name.replace(/\.md$/, '').replace(/^itinerario-2026-primavera-/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            base: parsed.base,
            dates: parsed.dates,
            days: parsed.days,
            bufferDays: parsed.bufferDays
        });
    } catch (err) {
        console.error('Error loading itinerary from GitHub:', err.message);
        res.status(500).json({ error: 'Failed to load itinerary' });
    }
});

// Obtener datos de un bloque específico (lugares y rutas) desde GitHub KML
app.get('/api/block/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    
    try {
        setNoStore(res);
        const refreshToken = req.query.refresh || req.query._ts || Date.now().toString();
        // Generar variaciones del nombre del bloque para buscar el KML
        const variations = [id];
        const parts = id.split('-');
        if (parts.length >= 2) {
            const baseNumber = parts[0];
            const nameParts = parts.slice(1);
            
            // Variaciones comunes
            variations.push(`${baseNumber}-${nameParts.join('')}`);
            
            for (let i = 1; i < nameParts.length; i++) {
                const before = nameParts.slice(0, i).join('-');
                const after = nameParts.slice(i).join('-');
                
                for (let j = 4; j < after.length - 2; j++) {
                    const variant = `${baseNumber}-${before}-${after.substring(0, j)}-${after.substring(j)}`;
                    variations.push(variant);
                }
            }
            
            for (let i = 5; i < nameParts.join('-').length - 3; i++) {
                const fullName = nameParts.join('-');
                const variant = `${baseNumber}-${fullName.substring(0, i)}-${fullName.substring(i)}`;
                variations.push(variant);
            }
        }
        
        // Buscar y parsear KML
        let kmlData = null;
        let foundVariant = null;
        
        for (const variant of [...new Set(variations)]) {
            try {
                const kmlUrl = appendRefreshToken(
                    `https://raw.githubusercontent.com/${GITHUB_REPO}/master/maps/${variant}.kml`,
                    refreshToken
                );
                const kmlResponse = await axios.get(
                    kmlUrl,
                    getGithubRequestConfig(req, { timeout: 5000 })
                );
                kmlData = kmlResponse.data;
                foundVariant = variant;
                break;
            } catch (err) {
                // Continuar con siguiente variación
            }
        }
        
        if (!kmlData) {
            return res.json({
                blockId: id,
                places: [],
                routes: []
            });
        }
        
        // Parsear KML para extraer places y routes
        const $ = cheerio.load(kmlData, { xmlMode: true });
        const places = [];
        const routes = [];
        
        // Extraer Placemarks
        $('Placemark').each((i, elem) => {
            // Buscar nombre en ExtendedData primero, luego en tag name
            const name = $(elem).find('Data[name="name"] value').text() || 
                        $(elem).find('name').text() || 
                        `Lugar ${i + 1}`;
            
            // Buscar dirección en ExtendedData
            const address = $(elem).find('Data[name="address"] value').text() || 
                           $(elem).find('description').text() || 
                           '';
            
            // VERIFICAR SI ES UN PUNTO (Lugar) - Buscar específicamente Point > coordinates
            const pointCoords = $(elem).find('Point').find('coordinates').text();
            
            if (pointCoords) {
                const coords = pointCoords.trim().split(',');
                if (coords.length >= 2) {
                    const lng = parseFloat(coords[0]);
                    const lat = parseFloat(coords[1]);
                    
                    if (!isNaN(lat) && !isNaN(lng)) {
                        // Extraer número de etiqueta del nombre (ej: "1. Itabashi Station" -> 1)
                        const orderMatch = name.match(/^(\d+)\.\s*/);
                        const labelNumber = orderMatch ? parseInt(orderMatch[1]) : (i + 1);
                        
                        places.push({
                            name: name,
                            address: address,
                            lat: lat,
                            lng: lng,
                            order: places.length + 1,  // El orden de visita es el orden en el KML
                            labelNumber: labelNumber  // El número que se muestra en el marcador
                        });
                    }
                }
            }
            
            // VERIFICAR SI ES UNA RUTA (LineString)
            const lineStringCoords = $(elem).find('LineString').find('coordinates').text();
            if (lineStringCoords && !pointCoords) {
                // Solo procesar como ruta si NO es también un punto
                const coords = lineStringCoords.trim().split(' ');
                
                // Generar polyline simple para la ruta
                const pathCoords = coords.map(coord => {
                    const parts = coord.split(',');
                    return {
                        lat: parseFloat(parts[1]),
                        lng: parseFloat(parts[0])
                    };
                }).filter(c => !isNaN(c.lat) && !isNaN(c.lng));
                
                if (pathCoords.length > 0) {
                    routes.push({
                        from: 'Inicio',
                        to: name,
                        polyline: encodePolyline(pathCoords)
                    });
                }
            }
        });
        
        res.json({
            blockId: id,
            resolvedBlockId: foundVariant || id,
            places,
            routes
        });
    } catch (err) {
        console.error(`[BLOCK] Error loading KML for "${id}":`, err.message);
        res.status(500).json({ error: 'Failed to load block data' });
    }
});

app.post('/api/repo/refresh', authenticateToken, (req, res) => {
    setNoStore(res);
    res.json({
        refreshToken: Date.now().toString(),
        refreshedAt: new Date().toISOString(),
        repo: GITHUB_REPO
    });
});

// Función para codificar polyline (formato de Google)
function encodePolyline(coords) {
    let result = '';
    let prevLat = 0;
    let prevLng = 0;
    
    for (const coord of coords) {
        const lat = Math.round(coord.lat * 1e5);
        const lng = Math.round(coord.lng * 1e5);
        
        result += encodeNumber(lat - prevLat);
        result += encodeNumber(lng - prevLng);
        
        prevLat = lat;
        prevLng = lng;
    }
    
    return result;
}

function encodeNumber(num) {
    num = num < 0 ? ~(num << 1) : num << 1;
    let result = '';
    
    while (num >= 0x20) {
        result += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
        num >>= 5;
    }
    
    result += String.fromCharCode(num + 63);
    return result;
}

// Iniciar servidor
async function start() {
    await ensureDataDir();
    
    // Inicializar base de datos SQLite
    initDatabase();
    migrateFromJSON();
    
    // Crear usuario admin si no existe
    await createAdminUser();
    
    // Iniciar servidor HTTPS si hay certificados
    if (HAS_SSL) {
        try {
            const options = {
                key: fsSync.readFileSync(SSL_KEY_PATH),
                cert: fsSync.readFileSync(SSL_CERT_PATH)
            };
            
            https.createServer(options, app).listen(HTTPS_PORT, '0.0.0.0', () => {
                console.log(`HTTPS Server running on https://localhost:${HTTPS_PORT}`);
                console.log(`Network access: https://${require('os').hostname()}:${HTTPS_PORT}`);
            });
        } catch (err) {
            console.error('Error starting HTTPS server:', err.message);
        }
    }
    
    // Iniciar servidor HTTP si no hay SSL o si ENABLE_HTTP=true
    if (!HAS_SSL || ENABLE_HTTP) {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`HTTP Server running on http://localhost:${PORT}`);
            console.log(`Network access: http://${require('os').hostname()}:${PORT}`);
        });
    }
    
    console.log(`API endpoints:`);
    console.log(`  POST /api/auth/login`);
    console.log(`  GET  /api/auth/me`);
    console.log(`  GET  /api/users`);
    console.log(`  POST /api/users`);
    console.log(`  DELETE /api/users/:id`);
    console.log(`  GET  /api/kmls`);
    console.log(`  GET  /api/kml/:name`);
    console.log(`  GET  /api/lookup-barcode?code=...`);
    console.log(`  GET  /api/findings`);
    console.log(`  POST /api/findings`);
    console.log(`  DELETE /api/findings/:id`);
    console.log(`  POST /api/extract-text`);
    console.log(`  GET  /api/itineraries`);
    console.log(`  GET  /api/itinerary/:id`);
    console.log(`  GET  /api/block/:id`);
    console.log(`  POST /api/repo/refresh`);
}

start();
