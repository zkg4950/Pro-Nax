@echo off
REM ProNax AI Services Startup Script
REM Starts all AI microservices in the correct order

echo ============================================================
echo ProNax AI Services Startup
echo ============================================================
echo.

REM Check if Ollama is running
echo [1/5] Checking Ollama...
curl -s http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Ollama is not running!
    echo Please start Ollama first: ollama serve
    echo Or install from: https://ollama.ai
    pause
    exit /b 1
)
echo OK: Ollama is running
echo.

REM Check if required models are pulled
echo [2/5] Checking Ollama models...
curl -s http://localhost:11434/api/tags | findstr "llama3.2" >nul
if %errorlevel% neq 0 (
    echo WARNING: llama3.2 model not found. Pulling...
    ollama pull llama3.2
)
curl -s http://localhost:11434/api/tags | findstr "tinyllama" >nul
if %errorlevel% neq 0 (
    echo WARNING: tinyllama model not found. Pulling...
    ollama pull tinyllama
)
echo OK: Models available
echo.

REM Start LangGraph Server
echo [3/5] Starting LangGraph Server (port 8000)...
start "LangGraph Server" cmd /k "npm run dev:langgraph"
timeout /t 3 /nobreak >nul
echo OK: LangGraph Server started
echo.

REM Start Admin Brain Server
echo [4/5] Starting Admin Brain Server (port 8001)...
start "Admin Brain Server" cmd /k "python admin_brain_server.py"
timeout /t 3 /nobreak >nul
echo OK: Admin Brain Server started
echo.

REM Start AI Gateway
echo [5/5] Starting AI Gateway (port 9000)...
start "AI Gateway" cmd /k "python ai_gateway.py"
timeout /t 3 /nobreak >nul
echo OK: AI Gateway started
echo.

echo ============================================================
echo All AI Services Started Successfully!
echo ============================================================
echo.
echo Services:
echo - Ollama: http://localhost:11434
echo - LangGraph: http://localhost:8000
echo - Admin Brain: http://localhost:8001
echo - AI Gateway: http://localhost:9000
echo.
echo Testing health check...
curl -s http://localhost:9000/api/ai/health
echo.
echo ============================================================
echo Press any key to close this window (services will continue running)
pause >nul
