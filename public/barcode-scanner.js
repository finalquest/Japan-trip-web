// Barcode Scanner usando ZXing
(function() {
    'use strict';

    function getZXingBrowser() {
        if (typeof window.ZXingBrowser !== 'undefined') {
            return window.ZXingBrowser;
        }
        if (typeof window.zxing !== 'undefined') {
            return window.zxing;
        }
        if (typeof window.BrowserMultiFormatReader !== 'undefined') {
            return { BrowserMultiFormatReader: window.BrowserMultiFormatReader };
        }
        return null;
    }

    window.BarcodeScanner = {
        _controls: null,
        _reader: null,

        start: async function(videoElement, onDetected, onError) {
            const ZXing = getZXingBrowser();
            
            if (!ZXing) {
                const errorMsg = 'ZXing no está cargado';
                if (onError) onError(errorMsg);
                throw new Error(errorMsg);
            }

            const BrowserMultiFormatReader = ZXing.BrowserMultiFormatReader;
            
            if (!BrowserMultiFormatReader) {
                const errorMsg = 'BrowserMultiFormatReader no encontrado';
                if (onError) onError(errorMsg);
                throw new Error(errorMsg);
            }

            this._reader = new BrowserMultiFormatReader();
            
            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new Error('Este navegador no permite usar la cámara');
                }

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
                            onDetected(result.getText());
                        }
                        if (err) {
                            if (err.name === 'NotFoundException' || 
                                err.message?.includes('No MultiFormat Readers')) {
                                return;
                            }
                            if (onError) onError(err.message);
                        }
                    },
                );
                
                return this._controls;
            } catch (err) {
                const message = err instanceof DOMException && err.name === 'NotAllowedError'
                    ? 'No tenemos permiso para usar la cámara. Permitilo y volvé a intentarlo.'
                    : err instanceof Error ? err.message : 'No se pudo iniciar la cámara';
                if (onError) onError(message);
                throw err;
            }
        },

        stop: function() {
            if (this._controls) {
                try { this._controls.stop(); } catch (e) {}
                this._controls = null;
            }
            if (this._reader) {
                try { this._reader.reset(); } catch (e) {}
                this._reader = null;
            }
        }
    };
})();
