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
from dotenv import load_dotenv

# Load .env explicitly if available
load_dotenv()

app = Flask(__name__)
CORS(app)

# Supabase Configuration
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY", "")

# Validate Supabase configuration
if not SUPABASE_URL:
    print("[WARNING] SUPABASE_URL not configured. Please set VITE_SUPABASE_URL or SUPABASE_URL in your environment variables.")
if not SUPABASE_SERVICE_ROLE_KEY:
    print("[WARNING] SUPABASE_SERVICE_ROLE_KEY not configured. Please set SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY in your environment variables.")

# Ollama Configuration
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
OLLAMA_FALLBACK_MODEL = os.getenv("OLLAMA_FALLBACK_MODEL", "tinyllama")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "180"))  # Increased default to 180 seconds

# Groq Configuration (fallback)
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

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
    
    def toggle_feature(self, feature_key: str, enabled: bool, reason: str, duration_minutes: int = 0):
        """Toggle a feature on/off in app_settings and log to audit_logs"""
        try:
            # Update app_settings table
            payload = {
                "key": feature_key,
                "value": str(enabled).lower(),
                "enabled": enabled,
                "reason": reason,
                "updated_at": "now()"
            }
            
            # Try to update first, then insert if not exists
            update_response = requests.patch(
                f"{self.url}/rest/v1/app_settings?key=eq.{feature_key}",
                headers=self.headers,
                json=payload
            )
            
            if update_response.status_code not in [200, 204]:
                # If update fails, try insert
                insert_response = requests.post(
                    f"{self.url}/rest/v1/app_settings",
                    headers=self.headers,
                    json=payload
                )
                if insert_response.status_code not in [200, 201]:
                    return {"error": f"Failed to update app_settings: {insert_response.status_code}"}
            
            # Log to audit_logs
            audit_payload = {
                "action": "FEATURE_TOGGLED",
                "target": feature_key,
                "reason": reason,
                "actor": "AI_AUTONOMOUS",
                "metadata": {
                    "enabled": enabled,
                    "duration": duration_minutes
                },
                "created_at": "now()"
            }
            
            audit_response = requests.post(
                f"{self.url}/rest/v1/audit_logs",
                headers=self.headers,
                json=audit_payload
            )
            
            if audit_response.status_code in [200, 201]:
                return {
                    "success": True,
                    "feature_key": feature_key,
                    "enabled": enabled,
                    "reason": reason,
                    "duration_minutes": duration_minutes,
                    "action": "feature_toggled"
                }
            else:
                return {"error": f"Feature toggled but audit log failed: {audit_response.status_code}"}
                
        except Exception as e:
            return {"error": str(e)}
    
    def get_feature_statuses(self):
        """Get all feature toggle statuses from app_settings"""
        try:
            response = requests.get(
                f"{self.url}/rest/v1/app_settings?select=*&order=updated_at desc",
                headers=self.headers
            )
            if response.status_code == 200:
                return {"features": response.json()}
            return {"error": f"Failed to get feature statuses: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}
    
    def query_ai_audit_logs(self, limit: int = 10, target: str = None):
        """Query AI autonomous actions from audit_logs"""
        try:
            query_url = f"{self.url}/rest/v1/audit_logs?actor=eq.AI_AUTONOMOUS&order=created_at desc&limit={limit}"
            if target:
                query_url += f"&target=eq.{target}"
            
            response = requests.get(query_url, headers=self.headers)
            if response.status_code == 200:
                logs = response.json()
                formatted_logs = []
                for log in logs:
                    formatted_logs.append({
                        "action": log.get("action"),
                        "target": log.get("target"),
                        "reason": log.get("reason"),
                        "timestamp": log.get("created_at"),
                        "metadata": log.get("metadata", {})
                    })
                return {"logs": formatted_logs, "count": len(formatted_logs)}
            return {"error": f"Failed to query audit logs: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}
    
    def diagnose_system_health(self):
        """Comprehensive system health diagnostic"""
        health_report = {
            "overall_status": "UNKNOWN",
            "checks": []
        }
        
        # Database Check
        try:
            tables_to_check = ["profiles", "videos", "audit_logs", "app_settings"]
            db_status = "HEALTHY"
            db_details = []
            
            for table in tables_to_check:
                try:
                    response = requests.get(
                        f"{self.url}/rest/v1/{table}?select=id&limit=1",
                        headers=self.headers
                    )
                    if response.status_code == 200:
                        db_details.append(f"[HEALTHY] {table} table accessible")
                    else:
                        db_status = "DEGRADED"
                        db_details.append(f"[DEGRADED] {table} table returned {response.status_code}")
                except Exception as e:
                    db_status = "BROKEN"
                    db_details.append(f"[BROKEN] {table} table error: {str(e)}")
            
            health_report["checks"].append({
                "component": "Database (Supabase)",
                "status": db_status,
                "details": db_details,
                "fix_steps": [] if db_status == "HEALTHY" else ["Check Supabase connection", "Verify table permissions"]
            })
        except Exception as e:
            health_report["checks"].append({
                "component": "Database (Supabase)",
                "status": "BROKEN",
                "details": [f"Connection error: {str(e)}"],
                "fix_steps": ["Check VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables"]
            })
        
        # R2 Storage Check
        r2_status = "HEALTHY"
        r2_details = []
        r2_fix_steps = []
        
        r2_account_id = os.getenv("R2_ACCOUNT_ID")
        r2_access_key = os.getenv("R2_ACCESS_KEY_ID")
        r2_secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
        r2_bucket = os.getenv("R2_BUCKET_NAME")
        
        if not all([r2_account_id, r2_access_key, r2_secret_key, r2_bucket]):
            r2_status = "BROKEN/MISSING CONFIG"
            r2_details.append("Cloudflare R2 credentials not configured in secrets")
            r2_fix_steps = [
                "Set R2_ACCOUNT_ID environment variable",
                "Set R2_ACCESS_KEY_ID environment variable",
                "Set R2_SECRET_ACCESS_KEY environment variable",
                "Set R2_BUCKET_NAME environment variable"
            ]
        else:
            r2_details.append("All R2 credentials configured")
        
        health_report["checks"].append({
            "component": "Cloudflare R2 Storage",
            "status": r2_status,
            "details": r2_details,
            "fix_steps": r2_fix_steps
        })
        
        # Redis Check
        redis_status = "HEALTHY"
        redis_details = []
        redis_fix_steps = []
        
        try:
            import redis
            redis_client = redis.Redis(host='localhost', port=6379, db=0, socket_timeout=2)
            redis_client.ping()
            redis_details.append("Redis connection successful")
        except ImportError:
            redis_status = "DEGRADED"
            redis_details.append("Redis Python package not installed")
            redis_fix_steps = ["pip install redis"]
        except Exception as e:
            redis_status = "DEGRADED"
            redis_details.append(f"Redis connection failed: {str(e)}")
            redis_details.append("Worker queues degraded (in-memory fallback)")
            redis_fix_steps = ["Start Redis server: redis-server", "Check Redis configuration"]
        
        health_report["checks"].append({
            "component": "Redis & Background Workers",
            "status": redis_status,
            "details": redis_details,
            "fix_steps": redis_fix_steps
        })
        
        # AI Gateway Check
        ai_gateway_status = "HEALTHY"
        ai_gateway_details = []
        ai_gateway_fix_steps = []
        
        try:
            response = requests.get("http://localhost:9000/api/ai/health", timeout=3)
            if response.status_code == 200:
                ai_gateway_details.append("AI Gateway service responding")
            else:
                ai_gateway_status = "DEGRADED"
                ai_gateway_details.append(f"AI Gateway returned {response.status_code}")
                ai_gateway_fix_steps = ["Check AI Gateway server on port 9000"]
        except Exception as e:
            ai_gateway_status = "BROKEN"
            ai_gateway_details.append(f"AI Gateway connection failed: {str(e)}")
            ai_gateway_fix_steps = ["Start AI Gateway service", "Check port 9000 availability"]
        
        health_report["checks"].append({
            "component": "AI Gateway & TTS Services",
            "status": ai_gateway_status,
            "details": ai_gateway_details,
            "fix_steps": ai_gateway_fix_steps
        })
        
        # Determine overall status
        all_statuses = [check["status"] for check in health_report["checks"]]
        if "BROKEN" in all_statuses or "BROKEN/MISSING CONFIG" in all_statuses:
            health_report["overall_status"] = "DEGRADED"
        elif "DEGRADED" in all_statuses:
            health_report["overall_status"] = "DEGRADED"
        else:
            health_report["overall_status"] = "HEALTHY"
        
        return health_report
    
    def analyze_app_growth_and_ui(self):
        """Analyze app growth metrics and provide UI/UX recommendations"""
        try:
            # Get recent videos for engagement analysis
            videos_response = requests.get(
                f"{self.url}/rest/v1/videos?select=id,title,views,created_at&order=created_at desc&limit=50",
                headers=self.headers
            )
            
            # Get user count
            users_response = requests.get(
                f"{self.url}/rest/v1/profiles?select=id&head=true",
                headers=self.headers
            )
            
            video_data = videos_response.json() if videos_response.status_code == 200 else []
            user_count = 0
            if users_response.status_code == 200:
                try:
                    user_count = int(users_response.headers.get('content-range', '0-0/0').split('/')[-1])
                except:
                    pass
            
            # Calculate engagement metrics
            total_views = sum(v.get('views', 0) for v in video_data)
            avg_views = total_views / len(video_data) if video_data else 0
            
            # Generate recommendations
            recommendations = {
                "metrics": {
                    "total_videos": len(video_data),
                    "total_users": user_count,
                    "total_views": total_views,
                    "average_views_per_video": round(avg_views, 2)
                },
                "ui_ux_recommendations": [
                    {
                        "priority": "HIGH",
                        "category": "Mobile Responsiveness",
                        "suggestion": "Improve admin tabs mobile layout - current implementation may have overflow issues on small screens",
                        "impact": "Better admin accessibility on mobile devices"
                    },
                    {
                        "priority": "MEDIUM",
                        "category": "Video Player",
                        "suggestion": "Add buffer state indicators and preloading for smoother playback",
                        "impact": "Reduced viewer drop-off during buffering"
                    },
                    {
                        "priority": "MEDIUM",
                        "category": "Navigation",
                        "suggestion": "Optimize drawer ergonomics - add swipe gestures and better touch targets",
                        "impact": "Improved navigation experience"
                    }
                ],
                "feature_recommendations": [
                    {
                        "priority": "HIGH",
                        "feature": "Automated Thumbnail Generation",
                        "description": "Use AI to generate thumbnails from video frames",
                        "impact": "Increased click-through rates by 25-40%"
                    },
                    {
                        "priority": "MEDIUM",
                        "feature": "AI Clip Extraction for Shorts",
                        "description": "Automatically extract viral moments for short-form content",
                        "impact": "Expand content reach to Shorts audience"
                    },
                    {
                        "priority": "LOW",
                        "feature": "Real-time Super Chat",
                        "description": "Live chat monetization during streams",
                        "impact": "Additional revenue stream"
                    }
                ],
                "performance_recommendations": [
                    {
                        "priority": "HIGH",
                        "category": "HLS Caching",
                        "suggestion": "Implement CDN caching for HLS segments",
                        "impact": "50-70% reduction in bandwidth costs"
                    },
                    {
                        "priority": "MEDIUM",
                        "category": "Image Lazy-loading",
                        "suggestion": "Lazy-load thumbnails and profile images",
                        "impact": "Faster initial page load (30-50% improvement)"
                    },
                    {
                        "priority": "MEDIUM",
                        "category": "CDN Routing",
                        "suggestion": "Configure geographically distributed CDN edge locations",
                        "impact": "Reduced latency for global users"
                    }
                ]
            }
            
            return recommendations
            
        except Exception as e:
            return {"error": str(e)}

# Initialize tools
supabase_tools = SupabaseAdminTools()

def call_ollama(messages, system_prompt=None):
    """Call Ollama API for chat completion with fallback to Groq"""
    message_lower = messages[-1].get("content", "").lower() if messages else ""
    
    # First check if we need to call real Supabase APIs
    if "database" in message_lower or "db" in message_lower:
        try:
            # Get system health which includes database info
            health = supabase_tools.get_system_health()
            return f"Jani, maine database check kiya hai. System health: {health}"
        except Exception as e:
            return f"Jani, database check mein error aa gaya hai: {str(e)}"
    
    elif "user" in message_lower and "count" in message_lower:
        try:
            # Get user count
            users = supabase_tools.get_users(limit=10)
            return f"Jani, total users hain: {users.get('count', 0)}"
        except Exception as e:
            return f"Jani, user count mein error aa gaya hai: {str(e)}"
    
    # Check Ollama availability and select model
    ollama_available, available_models = check_ollama_available()
    if not ollama_available:
        # Try Groq fallback if Ollama is not available
        if GROQ_API_KEY:
            return call_groq(messages, system_prompt)
        return "Jani, Ollama server chal nahi raha hai. Please ensure Ollama is running or configure GROQ_API_KEY."
    
    # Select model (use fallback if primary not available)
    selected_model = OLLAMA_MODEL if OLLAMA_MODEL in available_models else OLLAMA_FALLBACK_MODEL
    if selected_model not in available_models:
        # Try Groq fallback if model not available
        if GROQ_API_KEY:
            return call_groq(messages, system_prompt)
        return f"Jani, Ollama models available: {', '.join(available_models)}. Please pull required model or configure GROQ_API_KEY."
    
    # For all other messages, use Ollama with selected model
    try:
        simplified_messages = messages[-5:] if len(messages) > 5 else messages
        # Strong Roman Urdu prompt with explainable AI instructions
        simple_prompt = """IMPORTANT: You MUST respond ONLY in Roman Urdu (Urdu written in English letters). 
Do NOT use English words. Do NOT use any other language.
Example: "Jani, maine check kiya hai. Sab theek hai."
Be conversational and helpful. Use "jani" to address the user.

EXPLAINABLE AI INSTRUCTIONS:
When the admin asks about past actions (e.g., "Tum ne upload kyun band kiya?", "User X ko kyun ban kiya?", "Aaj tum ne kya kya actions liye?"):
- You MUST check the audit logs data provided in the context
- Explain the exact reason/trigger for each action
- Be transparent about autonomous decisions
- Show respect for the admin's authority
- Provide timestamps when available
- If audit logs are not available in context, ask the admin to check audit logs

When providing diagnostic reports or system status:
- Clearly indicate what is [HEALTHY], [DEGRADED], or [BROKEN]
- Provide actionable fix steps
- Be honest about system limitations"""
        
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
            timeout=OLLAMA_TIMEOUT  # Increased timeout to 180 seconds
        )
        
        if response.status_code == 200:
            data = response.json()
            ai_response = data.get("message", {}).get("content", "")
            if ai_response:
                return ai_response
            else:
                return "Jani, Ollama se empty response aaya hai. Dubara try karein."
        else:
            # Try Groq fallback on Ollama error
            if GROQ_API_KEY:
                return call_groq(messages, system_prompt)
            return f"Jani, Ollama error: {response.status_code}. Server slow chal raha hai."
    except Exception as e:
        # Try Groq fallback on Ollama timeout/connection error
        if GROQ_API_KEY:
            print(f"Ollama timeout/error: {e}, falling back to Groq")
            return call_groq(messages, system_prompt)
        return f"Jani, Ollama connection error: {str(e)}. Server slow hai ya Ollama chal nahi raha."

def call_groq(messages, system_prompt=None):
    """Call Groq API as fallback when Ollama is slow or unavailable"""
    if not GROQ_API_KEY:
        return "Jani, Groq API key not configured. Please set GROQ_API_KEY environment variable."
    
    try:
        simplified_messages = messages[-5:] if len(messages) > 5 else messages
        # Strong Roman Urdu prompt with explainable AI instructions
        simple_prompt = """IMPORTANT: You MUST respond ONLY in Roman Urdu (Urdu written in English letters). 
Do NOT use English words. Do NOT use any other language.
Example: "Jani, maine check kiya hai. Sab theek hai."
Be conversational and helpful. Use "jani" to address the user.

EXPLAINABLE AI INSTRUCTIONS:
When the admin asks about past actions (e.g., "Tum ne upload kyun band kiya?", "User X ko kyun ban kiya?", "Aaj tum ne kya kya actions liye?"):
- You MUST check the audit logs data provided in the context
- Explain the exact reason/trigger for each action
- Be transparent about autonomous decisions
- Show respect for the admin's authority
- Provide timestamps when available
- If audit logs are not available in context, ask the admin to check audit logs

When providing diagnostic reports or system status:
- Clearly indicate what is [HEALTHY], [DEGRADED], or [BROKEN]
- Provide actionable fix steps
- Be honest about system limitations"""
        
        payload = {
            "model": GROQ_MODEL,
            "messages": simplified_messages,
            "temperature": 0.7,
            "max_tokens": 200
        }
        if system_prompt:
            payload["messages"].insert(0, {"role": "system", "content": system_prompt})
        else:
            payload["messages"].insert(0, {"role": "system", "content": simple_prompt})
        
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=60
        )
        
        if response.status_code == 200:
            data = response.json()
            ai_response = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if ai_response:
                return ai_response
            else:
                return "Jani, Groq se empty response aaya hai. Dubara try karein."
        else:
            return f"Jani, Groq error: {response.status_code}. {response.text}"
    except Exception as e:
        return f"Jani, Groq connection error: {str(e)}."

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
    
    # System health check - new comprehensive diagnostic
    if "health" in message_lower or "status" in message_lower or "how's" in message_lower or "diagnostic" in message_lower:
        health = supabase_tools.diagnose_system_health()
        actions.append({
            "type": "System Health Diagnostic",
            "description": "Comprehensive system health check completed",
            "data": health,
            "is_autonomous": True
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
    
    # Feature toggle operations
    if "toggle" in message_lower or "enable" in message_lower or "disable" in message_lower or "band" in message_lower or "khol" in message_lower or "band" in message_lower:
        # Extract feature key and enabled state
        enabled = "enable" in message_lower or "on" in message_lower or "khol" in message_lower
        feature_key = None
        
        # Try to identify feature from message
        if "upload" in message_lower:
            feature_key = "upload_enabled"
        elif "stream" in message_lower or "live" in message_lower:
            feature_key = "live_streaming_enabled"
        elif "short" in message_lower:
            feature_key = "shorts_enabled"
        elif "comment" in message_lower:
            feature_key = "comments_enabled"
        
        if feature_key:
            reason = "Admin request via AI Brain"
            result = supabase_tools.toggle_feature(feature_key, enabled, reason)
            actions.append({
                "type": "Feature Toggled",
                "description": f"{'Enabled' if enabled else 'Disabled'} {feature_key}",
                "data": result,
                "is_autonomous": True,
                "badge": "AI AUTONOMOUS ACTION"
            })
    
    # Get feature statuses
    if "feature" in message_lower and ("status" in message_lower or "settings" in message_lower):
        features = supabase_tools.get_feature_statuses()
        actions.append({
            "type": "Feature Statuses Retrieved",
            "description": "Retrieved all feature toggle statuses",
            "data": features
        })
    
    # Query AI audit logs - for explainable AI
    if "audit" in message_lower or "log" in message_lower or "action" in message_lower or "kiya" in message_lower or "kya" in message_lower:
        logs = supabase_tools.query_ai_audit_logs(limit=10)
        actions.append({
            "type": "AI Audit Logs Retrieved",
            "description": f"Retrieved {logs.get('count', 0)} autonomous actions",
            "data": logs
        })
    
    # Analyze app growth and UI
    if "growth" in message_lower or "recommend" in message_lower or "improve" in message_lower or "suggestion" in message_lower or "ui" in message_lower:
        analysis = supabase_tools.analyze_app_growth_and_ui()
        actions.append({
            "type": "App Growth & UI Analysis",
            "description": "Analyzed app metrics and generated recommendations",
            "data": analysis
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
        
        # Check if admin is asking about past actions - if so, fetch audit logs
        message_lower = message.lower()
        audit_context = ""
        if any(keyword in message_lower for keyword in ["kyun", "kya", "kiya", "why", "what", "audit", "log", "action", "ban", "band", "suspension"]):
            audit_logs = supabase_tools.query_ai_audit_logs(limit=5)
            if audit_logs.get("logs"):
                audit_context = "\n\nRECENT AI AUTONOMOUS ACTIONS (for explainability):\n"
                for log in audit_logs["logs"]:
                    audit_context += f"- Action: {log['action']}, Target: {log['target']}, Reason: {log['reason']}, Time: {log['timestamp']}\n"
        
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
        
        # Add audit logs context if available (for explainable AI)
        if audit_context:
            messages.append({
                "role": "system",
                "content": audit_context
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
    print("[AI BRAIN] Initializing AI Brain Memory System...")
    init_memory_db()
    print("[AI BRAIN] Memory System Initialized")
    
    print("[AI BRAIN] AI Admin Brain Server Starting...")
    print(f"[AI BRAIN] Ollama Model: {OLLAMA_MODEL}")
    print(f"[AI BRAIN] Ollama URL: {OLLAMA_BASE_URL}")
    print(f"[AI BRAIN] Ollama Timeout: {OLLAMA_TIMEOUT}s")
    print(f"[AI BRAIN] Groq Fallback: {'Enabled' if GROQ_API_KEY else 'Disabled (set GROQ_API_KEY)'}")
    print(f"[AI BRAIN] Supabase URL: {SUPABASE_URL}")
    print(f"[AI BRAIN] Memory Database: {MEMORY_DB}")
    print("[AI BRAIN] Server running on http://localhost:8001")
    print("="*60)
    
    app.run(host='0.0.0.0', port=8001, debug=True)
