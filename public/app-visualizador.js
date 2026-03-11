/**
 * Visualizador de Itinerarios - Japan Trip Planner
 * Gestiona la visualización de itinerarios con mapas y navegación por días
 */

// Estado global del visualizador
const vizState = {
    currentItinerary: null,
    currentDay: null,
    days: [],
    places: [],
    routes: [],
    markers: [],
    polylines: [],
    map: null,
    infoWindow: null,
    showRoute: false,
    routeType: 'point-to-point',
    refreshToken: null,
    isRefreshing: false
};

// Inicializar cuando el DOM esté listo (solo inicializar el mapa, no cargar datos)
document.addEventListener('DOMContentLoaded', () => {
    initVizMap();
});

// Función para inicializar el visualizador después del login
function initVizAfterLogin() {
    loadItinerariesList();
}

function buildRefreshUrl(basePath) {
    const url = new URL(basePath, window.location.origin);

    if (vizState.refreshToken) {
        url.searchParams.set('refresh', vizState.refreshToken);
    }

    return url.toString();
}

function getAuthFetchOptions() {
    return {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        cache: 'no-store'
    };
}

function setRefreshStatus(message, isError = false) {
    const statusEl = document.getElementById('viz-refresh-status');
    if (!statusEl) return;

    statusEl.textContent = message || '';
    statusEl.classList.toggle('error', Boolean(isError));
}

/**
 * Carga la lista de itinerarios disponibles
 */
async function loadItinerariesList() {
    try {
        const response = await fetch(buildRefreshUrl('/api/itineraries'), getAuthFetchOptions());
        
        if (!response.ok) throw new Error('Failed to load itineraries');
        
        const data = await response.json();
        const select = document.getElementById('viz-itinerary-select');
        
        select.innerHTML = '<option value="">-- Seleccionar itinerario --</option>';
        
        data.itineraries.forEach(it => {
            const option = document.createElement('option');
            option.value = it.id;
            option.textContent = it.name;
            select.appendChild(option);
        });
    } catch (err) {
        console.error('Error loading itineraries list:', err);
    }
}

/**
 * Carga el itinerario seleccionado
 */
async function loadSelectedItinerary() {
    const select = document.getElementById('viz-itinerary-select');
    const itineraryId = select.value;
    
    if (!itineraryId) {
        alert('Selecciona un itinerario primero');
        return;
    }
    
    try {
        const response = await fetch(
            buildRefreshUrl(`/api/itinerary/${itineraryId}`),
            getAuthFetchOptions()
        );
        
        if (!response.ok) throw new Error('Failed to load itinerary');
        
        const data = await response.json();
        
        vizState.currentItinerary = data;
        vizState.days = data.days;
        vizState.currentDay = null;
        vizState.places = [];
        vizState.routes = [];
        
        // Mostrar contenido y ocultar mensaje vacío
        document.getElementById('viz-content').style.display = 'block';
        document.getElementById('viz-empty').style.display = 'none';
        
        // Renderizar navegación de días
        renderDaysNav();
        
        // Seleccionar primer día no-buffer
        const firstDay = vizState.days.find(d => !d.isBuffer) || vizState.days[0];
        if (firstDay) {
            selectDay(firstDay.day);
        }
        
    } catch (err) {
        console.error('Error loading itinerary:', err);
        alert('Error al cargar el itinerario');
    }
}

/**
 * Renderiza la navegación de días
 */
function renderDaysNav() {
    const container = document.getElementById('viz-days-list');
    container.innerHTML = '';
    
    let bufferCount = 0;
    
    vizState.days.forEach(day => {
        const btn = document.createElement('button');
        btn.className = 'day-btn';
        btn.dataset.day = day.day;
        
        if (day.isBuffer) {
            bufferCount++;
            btn.textContent = `Buffer ${bufferCount}`;
            btn.classList.add('buffer-day');
        } else {
            btn.textContent = `Día ${day.day}`;
        }
        
        btn.onclick = () => selectDay(day.day);
        container.appendChild(btn);
    });
}

/**
 * Selecciona un día específico y carga sus datos
 */
async function selectDay(dayNumber) {
    vizState.currentDay = dayNumber;
    
    // Actualizar UI de navegación
    document.querySelectorAll('.day-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.day) === dayNumber);
    });
    
    // Obtener datos del día
    const day = vizState.days.find(d => d.day === dayNumber);
    if (!day) return;
    
    // Actualizar información del día
    document.getElementById('viz-day-title').textContent = `Día ${day.day} - ${day.title}`;
    document.getElementById('viz-day-purpose').innerHTML = 
        day.purpose ? `🎯 ${day.purpose}` : '';
    
    // Renderizar bloques
    renderBlocks(day.blocks);
    
    // Cargar lugares de todos los bloques
    await loadDayPlaces(day);
    
    // Renderizar lugares en panel y mapa
    renderPlaces();
    updateMap();
}

/**
 * Limpia el nombre de un lugar eliminando el prefijo numérico
 */
function cleanPlaceName(name) {
    if (!name) return '';
    return name.replace(/^\d+\.\s*/, '');
}

/**
 * Calcula la distancia euclidiana entre dos lugares
 */
function getDistance(place1, place2) {
    if (!place1.lat || !place1.lng || !place2.lat || !place2.lng) return Infinity;
    return Math.sqrt(
        Math.pow(place1.lat - place2.lat, 2) + 
        Math.pow(place1.lng - place2.lng, 2)
    );
}

/**
 * Ordena lugares usando algoritmo Nearest Neighbor
 */
function sortPlacesByProximity(places, isCircular = false) {
    if (places.length < 2) return places;
    
    const unvisited = [...places];
    const sorted = [];
    
    let current = unvisited.shift();
    sorted.push(current);
    
    while (unvisited.length > 0) {
        let nearestIndex = 0;
        let minDistance = Infinity;
        
        for (let i = 0; i < unvisited.length; i++) {
            const dist = getDistance(current, unvisited[i]);
            if (dist < minDistance) {
                minDistance = dist;
                nearestIndex = i;
            }
        }
        
        current = unvisited.splice(nearestIndex, 1)[0];
        sorted.push(current);
    }
    
    if (isCircular) {
        sorted.push(places[0]);
    }
    
    return sorted;
}

/**
 * Genera rutas secuenciales desde lugares ordenados
 */
function generateRoutesFromPlaces(places) {
    const routes = [];
    
    for (let i = 0; i < places.length - 1; i++) {
        const from = places[i];
        const to = places[i + 1];
        
        if (from.lat && from.lng && to.lat && to.lng) {
            const path = [
                { lat: from.lat, lng: from.lng },
                { lat: to.lat, lng: to.lng }
            ];
            
            routes.push({
                from: from.name,
                to: to.name,
                polyline: encodePolyline(path)
            });
        }
    }
    
    return routes;
}

/**
 * Codifica una ruta a polyline (formato de Google)
 */
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

/**
 * Codifica un número para polyline
 */
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

/**
 * Renderiza la lista de bloques
 */
function renderBlocks(blocks) {
    const container = document.getElementById('viz-blocks-list');
    
    if (blocks.length === 0) {
        container.innerHTML = '<p class="no-blocks">Día de descanso / sin bloques definidos</p>';
        return;
    }
    
    container.innerHTML = blocks.map(block => 
        `<span class="block-tag" data-block="${block}">${block}</span>`
    ).join('');
}

/**
 * Carga los lugares y rutas de todos los bloques del día
 */
async function loadDayPlaces(day) {
    vizState.places = [];
    vizState.routes = [];
    
    const loadedBlocks = new Set();
    
    for (const blockId of day.blocks) {
        if (loadedBlocks.has(blockId)) continue;
        loadedBlocks.add(blockId);
        
        try {
            const response = await fetch(
                buildRefreshUrl(`/api/block/${blockId}`),
                getAuthFetchOptions()
            );
            
            if (!response.ok) {
                console.warn(`Block ${blockId} not found`);
                continue;
            }
            
            const data = await response.json();
            
            // Agregar lugares (evitando duplicados por nombre y ubicación)
            data.places.forEach(place => {
                const existsByName = vizState.places.find(p => p.name === place.name);
                const existsByLocation = vizState.places.find(p => {
                    if (!p.lat || !p.lng || !place.lat || !place.lng) return false;
                    const distance = Math.sqrt(
                        Math.pow(p.lat - place.lat, 2) + Math.pow(p.lng - place.lng, 2)
                    );
                    return distance < 0.0001;
                });
                
                if (!existsByName && !existsByLocation) {
                    vizState.places.push(place);
                }
            });
            
        } catch (err) {
            console.error(`Error loading block ${blockId}:`, err);
        }
    }
    
    // Ordenar lugares por proximidad (Nearest Neighbor)
    const isCircular = vizState.routeType === 'circular';
    vizState.places = sortPlacesByProximity(vizState.places, isCircular);
    
    // Generar rutas secuenciales desde el ordenamiento
    vizState.routes = generateRoutesFromPlaces(vizState.places);
    
    // Reenumerar lugares para que sean secuenciales
    vizState.places.forEach((place, index) => {
        place.labelNumber = index + 1;
    });
}

async function refreshGitContent() {
    if (vizState.isRefreshing) return;

    vizState.isRefreshing = true;
    setRefreshStatus('Actualizando...');

    try {
        const response = await fetch('/api/repo/refresh', {
            method: 'POST',
            ...getAuthFetchOptions()
        });

        if (!response.ok) throw new Error('Failed to refresh repo content');

        const data = await response.json();
        vizState.refreshToken = data.refreshToken;

        await loadItinerariesList();

        if (vizState.currentItinerary?.id) {
            const previousDay = vizState.currentDay;
            const select = document.getElementById('viz-itinerary-select');
            select.value = vizState.currentItinerary.id;
            await loadSelectedItinerary();

            if (previousDay != null) {
                await selectDay(previousDay);
            }
        }

        setRefreshStatus(`Actualizado ${new Date(data.refreshedAt).toLocaleTimeString()}`);
    } catch (err) {
        console.error('Error refreshing Git content:', err);
        setRefreshStatus('No se pudo refrescar', true);
        alert('Error al refrescar el contenido desde Git');
    } finally {
        vizState.isRefreshing = false;
    }
}

/**
 * Renderiza la lista de lugares en el panel lateral
 */
function renderPlaces() {
    const container = document.getElementById('viz-places-list');
    
    if (vizState.places.length === 0) {
        // Verificar si hay bloques pero no tienen datos
        const day = vizState.days.find(d => d.day === vizState.currentDay);
        if (day && day.blocks.length > 0) {
            container.innerHTML = `
                <div class="no-places-warning">
                    <p><strong>⚠️ Faltan datos de lugares</strong></p>
                    <p>Los bloques de este día no tienen archivos de coordenadas en el repositorio:</p>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        ${day.blocks.map(b => `<li>${b}</li>`).join('')}
                    </ul>
                    <p style="font-size: 0.9em; color: #666;">
                        Bloques disponibles: 34-ginza-nihonbashi, 35-yasukuni-kokyo, 36-akabane-higashi-jujo
                    </p>
                </div>
            `;
        } else {
            container.innerHTML = '<p class="no-places">No hay lugares definidos para este día</p>';
        }
        return;
    }
    
    container.innerHTML = vizState.places.map((place, index) => {
        const hasCoords = place.lat != null && place.lng != null;
        const labelNumber = place.labelNumber || (index + 1);
        return `
            <div class="place-item ${hasCoords ? '' : 'no-coords'}" data-index="${index}">
                <span class="place-number">${labelNumber}</span>
                <span class="place-icon">📍</span>
                <div class="place-info">
                    <div class="place-name">${cleanPlaceName(place.name)}</div>
                    ${place.address ? `<div class="place-address">${place.address}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    // Agregar eventos de click
    container.querySelectorAll('.place-item').forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.dataset.index);
            focusOnPlace(index);
        });
    });
}

/**
 * Inicializa el mapa del visualizador con Google Maps
 */
function initVizMap() {
    // Esperar a que Google Maps esté disponible
    if (window.google && window.google.maps) {
        ensureMap();
    } else {
        // Si no está cargado, intentar más tarde
        setTimeout(initVizMap, 500);
    }
}

/**
 * Inicializa o reinicializa el mapa con Google Maps
 */
function ensureMap() {
    if (vizState.map) return;
    
    const mapContainer = document.getElementById('viz-map');
    
    vizState.map = new google.maps.Map(mapContainer, {
        center: { lat: 35.6762, lng: 139.6503 }, // Centro de Tokyo
        zoom: 12
    });
    
    vizState.infoWindow = new google.maps.InfoWindow();
}

/**
 * Actualiza el mapa con los lugares actuales
 */
function updateMap() {
    ensureMap();
    
    // Limpiar marcadores y rutas anteriores
    vizState.markers.forEach(m => m.setMap(null));
    vizState.polylines.forEach(p => p.setMap(null));
    vizState.markers = [];
    vizState.polylines = [];
    
    const bounds = new google.maps.LatLngBounds();
    let hasValidPoints = false;
    
    // Agregar marcadores para cada lugar con coordenadas
    vizState.places.forEach((place, index) => {
        if (place.lat != null && place.lng != null) {
            // Usar el labelNumber (número que se muestra) o el índice + 1
            const labelNumber = place.labelNumber || (index + 1);
            
            const marker = new google.maps.Marker({
                position: { lat: place.lat, lng: place.lng },
                map: vizState.map,
                title: `${labelNumber}. ${cleanPlaceName(place.name)}`,
                label: {
                    text: String(labelNumber),
                    color: 'white'
                }
            });
            
            // InfoWindow al hacer click
            marker.addListener('click', () => {
                vizState.infoWindow.setContent(`
                    <div style="min-width: 200px;">
                        <b>${labelNumber}. ${cleanPlaceName(place.name)}</b><br>
                        ${place.address || ''}
                    </div>
                `);
                vizState.infoWindow.open(vizState.map, marker);
            });
            
            vizState.markers.push(marker);
            bounds.extend({ lat: place.lat, lng: place.lng });
            hasValidPoints = true;
        }
    });
    
    // Mostrar ruta si está activado
    if (vizState.showRoute && vizState.routes.length > 0) {
        drawRoutes();
    }
    
    // Ajustar bounds si hay puntos válidos
    if (hasValidPoints) {
        vizState.map.fitBounds(bounds, { padding: 50 });
    }
}

/**
 * Dibuja las rutas en el mapa con Google Maps
 */
function drawRoutes() {
    vizState.routes.forEach(route => {
        if (route.polyline) {
            try {
                const decoded = decodePolyline(route.polyline);
                if (decoded.length > 0) {
                    const path = decoded.map(coord => ({ lat: coord[0], lng: coord[1] }));
                    
                    const polyline = new google.maps.Polyline({
                        path: path,
                        geodesic: true,
                        strokeColor: '#FF6B6B',
                        strokeOpacity: 0.8,
                        strokeWeight: 3
                    });
                    
                    polyline.setMap(vizState.map);
                    vizState.polylines.push(polyline);
                }
            } catch (err) {
                console.warn('Error decoding polyline:', err);
            }
        }
    });
}

/**
 * Decodifica una polyline codificada (algoritmo de Google)
 */
function decodePolyline(encoded) {
    const points = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
        let b;
        let shift = 0;
        let result = 0;
        
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        
        const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;
        
        shift = 0;
        result = 0;
        
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        
        const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;
        
        points.push([lat / 1e5, lng / 1e5]);
    }
    
    return points;
}

/**
 * Enfoca el mapa en un lugar específico
 */
function focusOnPlace(index) {
    const place = vizState.places[index];
    if (!place || place.lat == null || place.lng == null) return;
    
    vizState.map.setCenter({ lat: place.lat, lng: place.lng });
    vizState.map.setZoom(16);
    
    // Abrir InfoWindow del marcador
    if (vizState.markers[index]) {
        google.maps.event.trigger(vizState.markers[index], 'click');
    }
}

/**
 * Toggle para mostrar/ocultar rutas
 */
function toggleRoute() {
    vizState.showRoute = document.getElementById('viz-show-route').checked;
    updateMap();
}

/**
 * Cambia el tipo de ruta y recarga el día actual
 */
function changeRouteType() {
    const radioButtons = document.getElementsByName('route-type');
    for (const radio of radioButtons) {
        if (radio.checked) {
            vizState.routeType = radio.value;
            break;
        }
    }
    
    // Recargar el día actual con el nuevo tipo de ruta
    if (vizState.currentDay) {
        selectDay(vizState.currentDay);
    }
}

// Exponer funciones globales necesarias
window.loadSelectedItinerary = loadSelectedItinerary;
window.selectDay = selectDay;
window.toggleRoute = toggleRoute;
window.changeRouteType = changeRouteType;
window.focusOnPlace = focusOnPlace;
window.initVizAfterLogin = initVizAfterLogin;
window.refreshGitContent = refreshGitContent;
window.vizState = vizState;
