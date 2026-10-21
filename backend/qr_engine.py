import io
import re
from PIL import Image, ImageDraw
import qrcode
from qrcode.constants import ERROR_CORRECT_H, ERROR_CORRECT_M, ERROR_CORRECT_Q, ERROR_CORRECT_L
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

def hex_to_rgb(hex_code: str):
    hex_code = hex_code.lstrip("#")
    if len(hex_code) == 3:
        hex_code = "".join([c*2 for c in hex_code])
    if len(hex_code) != 6:
        return (0, 0, 0)
    return tuple(int(hex_code[i:i+2], 16) for i in (0, 2, 4))

def generate_qr_matrix(data: str, error_level: str = "H"):
    ec_map = {
        "L": ERROR_CORRECT_L,
        "M": ERROR_CORRECT_M,
        "Q": ERROR_CORRECT_Q,
        "H": ERROR_CORRECT_H
    }
    ec = ec_map.get(error_level.upper(), ERROR_CORRECT_H)
    qr = qrcode.QRCode(
        version=None,
        error_correction=ec,
        box_size=1,
        border=1
    )
    qr.add_data(data)
    qr.make(fit=True)
    return qr

def generate_transparent_png(data: str, color_hex: str = "#000000", size: int = 1024, 
                             transparent: bool = True, bg_hex: str = "#ffffff", 
                             error_level: str = "H") -> io.BytesIO:
    qr = generate_qr_matrix(data, error_level)
    matrix = qr.get_matrix()
    matrix_size = len(matrix)

    # Box size in pixels
    scale = max(1, size // matrix_size)
    actual_size = matrix_size * scale

    fg_rgb = hex_to_rgb(color_hex)
    fg_rgba = (*fg_rgb, 255)

    if transparent:
        bg_rgba = (0, 0, 0, 0)
    else:
        bg_rgb = hex_to_rgb(bg_hex)
        bg_rgba = (*bg_rgb, 255)

    img = Image.new("RGBA", (actual_size, actual_size), bg_rgba)
    draw = ImageDraw.Draw(img)

    for r_idx, row in enumerate(matrix):
        for c_idx, val in enumerate(row):
            if val:
                x0 = c_idx * scale
                y0 = r_idx * scale
                x1 = x0 + scale
                y1 = y0 + scale
                draw.rectangle([x0, y0, x1, y1], fill=fg_rgba)

    # If requested size differs slightly, resize with high quality nearest neighbor to preserve crisp edges
    if actual_size != size:
        img = img.resize((size, size), Image.Resampling.NEAREST)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf

def generate_transparent_svg(data: str, color_hex: str = "#000000", error_level: str = "H") -> str:
    qr = generate_qr_matrix(data, error_level)
    matrix = qr.get_matrix()
    matrix_size = len(matrix)

    path_data = []
    for r_idx, row in enumerate(matrix):
        for c_idx, val in enumerate(row):
            if val:
                path_data.append(f"M{c_idx},{r_idx}h1v1h-1z")

    combined_path = "".join(path_data)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {matrix_size} {matrix_size}" width="100%" height="100%" shape-rendering="crispEdges">
  <path d="{combined_path}" fill="{color_hex}" />
</svg>"""
    return svg

def generate_single_qr_pdf(qr_id: str, order_id: str, title: str, target_url: str, 
                            redirect_url: str, color_hex: str = "#000000") -> io.BytesIO:
    """Generates a professional single printable dynamic QR code sheet."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=22,
        leading=26,
        textColor=colors.HexColor('#0f172a'),
        alignment=1, # Center
        spaceAfter=6
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#475569'),
        alignment=1,
        spaceAfter=15
    )
    badge_style = ParagraphStyle(
        'Badge',
        parent=styles['Normal'],
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#1e293b')
    )
    label_style = ParagraphStyle(
        'Label',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#64748b'),
        fontName='Helvetica-Bold'
    )
    url_style = ParagraphStyle(
        'URL',
        parent=styles['Normal'],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#2563eb'),
        fontName='Helvetica'
    )

    story = []

    # Title & Subtitle
    story.append(Paragraph(title or "Dynamic QR Code", title_style))
    story.append(Paragraph("Dynamic Redirect Pass & Project Tracking Label", subtitle_style))
    story.append(Spacer(1, 10))

    # Generate QR PNG image for PDF
    qr_img_stream = generate_transparent_png(redirect_url, color_hex=color_hex, size=600, transparent=False, bg_hex="#ffffff")
    rl_image = RLImage(qr_img_stream, width=220, height=220)
    rl_image.hAlign = 'CENTER'
    story.append(rl_image)
    story.append(Spacer(1, 15))

    # Details Table
    order_display = order_id if order_id else "N/A"
    data = [
        [Paragraph("QR ID", label_style), Paragraph(f"<b>{qr_id}</b>", badge_style)],
        [Paragraph("ORDER ID", label_style), Paragraph(f"<b>{order_display}</b>", badge_style)],
        [Paragraph("DYNAMIC REDIRECT", label_style), Paragraph(redirect_url, url_style)],
        [Paragraph("DESTINATION URL", label_style), Paragraph(target_url, url_style)],
        [Paragraph("TYPE", label_style), Paragraph("Dynamic Managed QR (Updatable Anytime)", badge_style)]
    ]

    t = Table(data, colWidths=[130, 360])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#e2e8f0')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t)
    story.append(Spacer(1, 20))

    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#94a3b8'),
        alignment=1
    )
    story.append(Paragraph("Scan with any mobile camera to be instantly redirected to the destination URL.", footer_style))

    doc.build(story)
    buf.seek(0)
    return buf

def generate_batch_qr_pdf(qrcodes: list, base_url: str) -> io.BytesIO:
    """Generates a printable grid sheet (cards) of all selected QR codes for printing stickers/labels."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=24,
        leftMargin=24,
        topMargin=24,
        bottomMargin=24
    )

    styles = getSampleStyleSheet()
    header_style = ParagraphStyle(
        'SheetHeader',
        parent=styles['Heading2'],
        fontSize=16,
        leading=20,
        textColor=colors.HexColor('#0f172a'),
        alignment=1,
        spaceAfter=12
    )

    story = [Paragraph("Dynamic QR Codes - Print Label Sheet", header_style), Spacer(1, 10)]

    # We build a 2-column or 3-column sticker layout
    rows = []
    current_row = []

    for item in qrcodes:
        qr_id = item["qr_id"]
        order_id = item.get("order_id") or "No Order"
        title = item.get("title") or "QR Code"
        redirect_url = f"{base_url.rstrip('/')}/r/{qr_id}"
        color_hex = item.get("color") or "#000000"

        # Generate small QR
        qr_stream = generate_transparent_png(redirect_url, color_hex=color_hex, size=240, transparent=False, bg_hex="#ffffff")
        qr_img = RLImage(qr_stream, width=110, height=110)

        card_content = [
            Paragraph(f"<b>{title[:22]}</b>", ParagraphStyle('CardTitle', parent=styles['Normal'], fontSize=10, leading=12, alignment=1)),
            Spacer(1, 2),
            qr_img,
            Spacer(1, 2),
            Paragraph(f"<b>{qr_id}</b>", ParagraphStyle('CardQrid', parent=styles['Normal'], fontSize=9, leading=11, textColor=colors.HexColor('#2563eb'), alignment=1)),
            Paragraph(f"Ord: {order_id[:16]}", ParagraphStyle('CardOrd', parent=styles['Normal'], fontSize=8, leading=10, textColor=colors.HexColor('#475569'), alignment=1))
        ]

        card_table = Table([[c] for c in card_content], colWidths=[165])
        card_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#ffffff')),
            ('BOX', (0,0), (-1,-1), 0.75, colors.HexColor('#cbd5e1')),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ]))

        current_row.append(card_table)
        if len(current_row) == 3: # 3 cards per row
            rows.append(current_row)
            current_row = []

    if current_row:
        while len(current_row) < 3:
            current_row.append("")
        rows.append(current_row)

    if rows:
        grid_table = Table(rows, colWidths=[180, 180, 180])
        grid_table.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 12),
        ]))
        story.append(grid_table)

    doc.build(story)
    buf.seek(0)
    return buf
