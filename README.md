# ⚡ Dynamic QR Code Studio (Private Project Manager)

A private, self-contained web platform built specifically for your project to generate, track, and manage **Dynamic QR Codes** with transparency, customizable designs, and multi-format export (**PDF**, **SVG**, **PNG**).

---

## 🌟 Key Features

1. **True Dynamic Redirects (`/r/{qr_id}`)**
   - The printed QR code stays the same forever.
   - You can change the destination target URL anytime in 1 click from your dashboard without reprinting.
   - Built-in scan analytics counter.

2. **QRID & Order ID Tracking**
   - Attach a permanent **QRID** (e.g., `QR-A8B9C` or custom slug).
   - Attach an **Order ID** (e.g., `ORD-2026-9901`) to easily search, filter, and link QR codes to specific client orders or packaging batches.
   - Instant real-time search across QRID, Order ID, Title, and Destination URL.

3. **100% Transparent Background Support**
   - Generates transparent QR codes (no white bounding box).
   - Live checkerboard preview in the browser shows true alpha transparency.
   - Color picker with curated themes (Deep Obsidian, Electric Indigo, Emerald Green, Ruby Red, Cyan) or any custom hex color.

4. **Multi-Format Downloads**
   - **Transparent PNG**: High-Res (1024px) & Ultra Print (2048px).
   - **Vector SVG**: Infinite scalability with transparent background, perfect for Adobe Illustrator, Figma, or laser cutters.
   - **Printable PDF Label**: Formatted single-page printable card with QR code, QRID, Order ID, title, and scan instructions.
   - **Batch PDF Sticker Sheet**: Print multiple QR codes simultaneously on A4 sticker sheets.

5. **Private & Local-First**
   - Runs locally on your machine with zero third-party subscription fees or telemetry.
   - Backed by a persistent SQLite database (`qrcodes.db`).
   - Accessible from your computer (`http://localhost:8000`) and mobile devices on the same Wi-Fi.

---

## 🚀 How to Run

### Option 1: Double-Click
Double-click `start.bat` in the project root directory.

### Option 2: Command Line
```powershell
.\.venv\Scripts\python run.py
```

Open your browser to:
- **Local Dashboard:** `http://localhost:8000`
- **From Phone (same Wi-Fi):** `http://<YOUR_LOCAL_IP>:8000` (The console displays your exact Wi-Fi IP upon starting).

---

## 📂 Project Structure

```
Dynamic QR code/
├── backend/
│   ├── app.py           # FastAPI server with dynamic redirects (/r/{qr_id}) & REST API
│   ├── database.py      # SQLite database schema and query helpers
│   └── qr_engine.py     # Transparent PNG, SVG, and ReportLab PDF generator
├── static/
│   ├── index.html       # Single-page dashboard interface
│   ├── css/style.css    # Modern dark glassmorphism styling
│   └── js/app.js        # Dynamic preview, filtering, modals & export controller
├── run.py               # Main launcher script with network IP auto-detection
├── start.bat            # 1-click Windows launcher
├── requirements.txt     # Python dependencies
└── qrcodes.db           # SQLite database (auto-created)
```
