@echo off
echo Staging and pushing changes to GitHub...
git add .
git commit -m "v3.0.0 Major Release: AI Auto-Transcribe Captions, Essential Graphics Presets system, and VTT/TXT/SRT Exporters"
git push origin main
echo Done!
pause
