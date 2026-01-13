from http.server import SimpleHTTPRequestHandler
from socketserver import TCPServer
import os
import sys
import webbrowser

# Define port
PORT = 8000

# Define web directory relative to this script (serve from project root to access both public/ and src/)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(SCRIPT_DIR, "..")

# Ensure the directory exists
if not os.path.exists(WEB_DIR):
    print(f"Error: Directory {WEB_DIR} does not exist.")
    sys.exit(1)

# Change working directory so SimpleHTTPRequestHandler serves from there
os.chdir(WEB_DIR)

print(f"Serving files from: {WEB_DIR}")
print(f"URL: http://localhost:{PORT}/public/")

try:
    with TCPServer(("", PORT), SimpleHTTPRequestHandler) as httpd:
        print("Use Ctrl+C to stop.")
        webbrowser.open(f"http://localhost:{PORT}/public/")
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped.")
except OSError as e:
    print(f"Error starting server: {e}")
