@echo off
echo Staging and pushing changes to GitHub...
git add .
git commit -m "v8.1.0 Master Release: Mathematical caption center alignment, master track style synchronization, and responsive canvas transform anchoring"
git push origin main
echo Done!
pause
