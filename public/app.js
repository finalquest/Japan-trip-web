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

// Inicializar app (llamado desde auth.js después de autenticación)
function initApp() {
    initMap();
    loadFindings();
    loadKMLList();
    setupEventListeners();
}

// Exportar para usar desde auth.js
window.initApp = initApp;

// Cargar lista de KMLs desde el repo usando GitHub API
async function loadKMLList() {
    const select = document.getElementById('repo-kml-select');
    
    try {
        // Usar GitHub API para listar archivos de la carpeta maps
        const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${KML_FOLDER}`;
        console.log('Fetching KML list from:', apiUrl);
        
        const response = await fetch(apiUrl, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }
        
        const files = await response.json();
        
        // Filtrar solo archivos .kml
        const kmlFiles = files
            .filter(file => file.type === 'file' && file.name.endsWith('.kml'))
            .map(file => file.name)
            .sort();
        
        console.log(`Found ${kmlFiles.length} KML files`);
        
        // Limpiar opciones existentes (excepto la primera)
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        // Agregar archivos al dropdown
        kmlFiles.forEach(file => {
            const option = document.createElement('option');
            option.value = file;
            option.textContent = file.replace('.kml', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            select.appendChild(option);
        });
        
        showNotification(`📂 ${kmlFiles.length} itinerarios cargados`);
        
    } catch (error) {
        console.error('Error loading KML list:', error);
        // Fallback: mostrar mensaje y dejar el select vacío
        showNotification('⚠️ No se pudo cargar la lista automáticamente');
    }
}

// Variable global para el infowindow actual (Google Maps)
let currentInfoWindow = null;

// Variable para el escáner de barcode
let barcodeScanning = false;

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
        // Cerrar infowindow anterior si existe
        if (currentInfoWindow) {
            currentInfoWindow.close();
            currentInfoWindow = null;
        }
        
        console.log('Cargando KML desde:', url);
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const kmlData = await response.text();
        console.log('KML descargado, tamaño:', kmlData.length);
        
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
        
        // Mostrar mensaje sutil en lugar de alert
        showNotification(`✅ Cargado: ${filename}`);
        
        // Cambiar a modo visualización
        enterViewerMode();
        
    } catch (error) {
        console.error('Error cargando KML:', error);
        alert(`❌ Error: ${error.message}`);
    }
}

// Mostrar notificación sutil
function showNotification(message) {
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: #34a853;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        z-index: 10000;
        font-weight: 500;
    `;
    notif.textContent = message;
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transition = 'opacity 0.5s';
        setTimeout(() => notif.remove(), 500);
    }, 3000);
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

// Cambiar a modo visualización
function enterViewerMode() {
    document.getElementById('kml-selector-mode').style.display = 'none';
    document.getElementById('kml-viewer-mode').style.display = 'block';
    document.getElementById('map-container').classList.add('map-expanded');
    
    // Ajustar mapa después de cambiar tamaño
    setTimeout(() => {
        if (mapType === 'google' && map) {
            google.maps.event.trigger(map, 'resize');
        } else if (mapType === 'leaflet' && map) {
            map.invalidateSize();
        }
    }, 300);
}

// Volver a modo selección
function backToSelector() {
    document.getElementById('kml-selector-mode').style.display = 'block';
    document.getElementById('kml-viewer-mode').style.display = 'none';
    document.getElementById('map-container').classList.remove('map-expanded');
    
    // Limpiar mapa
    mapMarkers.forEach(m => {
        if (mapType === 'google') m.setMap(null);
        else m.remove();
    });
    mapMarkers = [];
    if (currentInfoWindow) {
        currentInfoWindow.close();
        currentInfoWindow = null;
    }
    document.getElementById('route-info').innerHTML = '';
    
    // Reset select
    document.getElementById('repo-kml-select').value = '';
    
    // Ajustar mapa después de cambiar tamaño
    setTimeout(() => {
        if (mapType === 'google' && map) {
            google.maps.event.trigger(map, 'resize');
        } else if (mapType === 'leaflet' && map) {
            map.invalidateSize();
        }
    }, 300);
}

// Cargar KML desde archivo
function loadKML(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const kmlData = e.target.result;
        
        // Cerrar infowindow anterior si existe
        if (currentInfoWindow) {
            currentInfoWindow.close();
            currentInfoWindow = null;
        }
        
        if (mapType === 'google') {
            loadKMLGoogle(kmlData);
        } else {
            loadKMLLeaflet(kmlData);
        }
        
        // Parsear para mostrar lista
        const parser = new DOMParser();
        const kml = parser.parseFromString(kmlData, 'text/xml');
        displayKMLPoints(kml);
        
        // Mostrar notificación sutil
        showNotification(`✅ Cargado: ${file.name}`);
        
        // Cambiar a modo visualización
        enterViewerMode();
    };
    reader.readAsText(file);
}

function loadKMLGoogle(kmlData) {
    // Parsear KML manualmente porque KmlLayer necesita URL pública
    const parser = new DOMParser();
    const kml = parser.parseFromString(kmlData, 'text/xml');
    
    const placemarks = kml.querySelectorAll('Placemark');
    const bounds = new google.maps.LatLngBounds();
    
    // Limpiar marcadores anteriores y cerrar infowindow
    mapMarkers.forEach(m => m.setMap(null));
    mapMarkers = [];
    if (currentInfoWindow) {
        currentInfoWindow.close();
        currentInfoWindow = null;
    }
    
    placemarks.forEach((placemark, i) => {
        // Solo procesar puntos (no LineString/rutas)
        const point = placemark.querySelector('Point');
        if (!point) return;
        
        const name = getPlacemarkName(placemark, i);
        const extendedData = placemark.querySelector('ExtendedData');
        const address = extendedData?.querySelector('Data[name="address"] value')?.textContent || '';
        const coords = point.querySelector('coordinates')?.textContent?.trim();
        
        if (coords) {
            const [lng, lat] = coords.split(',').map(Number);
            if (!isNaN(lat) && !isNaN(lng)) {
                const position = { lat, lng };
                bounds.extend(position);
                
                const marker = new google.maps.Marker({
                    position: position,
                    map: map,
                    title: name,
                    label: {
                        text: String(mapMarkers.length + 1),
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: 'bold'
                    }
                });
                
                const content = address 
                    ? `<strong>${mapMarkers.length + 1}. ${name}</strong><br><small>${address}</small>`
                    : `<strong>${mapMarkers.length + 1}. ${name}</strong>`;
                
                const infowindow = new google.maps.InfoWindow({ content });
                marker.addListener('click', () => {
                    // Cerrar infowindow anterior si existe
                    if (currentInfoWindow) {
                        currentInfoWindow.close();
                    }
                    infowindow.open(map, marker);
                    currentInfoWindow = infowindow;
                });
                
                mapMarkers.push(marker);
            }
        }
    });
    
    if (!bounds.isEmpty()) {
        map.fitBounds(bounds);
    }
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
        // Solo procesar puntos (no LineString/rutas)
        const point = placemark.querySelector('Point');
        if (!point) return;
        
        const name = getPlacemarkName(placemark, i);
        const extendedData = placemark.querySelector('ExtendedData');
        const address = extendedData?.querySelector('Data[name="address"] value')?.textContent || '';
        const coords = point.querySelector('coordinates')?.textContent?.trim();
        
        if (coords) {
            const [lng, lat] = coords.split(',').map(Number);
            if (!isNaN(lat) && !isNaN(lng)) {
                bounds.extend([lat, lng]);
                
                const popupContent = address 
                    ? `<strong>${mapMarkers.length + 1}. ${name}</strong><br><small>${address}</small>`
                    : `<strong>${mapMarkers.length + 1}. ${name}</strong>`;
                
                // Crear pin con número usando divIcon
                const numberedIcon = L.divIcon({
                    className: 'numbered-pin',
                    html: `<div class="pin-number">${mapMarkers.length + 1}</div>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 30]
                });
                
                const marker = L.marker([lat, lng], { icon: numberedIcon })
                    .bindPopup(popupContent)
                    .addTo(map);
                
                mapMarkers.push(marker);
            }
        }
    });
    
    if (bounds.isValid()) {
        map.fitBounds(bounds);
    }
}

function getPlacemarkName(placemark, index) {
    // Intentar obtener nombre de diferentes lugares en el KML
    // 1. ExtendedData > Data[name="name"] > value
    const extendedData = placemark.querySelector('ExtendedData');
    if (extendedData) {
        const dataName = extendedData.querySelector('Data[name="name"] value');
        if (dataName?.textContent) {
            return dataName.textContent;
        }
    }
    // 2. Tag <name> directo
    const nameTag = placemark.querySelector('name');
    if (nameTag?.textContent) {
        return nameTag.textContent;
    }
    // 3. Fallback
    return `Punto ${index + 1}`;
}

function displayKMLPoints(kmlDoc) {
    const placemarks = kmlDoc.querySelectorAll('Placemark');
    const infoDiv = document.getElementById('route-info');
    
    // Solo mostrar puntos (no rutas/linestrings)
    const pointPlacemarks = Array.from(placemarks).filter(p => 
        p.querySelector('Point') || p.querySelector('coordinates')
    );
    
    let html = `<h3>Puntos en el itinerario (${pointPlacemarks.length})</h3><ul>`;
    
    pointPlacemarks.forEach((placemark, i) => {
        const name = getPlacemarkName(placemark, i);
        const extendedData = placemark.querySelector('ExtendedData');
        const address = extendedData?.querySelector('Data[name="address"] value')?.textContent || '';
        
        html += `<li><strong>${name}</strong>${address ? '<br><small>' + address + '</small>' : ''}</li>`;
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

// Funciones para escanear código de barras
async function startBarcodeScan() {
    const video = document.getElementById('barcode-video');
    const cameraStep = document.getElementById('camera-step');
    const barcodeStep = document.getElementById('barcode-step');
    
    if (!window.BarcodeScanner) {
        alert('Error: El escáner no está disponible. Recargá la página.');
        return;
    }
    
    cameraStep.style.display = 'none';
    barcodeStep.style.display = 'block';
    
    barcodeScanning = true;
    
    try {
        await window.BarcodeScanner.start(
            video,
            (barcode) => {
                processBarcode(barcode);
            },
            (errorMsg) => {
                console.error('Scanner error:', errorMsg);
            }
        );
    } catch (err) {
        console.error('Error starting scanner:', err);
        showManualBarcodeInput();
    }
}

async function processBarcode(barcode) {
    // Detener escaneo
    barcodeScanning = false;
    
    // Detener ZXing usando la API limpia
    if (window.BarcodeScanner) {
        window.BarcodeScanner.stop();
    }
    
    // Mostrar loading
    showNotification(`🔍 Buscando producto: ${barcode}...`);
    
    try {
        // Buscar en go-upc.com
        const product = await lookupBarcode(barcode);
        
        if (product) {
            // Pre-llenar formulario
            document.getElementById('finding-title').value = product.name || '';
            document.getElementById('finding-desc').value = product.description || '';
            
            // Si hay imagen, mostrarla
            if (product.image) {
                const img = document.getElementById('photo-preview');
                img.src = product.image;
            }
            
            showNotification('✅ Producto encontrado');
        } else {
            showNotification('⚠️ Producto no encontrado. Agregá los datos manualmente.');
        }
        
        // Mostrar formulario
        document.getElementById('barcode-step').style.display = 'none';
        document.getElementById('finding-form').style.display = 'block';
        
    } catch (error) {
        console.error('Error looking up barcode:', error);
        showNotification('❌ Error buscando producto');
        
        // Mostrar formulario igual
        document.getElementById('barcode-step').style.display = 'none';
        document.getElementById('finding-form').style.display = 'block';
    }
}

async function lookupBarcode(barcode) {
    try {
        const response = await fetch(`${API_BASE}/api/lookup-barcode?code=${encodeURIComponent(barcode)}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        if (data.found && data.name) {
            return { 
                name: data.name, 
                image: data.image, 
                description: data.description 
            };
        }
    } catch (err) {
        console.error('Barcode lookup error:', err);
    }
    
    return null;
}

function showManualBarcodeInput() {
    // Detener escaneo
    barcodeScanning = false;
    
    // Detener ZXing si está corriendo
    if (window.BarcodeScanner) {
        window.BarcodeScanner.stop();
    }
    
    // Mostrar input manual
    const container = document.getElementById('barcode-video-container');
    container.innerHTML = `
        <div style="padding: 2rem; text-align: center;">
            <p style="margin-bottom: 1rem; color: #666;">No se pudo iniciar el escáner automático.</p>
            <p style="margin-bottom: 1rem;">Ingresá el código manualmente:</p>
            <input type="text" id="manual-barcode" placeholder="Ej: 7791337010093" style="padding: 0.75rem; font-size: 1.2rem; width: 80%; text-align: center; margin-bottom: 1rem;">
            <br>
            <button onclick="submitManualBarcode()" class="btn-camera" style="margin-right: 0.5rem;">🔍 Buscar</button>
            <button onclick="cancelBarcodeScan()" class="btn-cancel">❌ Cancelar</button>
        </div>
    `;
}

function submitManualBarcode() {
    const input = document.getElementById('manual-barcode');
    const barcode = input.value.trim();
    
    if (!barcode) {
        alert('Ingresá un código de barras');
        return;
    }
    
    processBarcode(barcode);
}

function cancelBarcodeScan() {
    barcodeScanning = false;
    
    // Detener ZXing usando la API limpia
    if (window.BarcodeScanner) {
        window.BarcodeScanner.stop();
    }
    
    // Restaurar el video container
    const container = document.getElementById('barcode-video-container');
    container.innerHTML = `
        <video id="barcode-video" playsinline></video>
        <div class="scan-line"></div>
    `;
    
    document.getElementById('barcode-step').style.display = 'none';
    document.getElementById('camera-step').style.display = 'block';
}

// Preview de foto y mostrar formulario
document.getElementById('finding-photo')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.getElementById('photo-preview');
            img.src = e.target.result;
            
            // Ocultar cámara, mostrar formulario
            document.getElementById('camera-step').style.display = 'none';
            document.getElementById('finding-form').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

// Volver a sacar foto
function retakePhoto() {
    // Limpiar input y preview
    document.getElementById('finding-photo').value = '';
    document.getElementById('photo-preview').src = '';
    
    // Ocultar formulario, mostrar cámara
    document.getElementById('finding-form').style.display = 'none';
    document.getElementById('camera-step').style.display = 'block';
    
    // Limpiar campos del form
    document.getElementById('finding-form').reset();
    document.querySelectorAll('.tag.selected').forEach(t => t.classList.remove('selected'));
    updateTagsInput();
}

// Guardar hallazgo
document.getElementById('finding-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const photoInput = document.getElementById('finding-photo');
    const title = document.getElementById('finding-title').value;
    const desc = document.getElementById('finding-desc').value;
    const location = document.getElementById('finding-location').value;
    const lat = document.getElementById('finding-lat').value;
    const lng = document.getElementById('finding-lng').value;
    const tags = document.getElementById('finding-tags').value;
    
    const formData = new FormData();
    if (photoInput.files && photoInput.files[0]) {
        formData.append('photo', photoInput.files[0]);
    }
    formData.append('title', title);
    formData.append('description', desc);
    formData.append('location', location);
    formData.append('lat', lat);
    formData.append('lng', lng);
    formData.append('tags', tags);
    
    try {
        await saveFinding(formData);
        
        // Reset form
        document.getElementById('finding-form').reset();
        document.getElementById('photo-preview').src = '';
        document.querySelectorAll('.tag.selected').forEach(t => t.classList.remove('selected'));
        updateTagsInput();
        
        // Volver a pantalla inicial
        document.getElementById('finding-form').style.display = 'none';
        document.getElementById('camera-step').style.display = 'block';
        
        showNotification('✅ Guardado!');
    } catch (err) {
        showNotification('❌ Error al guardar');
    }
});

// API Functions
const API_BASE = '';

async function loadFindings() {
    try {
        const response = await fetch(`${API_BASE}/api/findings`, {
            headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to load findings');
        currentFindings = await response.json();
        renderFindings();
    } catch (err) {
        console.error('Error loading findings:', err);
        showNotification('⚠️ Error cargando hallazgos');
    }
}

async function saveFinding(formData) {
    try {
        const response = await fetch(`${API_BASE}/api/findings`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: formData
        });
        if (!response.ok) throw new Error('Failed to save');
        const finding = await response.json();
        currentFindings.unshift(finding);
        renderFindings();
        return finding;
    } catch (err) {
        console.error('Error saving finding:', err);
        throw err;
    }
}

async function deleteFinding(id) {
    if (!confirm('¿Borrar este item?')) return;

    try {
        const response = await fetch(`${API_BASE}/api/findings/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to delete');
        currentFindings = currentFindings.filter(f => f.id !== id);
        renderFindings();
    } catch (err) {
        console.error('Error deleting finding:', err);
        showNotification('❌ Error al borrar');
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
    
    grid.innerHTML = currentFindings.map(f => {
        const date = new Date(f.createdAt).toLocaleString('es-AR');
        const photoUrl = f.photoUrl || f.photo || '';
        const tags = f.tags || [];
        const createdBy = f.createdBy || 'Desconocido';

        return `
        <div class="finding-card">
            <button class="delete-btn" onclick="deleteFinding('${f.id}')">×</button>
            ${photoUrl ? `<img src="${photoUrl}" alt="${f.title}">` : ''}
            <div class="finding-card-content">
                <h3>${f.title}</h3>
                <p>${f.description || 'Sin descripción'}</p>
                ${f.location ? `<div class="location">📍 ${f.location}</div>` : ''}
                ${tags.length ? `<div class="tags">${tags.map(t => `<span class="tag-item">${t}</span>`).join('')}</div>` : ''}
                <div class="date">${date}</div>
                <div class="created-by">👤 ${createdBy}</div>
            </div>
        </div>
    `}).join('');
}

// Hacer funciones disponibles globalmente para onclick
window.showTab = showTab;
window.loadRepoKML = loadRepoKML;
window.backToSelector = backToSelector;
window.toggleTag = toggleTag;
window.getCurrentLocation = getCurrentLocation;
window.deleteFinding = deleteFinding;
window.retakePhoto = retakePhoto;
window.startBarcodeScan = startBarcodeScan;
window.cancelBarcodeScan = cancelBarcodeScan;
window.submitManualBarcode = submitManualBarcode;

function setupEventListeners() {
    // Cualquier setup adicional
}
