#!/usr/bin/env python3
"""Simple HTTP server with barcode lookup proxy"""
import http.server
import socketserver
import json
import urllib.request
import urllib.error
import ssl
import os

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def do_GET(self):
        if self.path.startswith('/api/lookup-barcode'):
            self.handle_barcode_lookup()
        else:
            super().do_GET()
    
    def handle_barcode_lookup(self):
        # Extraer barcode de la query
        from urllib.parse import parse_qs, urlparse
        query = parse_qs(urlparse(self.path).query)
        barcode = query.get('code', [''])[0]
        
        if not barcode:
            self.send_error(400, 'Missing barcode')
            return
        
        try:
            # Hacer request a go-upc.com
            url = f'https://go-upc.com/search?q={barcode}'
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            req = urllib.request.Request(url, headers=headers)
            
            # Ignorar verificación SSL para desarrollo
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            
            with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
                html = response.read().decode('utf-8')
                
                # Parsear HTML simple
                import re
                
                # Buscar nombre del producto
                name_match = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.DOTALL)
                name = re.sub(r'<[^>]+>', '', name_match.group(1)).strip() if name_match else None
                
                # Buscar imagen
                img_match = re.search(r'<img[^>]+src="([^"]+)"[^>]*class="[^"]*product[^"]*"', html, re.IGNORECASE)
                if not img_match:
                    img_match = re.search(r'<img[^>]+src="([^"]+)"[^>]*>', html)
                image = img_match.group(1) if img_match else None
                
                # Buscar descripción
                desc_match = re.search(r'<meta[^>]+name="description"[^>]+content="([^"]+)"', html)
                description = desc_match.group(1) if desc_match else None
                
                result = {
                    'barcode': barcode,
                    'name': name,
                    'image': image,
                    'description': description,
                    'found': name is not None
                }
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())
                
        except Exception as e:
            print(f'Error looking up barcode: {e}')
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e), 'found': False}).encode())
    
    def end_headers(self):
        # Agregar CORS headers para todas las respuestas
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"Serving at http://localhost:{PORT}")
        print(f"API endpoint: http://localhost:{PORT}/api/lookup-barcode?code=YOUR_BARCODE")
        httpd.serve_forever()
