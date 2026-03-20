# PRD-15: Agent Email Integration

**Status:** Implemented
**Date:** 2026-03-19

## Objective

Give each hired internal agent a dedicated email address under the company domain.

The system must be able to:
- create the mailbox when the agent is hired
- store the mailbox credentials securely
- use the mailbox to send and receive email
- remove the mailbox when the agent is terminated

## Provider Decision

The chosen provider is **Migadu**.

Reasoning:
- supports custom domains
- supports real mailboxes, not only forwarding
- exposes API endpoints for mailbox management
- supports IMAP and SMTP
- is a good fit for many internal agent mailboxes at low cost

This means the first version keeps the email runtime as a real mailbox integration.
It does not switch to an email-webhook-only architecture.

## What Email Means In This System

For this project, an agent email account is a normal mailbox:
- address, such as `agent-name@company-domain.com`
- inbound mail received by the provider
- outbound mail sent through SMTP
- mailbox contents read through IMAP

Basic concepts:
- `domain`: the company email domain
- `mailbox`: the actual inbox for one address
- `MX`: DNS record that tells the internet which provider receives mail for the domain
- `IMAP`: protocol used to read the mailbox
- `SMTP`: protocol used to send mail
- `alias`: an address that forwards mail, but is not necessarily a real mailbox

The chosen model is **real mailbox per agent**, not alias-only forwarding.

## Scope

This PRD covers:
- provider choice for agent mailboxes
- mailbox lifecycle for hired internal agents
- secure storage of mailbox credentials
- how the email provider fits the current runtime

This PRD does not cover:
- marketing email campaigns
- email templates
- newsletter tooling
- replacing the communication model with email-only webhooks

## Provisioning Model

### On Hiring

When a new internal agent is hired, the hiring flow should also:
- create a Migadu mailbox for the agent
- generate or assign mailbox credentials
- persist those credentials in encrypted agent provider storage
- make the mailbox available to the email communication provider runtime

The mailbox should be derived by the system.
The hiring requester does not manually specify SMTP/IMAP details.

### On Termination

When the internal agent is terminated, the termination flow should also:
- delete the Migadu mailbox for that agent
- remove the encrypted email provider credentials from local storage
- stop the local email provider runtime for that agent

## Runtime Direction

The current runtime direction remains:
- inbound email through IMAP
- outbound email through SMTP
- email integrated as a communication provider

This fits Migadu well and avoids adding a second architectural model right now.

If later the provider or product direction changes, inbound email can be redesigned around webhooks.
That is out of scope for this phase.

## Storage Boundary

Mailbox credentials do **not** belong in communication `accounts`.

Boundary:
- communication `accounts` = identity records for messaging providers and contacts
- encrypted `agent_providers` storage = per-agent runtime credentials such as the actual mailbox login used by the email provider

The Migadu admin credential stays in app env and the mailbox credentials used by one agent belong in `agent_providers`.

## Expected Credential Shape

The encrypted email provider record should contain at least:
- IMAP host
- IMAP port
- IMAP secure flag
- SMTP host
- SMTP port
- SMTP secure flag
- mailbox address
- mailbox password

The runtime should derive the communication account identity from the mailbox address, not expose the secret configuration to the agent.

## Relationship With Other PRDs

- `PRD-03`: hiring should provision the mailbox
- `PRD-04`: termination should delete the mailbox
- `communication-module.md`: email remains a communication provider

## Summary

The company will use Migadu as the agent email provider.

Each hired internal agent should receive a real mailbox on the company domain. The mailbox is provisioned during hiring, used by the email communication provider through IMAP/SMTP, stored in encrypted agent provider storage, and deleted during termination.

This keeps email simple, operational, and aligned with the current communication runtime.


## Implementation Status

Implemented today:
- Migadu mailbox provisioning is wired into the internal hiring workflow
- a hired agent now gets a real mailbox before runtime instantiation finishes
- mailbox credentials are stored in encrypted `agent_providers` storage under the existing `email` provider record
- termination now deletes the Migadu mailbox before local cleanup continues
- the runtime email provider continues to use IMAP and SMTP with the stored mailbox credentials

Current implementation notes:
- hiring requires `MIGADU_API_USER` and `MIGADU_API_KEY` in the app env
- existing seeded internal agents are not retroactively given mailboxes
- inbound email still uses IMAP IDLE, not webhooks

Bootstrap direction:
- the runtime uses `MIGADU_API_USER` and `MIGADU_API_KEY` from the app env for provisioning
