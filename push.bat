@echo off
echo Staging and pushing changes to GitHub...
git add .
git commit -m "v1.6.0 Fast-load network compression GZip, async defer scripts, CSS layout containment, and Lighthouse performance fixes"
git push origin main
echo Done!
pause
