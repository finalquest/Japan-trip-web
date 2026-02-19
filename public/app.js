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

// Cargar lista de KMLs desde nuestro backend (que hace proxy a GitHub)
async function loadKMLList() {
    const select = document.getElementById('repo-kml-select');
    
    try {
        const response = await fetch(`${API_BASE}/api/kmls`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const kmls = await response.json();
        
        // Limpiar opciones existentes (excepto la primera)
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        // Agregar archivos al dropdown
        kmls.forEach(kml => {
            const option = document.createElement('option');
            option.value = kml.name;
            option.textContent = kml.name.replace('.kml', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            select.appendChild(option);
        });
        
        showNotification(`📂 ${kmls.length} itinerarios cargados`);
        
    } catch (error) {
        console.error('Error loading KML list:', error);
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
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const kmlData = await response.text();
        
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
}

function initLeafletMap() {
    mapType = 'leaflet';
    map = L.map('map-container').setView([35.6762, 139.6503], 12);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
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
    console.log('[APP] startBarcodeScan iniciado');
    const video = document.getElementById('barcode-video');
    const cameraStep = document.getElementById('camera-step');
    const barcodeStep = document.getElementById('barcode-step');
    
    console.log('[APP] video element:', video);
    console.log('[APP] cameraStep:', cameraStep);
    console.log('[APP] barcodeStep:', barcodeStep);
    console.log('[APP] window.BarcodeScanner:', typeof window.BarcodeScanner);
    
    if (!window.BarcodeScanner) {
        console.error('[APP] ERROR: BarcodeScanner no está disponible');
        alert('Error: El escáner no está disponible. Recargá la página.');
        return;
    }
    
    console.log('[APP] Ocultando cameraStep, mostrando barcodeStep');
    cameraStep.style.display = 'none';
    barcodeStep.style.display = 'block';
    
    barcodeScanning = true;
    
    console.log('[APP] Llamando a BarcodeScanner.start...');
    try {
        await window.BarcodeScanner.start(
            video,
            (barcode) => {
                console.log('[APP] Barcode detectado en callback:', barcode);
                processBarcode(barcode);
            },
            (errorMsg) => {
                console.error('[APP] Scanner error:', errorMsg);
            }
        );
        console.log('[APP] BarcodeScanner.start completado');
    } catch (err) {
        console.error('[APP] Error starting scanner:', err);
        showManualBarcodeInput();
    }
}

// Variable global para guardar el barcode actual
let currentBarcode = null;

async function processBarcode(barcode) {
    // Guardar barcode globalmente
    currentBarcode = barcode;
    document.getElementById('finding-barcode').value = barcode;
    
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

// Extraer texto de imagen usando OCR
async function extractText() {
    const fileInput = document.getElementById('ocr-image');
    const loadingDiv = document.getElementById('ocr-loading');
    const extractBtn = document.getElementById('extract-btn');
    const descTextarea = document.getElementById('finding-desc');
    const priceInput = document.getElementById('finding-price');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        alert('Seleccioná una imagen primero');
        return;
    }
    
    const file = fileInput.files[0];
    
    // Validar que sea imagen
    if (!file.type.startsWith('image/')) {
        alert('El archivo debe ser una imagen');
        return;
    }
    
    // Mostrar loading
    loadingDiv.style.display = 'block';
    extractBtn.disabled = true;
    
    try {
        const formData = new FormData();
        formData.append('image', file);
        
        const response = await fetch(`${API_BASE}/api/extract-text`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al procesar imagen');
        }
        
        const data = await response.json();
        
        // Procesar datos extraídos
        if (data.data) {
            const extracted = data.data;
            
            // Actualizar título si está vacío
            const titleInput = document.getElementById('finding-title');
            if (extracted.productName && !titleInput.value) {
                titleInput.value = extracted.productName;
            }
            
            // Actualizar precio si está vacío
            if (extracted.price && !priceInput.value) {
                priceInput.value = extracted.price;
            }
            
            // Construir notas con el resto de la información
            const notes = [];
            if (extracted.brand) notes.push(`🏭 Marca: ${extracted.brand}`);
            if (extracted.model) notes.push(`🔢 Modelo: ${extracted.model}`);
            if (extracted.condition) notes.push(`📋 Estado: ${extracted.condition}`);
            if (extracted.warranty) notes.push(`🛡️ Garantía: ${extracted.warranty}`);
            if (extracted.features && Array.isArray(extracted.features) && extracted.features.length > 0) {
                notes.push('✨ Características:');
                extracted.features.forEach(f => notes.push(`  • ${f}`));
            }
            
            // Appendear notas a la descripción
            if (notes.length > 0) {
                const notesText = notes.join('\n');
                const currentText = descTextarea.value;
                if (currentText) {
                    descTextarea.value = currentText + '\n\n' + notesText;
                } else {
                    descTextarea.value = notesText;
                }
            }
        }
        
        // Limpiar input
        fileInput.value = '';
        
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        loadingDiv.style.display = 'none';
        extractBtn.disabled = false;
    }
}

// Preview de foto y mostrar formulario
document.getElementById('finding-photo')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Mostrar preview
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = document.getElementById('photo-preview');
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);

    // Ocultar cámara, mostrar formulario inmediatamente
    document.getElementById('camera-step').style.display = 'none';
    document.getElementById('finding-form').style.display = 'block';

    // Procesar imagen con OCR para extraer datos automáticamente
    showNotification('🔍 Analizando imagen...');

    try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch(`${API_BASE}/api/extract-text`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: formData
        });

        if (!response.ok) {
            console.log('OCR no disponible o error, continuando sin autofill');
            return;
        }

        const data = await response.json();

        if (data.data) {
            const extracted = data.data;

            // Pre-llenar título
            if (extracted.productName) {
                document.getElementById('finding-title').value = extracted.productName;
            }

            // Pre-llenar precio
            if (extracted.price) {
                document.getElementById('finding-price').value = extracted.price;
            }

            // Construir notas con la información extraída
            const notes = [];
            if (extracted.brand) notes.push(`🏭 Marca: ${extracted.brand}`);
            if (extracted.model) notes.push(`🔢 Modelo: ${extracted.model}`);
            if (extracted.condition) notes.push(`📋 Estado: ${extracted.condition}`);
            if (extracted.warranty) notes.push(`🛡️ Garantía: ${extracted.warranty}`);
            if (extracted.features && Array.isArray(extracted.features) && extracted.features.length > 0) {
                notes.push('✨ Características:');
                extracted.features.forEach(f => notes.push(`  • ${f}`));
            }

            // Llenar descripción con notas
            if (notes.length > 0) {
                document.getElementById('finding-desc').value = notes.join('\n');
            }

            showNotification('✅ Datos extraídos de la imagen');
        }
    } catch (err) {
        console.error('Error procesando imagen:', err);
        // No mostrar error al usuario, solo continuar sin autofill
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
    const price = document.getElementById('finding-price').value;
    const barcode = document.getElementById('finding-barcode').value;
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
    formData.append('price', price);
    formData.append('barcode', barcode);
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

// API Functions (API_BASE is defined in auth.js)

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
        <div class="finding-card" onclick="showDetailModal('${f.id}')" style="cursor: pointer;">
            <button class="delete-btn" onclick="event.stopPropagation(); deleteFinding('${f.id}')">×</button>
            ${photoUrl ? `<img src="${photoUrl}" alt="${f.title}">` : ''}
            <div class="finding-card-content">
                <h3>${f.title}</h3>
                ${f.price ? `<div class="price">${f.price}</div>` : ''}
                <p>${f.description ? f.description.substring(0, 100) + (f.description.length > 100 ? '...' : '') : 'Sin descripción'}</p>
                ${f.location ? `<div class="location">📍 ${f.location}</div>` : ''}
                ${tags.length ? `<div class="tags">${tags.slice(0, 3).map(t => `<span class="tag-item">${t}</span>`).join('')}${tags.length > 3 ? '<span class="tag-item">+' + (tags.length - 3) + '</span>' : ''}</div>` : ''}
                <div class="date">${date}</div>
                <div class="created-by">👤 ${createdBy}</div>
            </div>
        </div>
    `}).join('');
}

// Variable global para el finding actual en detalle
let currentDetailFinding = null;

// Mostrar modal de detalle
async function showDetailModal(findingId) {
    const finding = currentFindings.find(f => f.id === findingId);
    if (!finding) return;
    
    currentDetailFinding = finding;
    
    // Mostrar modal inmediatamente con datos locales
    renderDetailContent(finding);
    document.getElementById('detail-modal').style.display = 'flex';
    
    // Si tiene barcode, cargar datos actualizados
    if (finding.barcode) {
        await loadBarcodeData(finding);
    }
}

// Renderizar contenido del detalle
function renderDetailContent(finding) {
    // Título
    document.getElementById('detail-title').textContent = finding.title || 'Detalle del Producto';
    
    // Foto
    const photoContainer = document.getElementById('detail-photo-container');
    if (finding.photoUrl || finding.photo) {
        photoContainer.innerHTML = `<img src="${finding.photoUrl || finding.photo}" alt="${finding.title}">`;
    } else {
        photoContainer.innerHTML = '<p style="color: #999; padding: 2rem;">Sin foto</p>';
    }
    
    // Precio
    const priceEl = document.getElementById('detail-price');
    if (finding.price) {
        priceEl.textContent = finding.price;
        priceEl.style.display = 'inline-block';
    } else {
        priceEl.style.display = 'none';
    }
    
    // Descripción
    document.getElementById('detail-description').textContent = finding.description || 'Sin descripción';
    
    // Ubicación
    const locationEl = document.getElementById('detail-location');
    if (finding.location) {
        locationEl.innerHTML = `📍 ${finding.location}`;
        locationEl.style.display = 'block';
    } else {
        locationEl.style.display = 'none';
    }
    
    // Tags
    const tagsEl = document.getElementById('detail-tags');
    if (finding.tags && finding.tags.length > 0) {
        tagsEl.innerHTML = finding.tags.map(t => `<span class="tag-item">${t}</span>`).join('');
    } else {
        tagsEl.innerHTML = '';
    }
    
    // Meta (fecha, creador y barcode)
    const date = new Date(finding.createdAt).toLocaleString('es-AR');
    document.getElementById('detail-meta').innerHTML = `
        <div>📅 ${date}</div>
        <div>👤 ${finding.createdBy || 'Desconocido'}</div>
        ${finding.barcode ? `<div style="margin-top: 0.5rem; font-family: monospace; color: #666;">Barcode: ${finding.barcode}</div>` : ''}
    `;
}

// Cargar datos desde barcode
async function loadBarcodeData(finding) {
    const photoContainer = document.getElementById('detail-photo-container');
    
    // Mostrar loading
    photoContainer.innerHTML += '<div id="detail-loading" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(255,255,255,0.9); padding: 1rem; border-radius: 8px;">⏳ Cargando...</div>';
    
    try {
        const product = await lookupBarcode(finding.barcode);
        
        if (product) {
            // Actualizar el finding con datos nuevos
            finding.title = product.name || finding.title;
            finding.description = product.description || finding.description;
            if (product.image) {
                finding.photoUrl = product.image;
            }
            
            // Re-renderizar con datos actualizados
            renderDetailContent(finding);
        }
    } catch (error) {
        console.error('Error cargando datos del barcode:', error);
    } finally {
        // Quitar loading
        const loading = document.getElementById('detail-loading');
        if (loading) loading.remove();
    }
}

// Cerrar modal de detalle
function closeDetailModal() {
    document.getElementById('detail-modal').style.display = 'none';
    currentDetailFinding = null;
}

// Actualizar datos del producto desde barcode
async function refreshProductData(barcode, findingId) {
    if (!confirm('¿Actualizar datos del producto desde la base de datos?\n\nEsto reemplazará el título y descripción actuales.')) return;
    
    const refreshBtn = document.getElementById('detail-refresh-btn');
    refreshBtn.disabled = true;
    refreshBtn.textContent = '⏳ Actualizando...';
    
    try {
        const product = await lookupBarcode(barcode);
        
        if (product) {
            // Actualizar en el array
            const finding = currentFindings.find(f => f.id === findingId);
            if (finding) {
                finding.title = product.name || finding.title;
                finding.description = product.description || finding.description;
                if (product.image && !finding.photoUrl) {
                    finding.photoUrl = product.image;
                }
                
                // Actualizar la vista
                showDetailModal(findingId);
                renderFindings();
                showNotification('✅ Datos actualizados');
            }
        } else {
            showNotification('⚠️ Producto no encontrado en la base de datos');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('❌ Error al consultar producto');
    } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 Actualizar datos desde barcode';
    }
}

// Re-consultar producto por barcode
async function relookupProduct(barcode, findingId) {
    if (!confirm('¿Actualizar datos del producto desde la base de datos?')) return;
    
    showNotification(`🔍 Buscando: ${barcode}...`);
    
    try {
        const product = await lookupBarcode(barcode);
        
        if (product) {
            // Actualizar el finding en memoria
            const finding = currentFindings.find(f => f.id === findingId);
            if (finding) {
                finding.title = product.name || finding.title;
                finding.description = product.description || finding.description;
                if (product.image && !finding.photoUrl) {
                    finding.photoUrl = product.image;
                }
                
                // Guardar cambios
                await saveFindingsToServer(currentFindings);
                renderFindings();
                showNotification('✅ Producto actualizado');
            }
        } else {
            showNotification('⚠️ Producto no encontrado en la base de datos');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('❌ Error al consultar producto');
    }
}

// Función auxiliar para guardar findings (simulada, debería llamar al backend)
async function saveFindingsToServer(findings) {
    // En una implementación real, esto debería hacer un PUT/POST al servidor
    // Por ahora solo actualizamos en memoria
    console.log('Findings actualizados:', findings);
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
window.extractText = extractText;
window.showDetailModal = showDetailModal;
window.closeDetailModal = closeDetailModal;
window.renderDetailContent = renderDetailContent;
window.loadBarcodeData = loadBarcodeData;

function setupEventListeners() {
    // Cualquier setup adicional
}
