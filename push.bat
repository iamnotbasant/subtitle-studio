@echo off
echo Staging and pushing changes to GitHub...
git add .
git commit -m "v6.0.0 Premiere Pro 2024 Exact Mathematical Parity: sequence coordinate transform, font size ratio scaling, single-line text display"
git push origin main
echo Done!
pause
