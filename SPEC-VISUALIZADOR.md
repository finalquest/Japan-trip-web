# Documento Técnico: Visualizador de Itinerarios Tokio 2026

## 1. Resumen Ejecutivo

**Objetivo:** SPA que visualiza itinerarios de viaje con Google Maps, permitiendo navegar entre días (1-20) y alternar entre variantes de itinerario.

**Stack:** Node.js + Express (backend) + Vanilla JS (frontend) + Google Maps JavaScript API

---

## 2. Estructura de Datos de Entrada

### 2.1 Archivos de Itinerario (Markdown)

**Ubicación:** `itinerarios/*.md`

**Formato:**
```markdown
### Día 1 – 22/3 Tokio Norte I

**Bloques:**
- 10-itabashi-oyama
- 36-akabane-higashijujo

🎯 **Apunta a:** Reubicarse en el barrio y observar el Japón cotidiano sin filtro turístico.
```

**Campos a extraer:**
- `day`: Número de día (1-20)
- `date`: Fecha (ej: "22/3")
- `title`: Título después de la fecha (ej: "Tokio Norte I")
- `blocks`: Array de IDs de bloques (ej: ["10-itabashi-oyama", "36-akabane-higashijujo"])
- `purpose`: Texto después de 🎯 **Apunta a:**
- `isBuffer`: Boolean (true si no tiene bloques definidos)

### 2.2 Archivos de Lugares (JSON)

**Ubicación:** `data/places/{block-id}.json`

**Estructura:**
```json
[
  {
    "name": "Kaminari mon",
    "address": "2 Chome-3-1 Asakusa, Taito City, Tokyo 111-0032, Japón",
    "lat": 35.7111163,
    "lng": 139.7963656,
    "place_id": "ChIJ0YwG28aOGGARvRKAXIBWqNk",
    "aliases": ["Kaminarimon Gate"]
  }
]
```

### 2.3 Archivos de Rutas (JSON) - Opcional

**Ubicación:** `data/routes/{block-id}.json`

**Estructura:**
```json
[
  {
    "from": "Kaminari mon",
    "to": "Calle Comercial Nakamise",
    "polyline": "oy}xEi~ftYoCO",
    "distance": "81 m",
    "duration": "1 min"
  }
]
```

---

## 3. API del Servidor (Endpoints)

### 3.1 `GET /api/itineraries`
**Descripción:** Lista todas las variantes de itinerario disponibles

**Response:**
```json
{
  "itineraries": [
    {
      "id": "base-itabashi",
      "name": "Base Itabashi",
      "file": "itinerario-2026-primavera-base-itabashi.md"
    },
    {
      "id": "atami-dia1",
      "name": "Atami Día 1",
      "file": "itinerario-2026-primavera-atami-dia1.md"
    }
  ]
}
```

### 3.2 `GET /api/itinerary/:id`
**Descripción:** Parsea un itinerario específico y retorna estructura de días

**Response:**
```json
{
  "id": "base-itabashi",
  "name": "Base Itabashi",
  "base": "Itabashi",
  "dates": "22/03/2026 – 10/04/2026",
  "days": [
    {
      "day": 1,
      "date": "22/3",
      "title": "Tokio Norte I",
      "purpose": "Reubicarse en el barrio y observar el Japón cotidiano...",
      "blocks": ["10-itabashi-oyama", "36-akabane-higashijujo"],
      "isBuffer": false
    },
    {
      "day": 7,
      "date": "28/3", 
      "title": "Buffer / Sakura Local",
      "purpose": "No hacer nada obligatorio...",
      "blocks": [],
      "isBuffer": true
    }
  ],
  "bufferDays": [7, 14, 20]
}
```

### 3.3 `GET /api/block/:id`
**Descripción:** Carga lugares y rutas de un bloque específico

**Response:**
```json
{
  "blockId": "1-asakusa",
  "places": [
    {
      "name": "Kaminari mon",
      "address": "2 Chome-3-1 Asakusa...",
      "lat": 35.7111163,
      "lng": 139.7963656
    }
  ],
  "routes": [
    {
      "from": "Kaminari mon",
      "to": "Calle Comercial Nakamise",
      "polyline": "oy}xEi~ftYoCO"
    }
  ]
}
```

---

## 4. Especificación del Frontend

### 4.1 Estructura de Componentes

```
┌─────────────────────────────────────────────────────────────┐
│  [Dropdown: Base Itabashi ▼]                                │
├─────────────────────────────────────────────────────────────┤
│  Día 1  Día 2  Día 3 ... Día 20  |  Buffer 1  Buffer 2     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────┐  ┌──────────────────────┐ │
│  │                              │  │ Día 1 - Tokio Norte I│ │
│  │                              │  ├──────────────────────┤ │
│  │      GOOGLE MAPS             │  │ 🎯 Objetivo: ...     │ │
│  │                              │  │                      │ │
│  │   [Markers + Polylines]      │  │ Bloques:             │ │
│  │                              │  │ • 10-itabashi-oyama  │ │
│  │                              │  │ • 36-akabane...      │ │
│  │                              │  │                      │ │
│  │  [Ver ruta ▼]                │  │ Lugares:             │ │
│  │                              │  │ 1. 📍 Lugar A        │ │
│  │                              │  │ 2. 📍 Lugar B        │ │
│  │                              │  │ 3. 📍 Lugar C        │ │
│  └──────────────────────────────┘  └──────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Interacciones

**Navegación de días:**
- Click en día → Cargar lugares de todos los bloques de ese día
- Día activo destacado visualmente
- Buffer days al final con etiquetas "Buffer 1", "Buffer 2", "Buffer 3"

**Mapa:**
- Markers para todos los lugares del día actual
- Click en marker → InfoWindow con nombre y dirección
- Botón toggle "Mostrar ruta" → Decodificar polylines y dibujar en mapa
- Auto-fit bounds para mostrar todos los puntos

**Panel lateral:**
- Lista ordenada de lugares (orden de aparición en bloques)
- Bloques como tags clickeables (opcional: resaltar sus lugares)
- Propósito del día destacado con icono 🎯

### 4.3 Lógica de Merge de Lugares

Para cada día:
1. Iterar `blocks` array
2. Para cada bloque, hacer `fetch /api/block/{id}`
3. Concatenar todos los `places` manteniendo orden de bloques
4. Concatenar todas las `routes` (para polylines)
5. Eliminar duplicados por `name` (si un lugar aparece en múltiples bloques)

---

## 5. Dependencias

### 5.1 Backend (package.json)
```json
{
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0"
  }
}
```

### 5.2 Frontend
- Google Maps JavaScript API (cargar con API key)
- Sin frameworks adicionales (Vanilla JS + CSS Grid/Flexbox)

### 5.3 Variables de Entorno (.env)
```
GOOGLE_MAPS_API_KEY=your_api_key_here
PORT=3000
```

---

## 6. Estructura de Archivos del Proyecto

```
/web/
├── server.js                   # Servidor Express
├── package.json
├── .env                        # No commitear (API keys)
├── .env.example                # Template
├── lib/
│   └── itinerary-parser.js     # Parser de Markdown
├── public/
│   ├── index.html              # SPA
│   ├── css/
│   │   └── styles.css          # Responsive layout
│   └── js/
│       ├── app.js              # Entry point, state
│       ├── map.js              # Google Maps API wrapper
│       ├── parser.js           # Client-side helpers
│       └── ui.js               # DOM manipulation
└── README.md                   # Instrucciones de setup
```

---

## 7. Algoritmos Clave

### 7.1 Parser de Markdown (Node.js)
```javascript
// Pseudocódigo
function parseItinerary(mdContent) {
  const days = [];
  const lines = mdContent.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detectar día: "### Día X – DD/MM Título"
    const dayMatch = line.match(/### Día (\d+) – (\d+\/\d+) (.+)/);
    if (dayMatch) {
      currentDay = {
        day: parseInt(dayMatch[1]),
        date: dayMatch[2],
        title: dayMatch[3].trim(),
        blocks: [],
        purpose: ''
      };
    }
    
    // Detectar bloques: "- XX-nombre-del-bloque"
    const blockMatch = line.match(/^- (\d{1,2}-[\w-]+)/);
    if (blockMatch && currentDay) {
      currentDay.blocks.push(blockMatch[1]);
    }
    
    // Detectar propósito: "🎯 **Apunta a:** texto"
    const purposeMatch = line.match(/🎯 \*\*Apunta a:\*\* (.+)/);
    if (purposeMatch && currentDay) {
      currentDay.purpose = purposeMatch[1];
    }
    
    // Guardar día al encontrar siguiente ### o final
  }
  
  return days;
}
```

### 7.2 Decoder de Polyline (Google Maps)
```javascript
// Usar google.maps.geometry.encoding.decodePath(polylineString)
function decodePolyline(encoded) {
  return google.maps.geometry.encoding.decodePath(encoded);
}
```

### 7.3 Dibujar Rutas en Mapa
```javascript
function drawRoute(map, routes) {
  routes.forEach(route => {
    const path = decodePolyline(route.polyline);
    new google.maps.Polyline({
      path: path,
      map: map,
      strokeColor: '#FF0000',
      strokeWeight: 2
    });
  });
}
```

---

## 8. Instrucciones de Setup

### 8.1 Instalación
```bash
cd web/
npm install
cp .env.example .env
# Editar .env con tu GOOGLE_MAPS_API_KEY
npm start
```

### 8.2 Estructura de datos requerida (desde el otro repo)
El servidor espera:
- `../itinerarios/*.md` (archivos de itinerario)
- `../data/places/*.json` (coordenadas)
- `../data/routes/*.json` (opcional, para polylines)

---

## 9. Consideraciones

### 9.1 Manejo de errores
- Bloque sin archivo JSON → Mostrar en lista con warning ⚠️
- API de Maps no disponible → Mostrar mensaje de error
- Itinerario sin bloques (buffer) → Mostrar solo propósito

### 9.2 Performance
- Cachear resultados de parseo en memoria (el itinerario no cambia en runtime)
- Lazy loading de bloques (cargar solo cuando se selecciona el día)

### 9.3 Responsive
- Desktop: Split view 60% mapa / 40% lista
- Mobile: Stack vertical (mapa arriba, lista abajo) o drawer para lista

---

## 10. Checklist de Implementación

- [ ] Setup básico Express + static files
- [ ] Endpoint `/api/itineraries` (listar archivos MD)
- [ ] Endpoint `/api/itinerary/:id` (parser Markdown)
- [ ] Endpoint `/api/block/:id` (cargar JSON)
- [ ] Frontend: Cargar Google Maps API
- [ ] Frontend: Dropdown de variantes
- [ ] Frontend: Navegación días 1-20
- [ ] Frontend: Renderizar markers
- [ ] Frontend: Toggle "Mostrar ruta"
- [ ] Frontend: Panel lateral con detalles
- [ ] Responsive design
- [ ] Manejo de errores
