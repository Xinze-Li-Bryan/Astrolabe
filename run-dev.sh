#!/bin/bash
# Local dev script - customize ports here
# This file is gitignored, so your settings won't be committed

# Frontend port (change if 3000 conflicts)
export PORT=3456

# Backend port
export BACKEND_PORT=8765

# Enable dev mode (FPS panel, performance metrics)
export NEXT_PUBLIC_DEV_MODE=true

# Kill any existing process on backend port
lsof -ti:$BACKEND_PORT | xargs kill -9 2>/dev/null && echo "Killed existing process on port $BACKEND_PORT"

# Start backend
cd backend && python3 -m uvicorn astrolabe.server:app --host 127.0.0.1 --port $BACKEND_PORT &
BACKEND_PID=$!

# Start frontend (Tauri will connect to this)
cd .. && npm run dev -- -p $PORT &
FRONTEND_PID=$!

# Wait for frontend to be ready, then start Tauri with custom dev URL
sleep 3
TAURI_DEV_URL="http://localhost:$PORT" npm run tauri dev -- --config "{\"build\":{\"devUrl\":\"http://localhost:$PORT\"}}"

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
