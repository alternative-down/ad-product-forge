# Roadmap - Agent Platform Evolution

## 1. Core Infrastructure - Dynamic Agent Management

### 1.1 Database-Driven Agent System
- **Objective**: Transform from static agent configuration to runtime agent creation and management
- **Requirements**:
  - Migrate from fixed agent creation to database-backed dynamic spawning
  - Implement SQLite with Drizzle ORM for agent and credential storage
  - Create database schemas for agent configuration, credentials, and provider settings
  - Implement database migrations for schema versioning and management
  - Encrypt sensitive data (tokens, passwords) at rest
  - Define encryption strategy for data protection

### 1.2 Communication Provider Integration
- **Objective**: Persist and manage communication provider credentials and configuration
- **Requirements**:
  - Store communication provider environment variables in database
  - Migrate communication module from direct SQLClient to Drizzle ORM
  - Ensure provider credentials are encrypted before storage
  - Support multiple communication providers per agent

## 2. Role & Permission Management

### 2.1 Role and Function Schema
- **Objective**: Define granular access control and capabilities for each agent
- **Requirements**:
  - Implement Function schema - acts as grouper/classifier for agents
  - Implement Role schema - defines specific capabilities and permissions
  - Role configuration includes: Tools, Providers, Workflows access
  - Represent agent's position within the organization
  - Enable authorized agents to modify role/function configurations
  - Implement master agent with unrestricted permissions
  - Master agent initializes base configurations
  - Master agent grants/revokes permissions to other agents as they are hired
  - Support permission escalation and delegation

## 3. Agent Lifecycle Management

### 3.1 Agent Hiring Workflow
- **Objective**: Enable agents to autonomously create and provision new agents
- **Requirements**:
  - Create workflow for agent contraction (hiring)
  - Allow agents to define account creation parameters
  - Enable agents to select communication providers for new agents
  - Define configurable parameters for agent instantiation
  - Implement agent provisioning process

### 3.2 Agent Termination Workflow
- **Objective**: Gracefully remove agents from the system
- **Requirements**:
  - Create workflow for agent removal (demissão/termination)
  - Handle cleanup of agent-related resources and data
  - Define deactivation procedures

### 3.3 Heartbeat and Scheduling System
- **Objective**: Keep inactive agents active and enable autonomous scheduling
- **Requirements**:
  - Implement heartbeat scheduling to periodically wake agents
  - Prevent agents from indefinite stand-by periods
  - Allow agents to create their own cron jobs via internal messaging
  - Enable agents to check pending tasks and resume interrupted executions

### 3.4 Cron/Scheduling Tool
- **Objective**: Enable agents to create and manage scheduled tasks
- **Requirements**:
  - Implement cron tool for agents to define scheduling rules
  - Support scheduling configuration and repetition patterns
  - Generate internal messages for scheduled events
  - Route messages to internal chat provider as self-messaging
  - Trigger wakeQueue notification on scheduled event
  - Agent receives own-created instructions and executes them
  - Support recurring and one-time schedules

## 4. Communication System

### 4.1 Internal Group Chat Implementation
- **Objective**: Enable agents to collaborate and coordinate through group messaging
- **Requirements**:
  - Extend internal communication module to support group conversations
  - Currently supports direct messages only - add group support
  - Enable agents to create coordination groups
  - Support multiple agents within a single group
  - Enable group-based communication for all agents

### 4.2 Multi-Provider Group Support
- **Objective**: Extend group capabilities to all communication providers
- **Requirements**:
  - Implement groups for Discord provider (channels, mentions)
  - Implement groups for Email provider (CC, BCC, mailing lists)
  - Support channel creation per agent
  - Support email distribution and CC functionality
  - Maintain consistency across all providers

### 4.3 Research as Workflow
- **Objective**: Transform research from tool to workflow
- **Requirements**:
  - Convert current Research tool to workflow implementation
  - Maintain research functionality with workflow benefits
  - Enable more complex research orchestration

## 5. External Integration & Event Handling

### 5.1 Webhook & Event Routing System
- **Objective**: Enable external systems to trigger agent actions
- **Requirements**:
  - Implement webhook infrastructure for external triggers
  - Support agent-created custom webhook routes
  - Support pre-configured webhook routes (GitHub, Coolify, Payments, Ads, etc.)
  - Route incoming events to appropriate agents
  - Trigger agent wakeup on external events
  - Enable agents to process and respond to external triggers
  - Support event queue and message passing
  - Handle various event types (repository events, deployment events, payment notifications, ad events)

## 6. Version Control & Repository Management

### 6.1 GitHub Integration
- **Objective**: Enable agents to manage repositories and respond to events
- **Requirements**:
  - Provide agents access to GitHub organization
  - Enable repository creation and manipulation by agents
  - Implement GitHub event webhooks for listening to repository events
  - Define workflow for triggering agent actions based on GitHub events
  - Support agent-driven repository management

## 7. Deployment & Infrastructure

### 7.1 Application Deployment
- **Objective**: Allow agents to deploy created applications
- **Requirements**:
  - Integrate with Coolify on Hertzner infrastructure
  - Enable agents to configure and deploy applications via Coolify
  - Ensure deployed applications are immediately accessible

### 7.2 Domain Management
- **Objective**: Provide wildcard domain configuration for agent applications
- **Requirements**:
  - Configure wildcard DNS pointing to Hertzner machine
  - Migrate domain control from .br registry to provider supporting advanced configurations
  - Enable automatic domain assignment for deployed applications
  - Support subdomain provisioning per agent application

### 7.3 Email Service Integration
- **Objective**: Provide organizational email for each agent
- **Requirements**:
  - Define and integrate email service provider
  - Support domain-based email configuration
  - Enable SMTP/IMAP access for agents
  - Provide email inbox and sending capabilities per agent
  - Integrate existing SMTP/IMAP provider with chosen email service

## 8. Community & Marketing

### 8.1 Social Media & Community Integration
- **Objective**: Enable agents to promote creations and identify opportunities
- **Requirements**:
  - Integrate with social media platforms
  - Integrate with forums and community sites
  - Enable agents to publish and share work
  - Provide opportunity identification from community interactions

### 8.2 Marketing Platform Integration
- **Objective**: Enable campaign execution and marketing automation
- **Requirements**:
  - Integrate with marketing platforms
  - Enable agents to execute marketing campaigns
  - Support campaign management and automation

## 9. Financial Management & ERP

### 9.1 Micro-ERP System
- **Objective**: Provide comprehensive financial tracking and management
- **Requirements**:
  - Implement expense tracking and recording
  - Implement revenue tracking and recording
  - Implement payroll management (agent costs and compensation)
  - Support financial forecasting and projections
  - Enable flow control based on financial data
  - Provide agents access to their own financial data

### 9.2 Cash Flow Control
- **Objective**: Control and prioritize agent actions based on financial status
- **Requirements**:
  - Implement cash flow analysis and monitoring
  - Enable action limiting based on financial constraints
  - Support prioritization based on cash flow status
  - Integrate financial data into agent decision-making

## 10. Customer Support & Communication

### 10.1 Ticketing System
- **Objective**: Provide support infrastructure for agent-created applications
- **Requirements**:
  - Implement ticketing system for customer support
  - Support tickets as communication provider (alongside Discord/Email)
  - Enable agents to handle support tickets for their created systems
  - Provide ticket management and routing capabilities

## 11. Application Templates & Development

### 11.1 Web Application Templates
- **Objective**: Accelerate agent application development
- **Requirements**:
  - Create pre-built application templates with common features
  - Include authentication system in templates
  - Include payment gateway integration
  - Include ticketing system integration
  - Support agents to rapidly scaffold new applications

## 12. Agent Capabilities & Tools

### 12.1 Custom Tool Framework
- **Objective**: Enable agents to create and use specialized tools
- **Requirements**:
  - Implement framework for custom tool creation
  - Allow agents to build specialized tools for their operations
  - Support tool creation using Skills or custom Tool builder interface
  - Enable agents to evolve and create their own integrations/utilities
  - Agents can extend their capabilities independently

### 12.2 Marketing Artifact Generation Tools
- **Objective**: Provide agents with tools for creating marketing materials
- **Requirements**:
  - Integration with Nanobanana for image generation
  - Integration with Vimeo for video hosting/manipulation
  - Text-to-Speech (TTS) capabilities
  - Speech-to-Text (STT) capabilities
  - Support for multiple artifact types (images, animations, videos)
  - Enable agents to create and deploy marketing materials

### 12.3 Browser Service
- **Objective**: Provide agents with browser automation capabilities
- **Requirements**:
  - Implement browser service integration (external service, not sandbox-bound)
  - Consider OpenClaw-like external service approach
  - Handle Playwright integration challenges (path resolution, sandbox issues)
  - Enable agents to interact with web interfaces
  - Support web scraping and browser automation tasks

### 12.4 Sub-Agent Capability (Optional Investigation)
- **Objective**: Explore using cheaper LLM models for internal agent tasks
- **Status**: Exploratory, needs further evaluation
- **Considerations**:
  - Use sub-agents for context-heavy or information gathering tasks
  - Primary agent acts as supervisor/orchestrator
  - Potential concern: confusion with existing multi-agent system
  - May not be suitable depending on actual implementation needs

### 11.2 Advanced Capabilities
- **Objective**: Provide agents with diverse operational capabilities
- **Requirements**:
  - Browser service integration (potentially external service like OpenClaw)
  - Marketing artifact generation (images, animations, video via Nanobanana/Vimeo)
  - Document signing capabilities
  - Knowledge base with semantic search
  - Minio storage integration
  - BullMQ queue management
  - External agent creation for specialized consultants
