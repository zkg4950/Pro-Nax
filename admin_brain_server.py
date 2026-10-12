"""
AI Admin Brain Chat Server
Human-like conversation with real application control
Uses Ollama (Llama3.2) for natural responses
Persistent memory system for learning
Urdu language support
"""

from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import requests
import json
import os
import sqlite3
from datetime import datetime
from typing import Dict, List, Any

app = Flask(__name__)
CORS(app)

# Supabase Configuration
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL", "https://iouowplbxxivecctuilt.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Ollama Configuration
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
OLLAMA_FALLBACK_MODEL = os.getenv("OLLAMA_FALLBACK_MODEL", "tinyllama")

# Check Ollama availability
def check_ollama_available():
    """Check if Ollama is running and model is available"""
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get("models", [])
            model_names = [m.get("name", "").split(":")[0] for m in models]
            return True, model_names
        return False, []
    except Exception as e:
        print(f"Ollama check failed: {e}")
        return False, []

# Memory Database
MEMORY_DB = "ai_brain_memory.db"

# Initialize Memory Database
def init_memory_db():
    """Initialize SQLite database for persistent memory"""
    conn = sqlite3.connect(MEMORY_DB)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            category TEXT,
            importance INTEGER DEFAULT 1,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            access_count INTEGER DEFAULT 0
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_message TEXT NOT NULL,
            ai_response TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            context TEXT
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            decision TEXT NOT NULL,
            action_taken TEXT,
            result TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            learned_from TEXT
        )
    ''')
    
    conn.commit()
    conn.close()

def save_memory(content: str, category: str = "general", importance: int = 1):
    """Save a memory to the database"""
    conn = sqlite3.connect(MEMORY_DB)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO memories (content, category, importance) VALUES (?, ?, ?)",
        (content, category, importance)
    )
    conn.commit()
    conn.close()

def get_relevant_memories(query: str, limit: int = 5) -> List[Dict]:
    """Get relevant memories based on query"""
    try:
        conn = sqlite3.connect(MEMORY_DB)
        cursor = conn.cursor()
        
        # Simple keyword matching (in production, use vector embeddings)
        keywords = query.lower().split()
        
        # Build WHERE clause
        where_clauses = ' OR '.join(['LOWER(content) LIKE ?' for _ in keywords])
        params = [f'%{kw}%' for kw in keywords]
        
        cursor.execute(f'''
            SELECT content, category, importance, timestamp
            FROM memories
            WHERE {where_clauses}
            ORDER BY importance DESC, access_count DESC
            LIMIT ?
        ''', params + [limit])
        
        memories = []
        for row in cursor.fetchall():
            memories.append({
                "content": row[0],
                "category": row[1],
                "importance": row[2],
                "timestamp": row[3]
            })
        
        # Update access count
        cursor.execute(f'''
            UPDATE memories 
            SET access_count = access_count + 1 
            WHERE id IN (
                SELECT id FROM memories 
                WHERE {where_clauses} 
                ORDER BY importance DESC, access_count DESC 
                LIMIT ?
            )
        ''', params + [limit])
        
        conn.commit()
        conn.close()
        return memories
    except Exception as e:
        print(f"Error getting memories: {e}")
        return []

def save_conversation(user_message: str, ai_response: str, context: str = ""):
    """Save conversation to database"""
    conn = sqlite3.connect(MEMORY_DB)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO conversations (user_message, ai_response, context) VALUES (?, ?, ?)",
        (user_message, ai_response, context)
    )
    conn.commit()
    conn.close()

def save_decision(decision: str, action_taken: str, result: str = "", learned_from: str = ""):
    """Save decision to database for learning"""
    conn = sqlite3.connect(MEMORY_DB)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO decisions (decision, action_taken, result, learned_from) VALUES (?, ?, ?, ?)",
        (decision, action_taken, result, learned_from)
    )
    conn.commit()
    conn.close()

class SupabaseAdminTools:
    """Real tools for Supabase database operations"""
    
    def __init__(self):
        self.url = SUPABASE_URL
        self.service_key = SUPABASE_SERVICE_ROLE_KEY
        self.headers = {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json"
        }
    
    def get_system_health(self):
        """Get real system health from Supabase"""
        try:
            response = requests.post(
                f"{self.url}/rest/v1/rpc/supervisor_get_system_health",
                headers=self.headers
            )
            if response.status_code == 200:
                return response.json()
            return {"error": f"Failed to get health: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}
    
    def get_users(self, limit: int = 50) -> Dict:
        """Get real users from database"""
        try:
            # First get count
            count_response = requests.get(
                f"{self.url}/rest/v1/profiles?select=id&head=true",
                headers=self.headers
            )
            count = 0
            if count_response.status_code == 200:
                count = int(count_response.headers.get('content-range', '0-0/0').split('/')[-1])
            
            # Then get actual data
            response = requests.get(
                f"{self.url}/rest/v1/profiles?select=*&limit={limit}&order=created_at desc",
                headers=self.headers
            )
            if response.status_code == 200:
                return {"users": response.json(), "count": count}
            return {"error": f"Failed to get users: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}
    
    def ban_user(self, user_id, reason):
        """Actually ban a user in the database"""
        try:
            response = requests.patch(
                f"{self.url}/rest/v1/profiles?id=eq.{user_id}",
                headers=self.headers,
                json={"is_banned": True, "ban_reason": reason, "banned_at": "now()"}
            )
            if response.status_code in [200, 204]:
                return {"success": True, "user_id": user_id, "action": "banned"}
            return {"error": f"Failed to ban user: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}
    
    def get_videos(self, limit: int = 50) -> Dict:
        """Get real videos from database"""
        try:
            # First get count using Supabase count parameter
            count_response = requests.get(
                f"{self.url}/rest/v1/videos?select=id&head=true",
                headers=self.headers
            )
            count = 0
            if count_response.status_code == 200:
                try:
                    count = int(count_response.headers.get('content-range', '0-0/0').split('/')[-1])
                except:
                    count = 0
            
            # Then get actual data
            response = requests.get(
                f"{self.url}/rest/v1/videos?select=*&limit={limit}&order=created_at desc",
                headers=self.headers
            )
            if response.status_code == 200:
                return {"videos": response.json(), "count": count}
            return {"error": f"Failed to get videos: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}
    
    def delete_video(self, video_id, reason):
        """Actually delete a video"""
        try:
            response = requests.delete(
                f"{self.url}/rest/v1/videos?id=eq.{video_id}",
                headers=self.headers
            )
            if response.status_code in [200, 204]:
                return {"success": True, "video_id": video_id, "action": "deleted"}
            return {"error": f"Failed to delete video: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}

# Initialize tools
supabase_tools = SupabaseAdminTools()

def call_ollama(messages, system_prompt=None):
    """Call Ollama API for chat completion with fallback model"""
    message_lower = messages[-1].get("content", "").lower() if messages else ""
    
    # First check if we need to call real Supabase APIs
    if "database" in message_lower and "table" in message_lower:
        try:
            # Call Supabase to get table info
            tables_info = supabase_tools.list_tables()
            return f"Jani, maine database tables check kiye hain. Yeh raha information: {tables_info}"
        except Exception as e:
            return f"Jani, database tables check mein error aa gaya hai: {str(e)}"
    
    elif "database" in message_lower or "db" in message_lower:
        try:
            # Get system health which includes database info
            health = supabase_tools.get_system_health()
            return f"Jani, maine database check kiya hai. System health: {health}"
        except Exception as e:
            return f"Jani, database check mein error aa gaya hai: {str(e)}"
    
    elif "user" in message_lower and "count" in message_lower:
        try:
            # Get user count
            users = supabase_tools.list_users()
            return f"Jani, total users hain: {len(users.get('users', []))}"
        except Exception as e:
            return f"Jani, user count mein error aa gaya hai: {str(e)}"
    
    # Check Ollama availability and select model
    ollama_available, available_models = check_ollama_available()
    if not ollama_available:
        return "Jani, Ollama server chal nahi raha hai. Please ensure Ollama is running."
    
    # Select model (use fallback if primary not available)
    selected_model = OLLAMA_MODEL if OLLAMA_MODEL in available_models else OLLAMA_FALLBACK_MODEL
    if selected_model not in available_models:
        return f"Jani, Ollama models available: {', '.join(available_models)}. Please pull required model."
    
    # For all other messages, use Ollama with selected model
    try:
        simplified_messages = messages[-5:] if len(messages) > 5 else messages
        # Strong Roman Urdu prompt
        simple_prompt = """IMPORTANT: You MUST respond ONLY in Roman Urdu (Urdu written in English letters). 
Do NOT use English words. Do NOT use any other language.
Example: "Jani, maine check kiya hai. Sab theek hai."
Be conversational and helpful. Use "jani" to address the user."""
        
        payload = {
            "model": selected_model,
            "messages": simplified_messages,
            "stream": False,
            "options": {
                "temperature": 0.7,
                "top_p": 0.9,
                "num_predict": 200
            }
        }
        payload["system"] = simple_prompt
        
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            timeout=90
        )
        
        if response.status_code == 200:
            data = response.json()
            ai_response = data.get("message", {}).get("content", "")
            if ai_response:
                return ai_response
            else:
                return "Jani, Ollama se empty response aaya hai. Dubara try karein."
        else:
            return f"Jani, Ollama error: {response.status_code}. Server slow chal raha hai."
    except Exception as e:
        return f"Jani, Ollama connection error: {str(e)}. Server slow hai ya Ollama chal nahi raha."

def detect_intent_and_execute(message, video_frame=None):
    """Detect user intent and execute appropriate actions"""
    actions = []
    
    # Simple intent detection
    message_lower = message.lower()
    
    # If video frame is provided, acknowledge it
    if video_frame:
        actions.append({
            "type": "Video Input Received",
            "description": "I can see you through your camera",
            "data": {"video_frame": True}
        })
    
    # System health check
    if "health" in message_lower or "status" in message_lower or "how's" in message_lower:
        health = supabase_tools.get_system_health()
        actions.append({
            "type": "System Health Check",
            "description": "Checked system health metrics",
            "data": health
        })
    
    # Get users
    if "users" in message_lower or "user" in message_lower:
        users = supabase_tools.get_users(limit=10)
        actions.append({
            "type": "User Data Retrieved",
            "description": f"Retrieved {users.get('count', 0)} users",
            "data": users
        })
    
    # Get videos
    if "videos" in message_lower or "video" in message_lower:
        videos = supabase_tools.get_videos(limit=50)
        print(f"DEBUG: Videos response: {videos}")
        video_count = len(videos.get('videos', [])) if 'videos' in videos else videos.get('count', 0)
        actions.append({
            "type": "Video Data Retrieved",
            "description": f"Retrieved {video_count} videos",
            "data": videos
        })
    
    # Ban user (requires confirmation in real scenario)
    if "ban" in message_lower and "user" in message_lower:
        # Extract user ID if mentioned (simplified)
        actions.append({
            "type": "Ban User",
            "description": "User ban requested - requires user ID",
            "needs_confirmation": True
        })
    
    # Delete video (requires confirmation in real scenario)
    if "delete" in message_lower and "video" in message_lower:
        actions.append({
            "type": "Delete Video",
            "description": "Video deletion requested - requires video ID",
            "needs_confirmation": True
        })
    
    return actions

@app.route('/api/admin/chat', methods=['POST'])
def chat():
    """Handle chat requests from frontend"""
    try:
        data = request.json
        message = data.get('message', '')
        conversation_history = data.get('conversationHistory', [])
        system_prompt = data.get('systemPrompt')
        video_frame = data.get('videoFrame')  # Optional video frame data
        
        # Get relevant memories from database
        relevant_memories = get_relevant_memories(message, limit=5)
        
        # Build messages for Ollama
        messages = []
        
        # Add system prompt if provided
        if system_prompt:
            messages.append({
                "role": "system",
                "content": system_prompt
            })
        
        # Add memory context if available
        if relevant_memories:
            memory_context = "\n\nRELEVANT MEMORIES (I remember these):\n"
            for mem in relevant_memories:
                memory_context += f"- {mem['content']} (from {mem['category']})\n"
            messages.append({
                "role": "system",
                "content": memory_context
            })
        
        # Add conversation history
        for msg in conversation_history:
            messages.append({
                "role": msg.get('role', 'user'),
                "content": msg.get('content', '')
            })
        
        # Add current message
        messages.append({
            "role": "user",
            "content": message
        })
        
        # Detect and execute actions
        actions = detect_intent_and_execute(message, video_frame)
        
        # Build database context for Ollama
        db_data_description = ""
        if actions:
            for action in actions:
                if action.get("type") == "Video Data Retrieved":
                    video_count = action.get("data", {}).get("count", 0)
                    db_data_description = f"Database real-time data: Total videos uploaded = {video_count}."
                elif action.get("type") == "User Data Retrieved":
                    user_count = action.get("data", {}).get("count", 0)
                    db_data_description = f"Database real-time data: Total registered users = {user_count}."
        
        # Add database context to system prompt
        if db_data_description:
            enhanced_system_prompt = f"""You are ProNax AI Admin Brain connected to a live Supabase database. 
Here is the live data fetched for the current query: {db_data_description}
Answer the admin's query naturally, in a friendly and helpful tone (use Roman Urdu if they spoke it), providing the exact factual figures above if available."""
            messages.append({
                "role": "system",
                "content": enhanced_system_prompt
            })
        
        # Get response from Ollama
        response = call_ollama(messages, system_prompt)
        
        # Save conversation to memory
        save_conversation(message, response, str(actions))
        
        # Save important information as memories
        if "important" in message.lower() or "remember" in message.lower():
            save_memory(message, "user_instruction", importance=3)
        
        # Save decisions made
        if actions:
            for action in actions:
                if action.get("needs_confirmation"):
                    save_decision(f"User requested: {action['type']}", "Pending confirmation", learned_from=message)
                else:
                    save_decision(f"Executed: {action['type']}", action['description'], learned_from=message)
        
        return jsonify({
            "response": response,
            "actions": actions,
            "memories_used": len(relevant_memories),
            "timestamp": datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "response": f"Sorry, I encountered an error: {str(e)}"
        }), 500

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "model": OLLAMA_MODEL,
        "ollama_connected": True,
        "timestamp": datetime.now().isoformat()
    })

if __name__ == '__main__':
    # Initialize memory database
    print("🧠 Initializing AI Brain Memory System...")
    init_memory_db()
    print("✅ Memory System Initialized")
    
    print("🧠 AI Admin Brain Server Starting...")
    print(f"📡 Ollama Model: {OLLAMA_MODEL}")
    print(f"🔗 Ollama URL: {OLLAMA_BASE_URL}")
    print(f"💾 Supabase URL: {SUPABASE_URL}")
    print(f"🗄️ Memory Database: {MEMORY_DB}")
    print("🚀 Server running on http://localhost:8001")
    print("="*60)
    
    app.run(host='0.0.0.0', port=8001, debug=True)
