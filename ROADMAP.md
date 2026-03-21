# Roadmap

This roadmap is intentionally short and tied to the current documentation structure.

For implementation truth, use `docs/current/`.
For future design directions, use `docs/planning/`.

## Current implemented foundation

The current foundation is already in place for:

- persistent internal agents
- runtime loading from database
- hiring and termination workflows
- function/role capability control
- internal chat, Discord, and agent email
- GitHub App per agent
- GitHub work organization through repositories, issues, and pull requests
- Coolify operations
- schedules and heartbeat
- execution contracts and cash ledger
- notifications and wake queue

## Next business-critical gaps

These are the most obvious missing business capabilities after the current foundation:

1. external accounts receivable integration
   - Stripe / Asaas webhooks into the financial system

2. external accounts payable integration
   - first target: infrastructure providers such as Hetzner

3. support and ticket intake for products
   - integrated into Forge as an operational channel

4. public distribution and marketing access
   - social channels, forums, and related posting surfaces

5. creative artifact generation
   - assets required for product promotion and campaigns

## Current planning set

The active future planning set lives in `docs/planning/` and currently includes:

- billing and payment integration
- browser service
- knowledge base
- marketing artifact generation
- marketing platform integration
- GitHub work organization extensions
- secrets management
- social/community integration
- ticketing system
- web application templates
- generic webhook routing

## Rule

This roadmap should stay high-level.

Do not duplicate detailed design material here. Detailed future work belongs in `docs/planning/`. Detailed implemented behavior belongs in `docs/current/`.
