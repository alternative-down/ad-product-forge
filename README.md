# ad-product-forge

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-10.9.4%2B-blue)](https://www.npmjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Status](https://img.shields.io/badge/status-in%20development-yellow)](./ROADMAP.md)

An **autonomous AI agent platform** that enables fully autonomous product discovery, development, and deployment. Build a digital company operated by collaborative LLM agents that discover market opportunities, validate solutions, and launch products end-to-end.

## Table of Contents

- [Vision](#vision)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Development](#development)
- [Contributing](#contributing)
- [Documentation](#documentation)
- [Roadmap](#roadmap)
- [Community](#community)

## Vision

**ad-product-forge** is building the infrastructure for a fully autonomous company powered by AI agents. Instead of traditional product development workflows, our agents:

1. **Discover** market opportunities through active and passive signal collection
2. **Analyze** signals using semantic graphs and knowledge enrichment
3. **Extract** actionable problems and product opportunities
4. **Validate** solutions with minimal pre-solution landing pages
5. **Develop** products autonomously following best practices
6. **Deploy** to production with automated testing and validation
7. **Monitor** and iterate with continuous feedback loops

This eliminates friction in discovering real market problems and executing solutions, enabling rapid creation of multiple micro-SaaS products with continuous validation.

## Key Features

### Core Infrastructure
- **Dynamic Agent Management** - Create and manage agents at runtime with database-backed configuration
- **Multi-Provider Communication** - Agents communicate via Discord, Slack, email, and internal messaging
- **Role-Based Access Control** - Granular permissions and capabilities for each agent
- **Agent Lifecycle** - Autonomous hiring, provisioning, and termination workflows

### Advanced Capabilities
- **External Specialist Agents** - Create temporary consultant and persona agents for specific tasks
- **Autonomous Scheduling** - Agents create and manage cron jobs and scheduled tasks
- **Group Chat & Coordination** - Multi-agent collaboration through group messaging
- **Knowledge Graph Integration** - Semantic enrichment and intelligent decision-making

### Product Development
- **Signal Collection** - Active and passive market data ingestion from multiple sources
- **Semantic Analysis** - Knowledge graph enrichment with embeddings and relationships
- **Opportunity Mining** - Bottom-up and top-down discovery of market problems
- **Landing Page Generation** - Automatic pre-solution validation pages
- **Autonomous Development** - Code generation and deployment orchestration
- **Continuous Monitoring** - Production analytics and feedback loops

### System Integration
- **ERP & Financial Management** - Accounting and business operations integration
- **Customer Support Automation** - Helpdesk and support agent workflows
- **Webhook & Event System** - Real-time event streaming and integrations
- **Git Integration** - Version control and deployment automation
- **Storage & Knowledge Base** - Persistent data and document management

## Quick Start

### Prerequisites

- **Node.js** >= 20.x
- **npm** >= 10.9.4
- **Git**

### Installation

```bash
# Clone the repository
git clone https://github.com/alternative-down/ad-product-forge.git
cd ad-product-forge

# Install dependencies using npm workspaces
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Development

```bash
# Start development servers
npm run dev

# Run linting across all packages
npm run lint

# Format code with Prettier
npm run format

# Type check all packages
npm run typecheck

# Run tests
npm run test

# Build all packages
npm run build
```

### Docker

```bash
# Build and run with Docker Compose
docker-compose up

# Or build the image separately
docker build -t ad-product-forge .
docker run -p 3000:3000 ad-product-forge
```

## Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Signal Collection Layer                      │
│          (Active + Passive Market Data Ingestion)                │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│              Semantic Enrichment & Knowledge Graph               │
│    (Entity Extraction, Embeddings, Relationship Mapping)         │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│           Opportunity Mining & Ranking Engine                    │
│        (Problem Extraction, Validation, Prioritization)          │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│          Value Proposition & Pre-Solution Generation             │
│           (Landing Pages, Messaging, Lead Capture)               │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│         Autonomous Agent Development & Deployment                │
│     (Code Generation, Testing, Production Launch)                │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│            Monitoring, Analytics & Feedback Loops                │
│           (Performance Tracking, Continuous Iteration)           │
└─────────────────────────────────────────────────────────────────┘
```

### System Components

- **@mastra/core** - Core agent framework and execution engine
- **@mastra/rag** - Retrieval-augmented generation for knowledge integration
- **mastra-engine** - Custom agent orchestration and communication system
- **forge** - Main application with agent coordination logic
- **forge-email** - Email communication provider integration

### Data Flow

1. **Ingestion** → Raw signals stored with metadata
2. **Enrichment** → Semantic processing via knowledge graph
3. **Mining** → Automated problem and opportunity extraction
4. **Validation** → Pre-solution landing pages and lead capture
5. **Development** → Autonomous code generation and testing
6. **Deployment** → Production launch and monitoring
7. **Iteration** → Feedback collection and continuous improvement

## Tech Stack

### Core Framework
- **Mastra** (v1.11.0) - AI Agent framework for autonomous agents
- **Node.js** (>=20.x) - Runtime environment
- **TypeScript** - Type-safe language

### Libraries & Tools
- **AI SDK** (v6.0.116) - LLM integration and streaming
- **Turbo** (v2.8.16) - Monorepo build orchestration
- **Drizzle ORM** - Type-safe database access
- **Zod** - Runtime type validation

### Development Tools
- **Prettier** (v3.8.1) - Code formatting
- **Husky** (v9.1.7) - Git hooks
- **Commitlint** (v20.4.3) - Conventional commits
- **Changesets** (v2.30.0) - Version management

### Communication Integrations
- **Discord.js** - Discord bot integration
- **Slack SDK** - Slack app integration
- **Email providers** - Multiple email service integrations

### Infrastructure
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **Neo4j** - Knowledge graph database (planned)
- **SQLite** - Lightweight data persistence

## Project Structure

```
ad-product-forge/
├── apps/                           # Application workspace
│   ├── forge/                      # Main agent orchestration app
│   │   ├── src/
│   │   ├── examples/
│   │   └── package.json
│   └── forge-email/                # Email service integration
│
├── packages/                       # Shared libraries
│   └── mastra-engine/              # Core agent engine
│       ├── src/
│       │   ├── agents/             # Agent configurations
│       │   ├── providers/          # Communication providers
│       │   ├── tools/              # Agent tools
│       │   ├── workflows/          # Agent workflows
│       │   └── index.ts
│       └── examples/
│
├── docs/                           # Documentation
│   ├── features/                   # Feature documentation
│   ├── system/                     # System design docs
│   ├── research/                   # Research notes
│   ├── planning/                   # Planning documents
│   └── notes/                      # General notes
│
├── .github/                        # GitHub configuration
│   ├── workflows/                  # CI/CD workflows
│   └── pull_request_template.md
│
├── .husky/                         # Git hooks
├── .changeset/                     # Changesets
├── docker-compose.yml              # Docker configuration
├── turbo.json                      # Turbo configuration
├── tsconfig.base.json              # TypeScript config
├── package.json                    # Root workspace config
│
├── ROADMAP.md                      # Development roadmap
├── PRD.md                          # Product requirements
├── CODE_STYLE.md                   # Code style guide
├── AGENTS.md                       # Agent development guide
└── README.md                       # This file
```

## Development

### Code Style

This project follows explicit, readable code patterns prioritizing clarity over abstraction. See [CODE_STYLE.md](./CODE_STYLE.md) for detailed guidelines.

**Key principles:**
- One main concept per file
- Explicit over implicit
- Clear naming and obvious responsibilities
- Early returns over nested conditionals
- Type-safe with Zod validation
- No `any` types

### Project Commands

```bash
# Development
npm run dev                    # Start all dev servers in parallel
npm run dev:forge             # Start main app
npm run dev:email             # Start email service

# Quality
npm run lint                   # Run linters
npm run format                 # Format code
npm run format:check           # Check formatting
npm run typecheck              # Type checking

# Testing & Building
npm run test                   # Run all tests
npm run build                  # Build all packages

# Version Management
npm run changeset              # Create a changeset
npm run version-packages       # Version packages
npm run release                # Publish to npm
```

### Workspace Structure

This is a Turbo monorepo with npm workspaces:

- **apps/** - Deployable applications
- **packages/** - Shared libraries used by apps and other packages

Each app/package has its own `package.json`, `tsconfig.json`, and scripts.

### Git Workflow

This project uses:
- **Conventional Commits** - Enforced via Commitlint
- **Changesets** - Semantic versioning
- **Husky Hooks** - Pre-commit validation
- **Prettier** - Automatic code formatting

```bash
# Example workflow
git checkout -b feature/new-agent
npm run format:check
npm run lint
npm run typecheck
git add .
git commit -m "feat(agents): add specialist agent support"
npm run changeset
git push origin feature/new-agent
```

## Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository** on GitHub
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Follow code style** guidelines in [CODE_STYLE.md](./CODE_STYLE.md)
4. **Write tests** for new functionality
5. **Ensure quality** with linting and type checking:
   ```bash
   npm run lint
   npm run typecheck
   npm run format:check
   ```
6. **Create a changeset** for version tracking:
   ```bash
   npm run changeset
   ```
7. **Open a pull request** with a clear description

### Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env

# 3. Verify setup
npm run typecheck
npm run lint

# 4. Start development
npm run dev
```

### Reporting Issues

- **Bugs**: Use GitHub Issues with the bug label
- **Features**: Discuss in GitHub Discussions first
- **Security**: Email security@example.com (responsible disclosure)

## Documentation

### Core Documents

- **[ROADMAP.md](./ROADMAP.md)** - 14-section development roadmap with detailed requirements and timelines
- **[PRD.md](./PRD.md)** - Complete product requirements document with system architecture
- **[CODE_STYLE.md](./CODE_STYLE.md)** - Code organization and style guidelines
- **[AGENTS.md](./AGENTS.md)** - Agent development and architecture guidelines

### Feature Documentation

Detailed documentation for each feature area is available in `docs/features/`:

- Agent Management
- Communication System
- Knowledge Graph Integration
- Workflow Automation
- External Specialist Agents
- And more...

### System Documentation

System design and architecture details are in `docs/system/`:

- Database schema
- API design
- Security architecture
- Deployment patterns

## Roadmap

The project has an ambitious 14-section roadmap covering:

### Phase 1: Foundation
1. **Core Infrastructure** - Dynamic agent management and database integration
2. **External Specialist Agents** - Temporary consultant agents
3. **Role & Permission Management** - Granular access control

### Phase 2: Coordination
4. **Agent Lifecycle Management** - Hiring, provisioning, termination
5. **Communication System** - Group chat and multi-provider support
6. **Webhooks & Event Streaming** - Real-time integrations

### Phase 3: Development
7. **GitHub Integration** - Version control and deployment
8. **Deployment & Infrastructure** - Production launch automation
9. **Community & Marketing** - Public-facing agent interfaces

### Phase 4: Operations
10. **ERP & Financial Management** - Business operations
11. **Customer Support** - Helpdesk automation
12. **Storage & Knowledge** - Data persistence and search

### Phase 5: Expansion
13. **Application Templates** - Ready-made agent configurations
14. **Capabilities & Tools** - Extended agent abilities

For detailed requirements and timeline, see [ROADMAP.md](./ROADMAP.md).

## Community

- **Discussions** - [GitHub Discussions](https://github.com/alternative-down/ad-product-forge/discussions)
- **Issues** - [GitHub Issues](https://github.com/alternative-down/ad-product-forge/issues)
- **Repository** - [GitHub](https://github.com/alternative-down/ad-product-forge)

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## Getting Help

- Check the [documentation](./docs/) directory
- Review the [PRD](./PRD.md) for system overview
- See [ROADMAP.md](./ROADMAP.md) for upcoming features
- Open an issue for bugs or feature requests
- Start a discussion for questions

---

**Last Updated:** March 15, 2026
**Status:** Active Development (v0.1.0)
