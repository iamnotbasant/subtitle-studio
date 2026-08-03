@echo off
echo Staging and pushing changes to GitHub...
git add .
git commit -m "v1.1.0 Refactored font downloader, Colab URL automation, and FFmpeg path escaping"
git push origin main
echo Done!
pause
