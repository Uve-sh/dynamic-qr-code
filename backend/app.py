import socket
import os
import secrets
import string
from typing import Optional
from fastapi import FastAPI, HTTPException, Request, Response, Query
from fastapi.responses import RedirectResponse, HTMLResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from backend.database import (
    init_db, get_db, list_qrcodes, get_qrcode_by_id, 
    create_qrcode, update_qrcode, delete_qrcode, 
    record_scan, get_stats, get_setting, set_setting
)
from backend.qr_engine import (
    generate_transparent_png, 
    generate_transparent_svg, 
    generate_single_qr_pdf,
    generate_batch_qr_pdf
)

# Initialize DB on load
init_db()

app = FastAPI(title="Dynamic QR Code Manager", version="1.0.0")

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR, exist_ok=True)

# Helper to detect local network IP
def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def get_base_url(request: Request) -> str:
    saved = get_setting("base_url", "")
    if saved:
        return saved.rstrip("/")
    # Default to host header or detected IP
    host = request.headers.get("host", "localhost:8000")
    proto = request.headers.get("x-forwarded-proto", "http")
    return f"{proto}://{host}".rstrip("/")

class QRCodeCreate(BaseModel):
    qr_id: Optional[str] = None
    order_id: Optional[str] = ""
    title: str
    target_url: str
    color: Optional[str] = "#000000"
    transparent_bg: Optional[bool] = True
    bg_color: Optional[str] = "#ffffff"
    notes: Optional[str] = ""

class QRCodeUpdate(BaseModel):
    title: Optional[str] = None
    target_url: Optional[str] = None
    order_id: Optional[str] = None
    status: Optional[str] = None
    color: Optional[str] = None
    transparent_bg: Optional[bool] = None
    notes: Optional[str] = None

class SettingUpdate(BaseModel):
    base_url: str

def generate_random_qrid(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    chars = "".join(secrets.choice(alphabet) for _ in range(length))
    return f"QR-{chars}"

# ==================== DYNAMIC REDIRECT ENDPOINT ====================
@app.get("/r/{qr_id}")
async def redirect_qr(qr_id: str, request: Request):
    """The dynamic QR code permanent redirect endpoint.
    Scanners hit this URL, and are instantly redirected to the destination URL."""
    item = get_qrcode_by_id(qr_id)
    if not item:
        return HTMLResponse(
            status_code=404,
            content=f"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>QR Code Not Found</title>
                <style>
                    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; text-align: center; }}
                    .card {{ background: #1e293b; padding: 2.5rem; border-radius: 1rem; border: 1px solid #334155; max-width: 420px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }}
                    h1 {{ margin-top: 0; font-size: 1.6rem; color: #ef4444; }}
                    p {{ color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }}
                    code {{ background: #0f172a; padding: 0.2rem 0.5rem; border-radius: 0.25rem; color: #38bdf8; font-family: monospace; }}
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>QR Code Not Found</h1>
                    <p>The dynamic QR code with ID <code>{qr_id}</code> does not exist or has been removed.</p>
                </div>
            </body>
            </html>
            """
        )

    if item["status"] != "active":
        return HTMLResponse(
            status_code=200,
            content=f"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>QR Code Paused</title>
                <style>
                    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; text-align: center; }}
                    .card {{ background: #1e293b; padding: 2.5rem; border-radius: 1rem; border: 1px solid #334155; max-width: 420px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }}
                    .icon {{ font-size: 2.5rem; margin-bottom: 0.5rem; }}
                    h1 {{ margin-top: 0; font-size: 1.5rem; color: #f59e0b; }}
                    p {{ color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }}
                    code {{ background: #0f172a; padding: 0.2rem 0.5rem; border-radius: 0.25rem; color: #38bdf8; }}
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">⏸️</div>
                    <h1>QR Code Paused</h1>
                    <p>This dynamic QR code (<code>{qr_id}</code>) is temporarily paused by the administrator.</p>
                </div>
            </body>
            </html>
            """
        )

    # Record scan analytics
    ua = request.headers.get("user-agent", "")
    client_ip = request.client.host if request.client else ""
    record_scan(qr_id, user_agent=ua, ip_address=client_ip)

    target_url = item["target_url"]
    if not (target_url.startswith("http://") or target_url.startswith("https://")):
        target_url = "https://" + target_url

    return RedirectResponse(url=target_url, status_code=307)

# ==================== API ENDPOINTS ====================

@app.get("/api/suggest-id")
async def suggest_id():
    """Generates an available unique QRID suggestion."""
    for _ in range(10):
        candidate = generate_random_qrid(6)
        if not get_qrcode_by_id(candidate):
            return {"suggested_id": candidate}
    return {"suggested_id": f"QR-{secrets.token_hex(4).upper()}"}

@app.get("/api/qrcodes")
async def get_all_qrcodes(
    search: Optional[str] = "",
    order: Optional[str] = "",
    status: Optional[str] = "",
    request: Request = None
):
    items = list_qrcodes(search=search, order_filter=order, status_filter=status)
    base = get_base_url(request)
    for it in items:
        it["redirect_url"] = f"{base}/r/{it['qr_id']}"
    return items

@app.post("/api/qrcodes")
async def create_new_qrcode(payload: QRCodeCreate, request: Request):
    qr_id = payload.qr_id.strip() if payload.qr_id else ""
    if not qr_id:
        qr_id = generate_random_qrid(6)
    
    # Check duplicate
    if get_qrcode_by_id(qr_id):
        raise HTTPException(status_code=400, detail=f"QR ID '{qr_id}' is already taken. Please choose another.")
    
    if not payload.title:
        raise HTTPException(status_code=400, detail="Title/Label is required.")
    if not payload.target_url:
        raise HTTPException(status_code=400, detail="Target Destination URL is required.")

    created = create_qrcode(
        qr_id=qr_id,
        title=payload.title,
        target_url=payload.target_url,
        order_id=payload.order_id or "",
        color=payload.color or "#000000",
        transparent_bg=payload.transparent_bg if payload.transparent_bg is not None else True,
        bg_color=payload.bg_color or "#ffffff",
        notes=payload.notes or ""
    )
    base = get_base_url(request)
    created["redirect_url"] = f"{base}/r/{created['qr_id']}"
    return created

@app.get("/api/qrcodes/{qr_id}")
async def get_single_qrcode(qr_id: str, request: Request):
    item = get_qrcode_by_id(qr_id)
    if not item:
        raise HTTPException(status_code=404, detail="QR Code not found.")
    base = get_base_url(request)
    item["redirect_url"] = f"{base}/r/{item['qr_id']}"
    return item

@app.put("/api/qrcodes/{qr_id}")
async def update_single_qrcode(qr_id: str, payload: QRCodeUpdate, request: Request):
    existing = get_qrcode_by_id(qr_id)
    if not existing:
        raise HTTPException(status_code=404, detail="QR Code not found.")

    updated = update_qrcode(
        qr_id=qr_id,
        title=payload.title,
        target_url=payload.target_url,
        order_id=payload.order_id,
        status=payload.status,
        color=payload.color,
        transparent_bg=payload.transparent_bg,
        notes=payload.notes
    )
    base = get_base_url(request)
    updated["redirect_url"] = f"{base}/r/{updated['qr_id']}"
    return updated

@app.delete("/api/qrcodes/{qr_id}")
async def delete_single_qrcode(qr_id: str):
    existing = get_qrcode_by_id(qr_id)
    if not existing:
        raise HTTPException(status_code=404, detail="QR Code not found.")
    delete_qrcode(qr_id)
    return {"status": "success", "message": f"QR Code {qr_id} deleted."}

# ==================== EXPORT & DOWNLOAD ENDPOINTS ====================

@app.get("/api/qrcodes/{qr_id}/image")
async def download_image(
    qr_id: str,
    request: Request,
    size: int = Query(1024, ge=128, le=4096),
    transparent: bool = Query(True),
    color: Optional[str] = None,
    download: bool = Query(False)
):
    """Renders high-res transparent PNG for the QR Code."""
    item = get_qrcode_by_id(qr_id)
    if not item:
        raise HTTPException(status_code=404, detail="QR Code not found.")

    base = get_base_url(request)
    redirect_url = f"{base}/r/{qr_id}"
    qr_color = color if color else item.get("color", "#000000")

    buf = generate_transparent_png(
        data=redirect_url,
        color_hex=qr_color,
        size=size,
        transparent=transparent,
        bg_hex=item.get("bg_color", "#ffffff")
    )

    headers = {}
    if download:
        filename = f"{qr_id}{'_' + item['order_id'] if item.get('order_id') else ''}_transparent.png"
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'

    return Response(content=buf.getvalue(), media_type="image/png", headers=headers)

@app.get("/api/qrcodes/{qr_id}/svg")
async def download_svg(qr_id: str, request: Request, color: Optional[str] = None, download: bool = Query(True)):
    """Renders vector transparent SVG for the QR Code."""
    item = get_qrcode_by_id(qr_id)
    if not item:
        raise HTTPException(status_code=404, detail="QR Code not found.")

    base = get_base_url(request)
    redirect_url = f"{base}/r/{qr_id}"
    qr_color = color if color else item.get("color", "#000000")

    svg_data = generate_transparent_svg(data=redirect_url, color_hex=qr_color)

    headers = {}
    if download:
        filename = f"{qr_id}{'_' + item['order_id'] if item.get('order_id') else ''}_transparent.svg"
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'

    return Response(content=svg_data, media_type="image/svg+xml", headers=headers)

@app.get("/api/qrcodes/{qr_id}/pdf")
async def download_pdf(qr_id: str, request: Request):
    """Generates a high-quality printable PDF sheet for a single dynamic QR code."""
    item = get_qrcode_by_id(qr_id)
    if not item:
        raise HTTPException(status_code=404, detail="QR Code not found.")

    base = get_base_url(request)
    redirect_url = f"{base}/r/{qr_id}"
    qr_color = item.get("color", "#000000")

    pdf_buf = generate_single_qr_pdf(
        qr_id=qr_id,
        order_id=item.get("order_id", ""),
        title=item.get("title", ""),
        target_url=item.get("target_url", ""),
        redirect_url=redirect_url,
        color_hex=qr_color
    )

    filename = f"{qr_id}{'_' + item['order_id'] if item.get('order_id') else ''}_label.pdf"
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@app.get("/api/batch/pdf")
async def download_batch_pdf(request: Request, search: Optional[str] = "", order: Optional[str] = ""):
    """Generates a batch sticker/label PDF sheet of multiple QR codes."""
    items = list_qrcodes(search=search, order_filter=order)
    if not items:
        raise HTTPException(status_code=400, detail="No QR codes found to generate batch PDF.")

    base = get_base_url(request)
    pdf_buf = generate_batch_qr_pdf(items, base_url=base)
    filename = f"batch_qr_labels_{len(items)}_codes.pdf"
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@app.get("/api/stats")
async def stats():
    return get_stats()

@app.get("/api/config")
async def get_config(request: Request):
    configured = get_setting("base_url", "")
    auto_detected = f"http://{get_local_ip()}:8000"
    current_host = get_base_url(request)
    return {
        "configured_base_url": configured,
        "auto_detected_lan_url": auto_detected,
        "active_base_url": current_host,
        "local_ip": get_local_ip()
    }

@app.post("/api/config")
async def update_config(payload: SettingUpdate):
    url = payload.base_url.strip().rstrip("/")
    set_setting("base_url", url)
    return {"status": "success", "base_url": url}

# Mount static folder
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
async def root():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return HTMLResponse("<h1>Dynamic QR Code Manager Backend Running</h1>")
