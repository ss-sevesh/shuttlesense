"""Loopback-only private review server; exposes only explicitly supplied files."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from urllib.parse import urlsplit


def byte_range(header, size):
    if not header: return 0,size-1
    match = re.fullmatch(r'bytes=(\d+)-(\d*)',header)
    if not match: raise ValueError('Unsupported byte range')
    start = int(match[1]); end = min(size-1,int(match[2]) if match[2] else size-1)
    if not 0 <= start <= end < size: raise ValueError('Invalid byte range')
    return start,end


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('review',type=Path)
    parser.add_argument('--video',type=Path,required=True)
    parser.add_argument('--archive',type=Path,help='Optional private review clip/report ZIP')
    parser.add_argument('--port',type=int,default=8002)
    args = parser.parse_args()
    files = {'/':(args.review.resolve(),'text/html; charset=utf-8'),
             '/review.html':(args.review.resolve(),'text/html; charset=utf-8'),
             '/source.mp4':(args.video.resolve(),'video/mp4')}
    if args.archive: files['/rallies.zip']=(args.archive.resolve(),'application/zip')
    if not all(path.is_file() and path.stat().st_size>0 for path,_ in files.values()):
        parser.error('Every supplied review/video/archive must be a non-empty file')
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            target = files.get(urlsplit(self.path).path)
            if target is None: return self.send_error(404)
            path, mime = target; size = path.stat().st_size
            try: start,end = byte_range(self.headers.get('Range'),size)
            except ValueError: return self.send_error(416)
            self.send_response(206 if self.headers.get('Range') else 200)
            self.send_header('Content-Type',mime)
            self.send_header('Accept-Ranges','bytes')
            self.send_header('Content-Length',str(end-start+1))
            self.send_header('Cache-Control','no-store')
            if self.headers.get('Range'): self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
            self.end_headers()
            with path.open('rb') as stream:
                stream.seek(start); remaining=end-start+1
                try:
                    while remaining:
                        block=stream.read(min(65536,remaining))
                        if not block: break
                        self.wfile.write(block); remaining-=len(block)
                except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError): pass
    print(f'Private review: http://127.0.0.1:{args.port}/review.html',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()


if __name__ == '__main__':
    main()
