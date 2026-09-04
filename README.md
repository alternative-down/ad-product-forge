# AD Product Forge

AD Product Forge is a monorepo for running persistent AI agents as an operational team. It includes the agent service, a human administration interface, and reusable runtime packages.

## Components

- `apps/forge`: backend, agent orchestration, persistence, integrations, schedules, memory, and administrative API.
- `apps/forge-admin`: browser-based administration interface.
- `packages/agent-runtime-core`: generic step-based agent runtime.
- `packages/forge-runtime-core`: Forge-specific runtime capabilities shared by the applications.

## Requirements

- Node.js 20 or newer
- npm 10.9.4 or compatible

## Setup

```bash
npm ci
```

Create the required environment configuration before starting the backend. The application validates required values during startup.

## Development

```bash
npm run dev
npm run typecheck
npm run test
npm run lint
npm run build
```

Commands run across the npm workspaces through Turbo. Individual workspaces can be targeted with `npm run -w <workspace> <script>`.

## Production

Build and start the Forge backend with:

```bash
npm run -w forge-app build
npm run -w forge-app start
```

The standalone backend build compiles its runtime workspace dependencies before producing `apps/forge/dist/main.js`.

## Repository guidance

Automation working in this repository must read [AGENTS.md](./AGENTS.md). Runtime-facing Markdown stored under bundled skills and the Forge system prompt is application data and should be treated as source code.
