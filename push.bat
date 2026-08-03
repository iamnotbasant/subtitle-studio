@echo off
echo Staging and pushing changes to GitHub...
git add .
git commit -m "v7.1.0 Senior FFmpeg Subtitle Engine Fix: PlayResX/PlayResY canvas lock, Alignment 5 center-origin pos(abs_x, abs_y), and mandatory fontsdir passing"
git push origin main
echo Done!
pause
