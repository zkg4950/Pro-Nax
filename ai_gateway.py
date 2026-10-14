"""
Unified AI Gateway Service
Central hub for all AI services: LangGraph, CrewAI, Ollama
Standard REST endpoints with environment variable configuration
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
import subprocess
import json
from typing import Dict, Any

app = Flask(__name__)
CORS(app)

# Environment Variables with defaults
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
OLLAMA_FALLBACK_MODEL = os.getenv("OLLAMA_FALLBACK_MODEL", "tinyllama")
LANGGRAPH_PORT = os.getenv("LANGGRAPH_PORT", "8000")
ADMIN_BRAIN_PORT = os.getenv("ADMIN_BRAIN_PORT", "8001")
AI_GATEWAY_PORT = os.getenv("AI_GATEWAY_PORT", "9000")

# Supabase Configuration
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Health check for Ollama
def check_ollama_health() -> Dict[str, Any]:
    """Check if Ollama is running and model is available"""
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get("models", [])
            model_names = [m.get("name", "").split(":")[0] for m in models]
            return {
                "status": "healthy",
                "available": True,
                "models": model_names,
                "current_model": OLLAMA_MODEL if OLLAMA_MODEL in model_names else OLLAMA_FALLBACK_MODEL
            }
        return {"status": "unhealthy", "available": False, "error": "Ollama API error"}
    except Exception as e:
        return {"status": "unhealthy", "available": False, "error": str(e)}

# Health check for LangGraph
def check_langgraph_health() -> Dict[str, Any]:
    """Check if LangGraph server is running"""
    try:
        response = requests.get(f"http://localhost:{LANGGRAPH_PORT}/health", timeout=5)
        if response.status_code == 200:
            return {"status": "healthy", "available": True}
        return {"status": "unhealthy", "available": False, "error": f"HTTP {response.status_code}"}
    except Exception as e:
        return {"status": "unhealthy", "available": False, "error": str(e)}

# Health check for Admin Brain
def check_admin_brain_health() -> Dict[str, Any]:
    """Check if Admin Brain server is running"""
    try:
        response = requests.get(f"http://localhost:{ADMIN_BRAIN_PORT}/health", timeout=5)
        if response.status_code == 200:
            return {"status": "healthy", "available": True}
        return {"status": "unhealthy", "available": False, "error": f"HTTP {response.status_code}"}
    except Exception as e:
        return {"status": "unhealthy", "available": False, "error": str(e)}

# Root endpoint
@app.route('/')
def index():
    return jsonify({
        "service": "ProNax Unified AI Gateway",
        "version": "1.0.0",
        "endpoints": {
            "POST /api/ai/creator-coach": "Execute LangGraph Creator Coach workflow",
            "POST /api/ai/video-metadata": "Execute CrewAI Video Assistant",
            "POST /api/ai/admin-decision": "Execute CrewAI Admin Brain",
            "GET /api/ai/health": "Health check for all AI services"
        },
        "environment": {
            "OLLAMA_BASE_URL": OLLAMA_BASE_URL,
            "OLLAMA_MODEL": OLLAMA_MODEL,
            "LANGGRAPH_PORT": LANGGRAPH_PORT,
            "ADMIN_BRAIN_PORT": ADMIN_BRAIN_PORT
        }
    })

# Unified health check
@app.route('/api/ai/health', methods=['GET'])
def health_check():
    """Health check for all AI services"""
    return jsonify({
        "ollama": check_ollama_health(),
        "langgraph": check_langgraph_health(),
        "admin_brain": check_admin_brain_health(),
        "supabase": {
            "configured": bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY),
            "url": SUPABASE_URL if SUPABASE_URL else "not configured"
        },
        "timestamp": "datetime.now().isoformat()"
    })

# Creator Coach endpoint (LangGraph)
@app.route('/api/ai/creator-coach', methods=['POST'])
def creator_coach():
    """Execute LangGraph Creator Coach workflow with multi-language support"""
    try:
        data = request.json
        langgraph_health = check_langgraph_health()
        
        if not langgraph_health.get("available"):
            return jsonify({
                "success": False,
                "error": "LangGraph server unavailable",
                "fallback": "Ensure LangGraph server is running on port " + LANGGRAPH_PORT
            }), 503
        
        # Extract language and system prompt
        language = data.get("language", "en")
        system_prompt = data.get("system_prompt", "You are a helpful AI assistant.")
        
        # Add language instruction to the request
        enhanced_data = data.copy()
        enhanced_data["system_prompt"] = f"{system_prompt} Respond in {language} language."
        
        # Forward to LangGraph server
        response = requests.post(
            f"http://localhost:{LANGGRAPH_PORT}/api/generate",
            json=enhanced_data,
            timeout=60
        )
        
        if response.status_code == 200:
            return jsonify(response.json())
        else:
            return jsonify({
                "success": False,
                "error": f"LangGraph error: {response.status_code}",
                "details": response.text
            }), response.status_code
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# Video Metadata endpoint (CrewAI Video Assistant)
@app.route('/api/ai/video-metadata', methods=['POST'])
def video_metadata():
    """Execute CrewAI Video Assistant for title, description, tags with multi-language support"""
    try:
        data = request.json
        video_title = data.get("video_title", "")
        category = data.get("category", "")
        content = data.get("content", "")
        language = data.get("language", "en")
        
        if not video_title:
            return jsonify({
                "success": False,
                "error": "video_title is required"
            }), 400
        
        # Add language instruction to content
        language_instruction = f"Generate all metadata (title, description, tags) in {language} language."
        enhanced_content = f"{content}\n\n{language_instruction}"
        
        # Call CrewAI script
        result = subprocess.run(
            ["python", "crewai_video_assistant.py"],
            input=json.dumps({
                "video_title": video_title,
                "category": category,
                "content": enhanced_content,
                "language": language
            }),
            capture_output=True,
            text=True,
            timeout=120
        )
        
        if result.returncode == 0:
            return jsonify({
                "success": True,
                "data": result.stdout,
                "raw_output": result.stdout,
                "language": language
            })
        else:
            return jsonify({
                "success": False,
                "error": "CrewAI execution failed",
                "details": result.stderr
            }), 500
    except subprocess.TimeoutExpired:
        return jsonify({
            "success": False,
            "error": "CrewAI execution timeout"
        }), 504
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# Admin Decision endpoint (CrewAI Admin Brain)
@app.route('/api/ai/admin-decision', methods=['POST'])
def admin_decision():
    """Execute CrewAI Admin Brain for admin decisions with multi-language support"""
    try:
        data = request.json
        task_type = data.get("task_type", "full_check")
        language = data.get("language", "en")
        
        # Call appropriate CrewAI script
        if task_type == "full_check":
            script = "crewai_admin_real.py"
        elif task_type == "user_management":
            script = "crewai_admin_real.py"
        elif task_type == "content_moderation":
            script = "crewai_admin_real.py"
        else:
            script = "crewai_admin_system.py"
        
        # Add language instruction via environment
        env = os.environ.copy()
        env["RESPONSE_LANGUAGE"] = language
        
        result = subprocess.run(
            ["python", script],
            capture_output=True,
            text=True,
            timeout=180,
            env=env
        )
        
        if result.returncode == 0:
            return jsonify({
                "success": True,
                "data": result.stdout,
                "raw_output": result.stdout,
                "language": language
            })
        else:
            return jsonify({
                "success": False,
                "error": "CrewAI execution failed",
                "details": result.stderr
            }), 500
    except subprocess.TimeoutExpired:
        return jsonify({
            "success": False,
            "error": "CrewAI execution timeout"
        }), 504
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# Admin Chat endpoint (forward to Admin Brain server)
@app.route('/api/ai/admin-chat', methods=['POST'])
def admin_chat():
    """Forward to Admin Brain server for chat"""
    try:
        admin_brain_health = check_admin_brain_health()
        
        if not admin_brain_health.get("available"):
            return jsonify({
                "success": False,
                "error": "Admin Brain server unavailable",
                "fallback": "Ensure Admin Brain server is running on port " + ADMIN_BRAIN_PORT
            }), 503
        
        # Forward to Admin Brain server
        response = requests.post(
            f"http://localhost:{ADMIN_BRAIN_PORT}/api/admin/chat",
            json=request.json,
            timeout=90
        )
        
        if response.status_code == 200:
            return jsonify(response.json())
        else:
            return jsonify({
                "success": False,
                "error": f"Admin Brain error: {response.status_code}",
                "details": response.text
            }), response.status_code
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# TTS endpoint (Text-to-Speech with neural voices)
@app.route('/api/ai/tts', methods=['POST'])
def text_to_speech():
    """Generate speech using neural voices (OpenAI TTS or Edge-TTS fallback)"""
    try:
        data = request.json
        text = data.get("text", "")
        voice = data.get("voice", "female")  # 'female' or 'male'
        language = data.get("language", "en")
        
        if not text:
            return jsonify({
                "success": False,
                "error": "text is required"
            }), 400
        
        # Try OpenAI TTS if API key is available
        openai_api_key = os.getenv("OPENAI_API_KEY")
        if openai_api_key:
            try:
                # Map voice gender to OpenAI TTS voices
                openai_voice = "nova" if voice == "female" else "onyx"
                
                response = requests.post(
                    "https://api.openai.com/v1/audio/speech",
                    headers={
                        "Authorization": f"Bearer {openai_api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "tts-1",
                        "input": text,
                        "voice": openai_voice
                    },
                    timeout=30
                )
                
                if response.status_code == 200:
                    return response.content, 200, {
                        'Content-Type': 'audio/mpeg',
                        'Content-Disposition': 'attachment; filename=speech.mp3'
                    }
            except Exception as e:
                print(f"OpenAI TTS failed: {e}")
        
        # Fallback: Use Edge-TTS (Microsoft Neural TTS)
        try:
            import edge_tts
            import edge_tts.constants

            # Fix Microsoft 403 by pointing to current Edge synthesis endpoint
            edge_tts.constants.WSS_URL = (
                "wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1"
                f"?Ocp-Apim-Subscription-Key={edge_tts.constants.TRUSTED_CLIENT_TOKEN}"
            )
            import asyncio
            
            # Map language and voice to Edge-TTS voices with Pakistani neural voices
            voice_map = {
                'skr': 'ur-PK-UzmaNeural' if voice == 'female' else 'ur-PK-AsadNeural',
                'ur': 'ur-PK-UzmaNeural' if voice == 'female' else 'ur-PK-AsadNeural',
                'ar': 'ar-SA-ZariyahNeural' if voice == 'female' else 'ar-SA-HamedNeural',
                'hi': 'hi-IN-SwaraNeural' if voice == 'female' else 'hi-IN-MadhurNeural',
                'en': 'en-US-JennyNeural' if voice == 'female' else 'en-US-GuyNeural',
            }
            
            edge_voice = voice_map.get(language, voice_map['en'])
            
            # Strip JSON symbols, markdown, and other non-spoken characters
            clean_text = text
            # Remove JSON symbols
            clean_text = clean_text.replace('{', '').replace('}', '').replace('[', '').replace(']', '')
            clean_text = clean_text.replace('"', '').replace("'", '').replace(':', '').replace('_', '')
            # Remove markdown
            clean_text = clean_text.replace('**', '').replace('*', '').replace('#', '').replace('```', '')
            # Remove extra whitespace
            clean_text = ' '.join(clean_text.split())
            
            # Use edge_tts.Communicate with native rate and pitch parameters
            communicate = edge_tts.Communicate(clean_text, edge_voice, rate="-5%", pitch="+0Hz")
            
            # Generate audio synchronously using edge-tts save method
            import tempfile
            import os as os_module
            
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as temp_file:
                temp_path = temp_file.name
            
            # Run async function to save audio
            async def save_audio():
                await communicate.save(temp_path)
            
            asyncio.run(save_audio())
            
            # Read the audio file
            with open(temp_path, 'rb') as f:
                audio_data = f.read()
            
            # Clean up temp file
            os_module.unlink(temp_path)
            
            if audio_data:
                return audio_data, 200, {
                    'Content-Type': 'audio/mpeg',
                    'Content-Disposition': 'attachment; filename=speech.mp3'
                }
        except ImportError:
            print("edge-tts not installed, skipping")
        except Exception as e:
            print(f"Edge-TTS failed: {e}")
        
        # If both fail, return error
        return jsonify({
            "success": False,
            "error": "TTS services unavailable. Please configure OPENAI_API_KEY or install edge-tts.",
            "fallback": "Browser TTS will be used as fallback"
        }), 503
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

if __name__ == '__main__':
    print("="*60)
    print("[AI GATEWAY] ProNax Unified AI Gateway")
    print("="*60)
    print(f"[AI GATEWAY] Ollama: {OLLAMA_BASE_URL}")
    print(f"[AI GATEWAY] Model: {OLLAMA_MODEL} (fallback: {OLLAMA_FALLBACK_MODEL})")
    print(f"[AI GATEWAY] LangGraph: http://localhost:{LANGGRAPH_PORT}")
    print(f"[AI GATEWAY] Admin Brain: http://localhost:{ADMIN_BRAIN_PORT}")
    print(f"[AI GATEWAY] Gateway: http://localhost:{AI_GATEWAY_PORT}")
    print("="*60)
    
    app.run(host='0.0.0.0', port=int(AI_GATEWAY_PORT), debug=True)
