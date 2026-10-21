@echo off
title Dynamic QR Code Studio
echo ====================================================
echo Starting Dynamic QR Code Studio...
echo ====================================================
cd /d "%~dp0"
.\.venv\Scripts\python.exe run.py
pause
