// Estado global
let map;
let currentFindings = [];

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadFindings();
    setupEventListeners();
});

// Tabs
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(tabName === 'map' ? 'map-section' : 'findings-section').classList.add('active');
    event.target.classList.add('active');
    
    if (tabName === 'map' && map) {
        google.maps.event.trigger(map, 'resize');
    }
}

// Inicializar mapa
function initMap() {
    map = new google.maps.Map(document.getElementById('map-container'), {
        center: { lat: 35.6762, lng: 139.6503 }, // Tokyo
        zoom: 12
    });
}

// Cargar KML
function loadKML(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const kmlData = e.target.result;
        
        // Parsear KML básico para mostrar puntos
        const parser = new DOMParser();
        const kml = parser.parseFromString(kmlData, 'text/xml');
        
        // Limpiar mapa anterior
        map.data.forEach(feature => map.data.remove(feature));
        
        // Agregar KML al mapa
        const kmlLayer = new google.maps.KmlLayer({
            url: URL.createObjectURL(new Blob([kmlData], { type: 'application/vnd.google-earth.kml+xml' })),
            map: map
        });
        
        // También parsear manualmente para mostrar lista
        displayKMLPoints(kml);
    };
    reader.readAsText(file);
}

function displayKMLPoints(kmlDoc) {
    const placemarks = kmlDoc.querySelectorAll('Placemark');
    const infoDiv = document.getElementById('route-info');
    let html = `<h3>Puntos en el itinerario (${placemarks.length})</h3><ul>`;
    
    const bounds = new google.maps.LatLngBounds();
    
    placemarks.forEach((placemark, i) => {
        const name = placemark.querySelector('name')?.textContent || `Punto ${i+1}`;
        const desc = placemark.querySelector('description')?.textContent || '';
        const coords = placemark.querySelector('coordinates')?.textContent?.trim();
        
        if (coords) {
            const [lng, lat] = coords.split(',').map(Number);
            if (!isNaN(lat) && !isNaN(lng)) {
                bounds.extend({ lat, lng });
                
                const marker = new google.maps.Marker({
                    position: { lat, lng },
                    map: map,
                    title: name
                });
                
                const infowindow = new google.maps.InfoWindow({
                    content: `<strong>${name}</strong><br>${desc}`
                });
                
                marker.addListener('click', () => infowindow.open(map, marker));
            }
        }
        
        html += `<li><strong>${name}</strong>${desc ? ': ' + desc.substring(0, 50) + '...' : ''}</li>`;
    });
    
    html += '</ul>';
    infoDiv.innerHTML = html;
    
    if (!bounds.isEmpty()) {
        map.fitBounds(bounds);
    }
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
