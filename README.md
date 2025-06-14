# League of Legends Matchmaking System

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node.js-20+-green.svg)
![Angular](https://img.shields.io/badge/angular-18+-red.svg)
![Electron](https://img.shields.io/badge/electron-latest-blue.svg)
![TypeScript](https://img.shields.io/badge/typescript-5+-blue.svg)

## Overview

A comprehensive League of Legends matchmaking system featuring a desktop application with real-time MMR-based matchmaking, Riot API integration, and automatic lobby creation. Built with modern web technologies for a seamless gaming experience.

## 🎯 Key Features

### 🎮 5v5 Matchmaking System
- **MMR-based matchmaking** using advanced ELO algorithm
- **Real-time queue management** with WebSocket communication
- **Automatic team balancing** for fair matches
- **Estimated wait times** based on queue data
- **Match acceptance system** with timeout handling

### 🏆 Ranking & Statistics
- **Dynamic MMR calculation** based on match results
- **Initial MMR** derived from current League rank via Riot API
- **Comprehensive match history** with detailed analytics
- **Player statistics** including win rate, average MMR, and performance trends
- **Leaderboard system** for competitive ranking

### 🔗 League of Legends Integration
- **Riot Games API** for official player data and match history
- **League Client (LCU) API** for automatic lobby creation
- **Auto-invite system** that automatically invites matched players
- **Client status monitoring** to ensure players are available
- **Seamless game integration** without disrupting the LoL experience
- **Auto-registration** that detects your League account automatically
- **Auto-join queue** for quickly entering matchmaking
- **Current game detection** that shows your active match status
- **Real-time match monitoring** throughout your game session

### 💻 Desktop Application
- **Electron-based executable** for Windows, macOS, and Linux
- **Modern Angular frontend** with responsive design
- **Real-time notifications** for match found, lobby created, etc.
- **System tray integration** for background operation
- **Auto-updater** for seamless updates

## 🏗️ Architecture

### Project Structure
```
├── package.json                     # Root build configuration
├── README.md                        # This file
├── src/
│   ├── backend/                     # Node.js Express Server
│   │   ├── database/
│   │   │   └── DatabaseManager.ts   # SQLite database management
│   │   ├── services/
│   │   │   ├── MatchmakingService.ts # ELO-based matchmaking logic
│   │   │   ├── RiotAPIService.ts     # Riot Games API integration
│   │   │   ├── LCUService.ts         # League Client integration
│   │   │   └── PlayerService.ts      # Player data management
│   │   ├── server.ts                # Express server with WebSocket
│   │   └── tsconfig.json            # TypeScript configuration
│   ├── electron/                    # Electron Main Process
│   │   ├── main.ts                  # Main process and window management
│   │   ├── preload.ts               # Secure IPC bridge
│   │   └── tsconfig.json            # TypeScript configuration
│   └── frontend/                    # Angular Application
│       ├── angular.json             # Angular configuration
│       ├── src/app/
│       │   ├── app.ts               # Main application component
│       │   ├── app.html             # Main template
│       │   ├── app.scss             # Global styles
│       │   ├── interfaces.ts        # Shared TypeScript interfaces
│       │   ├── services/
│       │   │   ├── websocket.ts     # WebSocket service
│       │   │   └── api.ts           # HTTP API service
│       │   └── components/
│       │       ├── dashboard/       # Main dashboard
│       │       ├── queue/           # Queue management
│       │       └── match-history/   # Match history viewer
│       └── tsconfig.json            # TypeScript configuration
```

### System Workflow

1. **User Experience Flow:**
   ```
   Download .exe → Install app → Auto-detect your account → Auto-join queue → 
   Match found → Accept match → Auto-invite to lobby → Play game → 
   MMR updated → View match history
   ```

2. **Technical Flow:**
   ```
   Electron App → League Client detection → Auto-registration →
   WebSocket Connection → Backend Server → Matchmaking Service → 
   Riot API validation → LCU integration → Database updates → 
   Real-time notifications
   ```

3. **Matchmaking Algorithm:**
   ```
   Player joins queue → MMR calculation → Team balancing → 
   Match validation → Lobby creation → Player notifications → 
   Game session tracking → Post-game MMR adjustment
   ```

## 🛠️ Technology Stack

### Backend Technologies
- **Node.js** (v20+) - Runtime environment
- **Express.js** - Web framework with middleware support
- **TypeScript** - Type-safe development
- **WebSocket** - Real-time bidirectional communication
- **SQLite3** - Lightweight, serverless database
- **Axios** - HTTP client for external API calls
- **Helmet** - Security middleware
- **CORS** - Cross-origin resource sharing

### Frontend Technologies
- **Angular 18+** - Modern web framework
- **TypeScript** - Type-safe component development
- **SCSS** - Advanced CSS preprocessing
- **RxJS** - Reactive programming for async operations
- **Angular Router** - Single-page application navigation
- **FormsModule** - Reactive forms handling

### Desktop & Build Tools
- **Electron** - Cross-platform desktop application framework
- **Electron Builder** - Application packaging and distribution
- **ts-node** - TypeScript execution environment
- **Nodemon** - Development server with hot reload
- **Concurrently** - Run multiple npm scripts simultaneously

### External Integrations
- **Riot Games API** - Official League of Legends data
- **League Client (LCU) API** - Local client integration
- **WebSocket.io** - Enhanced WebSocket communication

## 🚀 Quick Start

### Prerequisites
- **Node.js** v20 or higher
- **npm** v8 or higher
- **League of Legends** client installed
- **Git** for version control

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/lol-matchmaking-system.git
   cd lol-matchmaking-system
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Configuration (Optional):**
   Create a `.env` file in the root directory:
   ```env
   RIOT_API_KEY=RGAPI-your-riot-api-key-here
   PORT=3000
   NODE_ENV=development
   ```

### Development

1. **Start development servers:**
   ```bash
   npm run dev
   ```
   This command starts:
   - Backend server on `http://localhost:3000`
   - Angular dev server on `http://localhost:4200`
   - Electron application

2. **Individual service startup:**
   ```bash
   # Backend only
   npm run dev:backend
   
   # Frontend only
   npm run dev:frontend
   
   # Electron only
   npm run electron:dev
   ```

### Building for Production

1. **Complete build:**
   ```bash
   npm run build
   ```

2. **Platform-specific distributions:**
   ```bash
   # Windows executable
   npm run dist:win
   
   # macOS application
   npm run dist:mac
   
   # Linux AppImage
   npm run dist:linux
   ```

## 📖 API Documentation

### WebSocket Events

#### Client → Server
- `join_queue` - Join matchmaking queue
- `leave_queue` - Leave current queue
- `accept_match` - Accept found match
- `decline_match` - Decline found match

#### Server → Client
- `queue_status` - Queue position and estimated time
- `match_found` - Match found notification
- `match_ready` - All players accepted
- `match_cancelled` - Match cancelled due to timeout/decline
- `lobby_created` - LCU lobby creation notification

### REST API Endpoints

#### Player Management
```http
GET    /api/players/:summonerName     # Get player profile
POST   /api/players/register          # Register new player
PUT    /api/players/:id/mmr          # Update player MMR
```

#### Match History
```http
GET    /api/matches/:playerId         # Get player match history
POST   /api/matches                   # Record new match
GET    /api/matches/:matchId          # Get specific match details
```

#### Statistics
```http
GET    /api/stats/leaderboard         # Get top players
GET    /api/stats/player/:id          # Get detailed player stats
GET    /api/queue/status              # Current queue status
```

## 🔧 Configuration

### Backend Configuration
Edit `src/backend/server.ts` for:
- **Port settings** - Default: 3000
- **Database path** - Default: `./database.sqlite`
- **API rate limiting** - Adjustable per endpoint
- **WebSocket settings** - Connection limits and timeouts

### Frontend Configuration
Edit `src/frontend/src/environments/`:
- **API endpoints** - Backend server URL
- **WebSocket URL** - Real-time connection
- **Riot API settings** - Region and version
- **UI themes** - Color schemes and layouts

### Electron Configuration
Edit `src/electron/main.ts` for:
- **Window dimensions** - Size and position
- **System tray** - Enable/disable background operation
- **Auto-updater** - Update check intervals
- **Security settings** - CSP and node integration

## 🏗️ Deployment

### Backend Deployment (Cloud)

#### Option 1: Render.com (Recommended)
1. Connect GitHub repository
2. Set environment variables
3. Auto-deploy on push to main branch

#### Option 2: Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway deploy
```

#### Option 3: Heroku
```bash
# Install Heroku CLI
heroku create your-app-name
heroku config:set NODE_ENV=production
git push heroku main
```

### Desktop Application Distribution

#### GitHub Releases
```bash
# Build and upload to releases
npm run build
npm run dist:all
# Upload generated files to GitHub releases
```

#### Auto-updater Setup
Configure in `package.json`:
```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "your-username",
      "repo": "lol-matchmaking-system"
    }
  }
}
```

## 🧪 Testing

### Unit Tests
```bash
# Run all tests
npm test

# Backend tests
npm run test:backend

# Frontend tests
npm run test:frontend
```

### Integration Tests
```bash
# E2E tests
npm run test:e2e

# API tests
npm run test:api
```

### Manual Testing Checklist
- [ ] Player registration and profile creation
- [ ] Queue joining and leaving functionality
- [ ] Matchmaking algorithm with various MMR ranges
- [ ] WebSocket real-time communication
- [ ] LCU integration and lobby creation
- [ ] MMR calculation after matches
- [ ] Match history accuracy
- [ ] Electron application packaging

## 🐛 Troubleshooting

### Common Issues

#### 1. LCU Connection Failed
```bash
# Ensure League Client is running
# Check LCU port (usually 2999)
# Verify LCU certificate
```

#### 2. WebSocket Connection Issues
```bash
# Check firewall settings
# Verify backend server is running
# Check network connectivity
```

#### 3. Riot API Rate Limiting
```bash
# Implement request queuing
# Add retry logic with exponential backoff
# Monitor API usage in logs
```

#### 4. Electron Build Failures
```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install

# Check platform-specific dependencies
npm run rebuild
```

## 🔒 Security Considerations

### Data Protection
- **No password storage** - Uses Riot Games authentication
- **Encrypted communications** - HTTPS and WSS in production
- **Input validation** - All user inputs sanitized
- **Rate limiting** - API endpoints protected against abuse

### Privacy
- **Minimal data collection** - Only game-related statistics
- **Local database** - Sensitive data stored locally when possible
- **GDPR compliance** - User data deletion capabilities
- **Anonymization** - Personal identifiers removed from logs

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes following the coding standards
4. Write tests for new functionality
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Coding Standards
- **TypeScript strict mode** enabled
- **ESLint** for code linting
- **Prettier** for code formatting
- **Conventional commits** for commit messages
- **Comprehensive documentation** for new features

### Pull Request Process
1. Ensure all tests pass
2. Update documentation as needed
3. Add yourself to contributors list
4. Request review from maintainers
5. Address feedback promptly

## 📋 Roadmap

### Phase 1: Core Features ✅
- [x] Basic matchmaking system
- [x] Riot API integration
- [x] LCU integration
- [x] Desktop application
- [x] Real-time communication

### Phase 2: Enhanced Features 🚧
- [ ] Advanced statistics and analytics
- [ ] Tournament system
- [ ] Custom game modes
- [ ] Social features (friends, chat)
- [ ] Mobile companion app

### Phase 3: Advanced Features 📋
- [ ] Machine learning matchmaking
- [ ] Esports integration
- [ ] Streaming overlay
- [ ] Discord bot integration
- [ ] API for third-party developers

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

### Getting Help
- **GitHub Issues** - Bug reports and feature requests
- **Discord Server** - Community support and discussions
- **Documentation** - Comprehensive guides and API reference
- **Email Support** - Direct contact for urgent issues

### Community
- **Discord**: [Join our community](https://discord.gg/your-invite)
- **Reddit**: [r/CustomLoLMatchmaking](https://reddit.com/r/your-subreddit)
- **Twitter**: [@LoLMatchmaking](https://twitter.com/your-handle)

---

## 🎉 Acknowledgments

- **Riot Games** for providing the League of Legends API
- **Angular Team** for the excellent frontend framework
- **Electron Team** for making desktop development accessible
- **Open Source Community** for the amazing tools and libraries

**Built with ❤️ for the League of Legends community**
