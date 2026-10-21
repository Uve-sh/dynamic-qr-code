import uvicorn
import socket
import sys
import os

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

if __name__ == "__main__":
    local_ip = get_local_ip()
    port = int(os.environ.get("PORT", 8000))

    print("=================================================================")
    print("DYNAMIC QR CODE STUDIO - PRIVATE SERVER")
    print("=================================================================")
    print(f"[*] Local Access:   http://localhost:{port}")
    print(f"[*] Phone / Wi-Fi:  http://{local_ip}:{port}")
    print("=================================================================")
    print("Press Ctrl+C to stop the server anytime.\n")

    is_dev = os.environ.get("ENV", "development").lower() == "development" and not os.environ.get("PORT")
    uvicorn.run("backend.app:app", host="0.0.0.0", port=port, reload=is_dev)
