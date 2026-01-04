@echo off
cd /d "%~dp0"

echo Starting Podcast Summarizer Server...
start "Podcast Server" cmd /k "cd server && node server.js"

echo Starting Podcast Summarizer Client...
start "Podcast Client" cmd /k "cd client && npm run dev"

echo Application launching...
echo Server runs on http://localhost:3000
echo Client runs on http://localhost:8020

