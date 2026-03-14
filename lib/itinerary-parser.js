const fs = require('fs').promises;
const path = require('path');

/**
 * Parsea un archivo de itinerario Markdown y extrae la estructura de días
 * @param {string} content - Contenido del archivo Markdown
 * @returns {Object} - Estructura del itinerario con días
 */
function parseItinerary(content) {
    const lines = content.split('\n');
    const days = [];
    let currentDay = null;
    let metadata = {
        base: '',
        dates: ''
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detectar línea base: "Base: XXXX"
        const baseMatch = line.match(/^\*\*Base:\*\*\s*(.+)/i);
        if (baseMatch) {
            metadata.base = baseMatch[1].trim();
            continue;
        }

        // Detectar fechas: "Fechas: DD/MM/YYYY – DD/MM/YYYY"
        const datesMatch = line.match(/^\*\*Fechas:\*\*\s*(.+)/i);
        if (datesMatch) {
            metadata.dates = datesMatch[1].trim();
            continue;
        }

        // Detectar día: "### Día X – DD/MM Título"
        // Soporta diferentes formatos: "Día X –" o "Día X -"
        const dayMatch = line.match(/###\s*D[ií]a\s*(\d+)\s*[–-]\s*(\d+\/\d+)\s*(.+)/i);
        if (dayMatch) {
            // Guardar día anterior si existe
            if (currentDay) {
                days.push(currentDay);
            }

            currentDay = {
                day: parseInt(dayMatch[1]),
                date: dayMatch[2],
                title: dayMatch[3].trim(),
                blocks: [],
                purpose: '',
                isBuffer: false
            };
            continue;
        }

        // Detectar bloques numéricos clásicos o IDs derivados tipo "alt-templos-caminatas-d01-asakusa"
        const blockMatch = line.match(/^-\s*([a-z0-9]+(?:-[a-z0-9]+)+)/i);
        if (blockMatch && currentDay) {
            currentDay.blocks.push(blockMatch[1]);
            continue;
        }

        // Detectar propósito: "🎯 **Apunta a:** texto" o variaciones
        const purposeMatch = line.match(/🎯\s*\*\*Apunta\s*a:\*\*\s*(.+)/i);
        if (purposeMatch && currentDay) {
            currentDay.purpose = purposeMatch[1].trim();
            continue;
        }

        // Propósito sin emoji
        const purposeMatch2 = line.match(/\*\*Apunta\s*a:\*\*\s*(.+)/i);
        if (purposeMatch2 && currentDay) {
            currentDay.purpose = purposeMatch2[1].trim();
        }
    }

    // Guardar último día
    if (currentDay) {
        days.push(currentDay);
    }

    // Marcar buffer days (días sin bloques)
    const bufferDays = [];
    days.forEach(day => {
        if (day.blocks.length === 0) {
            day.isBuffer = true;
            bufferDays.push(day.day);
        }
    });

    return {
        ...metadata,
        days,
        bufferDays
    };
}

/**
 * Extrae el nombre del itinerario desde el título del archivo
 * @param {string} filename - Nombre del archivo
 * @returns {string} - Nombre legible del itinerario
 */
function getItineraryName(filename) {
    // Quitar extensión y prefijos comunes
    let name = filename.replace(/\.md$/i, '');
    name = name.replace(/^itinerario-2026-primavera-/i, '');
    name = name.replace(/-/g, ' ');
    
    // Capitalizar primera letra de cada palabra
    return name.replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Genera un ID único para el itinerario
 * @param {string} filename - Nombre del archivo
 * @returns {string} - ID del itinerario
 */
function getItineraryId(filename) {
    return filename
        .replace(/\.md$/i, '')
        .replace(/^itinerario-2026-primavera-/i, '')
        .toLowerCase();
}

/**
 * Carga y parsea todos los itinerarios disponibles
 * @param {string} itinerariesDir - Directorio de itinerarios
 * @returns {Array} - Lista de itinerarios parseados
 */
async function loadAllItineraries(itinerariesDir) {
    try {
        const files = await fs.readdir(itinerariesDir);
        const mdFiles = files.filter(f => f.endsWith('.md'));
        
        const itineraries = [];
        for (const file of mdFiles) {
            const content = await fs.readFile(path.join(itinerariesDir, file), 'utf8');
            const parsed = parseItinerary(content);
            
            itineraries.push({
                id: getItineraryId(file),
                name: getItineraryName(file),
                file: file,
                ...parsed
            });
        }
        
        return itineraries;
    } catch (err) {
        console.error('Error loading itineraries:', err);
        return [];
    }
}

module.exports = {
    parseItinerary,
    getItineraryName,
    getItineraryId,
    loadAllItineraries
};
