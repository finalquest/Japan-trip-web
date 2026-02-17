# 🇯🇵 Japan Trip Planner

Web app simple para planificar y documentar tu viaje a Japón.

## Funcionalidades

### 🗺️ 1. Itinerario con KML
- Subí tu archivo KML exportado de Google My Maps
- Se renderiza el mapa con todos tus puntos marcados
- Lista de lugares debajo del mapa

### 📸 2. "Encontré Esto"
- Guardá fotos de cosas interesantes que ves pero no comprás
- Agregá notas (precio, tienda, por qué no lo compraste)
- Tags para organizar (#figure, #retro, #electronics, etc.)
- Geolocalización para recordar dónde lo viste
- Todo se guarda localmente en tu navegador (localStorage)

## Cómo usar

### Setup inicial
1. Copiá `config.js.example` a `config.js`
2. Editá `config.js` y agregá tu Google Maps API key
3. Abrí `index.html` en tu navegador

### Local (sin instalar nada)
1. Abrí el archivo `index.html` en tu navegador
2. ¡Listo! No necesitás servidor ni nada

### Para usar desde el celular
1. Subí los archivos a GitHub Pages, Netlify, o cualquier hosting estático
2. Abrí la URL desde tu celular
3. Podés sacar fotos directo desde la cámara del teléfono

## Exportar KML desde Google My Maps

1. Andá a [Google My Maps](https://www.google.com/mymaps)
2. Abrí tu mapa
3. Menú (tres puntos) → "Export to KML/KMZ"
4. Descargá el archivo
5. Subilo a la app

## Datos

Todo se guarda en el **localStorage** de tu navegador. 
- ✅ Funciona offline después de cargar una vez
- ✅ Los datos son privados (quedan en tu dispositivo)
- ❌ Si borrás el cache del navegador, perdés los datos
- ❌ No se sincroniza entre dispositivos automáticamente

Para hacer backup: exportá los datos manualmente (futura mejora).

## Mejoras futuras

- [ ] Exportar/Importar datos JSON
- [ ] Sincronización con Google Drive/Dropbox
- [ ] Compartir hallazgos con QR
- [ ] Integración con API para buscar tiendas cercanas
- [ ] Modo offline completo (PWA)

## Tecnología

- HTML5/CSS3/Vanilla JS
- Google Maps JavaScript API
- LocalStorage para persistencia
- Responsive (funciona en celular y desktop)
