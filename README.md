@@ -1,10 +1,10 @@
# ProNax - Modern Video Streaming Platform
# ProNax - AI-Powered Video Streaming Platform

<div align="center">

![ProNax](https://img.shields.io/badge/ProNax-0.7%20Beta-orange) ![License](https://img.shields.io/badge/license-MIT-blue) ![React](https://img.shields.io/badge/React-19.2.0-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue) ![TanStack](https://img.shields.io/badge/TanStack-Router-blue)
![ProNax](https://img.shields.io/badge/ProNax-1.0%20Beta-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![React](https://img.shields.io/badge/React-19.2.0-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue) ![TanStack](https://img.shields.io/badge/TanStack-Router-blue) ![CrewAI](https://img.shields.io/badge/CrewAI-AI%20Agents-purple) ![Ollama](https://img.shields.io/badge/Ollama-Local%20LLM-orange)

**A production-ready video streaming platform built with modern web technologies**
**Next-generation video streaming platform with AI-powered admin automation**

[Features](#-features) • [Installation](#-installation) • [Documentation](#-documentation) • [Deployment](#-deployment) • [Contributing](#-contributing)

@@ -14,10 +14,11 @@

## 🌟 Overview

ProNax is a comprehensive video streaming platform built with React 19, TypeScript, TanStack Router, and Supabase. It features advanced copyright detection, content moderation, admin dashboard, creator studio, and real-time capabilities. Perfect for launching your own video platform, educational content sites, or agency projects.
ProNax is a cutting-edge video streaming platform built with React 19, TypeScript, TanStack Router, and Supabase. It features advanced copyright detection, content moderation, AI-powered admin automation with CrewAI multi-agent system, creator studio, and real-time capabilities. Perfect for launching your own video platform, educational content sites, or agency projects.

### Key Highlights
- 🚀 **Modern Tech Stack** - React 19, TypeScript, TanStack Router, Tailwind CSS
- 🧠 **AI Admin Brain** - CrewAI multi-agent system with Ollama for intelligent automation
- 🎬 **Advanced Video Upload** - Chunked processing for large files (up to 2GB)
- 🔒 **Copyright Detection** - SHA-256 hash + acoustic fingerprinting
- 🛡️ **Content Moderation** - Profanity filtering + AI-powered analysis
@@ -51,6 +52,10 @@ ProNax is a comprehensive video streaming platform built with React 19, TypeScri
- ✅ **Earnings Analytics** - Revenue tracking and insights

### Admin Panel
- ✅ **AI Admin Brain** - CrewAI multi-agent system with Ollama LLM for intelligent automation
- ✅ **Smart Chat Interface** - Natural language admin commands with camera & voice support
- ✅ **Real Database Queries** - Live Supabase data integration for accurate analytics
- ✅ **Multi-Agent System** - System monitoring, user management, content moderation, security agents
- ✅ **Moderation Tools** - Content review, user management, bulk actions
- ✅ **Algorithm Controls** - Feed ranking weights, category management
- ✅ **Copyright Center** - Copyright claims management, dispute handling
@@ -98,6 +103,8 @@ ProNax is a comprehensive video streaming platform built with React 19, TypeScri
**Backend:**
- **Supabase** - PostgreSQL database, auth, realtime, storage
- **TanStack Start** - Server-side rendering
- **CrewAI** - Multi-agent AI automation framework
- **Ollama** - Local LLM for AI processing (Llama 3.2, TinyLlama)
- **FastAPI (Python)** - Copyright detection service
- **Dejavu** - Audio fingerprinting
- **PDQ/vPDQ** - Image/video hashing
@@ -160,13 +167,14 @@ Comprehensive Supabase schema with 18+ tables:
- **npm** or **bun**
- **Supabase** account (free tier works)
- **Python 3.9+** (optional, for copyright detection)
- **Ollama** (optional, for AI Admin Brain features)

### Quick Start (5 minutes)

```bash
# Clone the repository
git clone https://github.com/your-repo/pronax.git
cd pronax
git clone https://github.com/zkg4950/Pro-Nax.git
cd Pro-Nax

# Install dependencies
npm install
@@ -208,6 +216,11 @@ STORAGE_PROVIDER=local  # options: local, r2, s3
COPYRIGHT_DETECTION_ENABLED=true
VITE_AUDIO_FINGERPRINT_URL=http://localhost:8000

# AI Admin Brain (default: enabled)
AI_ADMIN_ENABLED=true
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=tinyllama  # options: tinyllama, llama3.2

# Live Streaming (default: disabled)
STREAMING_ENABLED=false
RTMP_URL=rtmps://global-live.mux.com:443/app
@@ -274,6 +287,7 @@ pronax/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── admin/          # Admin-specific components
│   │   │   └── AdminChat.tsx  # AI-powered admin chat interface
│   │   ├── studio/         # Creator studio components
│   │   └── ui/             # Base UI components
│   ├── features/           # Feature-specific pages
@@ -283,6 +297,9 @@ pronax/
│   ├── routes/             # API routes
│   ├── workers/            # Web workers
│   └── config/             # Configuration files
├── admin_brain_server.py    # Flask server for AI Admin Brain
├── crewai_admin_system.py   # CrewAI multi-agent system
├── crewai_admin_real.py     # Real Supabase integration for agents
├── python-services/        # Python copyright detection
├── supabase/              # Database migrations
├── public/                # Static assets
@@ -291,7 +308,44 @@ pronax/

---

## 🤝 Contributing
## � AI Admin Brain

ProNax features an advanced AI-powered admin automation system built with CrewAI and Ollama:

### Multi-Agent System
- **Admin Brain Agent** - Central decision maker coordinating all admin operations
- **System Monitoring Agent** - Real-time health checks and performance metrics
- **User Management Agent** - User behavior analysis and policy enforcement
- **Content Moderation Agent** - AI-powered content review and moderation
- **Security Agent** - Threat detection and prevention
- **Analytics Agent** - Data analysis and actionable insights
- **Incident Response Agent** - Emergency response and recovery coordination

### Features
- **Natural Language Interface** - Admin commands via chat with camera & voice support
- **Real Database Integration** - Live Supabase queries for accurate analytics
- **Roman Urdu Support** - AI responds in Roman Urdu for localized admin experience
- **Persistent Memory** - AI learns from past interactions and decisions
- **Camera Input** - AI can see through admin camera for visual context
- **Speech-to-Text** - Voice commands for hands-free admin operations
- **Text-to-Speech** - AI responses spoken aloud with female voice

### Setup
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull required models
ollama pull tinyllama
ollama pull llama3.2

# Start AI Admin Brain server
python admin_brain_server.py
```

---

## �🤝 Contributing

Contributions are welcome! Please follow these steps:

@@ -358,8 +412,8 @@ Built with modern web technologies and inspired by leading video platforms. Spec

**Built with ❤️ using modern web technologies**

[⭐ Star this repo](https://github.com/your-repo/pronax) • [🐛 Report issues](https://github.com/your-repo/pronax/issues) • [📖 Documentation](https://github.com/your-repo/pronax/wiki)
[⭐ Star this repo](https://github.com/zkg4950/Pro-Nax) • [🐛 Report issues](https://github.com/zkg4950/Pro-Nax/issues) • [📖 Documentation](https://github.com/zkg4950/Pro-Nax/wiki)

</div>
#   P r o - N a x 
 
