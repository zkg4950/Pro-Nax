#!/bin/bash
# ProNax AI Services Startup Script
# Starts all AI microservices in the correct order

echo "============================================================"
echo "ProNax AI Services Startup"
echo "============================================================"
echo ""

# Check if Ollama is running
echo "[1/5] Checking Ollama..."
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "ERROR: Ollama is not running!"
    echo "Please start Ollama first: ollama serve"
    echo "Or install from: https://ollama.ai"
    exit 1
fi
echo "OK: Ollama is running"
echo ""

# Check if required models are pulled
echo "[2/5] Checking Ollama models..."
if ! curl -s http://localhost:11434/api/tags | grep -q "llama3.2"; then
    echo "WARNING: llama3.2 model not found. Pulling..."
    ollama pull llama3.2
fi
if ! curl -s http://localhost:11434/api/tags | grep -q "tinyllama"; then
    echo "WARNING: tinyllama model not found. Pulling..."
    ollama pull tinyllama
fi
echo "OK: Models available"
echo ""

# Start LangGraph Server
echo "[3/5] Starting LangGraph Server (port 8000)..."
npm run langgraph:server &
LANGGRAPH_PID=$!
sleep 3
echo "OK: LangGraph Server started (PID: $LANGGRAPH_PID)"
echo ""

# Start Admin Brain Server
echo "[4/5] Starting Admin Brain Server (port 8001)..."
python admin_brain_server.py &
ADMIN_BRAIN_PID=$!
sleep 3
echo "OK: Admin Brain Server started (PID: $ADMIN_BRAIN_PID)"
echo ""

# Start AI Gateway
echo "[5/5] Starting AI Gateway (port 9000)..."
python ai_gateway.py &
AI_GATEWAY_PID=$!
sleep 3
echo "OK: AI Gateway started (PID: $AI_GATEWAY_PID)"
echo ""

echo "============================================================"
echo "All AI Services Started Successfully!"
echo "============================================================"
echo ""
echo "Services:"
echo "- Ollama: http://localhost:11434"
echo "- LangGraph: http://localhost:8000"
echo "- Admin Brain: http://localhost:8001"
echo "- AI Gateway: http://localhost:9000"
echo ""
echo "Testing health check..."
curl -s http://localhost:9000/api/ai/health | python -m json.tool
echo ""
echo "============================================================"
echo "Press Ctrl+C to stop all services"
echo ""

# Function to kill all services on exit
cleanup() {
    echo ""
    echo "Stopping all services..."
    kill $LANGGRAPH_PID $ADMIN_BRAIN_PID $AI_GATEWAY_PID 2>/dev/null
    echo "All services stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Keep script running
wait
