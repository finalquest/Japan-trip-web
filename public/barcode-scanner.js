// Barcode Scanner usando ZXing - Versión robusta con auto-detección
(function() {
    'use strict';

    // Detectar dónde está disponible ZXing
    function getZXingBrowser() {
        // Intentar diferentes formas en que ZXing podría estar disponible
        if (typeof window.ZXingBrowser !== 'undefined') {
            return window.ZXingBrowser;
        }
        if (typeof window.zxing !== 'undefined') {
            return window.zxing;
        }
        // El archivo zxing-browser.min.js expone a 'exports' o global
        // Verificar si hay clases específicas disponibles directamente
        if (typeof window.BrowserMultiFormatReader !== 'undefined') {
            return {
                BrowserMultiFormatReader: window.BrowserMultiFormatReader
            };
        }
        return null;
    }

    window.BarcodeScanner = {
        // Variable para guardar los controles del scanner
        _controls: null,
        _reader: null,

        start: async function(videoElement, onDetected, onError) {
            const ZXing = getZXingBrowser();
            
            if (!ZXing) {
                const errorMsg = 'ZXing no está cargado. Verificá que zxing-browser.min.js esté cargado antes de barcode-scanner.js';
                console.error(errorMsg);
                if (onError) onError(errorMsg);
                throw new Error(errorMsg);
            }

            const BrowserMultiFormatReader = ZXing.BrowserMultiFormatReader;
            
            if (!BrowserMultiFormatReader) {
                const errorMsg = 'BrowserMultiFormatReader no encontrado en ZXing';
                console.error(errorMsg, 'ZXing disponible:', Object.keys(ZXing));
                if (onError) onError(errorMsg);
                throw new Error(errorMsg);
            }

            this._reader = new BrowserMultiFormatReader();
            
            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new Error('Este navegador no permite usar la cámara');
                }

                // Solicitar permisos con la cámara trasera ideal
                const permissionStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' } },
                });
                permissionStream.getTracks().forEach((track) => track.stop());

                const constraints = {
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                };

                this._controls = await this._reader.decodeFromConstraints(
                    constraints,
                    videoElement,
                    (result, err) => {
                        if (result) {
                            const barcode = result.getText();
                            console.log('Barcode detectado:', barcode);
                            onDetected(barcode);
                        }
                        if (err) {
                            // NotFoundException es normal cuando no hay código
                            if (err.name === 'NotFoundException' || 
                                err.message?.includes('No MultiFormat Readers')) {
                                return;
                            }
                            console.log('Scanner error (ignorado):', err.message || err);
                            if (onError) onError(err.message);
                        }
                    },
                );
                
                return this._controls;
            } catch (err) {
                const message =
                    err instanceof DOMException && err.name === 'NotAllowedError'
                        ? 'No tenemos permiso para usar la cámara. Permitilo y volvé a intentarlo.'
                        : err instanceof Error
                            ? err.message
                            : 'No se pudo iniciar la cámara';
                console.error('Error iniciando scanner:', err);
                if (onError) onError(message);
                throw err;
            }
        },

        stop: function() {
            if (this._controls) {
                try {
                    this._controls.stop();
                } catch (e) {
                    console.log('Error al detener controls:', e);
                }
                this._controls = null;
            }
            if (this._reader) {
                try {
                    this._reader.reset();
                } catch (e) {
                    console.log('Error al resetear reader:', e);
                }
                this._reader = null;
            }
        }
    };

    // Log para debugging
    console.log('BarcodeScanner cargado. ZXing disponible:', !!getZXingBrowser());
})();
