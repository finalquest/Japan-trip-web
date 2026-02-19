// Barcode Scanner usando ZXing - Con logs de debug
(function() {
    'use strict';

    function getZXingBrowser() {
        console.log('[BARCODE] Buscando ZXing...');
        console.log('[BARCODE] window.ZXingBrowser:', typeof window.ZXingBrowser);
        console.log('[BARCODE] window.zxing:', typeof window.zxing);
        console.log('[BARCODE] window.BrowserMultiFormatReader:', typeof window.BrowserMultiFormatReader);
        
        if (typeof window.ZXingBrowser !== 'undefined') {
            console.log('[BARCODE] Encontrado: window.ZXingBrowser');
            return window.ZXingBrowser;
        }
        if (typeof window.zxing !== 'undefined') {
            console.log('[BARCODE] Encontrado: window.zxing');
            return window.zxing;
        }
        if (typeof window.BrowserMultiFormatReader !== 'undefined') {
            console.log('[BARCODE] Encontrado: window.BrowserMultiFormatReader directo');
            return { BrowserMultiFormatReader: window.BrowserMultiFormatReader };
        }
        console.log('[BARCODE] ERROR: ZXing no encontrado');
        return null;
    }

    window.BarcodeScanner = {
        _controls: null,
        _reader: null,

        start: async function(videoElement, onDetected, onError) {
            console.log('[BARCODE] Iniciando scanner...');
            console.log('[BARCODE] videoElement:', videoElement);
            console.log('[BARCODE] videoElement.tagName:', videoElement?.tagName);
            
            const ZXing = getZXingBrowser();
            
            if (!ZXing) {
                const errorMsg = 'ZXing no está cargado';
                console.error('[BARCODE]', errorMsg);
                if (onError) onError(errorMsg);
                throw new Error(errorMsg);
            }

            const BrowserMultiFormatReader = ZXing.BrowserMultiFormatReader;
            
            if (!BrowserMultiFormatReader) {
                const errorMsg = 'BrowserMultiFormatReader no encontrado';
                console.error('[BARCODE]', errorMsg);
                if (onError) onError(errorMsg);
                throw new Error(errorMsg);
            }

            console.log('[BARCODE] Creando reader...');
            this._reader = new BrowserMultiFormatReader();
            
            try {
                console.log('[BARCODE] Verificando getUserMedia...');
                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new Error('Este navegador no permite usar la cámara');
                }
                console.log('[BARCODE] getUserMedia disponible');

                console.log('[BARCODE] Pidiendo permisos...');
                const permissionStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' } },
                });
                console.log('[BARCODE] Permisos concedidos, deteniendo stream temporal');
                permissionStream.getTracks().forEach((track) => track.stop());

                const constraints = {
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                };
                console.log('[BARCODE] Constraints:', constraints);

                console.log('[BARCODE] Iniciando decodeFromConstraints...');
                console.log('[BARCODE] Video paused:', videoElement.paused);
                console.log('[BARCODE] Video readyState:', videoElement.readyState);
                
                // Asegurar que el video esté reproduciendo
                videoElement.play().then(() => {
                    console.log('[BARCODE] Video reproduciendo');
                }).catch(e => {
                    console.error('[BARCODE] Error reproduciendo video:', e);
                });
                
                let frameCount = 0;
                let lastLogTime = Date.now();
                
                this._controls = await this._reader.decodeFromConstraints(
                    constraints,
                    videoElement,
                    (result, err) => {
                        frameCount++;
                        const now = Date.now();
                        if (now - lastLogTime > 2000) {
                            console.log('[BARCODE] Frames procesados:', frameCount, 'Video playing:', !videoElement.paused);
                            lastLogTime = now;
                        }
                        if (result) {
                            console.log('[BARCODE] ¡CÓDIGO DETECTADO!', result.getText());
                            onDetected(result.getText());
                        }
                        if (err) {
                            if (err.name === 'NotFoundException' || 
                                err.message?.includes('No MultiFormat Readers')) {
                                // Ignorar, es normal
                                return;
                            }
                            console.error('[BARCODE] Error en scan:', err.name, err.message);
                            if (onError) onError(err.message);
                        }
                    },
                );
                
                console.log('[BARCODE] Scanner iniciado correctamente');
                return this._controls;
            } catch (err) {
                console.error('[BARCODE] Error iniciando:', err.name, err.message);
                const message = err instanceof DOMException && err.name === 'NotAllowedError'
                    ? 'No tenemos permiso para usar la cámara. Permitilo y volvé a intentarlo.'
                    : err instanceof Error ? err.message : 'No se pudo iniciar la cámara';
                if (onError) onError(message);
                throw err;
            }
        },

        stop: function() {
            console.log('[BARCODE] Deteniendo scanner...');
            if (this._controls) {
                try { this._controls.stop(); } catch (e) {}
                this._controls = null;
            }
            if (this._reader) {
                try { this._reader.reset(); } catch (e) {}
                this._reader = null;
            }
            console.log('[BARCODE] Scanner detenido');
        }
    };
    
    console.log('[BARCODE] BarcodeScanner cargado');
})();
