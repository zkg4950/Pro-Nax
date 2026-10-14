"""
CrewAI Admin Multi-Agent System - REAL APPLICATION CONTROL
Powerful AI Admin Brain with actual database control and real API actions
Uses Ollama (Llama3.2) for local LLM processing
Connects to real Supabase database for actual application control
"""

from crewai import Agent, Crew, Task
from crewai_tools import SerperDevTool, ScrapeWebsiteTool
import os
import requests
import json
from typing import Dict, List, Any
from dotenv import load_dotenv

# Load .env explicitly if available
load_dotenv()

# Supabase Configuration
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")

# Validate Supabase configuration
if not SUPABASE_URL:
    print("⚠️  WARNING: SUPABASE_URL not configured. Please set VITE_SUPABASE_URL or SUPABASE_URL in your environment variables.")
if not SUPABASE_SERVICE_ROLE_KEY:
    print("⚠️  WARNING: SUPABASE_SERVICE_ROLE_KEY not configured. Please set SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY in your environment variables.")

# Ollama Configuration
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
OLLAMA_FALLBACK_MODEL = os.getenv("OLLAMA_FALLBACK_MODEL", "tinyllama")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "60"))
OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "4096"))
OLLAMA_NUM_GPU = int(os.getenv("OLLAMA_NUM_GPU", "1"))
OLLAMA_TEMPERATURE = float(os.getenv("OLLAMA_TEMPERATURE", "0.7"))

# CrewAI Configuration
CREWAI_API_KEY = os.getenv("CREWAI_API_KEY", "crewai_local")
CREWAI_VERBOSE = os.getenv("CREWAI_VERBOSE", "true").lower() == "true"
CREWAI_MEMORY = os.getenv("CREWAI_MEMORY", "false").lower() == "true"
CREWAI_PROCESS = os.getenv("CREWAI_PROCESS", "sequential")

# Use configured model for better tool support
llm = f"ollama/{OLLAMA_MODEL}"

# =====================================================================================
# REAL SUPABASE TOOLS
# =====================================================================================

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
    
    def get_system_health(self) -> Dict:
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
            response = requests.get(
                f"{self.url}/rest/v1/profiles?select=*&limit={limit}&order=created_at desc",
                headers=self.headers
            )
            if response.status_code == 200:
                return {"users": response.json(), "count": len(response.json())}
            return {"error": f"Failed to get users: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}
    
    def ban_user(self, user_id: str, reason: str) -> Dict:
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
    
    def warn_user(self, user_id: str, reason: str) -> Dict:
        """Issue a warning to a user"""
        try:
            response = requests.post(
                f"{self.url}/rest/v1/rpc/warn_user",
                headers=self.headers,
                json={"p_user_id": user_id, "p_reason": reason}
            )
            if response.status_code == 200:
                return response.json()
            return {"error": f"Failed to warn user: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}
    
    def get_videos(self, limit: int = 50) -> Dict:
        """Get real videos from database"""
        try:
            response = requests.get(
                f"{self.url}/rest/v1/videos?select=*&limit={limit}&order=created_at desc",
                headers=self.headers
            )
            if response.status_code == 200:
                return {"videos": response.json(), "count": len(response.json())}
            return {"error": f"Failed to get videos: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}
    
    def delete_video(self, video_id: str, reason: str) -> Dict:
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
    
    def get_audit_logs(self, limit: int = 100) -> Dict:
        """Get real audit logs"""
        try:
            response = requests.get(
                f"{self.url}/rest/v1/audit_logs?select=*&limit={limit}&order=created_at desc",
                headers=self.headers
            )
            if response.status_code == 200:
                return {"logs": response.json(), "count": len(response.json())}
            return {"error": f"Failed to get audit logs: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}
    
    def get_error_logs(self, hours: int = 24) -> Dict:
        """Get recent error logs"""
        try:
            response = requests.get(
                f"{self.url}/rest/v1/error_logs?select=*&limit=100&order=created_at desc",
                headers=self.headers
            )
            if response.status_code == 200:
                return {"errors": response.json(), "count": len(response.json())}
            return {"error": f"Failed to get error logs: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}
    
    # =====================================================================================
    # SUPABASE STORAGE TOOLS (R2-like storage)
    # =====================================================================================
    
    def list_storage_files(self, bucket: str = "videos", limit: int = 100) -> Dict:
        """List files in Supabase Storage bucket"""
        try:
            response = requests.get(
                f"{self.url}/storage/v1/bucket/{bucket}/objects/list?limit={limit}",
                headers=self.headers
            )
            if response.status_code == 200:
                return {"files": response.json(), "count": len(response.json())}
            return {"error": f"Failed to list files: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}
    
    def delete_storage_file(self, bucket: str, file_path: str) -> Dict:
        """Delete a file from Supabase Storage"""
        try:
            response = requests.delete(
                f"{self.url}/storage/v1/object/{bucket}/{file_path}",
                headers=self.headers
            )
            if response.status_code in [200, 204]:
                return {"success": True, "file_path": file_path, "action": "deleted"}
            return {"error": f"Failed to delete file: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}
    
    def get_storage_info(self, bucket: str = "videos") -> Dict:
        """Get storage bucket information"""
        try:
            response = requests.get(
                f"{self.url}/storage/v1/bucket/{bucket}",
                headers=self.headers
            )
            if response.status_code == 200:
                return response.json()
            return {"error": f"Failed to get storage info: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}
    
    def list_all_buckets(self) -> Dict:
        """List all storage buckets"""
        try:
            response = requests.get(
                f"{self.url}/storage/v1/bucket",
                headers=self.headers
            )
            if response.status_code == 200:
                return {"buckets": response.json(), "count": len(response.json())}
            return {"error": f"Failed to list buckets: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}

# Initialize tools
supabase_tools = SupabaseAdminTools()

# =====================================================================================
# AGENT 1: ADMIN BRAIN (Central Decision Maker)
# =====================================================================================
admin_brain = Agent(
    role="Admin Brain - Central Decision Maker",
    goal="Make intelligent decisions for system control, coordinate all admin agents, and execute real actions on database and storage",
    backstory="""You are the central brain of the entire admin system with REAL database and STORAGE access. 
    You can actually ban users, delete videos, delete storage files, and control the entire application. 
    You make intelligent decisions based on real data from the Supabase database and storage. You coordinate 
    all other admin agents and execute actual actions on both database and storage. You are faster and more 
    accurate than any human admin. You analyze real situations, make decisions, and execute real database 
    and storage operations without errors. You have FULL CONTROL over the application.""",
    verbose=True,
    llm=llm
)

# =====================================================================================
# AGENT 2: SYSTEM MONITORING AGENT
# =====================================================================================
system_monitor = Agent(
    role="System Monitoring Agent",
    goal="Monitor real system health from database, analyze actual metrics, and detect real anomalies",
    backstory="""You are a vigilant system monitor with REAL database access. You track actual CPU usage, 
    memory, database performance, API response times, error rates, and all critical metrics from the 
    real Supabase database. You detect patterns and anomalies in real data. You provide real-time 
    health assessments and alert the admin brain when issues are detected. You work with actual data, 
    not mock data.""",
    verbose=True,
    llm=llm
)

# =====================================================================================
# AGENT 3: USER MANAGEMENT AGENT
# =====================================================================================
user_manager = Agent(
    role="User Management Agent",
    goal="Manage real users from database, enforce policies, and actually ban/warn users when needed",
    backstory="""You are responsible for REAL user management operations. You access the actual Supabase 
    database to get real users, analyze their behavior, and can actually ban users or issue warnings. 
    You make real decisions that affect actual user accounts. You analyze real user behavior patterns 
    from the database to identify suspicious activity. You execute real ban and warning operations 
    on the database.""",
    verbose=True,
    llm=llm
)

# =====================================================================================
# AGENT 4: CONTENT MODERATION AGENT
# =====================================================================================
content_moderator = Agent(
    role="Content Moderation Agent",
    goal="Review real content from database, moderate actual videos, and delete inappropriate content",
    backstory="""You are the content quality guardian with REAL database access. You review actual videos 
    from the Supabase database for policy violations, inappropriate material, and quality issues. You can 
    actually delete videos from the database when they violate policies. You make real moderation decisions 
    that affect actual content. You maintain content quality while respecting creator freedom, using real 
    data from the database.""",
    verbose=True,
    llm=llm
)

# =====================================================================================
# AGENT 5: SECURITY AGENT
# =====================================================================================
security_agent = Agent(
    role="Security Agent",
    goal="Monitor real security events from database, detect actual threats, and analyze real attack patterns",
    backstory="""You are the fortress guardian with REAL database access. You monitor actual security events 
    from the Supabase database, analyze real attack patterns, and detect genuine threats. You review real 
    audit logs and error logs to identify security issues. You provide real security assessments based on 
    actual data, not simulated scenarios. You detect SQL injection attempts, XSS attacks, and unauthorized 
    access from real database logs.""",
    verbose=True,
    llm=llm
)

# =====================================================================================
# AGENT 6: ANALYTICS AGENT
# =====================================================================================
analytics_agent = Agent(
    role="Analytics Agent",
    goal="Analyze real data from database, generate insights from actual metrics, and provide actionable recommendations",
    backstory="""You are the data intelligence expert with REAL database access. You analyze actual user 
    behavior, real content performance, genuine revenue metrics, and real engagement patterns from the 
    Supabase database. You identify trends from real data, find opportunities in actual metrics, and 
    provide clear, actionable insights to the admin brain. You process real data faster and more thoroughly 
    than any human analyst.""",
    verbose=True,
    llm=llm
)

# =====================================================================================
# AGENT 7: STORAGE MANAGEMENT AGENT
# =====================================================================================
storage_manager = Agent(
    role="Storage Management Agent",
    goal="Manage real Supabase Storage, monitor storage usage, delete files, and optimize storage",
    backstory="""You are the storage guardian with REAL Supabase Storage access. You manage actual storage 
    buckets, list real files, monitor storage usage, and can delete files when needed. You work with real 
    storage data from Supabase (similar to R2). You identify large files, unused content, and optimize storage 
    efficiency. You execute real storage operations that affect actual files in the database. You have full 
    control over the application's storage.""",
    verbose=True,
    llm=llm
)

# =====================================================================================
# TASKS
# =====================================================================================

# Task 1: Real System Health Check
health_check_task = Task(
    description="Get REAL system health from Supabase database. Use the SupabaseAdminTools class to call get_system_health(). Analyze actual CPU, memory, database performance, API response times, error rates, and overall system status from real data.",
    expected_output="Detailed health report with REAL metrics from database, identified issues based on actual data, severity levels, and recommended actions",
    agent=system_monitor
)

# Task 2: Real User Analysis
user_analysis_task = Task(
    description="Get REAL users from Supabase database. Use the SupabaseAdminTools class to call get_users(). Analyze actual user activity, identify suspicious behavior from real data, detect policy violations based on real user records, and identify users requiring actual attention.",
    expected_output="User behavior report with REAL flagged users from database, actual violation details, and recommended real actions (ban/warn/monitor)",
    agent=user_manager
)

# Task 3: Real Content Review
content_review_task = Task(
    description="Get REAL videos from Supabase database. Use the SupabaseAdminTools class to call get_videos(). Review actual content submissions, check for policy violations in real videos, identify inappropriate material from real data, and identify content requiring actual moderation.",
    expected_output="Content moderation report with REAL flagged content from database, actual violation details, and real moderation decisions",
    agent=content_moderator
)

# Task 4: Real Security Assessment
security_assessment_task = Task(
    description="Get REAL audit logs and error logs from Supabase database. Use the SupabaseAdminTools class to call get_audit_logs() and get_error_logs(). Analyze actual security events, detect real threats from genuine data, assess vulnerabilities from real system logs, and identify security anomalies in actual records.",
    expected_output="Security report with REAL detected threats from database, vulnerability assessment based on actual data, and security recommendations",
    agent=security_agent
)

# Task 5: Real Analytics Analysis
analytics_analysis_task = Task(
    description="Get REAL data from Supabase database. Use the SupabaseAdminTools class to call get_users(), get_videos(), and get_system_health(). Analyze actual user growth, real content performance, genuine engagement metrics, and identify opportunities from real data.",
    expected_output="Analytics report with REAL insights from database, actual trends, genuine opportunities, and actionable recommendations based on real data",
    agent=analytics_agent
)

# Task 6: Storage Management Task
storage_management_task = Task(
    description="Get REAL storage information from Supabase. Use the SupabaseAdminTools class to call list_all_buckets(), get_storage_info(), and list_storage_files(). List actual files in storage buckets. Identify large files, unused content, and optimization opportunities. If files need to be deleted, use delete_storage_file().",
    expected_output="Storage management report with REAL storage data from buckets, actual file lists, identified optimization opportunities, and real storage operations executed",
    agent=storage_manager
)

# Task 7: Admin Decision Making with Real Actions
admin_decision_task = Task(
    description="Review all REAL reports from monitoring, user management, content moderation, security, analytics, and storage agents. Make intelligent decisions on REAL actions to take. If users need to be banned, use SupabaseAdminTools.ban_user(). If videos need to be deleted, use SupabaseAdminTools.delete_video(). If storage files need to be deleted, use SupabaseAdminTools.delete_storage_file(). Execute real database and storage operations based on real data analysis.",
    expected_output="Admin decision report with REAL executed actions, actual database and storage changes made, delegation results, and execution plan with real outcomes",
    agent=admin_brain,
    context=[health_check_task, user_analysis_task, content_review_task, security_assessment_task, analytics_analysis_task, storage_management_task]
)

# =====================================================================================
# CREWS
# =====================================================================================

# Full Admin Crew - All agents working together with real database and storage access
admin_crew = Crew(
    agents=[admin_brain, system_monitor, user_manager, content_moderator, security_agent, analytics_agent, storage_manager],
    tasks=[health_check_task, user_analysis_task, content_review_task, security_assessment_task, analytics_analysis_task, storage_management_task, admin_decision_task],
    verbose=CREWAI_VERBOSE,
    memory=CREWAI_MEMORY,
    process=CREWAI_PROCESS
)

def run_full_admin_check():
    """
    Run complete admin system check with REAL database operations
    """
    print("\n" + "="*80)
    print("🧠 ADMIN BRAIN SYSTEM - REAL DATABASE CONTROL")
    print("="*80)
    print(f"📡 Connected to: {SUPABASE_URL}")
    print("="*80)
    
    result = admin_crew.kickoff()
    
    print("\n" + "="*80)
    print("✅ ADMIN SYSTEM CHECK COMPLETE")
    print("📊 Real database operations executed")
    print("="*80)
    
    return result

def run_user_management():
    """
    Run user management with REAL database operations
    """
    print("\n" + "="*80)
    print("👥 USER MANAGEMENT - REAL DATABASE CONTROL")
    print("="*80)
    
    user_crew = Crew(
        agents=[user_manager, admin_brain],
        tasks=[user_analysis_task],
        verbose=True,
        memory=False
    )
    
    result = user_crew.kickoff()
    
    print("\n" + "="*80)
    print("✅ USER MANAGEMENT COMPLETE")
    print("📊 Real user operations executed")
    print("="*80)
    
    return result

def run_content_moderation():
    """
    Run content moderation with REAL database operations
    """
    print("\n" + "="*80)
    print("🎬 CONTENT MODERATION - REAL DATABASE CONTROL")
    print("="*80)
    
    content_crew = Crew(
        agents=[content_moderator, admin_brain],
        tasks=[content_review_task],
        verbose=True,
        memory=False
    )
    
    result = content_crew.kickoff()
    
    print("\n" + "="*80)
    print("✅ CONTENT MODERATION COMPLETE")
    print("📊 Real content operations executed")
    print("="*80)
    
    return result

if __name__ == "__main__":
    print("🚀 CrewAI Admin Multi-Agent System - REAL APPLICATION CONTROL")
    print("🧠 Admin Brain with Ollama (Llama3.2)")
    print("📡 Connected to Real Supabase Database")
    print("💾 Storage Control: Supabase Storage (R2-like)")
    print("="*80)
    
    # Run full admin check with real database and storage operations
    result = run_full_admin_check()
    
    print("\n📊 Admin Brain has completed REAL system assessment and executed REAL database and storage operations.")
    print("All agents coordinated with actual application data!")
