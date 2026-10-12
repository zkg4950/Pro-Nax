"""
CrewAI Admin Multi-Agent System
Powerful AI Admin Brain for complete application control
Uses Ollama (Phi3 for faster performance) for local LLM processing
"""

from crewai import Agent, Crew, Task
from crewai.tools import tool
from supabase import create_client, Client
import os

# Supabase Configuration
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Use Llama3.2 (supports tools and is faster than TinyLlama)
llm = "ollama/llama3.2"

# =====================================================================================
# SUPABASE DATABASE TOOLS
# =====================================================================================

@tool("Get Video Statistics")
def get_video_stats() -> str:
    """Fetches total video count and status from Supabase database."""
    try:
        response = supabase.table('videos').select('*', count='exact').execute()
        count = response.count if hasattr(response, 'count') else len(response.data)
        return f"Real Database Data: Total videos uploaded in Supabase is {count}."
    except Exception as e:
        return f"Error fetching video data: {str(e)}"

@tool("Get User Statistics")
def get_user_stats() -> str:
    """Fetches total registered users from Supabase database."""
    try:
        response = supabase.table('profiles').select('*', count='exact').execute()
        count = response.count if hasattr(response, 'count') else len(response.data)
        return f"Real Database Data: Total registered users in Supabase is {count}."
    except Exception as e:
        return f"Error fetching user data: {str(e)}"

# =====================================================================================
# AGENT 1: ADMIN BRAIN (Central Decision Maker)
# =====================================================================================
admin_brain = Agent(
    role="Admin Brain - Central Decision Maker",
    goal="Make intelligent decisions for system control, coordinate all admin agents, and ensure optimal system performance",
    backstory="""You are the central brain of the entire admin system. You have complete oversight 
    of the application and make intelligent decisions to keep it running smoothly. You coordinate 
    all other admin agents, prioritize tasks, and ensure the system operates at peak efficiency. 
    You are faster and more accurate than any human admin. You analyze situations, make decisions, 
    and execute actions without errors.""",
    verbose=True,
    llm=llm
)

# =====================================================================================
# AGENT 2: SYSTEM MONITORING AGENT
# =====================================================================================
system_monitor = Agent(
    role="System Monitoring Agent",
    goal="Continuously monitor system health, performance metrics, and fetch real database records",
    backstory="""You track CPU, memory, and query live data from Supabase using your tools.""",
    verbose=True,
    llm=llm,
    tools=[get_video_stats, get_user_stats],
    memory=True
)

# =====================================================================================
# AGENT 3: USER MANAGEMENT AGENT
# =====================================================================================
user_manager = Agent(
    role="User Management Agent",
    goal="Manage users, enforce policies, handle moderation, and ensure community safety",
    backstory="""You are responsible for all user-related operations. You handle user registrations, 
    profile management, ban decisions, restriction enforcement, and policy violations. You analyze 
    user behavior patterns to identify suspicious activity. You make fair but firm decisions 
    to protect the community. You work faster and more consistently than human moderators.""",
    verbose=True,
    llm=llm,
    memory=True
)

# =====================================================================================
# AGENT 4: CONTENT MODERATION AGENT
# =====================================================================================
content_moderator = Agent(
    role="Content Moderation Agent",
    goal="Review, moderate, and approve content to ensure platform safety and quality standards",
    backstory="""You are the content quality guardian. You review videos, comments, and all user-generated 
    content for policy violations, inappropriate material, and quality issues. You use AI to detect 
    subtle violations that humans might miss. You make quick, accurate moderation decisions. You 
    maintain content quality while respecting creator freedom.""",
    verbose=True,
    llm=llm,
    memory=True
)

# =====================================================================================
# AGENT 5: SECURITY AGENT
# =====================================================================================
security_agent = Agent(
    role="Security Agent",
    goal="Detect threats, prevent attacks, and ensure system security at all times",
    backstory="""You are the fortress guardian. You monitor for SQL injection attempts, XSS attacks, 
    unauthorized access attempts, brute force attacks, and all security threats. You analyze traffic 
    patterns to detect botnets and malicious actors. You implement proactive security measures. 
    You respond to threats faster than any human security team could.""",
    verbose=True,
    llm=llm,
    memory=True
)

# =====================================================================================
# AGENT 6: ANALYTICS AGENT
# =====================================================================================
analytics_agent = Agent(
    role="Analytics Agent",
    goal="Analyze live platform data from database tools.",
    backstory="""You fetch real metrics directly from the database.""",
    verbose=True,
    llm=llm,
    tools=[get_video_stats, get_user_stats],
    memory=True
)

# =====================================================================================
# AGENT 7: INCIDENT RESPONSE AGENT
# =====================================================================================
incident_responder = Agent(
    role="Incident Response Agent",
    goal="Respond to incidents, coordinate recovery, and minimize impact on users",
    backstory="""You are the emergency response specialist. When incidents occur (outages, breaches, 
    errors), you spring into action. You coordinate with other agents to diagnose issues, implement 
    fixes, and communicate with users. You minimize downtime and impact. You remain calm under 
    pressure and execute recovery procedures flawlessly.""",
    verbose=True,
    llm=llm,
    memory=True
)

# =====================================================================================
# TASKS
# =====================================================================================

# Task 1: System Health Check
health_check_task = Task(
    description="Perform comprehensive system health check: analyze CPU, memory, database performance, API response times, error rates, and overall system status",
    expected_output="Detailed health report with metrics, identified issues, severity levels, and recommended actions",
    agent=system_monitor
)

# Task 2: User Behavior Analysis
user_analysis_task = Task(
    description="Analyze recent user activity: identify suspicious behavior, policy violations, spam accounts, and users requiring attention",
    expected_output="User behavior report with flagged users, violation details, recommended actions (ban/warn/monitor)",
    agent=user_manager
)

# Task 3: Content Review
content_review_task = Task(
    description="Review recent content submissions: check for policy violations, inappropriate material, quality issues, and content requiring moderation",
    expected_output="Content moderation report with flagged content, violation details, and moderation decisions",
    agent=content_moderator
)

# Task 4: Security Assessment
security_assessment_task = Task(
    description="Perform security assessment: check for threats, attack attempts, vulnerabilities, and security anomalies",
    expected_output="Security report with detected threats, vulnerability assessment, and security recommendations",
    agent=security_agent
)

# Task 5: Analytics Analysis
analytics_analysis_task = Task(
    description="Analyze platform data: user growth, content performance, engagement metrics, revenue trends, and identify opportunities",
    expected_output="Analytics report with key insights, trends, opportunities, and actionable recommendations",
    agent=analytics_agent
)

# Task 6: Admin Decision Making
admin_decision_task = Task(
    description="Review all reports from monitoring, user management, content moderation, security, and analytics agents. Make intelligent decisions on actions to take. Prioritize tasks and coordinate response.",
    expected_output="Admin decision report with prioritized actions, delegation to appropriate agents, and execution plan",
    agent=admin_brain,
    context=[health_check_task, user_analysis_task, content_review_task, security_assessment_task, analytics_analysis_task]
)

# =====================================================================================
# CREWS
# =====================================================================================

# Full Admin Crew - All agents working together
admin_crew = Crew(
    agents=[admin_brain, system_monitor, user_manager, content_moderator, security_agent, analytics_agent, incident_responder],
    tasks=[health_check_task, user_analysis_task, content_review_task, security_assessment_task, analytics_analysis_task, admin_decision_task],
    verbose=True,
    memory=False,  # Disabled for now (requires embedder setup)
    process="sequential",  # Sequential execution for now
    manager_llm=llm  # For future hierarchical use
)

# Quick Health Check Crew - For rapid system checks
health_crew = Crew(
    agents=[system_monitor, admin_brain],
    tasks=[health_check_task],
    verbose=True,
    memory=False
)

# Security Response Crew - For security incidents
security_crew = Crew(
    agents=[security_agent, incident_responder, admin_brain],
    tasks=[security_assessment_task],
    verbose=True,
    memory=False
)

# User Management Crew - For user-related operations
user_crew = Crew(
    agents=[user_manager, admin_brain],
    tasks=[user_analysis_task],
    verbose=True,
    memory=False
)

def run_full_admin_check():
    """
    Run complete admin system check
    """
    print("\n" + "="*80)
    print("🧠 ADMIN BRAIN SYSTEM - FULL SYSTEM CHECK")
    print("="*80)
    
    result = admin_crew.kickoff()
    
    print("\n" + "="*80)
    print("✅ ADMIN SYSTEM CHECK COMPLETE")
    print("="*80)
    
    return result

def run_health_check():
    """
    Run quick health check
    """
    print("\n" + "="*80)
    print("🏥 SYSTEM HEALTH CHECK")
    print("="*80)
    
    result = health_crew.kickoff()
    
    print("\n" + "="*80)
    print("✅ HEALTH CHECK COMPLETE")
    print("="*80)
    
    return result

def run_security_check():
    """
    Run security assessment
    """
    print("\n" + "="*80)
    print("🔒 SECURITY ASSESSMENT")
    print("="*80)
    
    result = security_crew.kickoff()
    
    print("\n" + "="*80)
    print("✅ SECURITY CHECK COMPLETE")
    print("="*80)
    
    return result

def run_user_analysis():
    """
    Run user behavior analysis
    """
    print("\n" + "="*80)
    print("👥 USER BEHAVIOR ANALYSIS")
    print("="*80)
    
    result = user_crew.kickoff()
    
    print("\n" + "="*80)
    print("✅ USER ANALYSIS COMPLETE")
    print("="*80)
    
    return result

if __name__ == "__main__":
    print("🚀 CrewAI Admin Multi-Agent System")
    print("🧠 Admin Brain with Ollama (Phi3)")
    print("="*80)
    
    # Run full admin check
    result = run_full_admin_check()
    
    print("\n📊 Admin Brain has completed system assessment and made decisions.")
    print("All agents coordinated successfully!")
