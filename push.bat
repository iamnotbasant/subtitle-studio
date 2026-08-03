@echo off
echo Staging and pushing changes to GitHub...
git add .
git commit -m "v1.2.0 Apple Dark UI overhaul, dynamic aspect ratio viewport engine, and Premiere Pro Essential Graphics panel"
git push origin main
echo Done!
pause
