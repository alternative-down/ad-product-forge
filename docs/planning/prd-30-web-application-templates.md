# PRD — Web Application Templates

**Status:** Planning - Technical Design
**Date:** 2026-03-15
**Scope:** Personal developer project - KISS & YAGNI principles

---

## Executive Summary

### Classification: AD-PRODUCT-FORGE APPLICATION

**This PRD describes code generation infrastructure specific to ad-product-forge.** Application templates enable Nicolas' development agents to autonomously scaffold new products at speed. This is application-specific developer tooling, not framework infrastructure.

Provide pre-built application templates so agents can rapidly scaffold production-ready applications with standard patterns for authentication, database, and deployment.

**Core Goal (for ad-product-forge):** Agents can generate a complete web application in seconds instead of building from scratch. Enables rapid autonomous product development.

---

## Problem Statement

Currently, agents starting new applications must:
- Set up authentication manually
- Configure database connections
- Create boilerplate code
- Set up error handling, logging, deployment

This is time-consuming and repetitive.

**Target Scenarios:**
1. Agent runs: `scaffold create-app --template rest-api --name my-api`
2. Agent gets ready-to-customize REST API with auth and database
3. Agent can deploy immediately

---

## Key Features

### 1. Template Management
```typescript
// List available templates
listTemplates(): Promise<Array<{
  templateId: string;
  name: string;
  description: string;
  framework: string;
  language: string;
}>>;

// Create application from template
createApplication(input: {
  templateId: string;
  appName: string;
  outputPath: string;
  parameters?: Record<string, any>;
}): Promise<{
  success: boolean;
  projectPath: string;
}>;
```

### 2. CLI Interface
```bash
# List templates
agent-scaffold list

# Create new app
agent-scaffold create-app \
  --template rest-api \
  --name my-api \
  --output ./apps/my-api

# Customize template
agent-scaffold configure --app-path ./apps/my-api
```

---

## Core Templates

### Template 1: REST API Backend
- **Stack:** Node.js/Express, TypeScript, SQLite
- **Includes:**
  - Basic CRUD routes
  - Database schema setup
  - Error handling
  - .env template

### Template 2: Full-Stack Web Application
- **Stack:** React, Node.js, SQLite, TypeScript
- **Includes:**
  - Basic login/signup
  - User dashboard
  - Backend API
  - Responsive design (Tailwind)

---

## Template Structure

```
templates/
├── rest-api-backend/
│  ├── template.yml          # Metadata
│  ├── src/
│  │  ├── config/
│  │  ├── routes/
│  │  ├── services/
│  │  ├── db/
│  │  └── index.ts
│  ├── tests/
│  ├── package.json
│  ├── .env.example
│  ├── docker-compose.yml
│  ├── README.md
│  └── hooks/
│     └── setup.sh
```

---

## Implementation

### Phase 1: Foundation (2 weeks)
- [ ] Template engine and CLI
- [ ] REST API Backend template
- [ ] Full-Stack Web template
- [ ] Basic documentation

### Phase 2: Enhancement (Future)
- [ ] Template customization wizard
- [ ] Additional templates

---

## Success Criteria

- [ ] Agent can list templates
- [ ] Agent can generate application in < 10 seconds
- [ ] Generated app is runnable without modifications
- [ ] Templates are well-documented
- [ ] Setup instructions are clear

---

## Risks

- Templates may become outdated as frameworks evolve
- Generated code should follow best practices
- Security must be embedded in templates

---

## Future Enhancements

- Admin dashboard template
- GraphQL API template
- Custom template creation framework
