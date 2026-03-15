# PRD — Web Application Templates

**Status:** Planning - Feature Design & Analysis
**Date:** 2026-03-15
**Version:** 1.0
**Feature ID:** PLATFORMS-030

---

## Executive Summary

**Objective:** Implement a comprehensive Web Application Templates system that enables agents to rapidly scaffold production-ready applications with pre-configured features, reducing development time and ensuring architectural consistency across generated applications.

**Problem:** Agents currently need to build applications from scratch, making decisions on authentication systems, payment integrations, ticketing systems, and overall architecture. This results in:
- Inconsistent application structures across generated projects
- Extended development time for boilerplate setup
- Repeated implementation of common patterns
- Higher risk of security and architectural issues
- Limited reusability of proven solutions

**Solution:** Create a modular template system providing:
- Pre-built application scaffolds with common architectural patterns
- Integrated authentication systems (JWT, OAuth, multi-factor auth)
- Payment gateway integrations (Stripe, PayPal, etc.)
- Ticket/issue tracking system integrations (Jira, GitHub Issues, etc.)
- CLI tools and SDK for agents to instantly generate applications
- Customizable templates based on application type and tech stack

**Value Proposition:**
- Reduce application bootstrap time from weeks to minutes
- Ensure consistent security practices and architectural patterns
- Enable agents to focus on business logic rather than infrastructure
- Provide battle-tested implementations of common integrations
- Support rapid iteration and experimentation with new applications
- Improve application quality through proven templates

**Scope:** Initial release focuses on core templates and integrations; extensibility framework for future custom templates

---

## Problem Statement

### Current State

The agent platform currently:
- Requires agents to manually scaffold new applications from blank projects
- Lacks standardized patterns for authentication implementation
- Forces duplicate implementation of payment processing logic
- Provides no built-in ticket/support system integration
- Results in inconsistent application structures and varying code quality
- Extends time-to-production for new applications significantly

### Stakeholders & Impact

**Primary Stakeholders:**
- **Agents/AI Systems:** Need rapid application generation with sensible defaults
- **End Users:** Benefit from consistent, secure, well-integrated applications
- **Platform Team:** Maintenance burden from diverse codebase patterns

**Impact Areas:**
- Agent productivity and capability
- Application quality and security
- Time-to-market for new features
- Maintainability of generated code

### User Pain Points

1. **Boilerplate Fatigue:** Agents spend cycles implementing authentication, error handling, and configuration
2. **Inconsistency:** Different agents create different patterns, making support difficult
3. **Security Risk:** Re-implementing auth and security features multiple times increases error likelihood
4. **Integration Complexity:** Setting up payment and ticketing systems requires research and manual integration
5. **Time Loss:** Scaffold-to-production path is too long for rapid prototyping

---

## Requirements Analysis

### Functional Requirements

#### F1: Template Management System
- **F1.1:** Provide a catalog of pre-built application templates
- **F1.2:** Support multiple programming languages/frameworks (Node.js, Python, Go, etc.)
- **F1.3:** Enable agents to list, inspect, and select templates via SDK
- **F1.4:** Allow customization of template parameters during generation
- **F1.5:** Support versioning of templates to enable template evolution

#### F2: Authentication System Integration
- **F2.1:** Include JWT-based authentication in templates
- **F2.2:** Support OAuth2/OpenID Connect provider integration
- **F2.3:** Implement multi-factor authentication (MFA) capabilities
- **F2.4:** Provide user session management and refresh token handling
- **F2.5:** Include password reset and account recovery flows
- **F2.6:** Support role-based access control (RBAC) in template structure

#### F3: Payment Gateway Integration
- **F3.1:** Provide pre-configured Stripe integration in templates
- **F3.2:** Support PayPal payment processing
- **F3.3:** Include webhook handling for payment events
- **F3.4:** Implement order/subscription management patterns
- **F3.5:** Support multiple currencies and localization
- **F3.6:** Include PCI compliance best practices in payment handling

#### F4: Ticket/Support System Integration
- **F4.1:** Pre-configure Jira integration for issue tracking
- **F4.2:** Support GitHub Issues for public projects
- **F4.3:** Implement ticketing API endpoints in templates
- **F4.4:** Support ticket creation/update/resolution workflows
- **F4.5:** Include webhook handling for ticket events
- **F4.6:** Provide dashboard for ticket management

#### F5: Application Scaffolding
- **F5.1:** Provide CLI command: `agent-scaffold create-app --template <name>`
- **F5.2:** Interactive configuration wizard for template parameters
- **F5.3:** Generate complete project structure with all dependencies
- **F5.4:** Create environment configuration templates (.env.example)
- **F5.5:** Generate README with setup instructions
- **F5.6:** Support post-generation hooks for custom setup

#### F6: Template Extensibility
- **F6.1:** Define template structure and composition rules
- **F6.2:** Enable custom template creation by advanced users
- **F6.3:** Support template inheritance and composition
- **F6.4:** Provide template validation and testing framework
- **F6.5:** Enable community template sharing and discovery

### Non-Functional Requirements

#### NFR1: Performance
- **NFR1.1:** Template generation should complete in < 10 seconds
- **NFR1.2:** CLI should respond to commands in < 2 seconds
- **NFR1.3:** Template catalog should load in < 1 second

#### NFR2: Security
- **NFR2.1:** All templates must follow OWASP Top 10 principles
- **NFR2.2:** Sensitive data (API keys, secrets) must never be hardcoded in templates
- **NFR2.3:** Generated applications must support secrets management (environment variables, vaults)
- **NFR2.4:** All third-party integrations must use secure credential storage
- **NFR2.5:** Templates must include security scanning recommendations

#### NFR3: Scalability
- **NFR3.1:** Support generation of unlimited applications from templates
- **NFR3.2:** Template catalog should scale to 100+ templates without performance degradation
- **NFR3.3:** Support concurrent scaffold generation without interference

#### NFR4: Maintainability
- **NFR4.1:** Templates should be version-controlled and tracked
- **NFR4.2:** Easy update path for template improvements
- **NFR4.3:** Clear documentation of template structure and customization points

#### NFR5: User Experience
- **NFR5.1:** Clear, friendly error messages during scaffold generation
- **NFR5.2:** Progress indication for long-running scaffold operations
- **NFR5.3:** Comprehensive documentation and examples for each template

---

## Success Metrics & KPIs

### Primary Metrics

1. **Time-to-Production Reduction**
   - Baseline: Average time from project start to deployed app
   - Target: 70% reduction in bootstrap time through template usage
   - Measurement: Track scaffold-to-first-deploy time

2. **Template Adoption Rate**
   - Baseline: Current manual scaffold rate
   - Target: 80% of new agents use templates
   - Measurement: Track percentage of projects using template system

3. **Consistency Score**
   - Baseline: Code review observations about inconsistency
   - Target: 95% consistency in authentication/payment patterns
   - Measurement: Automated consistency checks on generated code

4. **Agent Productivity**
   - Baseline: Projects completed per agent per sprint
   - Target: 25% increase in productivity for projects using templates
   - Measurement: Project tracking and delivery metrics

### Secondary Metrics

5. **Template Quality**
   - Security scan pass rate: Target 100%
   - Test coverage of template: Target 80%+
   - Integration test success rate: Target 99%+

6. **User Satisfaction**
   - Template usefulness survey: Target 4.5/5.0 rating
   - Documentation clarity: Target 90% found docs helpful
   - Support tickets related to templates: Target < 5%

7. **Coverage Metrics**
   - Number of templates available: Target 15+ core templates
   - Supported frameworks/languages: Target 5+ major platforms
   - Integration options: Target 10+ integrated services

---

## Design & Technical Approach

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│          Template System Architecture               │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Agent SDK Interface                                │
│  ├─ scaffold create-app                             │
│  └─ template list/inspect                           │
│           ↓                                          │
│  Template Engine                                    │
│  ├─ Template Resolver                               │
│  ├─ Parameter Validation                            │
│  ├─ File Generation & Transformation                │
│  └─ Post-Generation Hooks                           │
│           ↓                                          │
│  Template Repository                                │
│  ├─ Core Templates (v1, v2, etc.)                   │
│  ├─ Template Metadata                               │
│  └─ Integration Configs                             │
│           ↓                                          │
│  Generated Applications                             │
│  ├─ Full Project Structure                          │
│  ├─ Pre-configured Services                         │
│  └─ Ready-to-customize Code                         │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Core Templates (Initial Release)

#### Template 1: REST API Backend
- **Tech Stack:** Node.js/Express, TypeScript, PostgreSQL
- **Includes:**
  - JWT authentication with refresh tokens
  - Role-based access control (RBAC)
  - Standard CRUD operations pattern
  - Database migrations setup
  - API documentation (OpenAPI/Swagger)
  - Error handling middleware
  - Logging and monitoring hooks
  - Docker configuration
- **Integrations:** Stripe (payments), Jira (support)

#### Template 2: Full-Stack Web Application
- **Tech Stack:** React, Node.js/Express, PostgreSQL, TypeScript
- **Includes:**
  - Complete authentication flow (login, signup, MFA)
  - User dashboard structure
  - Admin panel template
  - Payment checkout integration
  - Support ticket system UI
  - Responsive design (Tailwind CSS)
  - Form validation patterns
  - State management (Redux/Zustand)

#### Template 3: Python Data Application
- **Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL
- **Includes:**
  - Async API patterns
  - Authentication with JWT
  - Database ORM setup
  - Admin interface (optional)
  - Data export functionality
  - Logging and monitoring

#### Template 4: Mobile-First Web App
- **Tech Stack:** Next.js, TypeScript, Tailwind CSS, Supabase
- **Includes:**
  - Progressive Web App capabilities
  - Mobile-optimized UI
  - Offline support patterns
  - Authentication UI
  - Push notifications setup
  - Responsive layouts

#### Template 5: E-commerce Application
- **Tech Stack:** Next.js, Stripe, Shopify integration, TypeScript
- **Includes:**
  - Product catalog system
  - Shopping cart logic
  - Stripe payment integration
  - Order management
  - Customer accounts
  - Admin product management
  - Review/rating system

### Authentication System Design

```
Authentication Flow:
┌────────┐           ┌──────────────┐           ┌────────┐
│ Client │           │ Auth Service │           │ DB     │
└────────┘           └──────────────┘           └────────┘
   │ 1. Login              │                         │
   │─────────────────────→ │                         │
   │                       │ 2. Verify Credentials   │
   │                       │────────────────────────→│
   │                       │                    3. OK│
   │                       │←────────────────────────│
   │                       │ 4. Generate JWT         │
   │ 5. JWT + Refresh      │                         │
   │←─────────────────────│                         │
   │                       │                         │
   │ 6. API Request        │                         │
   │ (with JWT)            │                         │
   │─────────────────────→ │ 7. Validate Token      │
   │                       │────────────────────────→│
   │                       │                    8. OK│
   │                       │←────────────────────────│
   │ 9. Response           │                         │
   │←─────────────────────│                         │
```

**Features:**
- JWT tokens with configurable expiration
- Refresh token rotation
- Multi-factor authentication (TOTP-based)
- OAuth2 provider integration (Google, GitHub, etc.)
- Session management and revocation
- Password reset with email verification
- Account lockout after failed attempts

### Payment Integration Design

**Stripe Integration:**
- Customer creation and management
- Payment intent/charge creation
- Webhook event handling (payment.success, payment.failed, etc.)
- Subscription management
- Invoice generation
- Webhook signature verification

**PayPal Integration:**
- Order creation and payment
- Webhook integration
- Subscription support
- Settlement reporting

**Template Includes:**
- Secure API key management (environment-based)
- Webhook receiver and processor
- Database models for payment records
- Order tracking
- Receipt/invoice generation
- Error handling and retry logic

### Ticket System Integration Design

**Jira Integration:**
- Project and issue creation
- Custom field mapping
- Webhook handling for issue updates
- Issue search and filtering
- Assignee management
- Status transitions

**GitHub Issues Integration:**
- Repository integration
- Issue creation from application
- Label and milestone support
- Comment and discussion handling
- Closing/reopening issues

**Template Includes:**
- Backend endpoints for ticket operations
- UI for ticket viewing/creation
- Webhook receiver for external updates
- Notification system for status changes
- Analytics and reporting

### Template File Structure

```
template-rest-api/
├── template.yml                    # Template metadata
├── parameters.yml                  # Configuration schema
├── src/
│  ├── config/                      # Configuration templates
│  ├── middleware/                  # Auth, error handling
│  ├── routes/
│  │  ├── auth.ts                   # Authentication endpoints
│  │  ├── payments.ts               # Payment handling
│  │  └── tickets.ts                # Ticket integration
│  ├── services/
│  │  ├── auth.service.ts           # Auth logic
│  │  ├── stripe.service.ts         # Stripe integration
│  │  └── jira.service.ts           # Jira integration
│  ├── models/
│  │  ├── user.model.ts
│  │  ├── payment.model.ts
│  │  └── ticket.model.ts
│  ├── db/
│  │  ├── schema.ts                 # Database schema
│  │  └── migrations/
│  └── index.ts                     # Entry point
├── tests/                          # Test suite
├── .env.example                    # Environment template
├── docker-compose.yml              # Docker setup
├── README.md                        # Setup instructions
├── package.json                    # Dependencies
└── hooks/                          # Post-generation hooks
   └── setup.sh                     # Setup script

template.yml content:
---
name: "REST API Backend"
description: "Production-ready REST API with auth and payments"
version: "1.0.0"
framework: "nodejs"
language: "typescript"
features:
  - authentication
  - payments
  - ticketing
parameters:
  appName:
    type: string
    description: "Application name"
    default: "my-api"
  database:
    type: enum
    options: [postgresql, mysql, mongodb]
    default: "postgresql"
  authProvider:
    type: enum
    options: [jwt, oauth]
    default: "jwt"
  paymentProvider:
    type: enum
    options: [stripe, paypal]
    default: "stripe"
```

### SDK Integration

```typescript
import { AgentScaffold } from '@agent-platform/scaffold-sdk';

const scaffold = new AgentScaffold({
  templatesDir: './templates',
  outputDir: './generated-apps'
});

// List available templates
const templates = await scaffold.listTemplates();

// Generate new application
const app = await scaffold.createApplication({
  templateId: 'rest-api-backend',
  appName: 'customer-service-api',
  parameters: {
    database: 'postgresql',
    authProvider: 'jwt',
    paymentProvider: 'stripe'
  },
  outputPath: './apps/customer-service-api'
});

// Apply custom configuration
await app.configure({
  stripeKey: 'sk_live_...',
  jiraUrl: 'https://company.atlassian.net'
});
```

---

## Implementation Plan & Roadmap

### Phase 1: Foundation (Weeks 1-3)
**Deliverables:**
- Template engine core implementation
- Template repository structure
- REST API Backend template (basic auth + REST patterns)
- Agent SDK interface
- CLI tool for scaffold generation

**Tasks:**
1. Design and implement template engine
2. Create template directory structure and metadata system
3. Build REST API Backend template with JWT auth
4. Develop scaffold generation logic
5. Create Agent SDK integration
6. Build basic CLI tool
7. Write documentation and examples

### Phase 2: Integrations (Weeks 4-6)
**Deliverables:**
- Stripe payment integration
- Jira ticket system integration
- PayPal support
- GitHub Issues integration
- Updated templates with integrations

**Tasks:**
1. Implement Stripe payment service
2. Add Stripe integration to templates
3. Implement Jira API client and integration
4. Add Jira integration to templates
5. Add PayPal support
6. Add GitHub Issues support
7. Create integration tests
8. Update documentation with integration guides

### Phase 3: Additional Templates (Weeks 7-9)
**Deliverables:**
- Full-stack Web Application template
- Python Data Application template
- Mobile-First Web App template
- E-commerce Application template

**Tasks:**
1. Create Full-stack Web template (React + Node.js)
2. Create Python template (FastAPI)
3. Create Next.js mobile-first template
4. Create E-commerce template with Shopify integration
5. Test all templates thoroughly
6. Create setup guides for each template
7. Create example projects using each template

### Phase 4: Extensibility & Polish (Weeks 10-12)
**Deliverables:**
- Template extensibility framework
- Custom template creation guide
- Web dashboard for template management
- Template versioning system
- Performance optimization

**Tasks:**
1. Design template inheritance and composition system
2. Implement custom template creation tools
3. Create web UI for browsing and selecting templates
4. Implement template versioning and migration system
5. Performance testing and optimization
6. Security audit of all templates
7. Create comprehensive documentation
8. Beta testing with agents

---

## Dependencies & Integrations

### External Dependencies

**Template Tools:**
- Handlebars or EJS for template rendering
- Commander.js or Yargs for CLI
- Inquirer.js or similar for interactive prompts

**Core Dependencies (in templates):**
- Authentication: jsonwebtoken, bcrypt, passport
- Payments: stripe SDK, paypal-rest-sdk
- Database: TypeORM, Sequelize, SQLAlchemy
- API: Express, FastAPI, Echo/Gin
- Testing: Jest, pytest, Mocha

**Integration Services:**
- Stripe API
- PayPal API
- Jira Cloud API
- GitHub API

### Internal Dependencies

- Agent SDK (for CLI integration)
- Platform database (for template versioning)
- Secrets management system (for test credentials)
- CI/CD pipeline (for template testing)

---

## Risk Analysis & Mitigation

### Risks

**R1: Template Obsolescence**
- **Impact:** Templates become outdated as frameworks evolve
- **Probability:** High
- **Mitigation:**
  - Implement versioning system for templates
  - Establish template update schedule (quarterly reviews)
  - Monitor framework updates and security advisories
  - Community contribution process for template improvements

**R2: Security Vulnerabilities in Templates**
- **Impact:** Generated applications inherit vulnerabilities
- **Probability:** Medium
- **Mitigation:**
  - Security audit before each template release
  - Automated security scanning (SAST/dependency checks)
  - Pin dependencies with security updates
  - Regular penetration testing
  - Security guidelines documentation

**R3: Poor Integration Quality**
- **Impact:** Generated applications with broken integrations
- **Probability:** Medium
- **Mitigation:**
  - Comprehensive integration testing
  - Real API testing with test accounts
  - Webhook simulation and testing
  - Documentation with troubleshooting guides
  - Support team training on integrations

**R4: Low Adoption Rate**
- **Impact:** Feature development effort not justified
- **Probability:** Medium
- **Mitigation:**
  - Clear communication about time savings
  - Comprehensive documentation and tutorials
  - Gradual rollout with feedback collection
  - Integration with agent workflow
  - Incentivize usage with improved features

**R5: Performance Issues During Generation**
- **Impact:** Poor user experience, generation timeouts
- **Probability:** Low
- **Mitigation:**
  - Performance benchmarking during development
  - Optimize template processing
  - Implement progress indication
  - Asynchronous generation support
  - Caching of template metadata

**R6: Compatibility Issues Across Platforms**
- **Impact:** Generated apps fail on different environments
- **Probability:** Medium
- **Mitigation:**
  - Test generation on multiple OS (Windows, Mac, Linux)
  - Use cross-platform compatible tools
  - Docker containerization support
  - CI/CD pipeline for generated apps
  - Clear environment requirements documentation

---

## Resource Requirements

### Team Composition

**Full-time:**
- 1 Senior Backend Engineer (architecture, core engine)
- 1 Full-stack Engineer (template development)
- 1 QA Engineer (testing, integration validation)

**Part-time:**
- 1 Product Manager (coordination, roadmap)
- 1 Technical Writer (documentation)
- 1 Security Engineer (security audit, compliance)

### Timeline

- **Total Duration:** 12 weeks
- **Team Allocation:** 3 FTE engineers + support roles
- **Estimated Effort:** 360 engineer-hours

### Tools & Infrastructure

- Template repository (Git with CI/CD)
- Template testing infrastructure
- API test environments (Stripe sandbox, Jira dev instance)
- Documentation platform
- Analytics for template usage tracking

---

## Success Criteria & Launch Checklist

### Pre-Launch Requirements

- [ ] All 5 core templates completed and tested
- [ ] Integration tests passing for all services (Stripe, Jira, PayPal, GitHub)
- [ ] Security audit completed with no critical findings
- [ ] Documentation complete (setup guides, API docs, troubleshooting)
- [ ] CLI tool functional and tested
- [ ] SDK integration verified with agent workflows
- [ ] Performance benchmarks met (< 10s generation time)
- [ ] Disaster recovery and rollback procedures documented

### Launch Success Criteria

- [ ] Zero critical security vulnerabilities in generated apps
- [ ] 100% of template tests passing
- [ ] Integration test success rate > 99%
- [ ] Generation time < 10 seconds (p95)
- [ ] User documentation rating > 4.5/5
- [ ] Agent adoption rate reaches 30% within first month
- [ ] Support ticket volume < 2% of generated projects

### Post-Launch Metrics

**First Month:**
- Track number of agents using templates
- Monitor generation success rate
- Collect feedback on template usefulness
- Monitor performance and error rates

**Months 2-3:**
- Analyze productivity improvements
- Identify most-used templates
- Gather feature requests
- Plan template improvements and new templates

---

## Open Questions & Decisions Needed

1. **Template Storage:**
   - Should templates be stored in Git repository or database?
   - How to version and distribute template updates?
   - **Decision Needed:** Storage backend strategy

2. **Framework Coverage:**
   - Which frameworks should Phase 1 cover (Node.js, Python, Go, etc.)?
   - Should we support frontend frameworks (React, Vue, Angular)?
   - **Decision Needed:** Initial framework priority list

3. **Integration Flexibility:**
   - Should integrations be optional or mandatory in templates?
   - How to handle optional integration configuration?
   - **Decision Needed:** Integration configuration approach

4. **Cost & Pricing:**
   - How are Stripe/PayPal test account costs handled?
   - Who pays for Jira/GitHub API usage in templates?
   - **Decision Needed:** Cost allocation strategy

5. **Custom Templates:**
   - When should custom template support be released (Phase 4 or later)?
   - What are guidelines for custom template quality?
   - **Decision Needed:** Custom template governance

---

## Glossary

- **Template:** Pre-built application scaffold with common features
- **Scaffold:** Process of generating a new project from a template
- **Integration:** Connection to external services (Stripe, Jira, etc.)
- **Parameter:** Configurable value during template generation
- **RBAC:** Role-Based Access Control
- **JWT:** JSON Web Token (authentication)
- **OAuth2:** Authorization protocol
- **MFA:** Multi-Factor Authentication
- **OWASP:** Open Web Application Security Project
- **PCI:** Payment Card Industry (compliance standard)
- **WebHook:** Event-driven callback to external systems

---

## Appendix: Template Examples

### Example: Generated REST API Output

```
my-api/
├── src/
│  ├── config/
│  │  ├── database.ts
│  │  └── auth.ts
│  ├── middleware/
│  │  ├── errorHandler.ts
│  │  └── authGuard.ts
│  ├── routes/
│  │  ├── auth.ts
│  │  ├── payments.ts
│  │  ├── tickets.ts
│  │  └── users.ts
│  ├── services/
│  │  ├── authService.ts
│  │  ├── stripeService.ts
│  │  └── jiraService.ts
│  ├── models/
│  │  ├── user.ts
│  │  ├── payment.ts
│  │  └── ticket.ts
│  ├── db/
│  │  ├── schema.ts
│  │  └── migrations/
│  │     └── 001_initial.ts
│  └── index.ts
├── tests/
│  ├── auth.test.ts
│  ├── payments.test.ts
│  └── tickets.test.ts
├── .env.example
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── jest.config.js
├── README.md
└── Dockerfile
```

### Example: Configuration File Generated

```env
# Application
NODE_ENV=development
PORT=3000
APP_NAME=my-api
APP_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/my_api_db

# Authentication
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=24h
REFRESH_TOKEN_SECRET=your-refresh-secret
REFRESH_TOKEN_EXPIRES_IN=7d

# Payments (Stripe)
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Tickets (Jira)
JIRA_URL=https://company.atlassian.net
JIRA_API_TOKEN=your-jira-token
JIRA_PROJECT_KEY=PROJ

# Email (for auth flows)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

---

**Document Status:** Ready for Technical Review
**Next Steps:** Stakeholder review and approval before Phase 1 kickoff
