r"""Abre WiWO.ADS en Chrome inyectando el header de auth de ChatGPT Sites.

Uso:  python scripts/open-in-chrome.py [puerto]     (por defecto 5173)
Requiere el dev server corriendo:  .\node_modules\.bin\vite
"""
import sys

from playwright.sync_api import sync_playwright

PORT = sys.argv[1] if len(sys.argv) > 1 else "5173"
URL = f"http://localhost:{PORT}/"
EMAIL = "techlab@mgcglobalgroup.com"
HDRS = {
    "oai-authenticated-user-email": EMAIL,
    "oai-authenticated-user-full-name": "Tech%20Lab",
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
}

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=False, args=["--start-maximized"])
    ctx = browser.new_context(no_viewport=True, extra_http_headers=HDRS)
    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle", timeout=90000)
    page.keyboard.press("Escape")
    if "signin-with-chatgpt" in page.url:
        print(f"AVISO: el servidor en {URL} no recibio los headers de identidad.")
    print(f"Chrome abierto en {URL} como {EMAIL}. Cierra la ventana para terminar.")
    page.wait_for_event("close", timeout=0)
