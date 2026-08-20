@echo off
echo Staging and pushing changes to GitHub...
git add .
git commit -m "Update Subtitle Studio Pro: Bento Dark UI, SVG icons, Premiere Pro Inspector, and video player fixes"
git push origin main
echo Done!
pause
