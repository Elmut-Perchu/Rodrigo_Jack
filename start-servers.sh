#!/bin/bash

# 🎮 Rodrigo Jack - Start Servers Script
# Starts both frontend and backend servers for the game

echo "🎮 Starting Rodrigo Jack Servers..."
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if ports are in use
check_port() {
    lsof -ti :$1 > /dev/null 2>&1
}

# Kill process on port
kill_port() {
    echo "  Killing process on port $1..."
    lsof -ti :$1 | xargs kill -9 2>/dev/null
}

# Frontend Server (Port 8000)
echo "📦 Starting Frontend Server (port 8000)..."
if check_port 8000; then
    echo -e "  ${YELLOW}⚠️  Port 8000 already in use${NC}"
    kill_port 8000
    sleep 1
fi

python3 dev_server.py 8000 > /dev/null 2>&1 &
FRONTEND_PID=$!

sleep 1
if check_port 8000; then
    echo -e "  ${GREEN}✅ Frontend server running (PID: $FRONTEND_PID)${NC}"
else
    echo -e "  ${RED}❌ Failed to start frontend server${NC}"
    exit 1
fi

# Backend Server (Port 8080)
echo ""
echo "🔌 Starting Backend Server (port 8080)..."

# Check if server binary exists
echo "  Building Go VS server..."
cd server
go build -o rodrigo-jack-vs
if [ $? -ne 0 ]; then
    echo -e "  ${RED}❌ Failed to build VS server${NC}"
    kill $FRONTEND_PID
    exit 1
fi
cd ..

# Kill existing backend
if check_port 8080; then
    echo -e "  ${YELLOW}⚠️  Port 8080 already in use${NC}"
    kill_port 8080
    sleep 1
fi

# Start backend
cd server
./rodrigo-jack-vs > /dev/null 2>&1 &
BACKEND_PID=$!
cd ..

sleep 2
if check_port 8080; then
    echo -e "  ${GREEN}✅ Backend server running (PID: $BACKEND_PID)${NC}"
else
    echo -e "  ${RED}❌ Failed to start backend server${NC}"
    kill $FRONTEND_PID
    exit 1
fi

# Score API Server (Port 8081) - Adventure mode leaderboard
echo ""
echo "🏆 Starting Score API Server (port 8081)..."

echo "  Building Go score server..."
go build -o score-server .
if [ $? -ne 0 ]; then
    echo -e "  ${RED}❌ Failed to build score server${NC}"
    kill $FRONTEND_PID $BACKEND_PID
    exit 1
fi

if check_port 8081; then
    echo -e "  ${YELLOW}⚠️  Port 8081 already in use${NC}"
    kill_port 8081
    sleep 1
fi

./score-server > /dev/null 2>&1 &
SCORE_PID=$!

sleep 1
if check_port 8081; then
    echo -e "  ${GREEN}✅ Score server running (PID: $SCORE_PID)${NC}"
else
    echo -e "  ${RED}❌ Failed to start score server${NC}"
    kill $FRONTEND_PID $BACKEND_PID
    exit 1
fi

# Success
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 All servers started successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "🌐 Open in browser:"
echo -e "   ${YELLOW}http://localhost:8000${NC}"
echo ""
echo "📊 Health checks:"
echo "   Frontend:  http://localhost:8000"
echo "   Backend:   http://localhost:8080/health"
echo "   Scores:    http://localhost:8081/api/scores"
echo "   WebSocket: ws://localhost:8080/ws"
echo ""
echo "📝 Server PIDs:"
echo "   Frontend: $FRONTEND_PID"
echo "   Backend:  $BACKEND_PID"
echo "   Scores:   $SCORE_PID"
echo ""
echo "⏹️  To stop servers:"
echo "   kill $FRONTEND_PID $BACKEND_PID $SCORE_PID"
echo ""
echo "Press Ctrl+C to stop all servers..."

# Wait for interrupt
trap "echo ''; echo '⏹️  Stopping servers...'; kill $FRONTEND_PID $BACKEND_PID $SCORE_PID 2>/dev/null; echo '✅ Servers stopped'; exit 0" INT

# Keep script running
wait
