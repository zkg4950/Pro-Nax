"""
CrewAI Multi-Agent Video Assistant System
Uses Ollama for local LLM processing
"""

from crewai import Agent, Crew, Task
import os
import sys
import json

# Ollama Configuration
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
OLLAMA_FALLBACK_MODEL = os.getenv("OLLAMA_FALLBACK_MODEL", "tinyllama")

# Use configured model
llm = f"ollama/{OLLAMA_MODEL}"

# Agent 1: Video Title Specialist Agent
title_agent = Agent(
    role="Video Title Specialist",
    goal="Create engaging, SEO-friendly video titles that attract viewers",
    backstory="""You are an expert at creating viral video titles. 
    You understand what makes titles click-worthy and SEO-optimized.
    You analyze video content and craft titles that stand out.""",
    verbose=True,
    llm=llm
)

# Agent 2: Video Description Writer Agent
description_agent = Agent(
    role="Video Description Writer",
    goal="Write compelling video descriptions that explain content and encourage engagement",
    backstory="""You are a master storyteller who can describe video content 
    in an engaging way. You know how to write descriptions that hook viewers 
    and encourage them to watch, like, and share.""",
    verbose=True,
    llm=llm
)

# Agent 3: Hashtag Researcher Agent
hashtag_agent = Agent(
    role="Hashtag Researcher",
    goal="Research and generate relevant hashtags to maximize video discoverability",
    backstory="""You are a social media expert who knows which hashtags 
    are trending and relevant. You research the best hashtags for different 
    content types and niches to maximize reach and engagement.""",
    verbose=True,
    llm=llm
)

# Agent 4: Metadata Optimizer Agent
metadata_agent = Agent(
    role="Metadata Optimizer",
    goal="Optimize video metadata including category, tags, and SEO elements",
    backstory="""You are an SEO expert who understands how video metadata 
    affects discoverability. You analyze content and suggest optimal 
    categories, tags, and other metadata elements.""",
    verbose=True,
    llm=llm
)

# Agent 5: Quality Assurance Agent
qa_agent = Agent(
    role="Quality Assurance Specialist",
    goal="Review all generated content for quality, consistency, and accuracy",
    backstory="""You are a meticulous quality specialist who ensures 
    all generated content meets high standards. You check for consistency, 
    clarity, and accuracy before finalizing any video metadata.""",
    verbose=True,
    llm=llm
)

# Task 1: Title Generation Task
title_task = Task(
    description="Generate 5 engaging video titles for: {video_title} in category: {category}",
    expected_output="5 different title options with brief explanations for each",
    agent=title_agent
)

# Task 2: Description Writing Task
description_task = Task(
    description="Write a compelling video description for: {video_title} with content: {content}",
    expected_output="A 200-300 word description that hooks viewers and encourages engagement",
    agent=description_agent
)

# Task 3: Hashtag Generation Task
hashtag_task = Task(
    description="Generate 15 relevant hashtags for video: {video_title} in category: {category}",
    expected_output="15 hashtags including broad, niche, and trending tags",
    agent=hashtag_agent
)

# Task 4: Metadata Optimization Task
metadata_task = Task(
    description="Optimize metadata for video: {video_title} - suggest category, tags, and SEO elements",
    expected_output="Optimized category, suggested tags, and SEO recommendations",
    agent=metadata_agent
)

# Task 5: Quality Review Task
qa_task = Task(
    description="Review all generated content for video: {video_title} and ensure quality and consistency",
    expected_output="Quality assessment report with any corrections needed",
    agent=qa_agent
)

# Create the Crew
video_assistant_crew = Crew(
    agents=[title_agent, description_agent, hashtag_agent, metadata_agent, qa_agent],
    tasks=[title_task, description_task, hashtag_task, metadata_task, qa_task],
    verbose=True
)

def process_video_assistant(video_title, category, content=""):
    """
    Process video through multi-agent system
    """
    print(f"\n🎬 Processing Video: {video_title}")
    print(f"📂 Category: {category}")
    print(f"📝 Content: {content[:100] if content else 'Not provided'}...")
    print("=" * 60)
    
    # Execute the crew
    result = video_assistant_crew.kickoff(
        inputs={
            "video_title": video_title,
            "category": category,
            "content": content
        }
    )
    
    return result

if __name__ == "__main__":
    # Example usage
    print("🚀 CrewAI Video Assistant System with Ollama (TinyLlama)")
    print("=" * 60)
    
    # Example video
    video_title = "Ultimate Pasta Recipe - 5 Minute Cooking"
    category = "Cooking"
    content = "A quick and easy pasta recipe that anyone can make at home. Perfect for beginners!"
    
    result = process_video_assistant(video_title, category, content)
    
    print("\n✅ Multi-Agent Processing Complete!")
    print("=" * 60)
