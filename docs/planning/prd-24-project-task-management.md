# PRD-24: GitHub Work Organization

> Status: planned. This document does not describe implemented behavior unless explicitly stated.

**Status:** Planned
**Classification:** FORGE APP

## 1. Goal

Use **GitHub** itself as the work organization system for agents.

The first version should use:

- repositories as the top-level work containers
- issues for task and ticket tracking
- comments for discussion and progress updates
- labels and milestones when useful

This PRD is about:

- organizing agent work through GitHub
- using the identities and webhooks that already exist in the GitHub integration
- expanding the GitHub tool surface for issue-centered work

This PRD is not about:

- integrating Linear
- building a local issue/project system in Forge
- introducing new project/task tables

## 2. Core Direction

The simplest direction is:

- `1 repository = 1 project`
- GitHub remains the source of truth for work items
- agents use their existing GitHub app identity
- Forge receives GitHub webhook events and wakes the right agent

This keeps the whole flow in the same platform that already owns:

- repositories
- branches
- pull requests
- code review

## 3. Identity Model

No new identity model is needed.

Agents already have:

- their own GitHub App identity
- repository access
- webhook handling

That same identity should now also own:

- issue creation
- issue updates
- issue comments
- milestone and label usage where appropriate

## 4. Repository Assumption

The first version assumes:

- work is organized per repository
- each repository is its own project boundary

This means we do not need:

- organization-level project modeling in Forge
- local mappings between repositories and projects

## 5. Work Item Direction

The first version should use **issues** as the core work item.

Issues should cover:

- research tasks
- development tasks
- bugs
- support follow-up
- coordination between agents

Comments on issues should be the main place for:

- updates
- reasoning summaries
- handoff notes

## 6. Tool Surface Direction

The GitHub surface should be condensed by entity.

Rules:

- `list_*` returns subitems when relevant
- `get_*` also returns subitems when relevant
- `manage_*` owns `create | update | delete`
- reciprocal state changes use `toggle_*`
- subitems can be truncated when large

Planned GitHub surface:

1. `get_github_git_credentials`
   - remains separate because it is credential generation, not entity CRUD

2. `list_github_repositories`
   - returns repositories with optional embedded subitems:
     - issues
     - pull requests
     - labels
     - milestones

3. `get_github_repository`
   - returns one repository with the same embedded subitem direction

4. `manage_github_repository`
   - `action: create | update | delete`

5. `list_github_issues`
   - returns issues with embedded subitems when requested:
     - comments
     - labels
     - milestone
     - assignees

6. `get_github_issue`
   - returns one issue with the same embedded subitem direction

7. `manage_github_issue`
   - `action: create | update | delete`

8. `toggle_github_issue`
   - `state: open | closed`

9. `manage_github_issue_comment`
   - `action: create | update | delete`

10. `list_github_pull_requests`
    - returns pull requests with embedded subitems when relevant

11. `get_github_pull_request`
    - returns one pull request with embedded subitems when relevant

12. `manage_github_pull_request`
    - `action: create | update | delete`

13. `list_github_labels`
14. `get_github_label`
15. `manage_github_label`
    - `action: create | update | delete`

16. `list_github_milestones`
17. `get_github_milestone`
18. `manage_github_milestone`
    - `action: create | update | delete`

## 7. Webhook Direction

The existing GitHub adapter-specific webhook model should be reused.

Relevant events for work organization:

- `issues`
- `issue_comment`
- `pull_request`
- `pull_request_review`
- `push`

Relevant events should continue to become:

- `agent_notifications`
- `wakeQueue` triggers

No new webhook system is required for this PRD.

## 8. Forge Data Model Direction

No new local schema should be introduced for work tracking in the first version.

Forge should not create:

- `projects`
- `tasks`
- `issues`
- `issue_comments`

GitHub already owns this data.

Forge should only:

- expose the operational tools
- react to webhook events
- create notifications

## 9. Tool Volume Direction

As the GitHub tool surface grows, the agent runtime should avoid injecting every tool into every turn upfront.

The recommended direction is to adopt Mastra's `ToolSearchProcessor` so the agent can:

- search tools
- load the relevant tool on demand

This is a good fit now because the total number of tools across:

- GitHub
- Coolify
- communication
- notifications
- micro ERP

is already becoming large.

Reference:

- [ToolSearchProcessor](https://mastra.ai/reference/processors/tool-search-processor)

## 10. Design Rules

- GitHub is the source of truth for work items
- one repository is treated as one project boundary
- no local issue/project schema is introduced
- issue/repository/PR tools stay provider-specific but should be grouped by entity
- webhook handling stays inside the existing GitHub adapter model
- agent identity stays the GitHub App identity already in use
- tool search should be preferred once the expanded GitHub work tools are added

## 11. Success Criteria

- agents can organize work through GitHub issues
- agents can comment and update progress inside GitHub
- webhook events continue to wake the right agent
- no extra planning/task schema is introduced in Forge
- the system stays inside the GitHub platform already in use
