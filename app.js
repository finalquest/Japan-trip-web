// Estado global
let map;
let mapType = 'google'; // 'google' o 'leaflet'
let currentFindings = [];
let mapMarkers = [];

// Config del repo
const REPO_OWNER = 'finalquest';
const REPO_NAME = 'tokyo2026';
const REPO_BRANCH = 'master';
const KML_FOLDER = 'maps';

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadFindings();
    loadKMLList();
    setupEventListeners();
});

// Cargar lista de KMLs desde el repo
async function loadKMLList() {
    const select = document.getElementById('repo-kml-select');
    
    // Lista de KMLs conocidos (hardcodeada para evitar CORS/API)
    const kmlFiles = [
        '1-asakusa.kml',
        '2-nippori.kml',
        '3-yanesen.kml',
        '4-shibuya.kml',
        '5-harajuku-omotesando.kml',
        '6-shinjuku.kml',
        '7-ginza-tsukiji-tokyo-station.kml',
        '8-ueno-ameyoko.kml',
        '9-ryogoku-tokyo-skytree.kml',
        '10-itabashi-oyama.kml',
        '11-kichijoji-inokashira.kml',
        '12-shimokitazawa-sangenjaya.kml',
        '13-daikanyama-nakameguro-meguro-river.kml',
        '14-koenji-nakano.kml',
        '15-akihabara-kanda.kml',
        '16-ikebukuro-sugamo.kml',
        '17-kamakura-enoshima.kml',
        '18-nikko-utsunomiya.kml',
        '19-hakone.kml',
        '20-yokosuka.kml',
        '21-kawagoe.kml',
        '22-narita-naritasan-omotesando.kml',
        '23-sawara.kml',
        '24-fujinomiya.kml',
        '25-kanda-jimbocho-tokyo-station.kml',
        '26-todoroki-jiyugaoka-gotokuji-shoin.kml',
        '27-chofu-jindaiji-jindai-botanical.kml',
        '28-setagaya-tamagawa.kml',
        '29-nerima-kasugacho-hikarigaoka.kml',
        '30-edogawa-kasai-rinkai-park.kml',
        '31-adachi-nishiarai-daishi.kml',
        '32-katsushika-shibamata-yagiri.kml',
        '33-sumida-kinshicho-ryogoku.kml',
        '34-taito-asakusa-okachimachi.kml',
        '35-chiyoda-imperial-palace-marunouchi.kml',
        '36-minato-roppongi-azabu.juban.kml',
        '37-shinagawa-tennozu-oisle.kml',
        '38-meguro-gakugeidaigaku-nakameguro.kml',
        '39-setagaya-shimokitazawa-daita.kml',
        '40-shibuya-ebisu-daikanyama.kml',
        '41-shinjuku-takadanobaba-waseda.kml',
        '42-toshima-ikebukuro-meijiro.kml',
        '43-kita-akabane-ukima.kml',
        '44-itabashi-nerima-takao.kml',
        '45-toda-soka-koshigaya.kml',
        '46-kasukabe-sugito-matsudo.kml',
        '47-ichikawa-funabashi-urayasu.kml',
        '48-misato-yoshikawa-nagareyama.kml',
        '49-kashiwa-abiko-toride.kml',
        '50-tsukuba-kasumigaura.kml',
        '51-mito-hitachi.kml'
    ];
    
    kmlFiles.forEach(file => {
        const option = document.createElement('option');
        option.value = file;
        option.textContent = file.replace('.kml', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        select.appendChild(option);
    });
}

// Cargar KML seleccionado del repo
async function loadRepoKML() {
    const select = document.getElementById('repo-kml-select');
    const filename = select.value;
    
    if (!filename) {
        alert('Seleccioná un KML primero');
        return;
    }
    
    const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${KML_FOLDER}/${filename}`;
    
    try {
        console.log('Cargando KML desde:', url);
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const kmlData = await response.text();
        console.log('KML descargado, tamaño:', kmlData.length);
        console.log('Primeros 200 chars:', kmlData.substring(0, 200));
        
        if (!kmlData.includes('<kml') && !kmlData.includes('<Placemark')) {
            throw new Error('El archivo descargado no parece ser un KML válido');
        }
        
        // Parsear para mostrar lista PRIMERO
        const parser = new DOMParser();
        const kml = parser.parseFromString(kmlData, 'text/xml');
        
        // Verificar si hay errores de parseo
        const parseError = kml.querySelector('parsererror');
        if (parseError) {
            console.error('Error de parseo XML:', parseError.textContent);
            throw new Error('Error al parsear el XML del KML');
        }
        
        displayKMLPoints(kml);
        
        // Procesar el KML en el mapa
        if (mapType === 'google') {
            loadKMLGoogle(kmlData);
        } else {
            loadKMLLeaflet(kmlData);
        }
        
        alert(`✅ Cargado: ${filename}`);
        
    } catch (error) {
        console.error('Error cargando KML:', error);
        console.error('Stack:', error.stack);
        alert(`❌ Error: ${error.message}\n\nRevisá la consola (F12) para más detalles.`);
    }
}

// Tabs
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(tabName === 'map' ? 'map-section' : 'findings-section').classList.add('active');
    event.target.classList.add('active');
    
    if (tabName === 'map' && map) {
        if (mapType === 'google') {
            google.maps.event.trigger(map, 'resize');
        } else if (mapType === 'leaflet') {
            map.invalidateSize();
        }
    }
}

// Inicializar mapa (Google o OpenStreetMap)
function initMap() {
    const mapContainer = document.getElementById('map-container');
    
    // Esperar a que se cargue alguna librería
    setTimeout(() => {
        if (window.google && window.google.maps && window.USE_GOOGLE_MAPS) {
            initGoogleMap();
        } else if (window.L) {
            initLeafletMap();
        } else {
            // Si ninguna cargó, esperar un poco más
            setTimeout(initMap, 500);
        }
    }, 100);
}

function initGoogleMap() {
    mapType = 'google';
    map = new google.maps.Map(document.getElementById('map-container'), {
        center: { lat: 35.6762, lng: 139.6503 },
        zoom: 12
    });
    console.log('Usando Google Maps');
}

function initLeafletMap() {
    mapType = 'leaflet';
    map = L.map('map-container').setView([35.6762, 139.6503], 12);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    console.log('Usando OpenStreetMap (Leaflet)');
}

// Cargar KML
function loadKML(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const kmlData = e.target.result;
        
        if (mapType === 'google') {
            loadKMLGoogle(kmlData);
        } else {
            loadKMLLeaflet(kmlData);
        }
        
        // Parsear para mostrar lista
        const parser = new DOMParser();
        const kml = parser.parseFromString(kmlData, 'text/xml');
        displayKMLPoints(kml);
    };
    reader.readAsText(file);
}

function loadKMLGoogle(kmlData) {
    const blob = new Blob([kmlData], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    
    const kmlLayer = new google.maps.KmlLayer({
        url: url,
        map: map
    });
}

function loadKMLLeaflet(kmlData) {
    // Para Leaflet necesitamos parsear manualmente
    const parser = new DOMParser();
    const kml = parser.parseFromString(kmlData, 'text/xml');
    
    const placemarks = kml.querySelectorAll('Placemark');
    const bounds = L.latLngBounds();
    
    // Limpiar marcadores anteriores
    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];
    
    placemarks.forEach((placemark, i) => {
        const name = placemark.querySelector('name')?.textContent || `Punto ${i+1}`;
        const desc = placemark.querySelector('description')?.textContent || '';
        const coords = placemark.querySelector('coordinates')?.textContent?.trim();
        
        if (coords) {
            const [lng, lat] = coords.split(',').map(Number);
            if (!isNaN(lat) && !isNaN(lng)) {
                bounds.extend([lat, lng]);
                
                const marker = L.marker([lat, lng])
                    .bindPopup(`<strong>${name}</strong><br>${desc}`)
                    .addTo(map);
                
                mapMarkers.push(marker);
            }
        }
    });
    
    if (bounds.isValid()) {
        map.fitBounds(bounds);
    }
}

function displayKMLPoints(kmlDoc) {
    const placemarks = kmlDoc.querySelectorAll('Placemark');
    const infoDiv = document.getElementById('route-info');
    let html = `<h3>Puntos en el itinerario (${placemarks.length})</h3><ul>`;
    
    placemarks.forEach((placemark, i) => {
        const name = placemark.querySelector('name')?.textContent || `Punto ${i+1}`;
        const desc = placemark.querySelector('description')?.textContent || '';
        
        html += `<li><strong>${name}</strong>${desc ? ': ' + desc.substring(0, 50) + '...' : ''}</li>`;
    });
    
    html += '</ul>';
    infoDiv.innerHTML = html;
}

// Manejo de archivos
document.getElementById('kml-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        loadKML(file);
    }
});

// Tags
function toggleTag(element) {
    element.classList.toggle('selected');
    updateTagsInput();
}

function updateTagsInput() {
    const selected = document.querySelectorAll('.tag.selected');
    const tags = Array.from(selected).map(el => el.textContent);
    document.getElementById('finding-tags').value = tags.join(',');
}

// Geolocalización
function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                document.getElementById('finding-lat').value = position.coords.latitude;
                document.getElementById('finding-lng').value = position.coords.longitude;
                document.getElementById('finding-location').value = `GPS: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
                alert('Ubicación guardada!');
            },
            () => alert('No se pudo obtener la ubicación')
        );
    } else {
        alert('Geolocalización no soportada');
    }
}

// Preview de foto
document.getElementById('finding-photo')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.getElementById('photo-preview');
            img.src = e.target.result;
            img.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

// Guardar hallazgo
document.getElementById('finding-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const photoInput = document.getElementById('finding-photo');
    const title = document.getElementById('finding-title').value;
    const desc = document.getElementById('finding-desc').value;
    const location = document.getElementById('finding-location').value;
    const lat = document.getElementById('finding-lat').value;
    const lng = document.getElementById('finding-lng').value;
    const tags = document.getElementById('finding-tags').value.split(',').filter(t => t);
    
    if (photoInput.files && photoInput.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const finding = {
                id: Date.now(),
                photo: e.target.result,
                title,
                description: desc,
                location,
                lat,
                lng,
                tags,
                date: new Date().toLocaleString('es-AR')
            };
            
            currentFindings.unshift(finding);
            saveFindings();
            renderFindings();
            
            // Reset form
            document.getElementById('finding-form').reset();
            document.getElementById('photo-preview').style.display = 'none';
            document.querySelectorAll('.tag.selected').forEach(t => t.classList.remove('selected'));
            updateTagsInput();
            
            alert('Guardado!');
        };
        reader.readAsDataURL(photoInput.files[0]);
    }
});

// LocalStorage
function saveFindings() {
    localStorage.setItem('japanFindings', JSON.stringify(currentFindings));
}

function loadFindings() {
    const saved = localStorage.getItem('japanFindings');
    if (saved) {
        currentFindings = JSON.parse(saved);
        renderFindings();
    }
}

function renderFindings() {
    const grid = document.getElementById('findings-grid');
    const count = document.getElementById('findings-count');
    
    count.textContent = currentFindings.length;
    
    if (currentFindings.length === 0) {
        grid.innerHTML = '<p style="color: #666; text-align: center; grid-column: 1/-1;">Todavía no guardaste nada. ¡Empezá a explorar!</p>';
        return;
    }
    
    grid.innerHTML = currentFindings.map(f => `
        <div class="finding-card">
            <button class="delete-btn" onclick="deleteFinding(${f.id})">×</button>
            <img src="${f.photo}" alt="${f.title}">
            <div class="finding-card-content">
                <h3>${f.title}</h3>
                <p>${f.description || 'Sin descripción'}</p>
                ${f.location ? `<div class="location">📍 ${f.location}</div>` : ''}
                ${f.tags.length ? `<div class="tags">${f.tags.map(t => `<span class="tag-item">${t}</span>`).join('')}</div>` : ''}
                <div class="date">${f.date}</div>
            </div>
        </div>
    `).join('');
}

function deleteFinding(id) {
    if (confirm('¿Borrar este item?')) {
        currentFindings = currentFindings.filter(f => f.id !== id);
        saveFindings();
        renderFindings();
    }
}

function setupEventListeners() {
    // Cualquier setup adicional
}
