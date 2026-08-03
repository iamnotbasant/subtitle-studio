@echo off
echo Staging and pushing changes to GitHub...
git add .
git commit -m "v8.0.0 Master Release: Custom @font-face preview, Ctrl+Wheel timeline zoom, clip razor cut/split & trim handles, Undo/Redo engine"
git push origin main
echo Done!
pause
