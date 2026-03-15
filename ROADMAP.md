# Roadmap - Mastra Framework & ad-product-forge Application

---

## PART 1: MASTRA FRAMEWORK CORE

**Classification:** Framework infrastructure for autonomous multi-agent orchestration. These features are reusable across any Mastra deployment and enable sophisticated agent-based systems.

### 1. Agent Registry & Persistence

#### 1.1 Database-Driven Agent System (PRD-01)
- **Objective**: Transform from static agent configuration to runtime agent creation and management
- **Requirements**:
  - Migrate from fixed agent creation to database-backed dynamic spawning
  - Implement SQLite with Drizzle ORM for agent and credential storage
  - Create database schemas for agent configuration, credentials, and provider settings
  - Implement database migrations for schema versioning and management
  - Encrypt sensitive data (tokens, passwords) at rest
  - Define encryption strategy for data protection

#### 1.2 Communication Provider Integration (PRD-02)
- **Objective**: Persist and manage communication provider credentials and configuration
- **Requirements**:
  - Store communication provider credentials in database
  - Migrate to Drizzle ORM for type-safe queries
  - Ensure provider credentials are encrypted before storage
  - Support multiple communication providers per agent

### 2. Multi-Agent Orchestration

#### 2.1 External Agent System (PRD-03)
- **Objective**: Enable creation of temporary specialist agents for specific tasks
- **Requirements**:
  - Support external specialist agents (consultants, personas, subject matter experts)
  - Create agents on-demand for internal agent requests
  - External agents have restricted permissions (messaging only)
  - External agents cannot access internal resources
  - Communication via internal messaging system
  - Agents only wake up when receiving messages
  - Can be terminated when task is complete

### 3. Access Control & Organization

#### 3.1 Role and Function Schema (PRD-04)
- **Objective**: Define granular access control and capabilities for each agent
- **Requirements**:
  - Implement Function schema - acts as grouper/classifier for agents
  - Implement Role schema - defines specific capabilities and permissions
  - Role configuration includes: Tools, Providers, Workflows access
  - Implement master agent with unrestricted permissions
  - Master agent initializes base configurations
  - Master agent grants/revokes permissions to other agents
  - Support permission escalation and delegation

### 4. Agent Lifecycle Management

#### 4.1 Agent Hiring Workflow (PRD-05)
- **Objective**: Enable agents to autonomously create and provision new agents
- **Requirements**:
  - Create workflow for agent creation and provisioning
  - Allow agents to define account creation parameters
  - Enable agents to select communication providers for new agents
  - Define configurable parameters for agent instantiation
  - Implement agent provisioning process

#### 4.2 Agent Termination Workflow (PRD-06)
- **Objective**: Gracefully remove agents from the system
- **Requirements**:
  - Create workflow for agent removal
  - Handle cleanup of agent-related resources and data
  - Define deactivation procedures

#### 4.3 Heartbeat and Scheduling System (PRD-07)
- **Objective**: Keep agents active and enable autonomous scheduling
- **Requirements**:
  - Implement heartbeat scheduling to periodically wake agents
  - Prevent agents from indefinite stand-by periods
  - Allow agents to create their own cron jobs
  - Enable agents to check for pending tasks
  - Support resume of interrupted executions

#### 4.4 Cron/Scheduling Tool (PRD-08)
- **Objective**: Enable agents to create and manage scheduled tasks
- **Requirements**:
  - Implement cron tool for agents to define scheduling rules
  - Support scheduling configuration and repetition patterns
  - Generate internal messages for scheduled events
  - Trigger wake events on scheduled time
  - Support recurring and one-time schedules

### 5. Multi-Agent Communication

#### 5.1 Internal Group Chat Implementation (PRD-09)
- **Objective**: Enable agents to collaborate and coordinate through group messaging
- **Requirements**:
  - Extend internal communication module to support group conversations
  - Enable agents to create coordination groups
  - Support multiple agents within a single group
  - Enable group-based communication for all agents

#### 5.2 Multi-Provider Group Support (PRD-10)
- **Objective**: Extend group capabilities to all communication providers
- **Requirements**:
  - Implement groups for Discord provider (channels, mentions)
  - Implement groups for Email provider (CC, BCC, mailing lists)
  - Support channel creation per agent
  - Support email distribution functionality
  - Maintain consistency across all providers

---

## PART 2: AD-PRODUCT-FORGE APPLICATION

**Classification:** Application-specific features tailored to Nicolas' autonomous product development platform. These are not framework infrastructure but implementation-specific to ad-product-forge's business model.

### 1. Product Development & Research

#### 1.1 Research as Workflow (PRD-11)
- **Objective**: Transform research from tool to workflow for complex analysis
- **Requirements**:
  - Convert current Research tool to workflow implementation
  - Support sequential research queries
  - Enable conditional branching based on results
  - Support parallel research streams
  - Maintain backward compatibility with tool calls

### 2. External Integration

#### 2.1 Webhook & Event Routing System (PRD-12)
- **Objective**: Enable external systems to trigger agent actions
- **Requirements**:
  - Implement webhook infrastructure for external triggers
  - Support agent-created custom webhook routes
  - Support pre-configured routes (GitHub, Coolify, Payments, Ads, etc.)
  - Route incoming events to appropriate agents
  - Trigger agent wakeup on external events

#### 2.2 GitHub Integration (PRD-13)
- **Objective**: Enable agents to manage repositories and respond to events
- **Requirements**:
  - Provide agents access to GitHub organization
  - Enable repository creation and manipulation by agents
  - Implement GitHub event webhooks
  - Define workflow for triggering agent actions based on GitHub events
  - Support agent-driven repository management

### 3. Deployment & Infrastructure

#### 3.1 Application Deployment (PRD-14)
- **Objective**: Allow agents to deploy created applications
- **Requirements**:
  - Integrate with Coolify on Hetzner infrastructure
  - Enable agents to configure and deploy applications via Coolify
  - Ensure deployed applications are immediately accessible

#### 3.2 Domain Management (PRD-15)
- **Objective**: Provide wildcard domain configuration for agent applications
- **Requirements**:
  - Configure wildcard DNS pointing to Hetzner machine
  - Enable automatic domain assignment for deployed applications
  - Support subdomain provisioning per agent application

#### 3.3 Email Service Integration (PRD-16)
- **Objective**: Provide organizational email for agents
- **Requirements**:
  - Support domain-based email configuration
  - Enable SMTP/IMAP access for agents
  - Provide email inbox and sending capabilities per agent

### 4. Business Operations

#### 4.1 Micro-ERP System (PRD-19)
- **Objective**: Provide financial tracking and management
- **Requirements**:
  - Implement expense tracking and recording
  - Implement revenue tracking and recording
  - Support financial forecasting and projections

#### 4.2 CRM System (PRD-21)
- **Objective**: Provide customer relationship management capabilities
- **Requirements**:
  - Implement customer and contact management
  - Support sales pipeline management
  - Enable interaction history tracking
  - Provide simple reporting on pipeline and activity

#### 4.3 Billing & Payment Integration (PRD-22)
- **Objective**: Integrate payment processing with platform
- **Requirements**:
  - Integrate Stripe for payment processing
  - Support recurring billing and subscriptions
  - Track payment transactions
  - Connect to ERP for financial reconciliation

#### 4.4 Project & Task Management (PRD-23)
- **Objective**: Provide project and task tracking system
- **Requirements**:
  - Implement project management system
  - Support task creation with status tracking
  - Enable task listing and filtering

#### 4.5 Ticketing System (PRD-24)
- **Objective**: Provide support infrastructure for agent-created applications
- **Requirements**:
  - Implement ticketing system for customer support
  - Support basic ticket creation and status tracking
  - Enable agents to handle support tickets

### 5. Data Storage & Knowledge

#### 5.1 Distributed Storage System (PRD-25)
- **Objective**: Provide scalable storage for agents and applications
- **Requirements**:
  - Implement local file storage for agents
  - Enable agents to use storage for artifacts
  - Support metadata tracking in database

#### 5.2 Task Queue & Event Processing (PRD-26)
- **Objective**: Provide asynchronous task processing capabilities
- **Requirements**:
  - Integrate BullMQ for job queuing
  - Enable agents to queue and execute tasks
  - Support automatic retries on failure

#### 5.3 Knowledge Base System (PRD-27)
- **Objective**: Provide semantic search and knowledge retrieval
- **Requirements**:
  - Implement document storage with semantic search
  - Use embeddings for similarity-based retrieval
  - Enable agents to search and retrieve knowledge

#### 5.4 Secrets Management (PRD-28)
- **Objective**: Securely store and manage sensitive credentials
- **Requirements**:
  - Implement vault system for agent secrets
  - Store API keys, tokens, and credentials securely
  - Support secret rotation and management
  - Enable agents to access secrets securely

#### 5.5 Electronic Signature System (PRD-29)
- **Objective**: Enable document signing capabilities
- **Requirements**:
  - Implement electronic document signing
  - Support cryptographic verification
  - Enable agents to sign documents
  - Store signed document audit trails

### 6. Application Development Tools

#### 6.1 Web Application Templates (PRD-30)
- **Objective**: Accelerate agent application development
- **Requirements**:
  - Create pre-built application templates with common features
  - Include authentication system in templates
  - Include payment gateway integration
  - Support agents to rapidly scaffold new applications

#### 6.2 Custom Tool Framework (PRD-31)
- **Objective**: Enable agents to create and use specialized tools
- **Requirements**:
  - Implement framework for custom tool creation
  - Allow agents to build specialized tools for their operations
  - Support tool creation using Skills or custom interfaces
  - Enable agents to evolve and create their own integrations

#### 6.3 Marketing Artifact Generation Tools (PRD-32)
- **Objective**: Provide agents with tools for creating marketing materials
- **Requirements**:
  - Integration with image generation services
  - Text-to-Speech (TTS) capabilities
  - Support for multiple artifact types (images, audio)
  - Enable agents to create and deploy marketing materials

#### 6.4 Browser Service (PRD-33)
- **Objective**: Provide agents with browser automation capabilities
- **Requirements**:
  - Implement browser service integration (external service)
  - Enable agents to interact with web interfaces
  - Support web scraping and browser automation tasks

#### 6.5 Sub-Agent Capability (PRD-34, Optional)
- **Objective**: Explore using cheaper LLM models for internal agent tasks
- **Status**: Exploratory, needs further evaluation
- **Considerations**:
  - Use sub-agents for information gathering tasks
  - Primary agent acts as supervisor/orchestrator
  - Cost optimization for at-scale deployments

### 7. Optional/Deferred Features

#### 7.1 Social Media & Community Integration (PRD-17, DEFERRED)
- **Status**: Deprioritized in favor of core product development
- **Reason**: Solo dev prefers manual control over automated social posting

#### 7.2 Marketing Platform Integration (PRD-18, DEFERRED)
- **Status**: Deferred, use PRD-16 (simple email) instead
- **Reason**: Basic email sufficient for current needs

#### 7.3 Cash Flow Control (PRD-20, OPTIONAL)
- **Status**: Optional, deferred until multiple agents require budget management
- **Reason**: Value-to-effort ratio too low for MVP
