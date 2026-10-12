# ProNax - AI-Powered Video Streaming Platform

<div align="center">

![ProNax](https://img.shields.io/badge/ProNax-1.0%20Beta-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![React](https://img.shields.io/badge/React-19.2.0-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue) ![TanStack](https://img.shields.io/badge/TanStack-Router-blue) ![CrewAI](https://img.shields.io/badge/CrewAI-AI%20Agents-purple) ![Ollama](https://img.shields.io/badge/Ollama-Local%20LLM-orange)

**Next-generation video streaming platform with AI-powered admin automation**

[Features](#-features) • [Installation](#-installation) • [Documentation](#-documentation) • [Deployment](#-deployment) • [Contributing](#-contributing)

</div>

---

## 🌟 Overview

ProNax is a cutting-edge video streaming platform built with React 19, TypeScript, TanStack Router, and Supabase. It features advanced copyright detection, content moderation, AI-powered admin automation with CrewAI multi-agent system, creator studio, and real-time capabilities. Perfect for launching your own video platform, educational content sites, or agency projects.

### Key Highlights
- 🚀 **Modern Tech Stack** - React 19, TypeScript, TanStack Router, Tailwind CSS
- 🧠 **AI Admin Brain** - CrewAI multi-agent system with Ollama for intelligent automation
- 🎬 **Advanced Video Upload** - Chunked processing for large files (up to 2GB)
- 🔒 **Copyright Detection** - SHA-256 hash + acoustic fingerprinting
- 🛡️ **Content Moderation** - Profanity filtering + AI-powered analysis
- 👥 **Real-time Features** - Live likes, comments, notifications
- 🎨 **Beautiful UI** - Mobile-first responsive design
- 📊 **Admin Dashboard** - Complete moderation and management tools
- 💰 **Creator Studio** - Analytics, uploads, monetization controls

---

## 📋 Features

### Core Platform
- ✅ **Modern UI/UX** - React 19 + TanStack Router + Tailwind CSS + Radix UI
- ✅ **Video Upload System** - Chunked processing for files up to 2GB
- ✅ **Copyright Detection** - SHA-256 hash duplicate detection + acoustic fingerprinting
- ✅ **Content Moderation** - Profanity filtering, AI-powered content analysis
- ✅ **Real-time Features** - Likes, comments, notifications with Supabase realtime
- ✅ **User Authentication** - Supabase auth with OAuth integration
- ✅ **Responsive Design** - Mobile-first approach with proper breakpoints
- ✅ **Smart Search** - Advanced search with category filtering
- ✅ **Social Features** - Follows, playlists, saved videos

### Creator Studio
- ✅ **Dashboard** - Video management, analytics overview, content library
- ✅ **Upload Modal** - Comprehensive upload interface with copyright checks
- ✅ **Analytics View** - Performance metrics and engagement data
- ✅ **Settings** - Channel customization, monetization controls
- ✅ **Video Editor** - Basic editing capabilities
- ✅ **Content Library** - Organized video management
- ✅ **Earnings Analytics** - Revenue tracking and insights

### Admin Panel
- ✅ **AI Admin Brain** - CrewAI multi-agent system with Ollama LLM for intelligent automation
- ✅ **Smart Chat Interface** - Natural language admin commands with camera & voice support
- ✅ **Real Database Queries** - Live Supabase data integration for accurate analytics
- ✅ **Multi-Agent System** - System monitoring, user management, content moderation, security agents
- ✅ **Moderation Tools** - Content review, user management, bulk actions
- ✅ **Algorithm Controls** - Feed ranking weights, category management
- ✅ **Copyright Center** - Copyright claims management, dispute handling
- ✅ **User Management** - Role-based access control, user analytics
- ✅ **System Monitoring** - Real-time stats, performance metrics
- ✅ **Audit Logs** - Comprehensive activity tracking
- ✅ **Rate Limiting** - Configurable rate limiting for API endpoints
- ✅ **AB Testing** - Built-in A/B testing framework

### Advanced Features
- ✅ **Live Streaming** - RTMP integration with Mux (UI ready)
- ✅ **Payment System** - Wallet interface for creator earnings (UI ready)
- ✅ **Multi-language Support** - Subtitle management system
- ✅ **Video Player** - HLS.js integration with custom controls
- ✅ **Category System** - Organized content categorization
- ✅ **Shorts Support** - Vertical video format support
- ✅ **Playlist Management** - Create and manage playlists
- ✅ **Channel System** - User channels and profiles

### Security & Performance
- ✅ **Content Security Policy** - Configurable CSP headers
- ✅ **Input Validation** - Zod schema validation throughout
- ✅ **Error Handling** - Comprehensive error boundaries
- ✅ **Performance Optimization** - Code splitting and lazy loading
- ✅ **Memory Management** - Chunked file processing
- ✅ **Security Headers** - HSTS, X-Frame-Options, etc.

---

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- **React 19** - Latest React with concurrent features
- **TypeScript 5.8** - Full type safety
- **TanStack Router** - Modern file-based routing
- **TanStack Start** - SSR framework
- **Tailwind CSS** - Utility-first styling
- **Radix UI** - Accessible component library
- **Framer Motion** - Smooth animations
- **HLS.js** - Video streaming
- **Mux Player** - Advanced video playback

**Backend:**
- **Supabase** - PostgreSQL database, auth, realtime, storage
- **TanStack Start** - Server-side rendering
- **CrewAI** - Multi-agent AI automation framework
- **Ollama** - Local LLM for AI processing (Llama 3.2, TinyLlama)
- **FastAPI (Python)** - Copyright detection service
- **Dejavu** - Audio fingerprinting
- **PDQ/vPDQ** - Image/video hashing

**Infrastructure:**
- **Cloudflare R2** - Video storage (configurable)
- **AWS S3** - Alternative storage option
- **Redis** - Caching and rate limiting
- **BullMQ** - Job queue system

### Database Schema

Comprehensive Supabase schema with 18+ tables:

**Core Tables:**
- `videos` - Video metadata and content
- `users` - User authentication data
- `profiles` - User profiles and settings
- `channels` - User channel information

**Content Tables:**
- `playlists` - User playlists
- `playlist_items` - Playlist video associations
- `comments` - Video comments
- `video_likes` - Video likes

**Analytics Tables:**
- `video_analytics` - Video performance metrics
- `user_analytics` - User engagement data
- `events` - Event tracking
- `metrics` - System metrics

**Copyright Tables:**
- `copyright_fingerprints` - Content fingerprints
- `copyright_claims` - Copyright claims
- `copyright_disputes` - Dispute management

**Moderation Tables:**
- `moderation_queue` - Content moderation queue
- `reports` - User reports
- `ab_tests` - A/B testing data

**Payment Tables:**
- `user_wallets` - User wallet balances
- `withdrawal_requests` - Withdrawal requests
- `transactions` - Transaction history

**System Tables:**
- `feature_flags` - Feature toggles
- `system_config` - System configuration
- `audit_logs` - Activity tracking

---

## 🚀 Installation

### Prerequisites

- **Node.js** 18+ 
- **npm** or **bun**
- **Supabase** account (free tier works)
- **Python 3.9+** (optional, for copyright detection)
- **Ollama** (optional, for AI Admin Brain features)

### Quick Start (5 minutes)

```bash
# Clone the repository
git clone https://github.com/zkg4950/Pro-Nax.git
cd Pro-Nax

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Start development server
npm run dev
```

Visit `http://localhost:5173` to see your ProNax instance running!

### Detailed Installation

For comprehensive setup instructions, see [INSTALLATION.md](INSTALLATION.md)

---

## 🔧 Configuration

### Required Environment Variables

```env
# Supabase Configuration (REQUIRED)
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Optional Configuration

```env
# Storage (default: local)
STORAGE_PROVIDER=local  # options: local, r2, s3

# Copyright Detection (default: enabled)
COPYRIGHT_DETECTION_ENABLED=true
VITE_AUDIO_FINGERPRINT_URL=http://localhost:8000

# AI Admin Brain (default: enabled)
AI_ADMIN_ENABLED=true
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=tinyllama  # options: tinyllama, llama3.2

# Live Streaming (default: disabled)
STREAMING_ENABLED=false
RTMP_URL=rtmps://global-live.mux.com:443/app

# Payment Processing (default: disabled)
PAYMENTS_ENABLED=false
VITE_STRIPE_PUBLIC_KEY=your_stripe_key
```

For full configuration options, see `.env.example` and [CONFIGURATION.md](CONFIGURATION.md)

---

## 📚 Documentation

- **[INSTALLATION.md](INSTALLATION.md)** - Detailed setup guide
- **[CONFIGURATION.md](CONFIGURATION.md)** - Configuration reference
- **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** - API reference
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deployment guides

---

## 🚀 Deployment

### Vercel Deployment

```bash
npm run build
vercel deploy
```

### Docker Deployment

```bash
docker build -t pronax .
docker run -p 5173:5173 pronax
```

### Custom Server

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment guides including:
- Vercel deployment
- Docker deployment
- Custom server deployment
- Environment-specific configurations

---

## 🎯 Use Cases

- **Video Platform MVP** - Launch your own video streaming service
- **Content Platform** - Educational, entertainment, or niche content
- **Agency Projects** - Client video platforms with white-label capability
- **Learning Project** - Study modern React architecture and patterns
- **SaaS Foundation** - Build upon for commercial video platform
- **Internal Tool** - Company video hosting and management

---

## 📦 Project Structure

```
pronax/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── admin/          # Admin-specific components
│   │   │   └── AdminChat.tsx  # AI-powered admin chat interface
│   │   ├── studio/         # Creator studio components
│   │   └── ui/             # Base UI components
│   ├── features/           # Feature-specific pages
│   │   └── pages/          # Page components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utility libraries
│   ├── routes/             # API routes
│   ├── workers/            # Web workers
│   └── config/             # Configuration files
├── admin_brain_server.py    # Flask server for AI Admin Brain
├── crewai_admin_system.py   # CrewAI multi-agent system
├── crewai_admin_real.py     # Real Supabase integration for agents
├── python-services/        # Python copyright detection
├── supabase/              # Database migrations
├── public/                # Static assets
└── docs/                  # Documentation
```

---

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

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting

---

## 📄 License

MIT License - Full source code access with modification rights

---

## 🎉 Roadmap

### v0.8 (Next Release)
- Enhanced analytics dashboard
- Improved mobile experience
- Performance optimizations
- Additional video formats support

### v1.0 (Major Release)
- Complete R2/S3 integration
- Full payment processing
- Multi-tenancy support
- Production-ready features
- Advanced security features

### v1.1+ (Future)
- Mobile apps (React Native)
- Advanced AI features
- Enterprise features
- API marketplace integration

---

## 🙏 Acknowledgments

Built with modern web technologies and inspired by leading video platforms. Special thanks to the open-source community for the amazing tools and libraries.

---

## 📞 Support

- **Documentation**: Comprehensive guides and API reference
- **Issues**: GitHub Issues for bug reports
- **Community**: Join our Discord/Slack community
- **Email**: support@pronax.com

---

<div align="center">

**Built with ❤️ using modern web technologies**

[⭐ Star this repo](https://github.com/zkg4950/Pro-Nax) • [🐛 Report issues](https://github.com/zkg4950/Pro-Nax/issues) • [📖 Documentation](https://github.com/zkg4950/Pro-Nax/wiki)

</div>
 
 