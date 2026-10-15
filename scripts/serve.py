#!/usr/bin/env python3
"""Static localhost-only server, gzip cache and conditional responses. No third-party dependency."""
import argparse, gzip, hashlib, http.server, mimetypes, threading
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT=Path(__file__).resolve().parents[1]/'app'
CACHE={}; LOCK=threading.Lock()

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self): self.respond(False)
    def do_HEAD(self): self.respond(True)
    def respond(self, head):
        path=(ROOT/unquote(urlsplit(self.path).path).lstrip('/')).resolve()
        if not path.is_relative_to(ROOT): self.send_error(403); return
        if path.is_dir(): path=path/'index.html'
        if not path.is_file(): self.send_error(404); return
        use_gzip='gzip' in self.headers.get('Accept-Encoding','') and path.suffix in {'.js','.mjs','.json','.geojson','.css','.html','.svg'}
        stat=path.stat(); key=(str(path),stat.st_mtime_ns,use_gzip)
        with LOCK:
            if key not in CACHE:
                raw=path.read_bytes(); body=gzip.compress(raw,compresslevel=5) if use_gzip else raw
                CACHE[key]=(body,'"'+hashlib.sha256(body).hexdigest()[:20]+'"')
            body,etag=CACHE[key]
        if self.headers.get('If-None-Match')==etag:
            self.send_response(304);self.send_header('ETag',etag);self.end_headers();return
        self.send_response(200)
        content_type={'.mjs':'text/javascript','.geojson':'application/geo+json'}.get(path.suffix,mimetypes.guess_type(path)[0] or 'application/octet-stream')
        self.send_header('Content-Type',content_type+('; charset=utf-8' if content_type.startswith('text/') or path.suffix in {'.json','.geojson'} else ''))
        self.send_header('Content-Length',str(len(body)));self.send_header('ETag',etag)
        self.send_header('Cache-Control','no-cache');self.send_header('Vary','Accept-Encoding')
        self.send_header('X-Content-Type-Options','nosniff')
        if use_gzip:self.send_header('Content-Encoding','gzip')
        self.end_headers()
        if not head:self.wfile.write(body)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8765);args=parser.parse_args()
    if not (ROOT/'data/atlas.json').exists():raise SystemExit('Données absentes. Exécuter la préparation avant le lancement.')
    server=http.server.ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'ATLAS : http://127.0.0.1:{args.port}\nCtrl+C pour arrêter. Données servies depuis {ROOT}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:server.server_close()

if __name__=='__main__':main()
