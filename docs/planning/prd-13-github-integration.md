# PRD-13: GitHub Integration

**Status:** Planning

**Note:** This is a personal project from a solo developer. Built with KISS (Keep It Simple, Stupid) and YAGNI (You Aren't Gonna Need It) principles in mind.

---

## 1. Overview

Enable agents to read/write GitHub repositories, create commits, open PRs, and respond to GitHub events via webhooks.

**Core capabilities:**
- Read files from repositories
- Create commits
- Create branches and PRs
- Respond to GitHub webhook events

---

## 2. Use Cases

### 2.1 Create Repository
Agent provisions a new GitHub repository under authenticated organization/account.

### 2.2 Push Code
Agent commits code to repository (new commits, push changes).

### 2.3 Open Pull Request
Agent creates pull request with generated code/changes.

### 2.4 Listen to Events
Agent receives GitHub push/PR/issue events via webhooks.

---

## 3. Core Tools

**Repository Management:**
- `createRepository(name, description)` — Create new repo
- `readFile(repo, path)` — Read file from repo
- `writeFile(repo, path, content)` — Create/update file

**Commits & Branches:**
- `createBranch(repo, branchName, fromBranch)` — New branch
- `createCommit(repo, branch, message, changes)` — Create commit
- `createPullRequest(repo, fromBranch, toBranch, title, body)` — Open PR

**Events:**
- Webhook at `/webhook/github/{agentId}` receives push/PR/issue events
- Agent processes via `listQueuedEvents()` and `processWebhookEvent(eventId)`

---

## 4. Storage

Simple database schema:

- `github_repos` — repo_id, agent_id, repo_name, repo_url, github_org, created_at
- `github_credentials` — cred_id, agent_id, access_token (encrypted), scope

---

## 5. Authentication

Agents provide GitHub personal access token with repository scopes:
- `repo` — Full control of private repositories
- `workflow` — Full control of GitHub Actions workflows
- `webhooks` — Manage webhooks

Credentials stored encrypted in database.

---

## 6. Implementation

- **Week 1:** GitHub API client + repo/file read/write operations
- **Week 2:** Commit/branch/PR operations
- **Week 3:** Webhook integration + tests

---

## 7. Out of Scope

- GitHub Actions configuration
- Issue/PR review workflows
- Advanced Git operations
- GitHub Apps (use personal tokens only)
- Team/organization management
- Branch protection rules
- Code search/querying
- Release management

---

**Document Version:** 0.1 (Simplified)
**Last Updated:** 2026-03-15
