# PRD-03: Agent Hiring Workflow

**Status:** Partially Implemented
**Data:** 2026-03-18

## Objective

Define the internal hiring workflow used when one agent requests that the company hire a new permanent agent.

This workflow should behave like a simplified internal HR process:

- one agent requests a new hire
- the hiring workflow validates whether the company can afford the process
- the workflow creates the new agent
- the workflow creates the first execution contract for that agent
- the workflow instantiates the hired agent in the runtime

## Scope

This PRD covers:

- the hiring request
- the hiring workflow itself
- initial agent creation
- first contract creation
- GitHub App provisioning for the hired agent
- runtime instantiation of the hired agent

This PRD does not cover:

- company cash ledger design in detail
- contract pacing rules in detail
- tools by role/function
- permissions
- advanced provisioning policies

Related documents:

- `PRD-08: Company Cash Ledger`
- `PRD-34: Agent Operating Budget`

## Core Idea

Hiring a new agent is not only agent creation.
It is a company workflow that includes:

- paying for the hiring process itself
- creating the hired agent
- creating the first renewable weekly execution contract
- making the agent available in the runtime

The requesting agent does not decide technical provisioning details.
It requests a role/function and a weekly amount the company is willing to pay.
The hiring workflow handles the rest.

## Hiring Request Input

The requesting agent provides:

- the function/professional type needed
- the weekly amount the company is willing to pay
- optional additional context for the hiring workflow

The requesting agent does not provide:

- tools
- provider list
- direct provisioning instructions
- low-level runtime configuration

The workflow should derive the rest.

## Main Flow

### 1. Receive Hiring Request

An internal agent asks the hiring workflow to hire a new permanent agent.

Input includes:

- requested function
- weekly contract amount
- optional additional hiring context

### 2. Check Hiring Process Affordability

Before continuing, the system checks whether the company can afford the hiring process itself.

This is separate from the future weekly contract budget.

### 3. Create the Hired Agent Prompt

The workflow generates the system prompt for the hired agent.

This prompt should be based on:

- the requested function
- the hiring context
- the company's internal conventions

This is part of the hiring process itself and can generate LLM cost.

### 4. Create the Agent Record

The workflow creates the hired agent record in the company registry.

This is the moment where the new agent becomes a formal company entity.

### 5. Create the First Contract

The workflow creates the first weekly execution contract for the hired agent.

Rules:

- weekly amount is mandatory
- auto-renew starts as `true`

The hiring workflow does not fund this contract.

Contract funding and budget capture belong to the contract process defined in `PRD-34`.

### 6. Register Hiring Process Cost

The workflow records only the financial cost of the hiring process itself.

It does not register contract funding.

### 7. Instantiate the Hired Agent

After the record and first contract exist, the workflow instantiates the hired agent in the runtime.

The current likely direction is:

- a singleton/registry in memory with the active instantiated agents

This registry is specifically for hired internal collaborators.

It is not a global registry for every possible agent instance in the system.

Rules for the first version:

- all internal collaborators stored in the agent table are instantiated on application boot
- hiring adds the new internal collaborator to this registry
- termination removes the internal collaborator from this registry

This runtime detail can evolve later, but for now the workflow is responsible for making the hired agent available after successful hiring.

## Financial Boundary

This workflow depends on two other systems:

### PRD-08

Responsible for:

- recording company cash movements
- current balance
- future obligations

### PRD-34

Responsible for:

- the agent execution contract
- contract budget capture/funding
- contract budget consumption
- pacing of future execution steps

This PRD only coordinates the hiring event that connects those systems.

## Data Model Direction

This PRD should not introduce a separate financial model.

It should rely on:

- company ledger records from `PRD-08`
- execution contracts from `PRD-34`
- agent registry records from the agent system

Expected business objects involved in the workflow:

- hiring request
- agent record
- first execution contract
- ledger entry for hiring process cost

## Initial Provisioning

The hiring workflow is responsible for initial provisioning, but the requester does not control that provisioning directly.

For the current implementation, the practical result is still small:

- create the hired agent
- provision a pending GitHub App integration for it
- instantiate it in the runtime
- make it available for internal communication

Current provisioning direction includes:

- GitHub App provisioning flow for source control integration
- Migadu mailbox provisioning for agent email

These should be derived by the workflow, not manually specified by the hiring requester.

For the current GitHub direction, the first version provisions a pending GitHub App integration and returns a registration URL so the app can be created and installed for that hired agent.

For email, the chosen direction is a real mailbox per agent using Migadu, provisioned by API during hiring and stored in encrypted agent provider storage for the runtime email provider.

## Cost Recording Rule

The workflow should only register financial cost after a real cost-generating operation has effectively happened.

The simple rule for now is:

- if a costly LLM operation actually ran, its cost is recorded
- if the process fails before any real costly operation happened, there is nothing to record yet

The current understanding is that the only meaningfully costly external part of this workflow is the LLM work involved in the hiring process itself.
The rest is mostly internal system work.

This cost should be registered only as a financial movement.

It should not be recorded in `agent_execution_steps`, because that table is reserved for agent execution only and the hiring workflow is not an agent.

## Design Rules

- Hiring creates both the agent and the first contract.
- Weekly amount is mandatory at hiring time.
- New hired agents start with `autoRenew = true`.
- Hiring process cost belongs to the hiring workflow.
- Contract funding does not belong to the hiring workflow.
- Hiring workflow cost is recorded only as a financial movement.
- Requesters describe the professional function needed, not the technical provisioning details.
- Tool assignment and role-capability mapping do not belong in this PRD.

## Summary

This PRD defines hiring as a company workflow, not just a technical agent creation step.

The workflow receives a hiring request, checks affordability for the hiring process itself, generates the hired agent prompt, creates the agent record, creates the first renewable weekly contract, records the hiring process cost, and makes the hired agent available in the runtime.

This keeps hiring aligned with both the financial model of the company and the execution contract model of the hired agent without mixing the hiring workflow with the contract funding process.

## Implementation Status

Implemented today:

- internal hiring workflow exists in the Forge app
- workflow input already matches the business shape:
  - `requestedFunction`
  - `additionalContext?`
  - `weeklyBudgetUsd`
- the workflow generates the hired agent system prompt through a dedicated RH LLM step
- the RH generation cost is recorded in the company cash ledger
- the workflow creates:
  - the agent record
  - the first weekly execution contract with `autoRenew = true`
- the workflow instantiates the hired agent in the in-memory internal agent registry
- the workflow provisions a Migadu mailbox for the hired agent
- the workflow stores the mailbox runtime credentials in encrypted agent provider storage
- the workflow depends on `MIGADU_API_USER` and `MIGADU_API_KEY` in the app env
- the workflow provisions a pending GitHub App integration for the hired agent
- the workflow returns:
  - `emailAddress`
  - `githubAppRegistrationUrl`

Current implementation notes:

- the RH prompt generation currently uses a dedicated temporary internal RH agent with:
  - `model = account-oauth/openai-codex/gpt-5.4-mini`
- the first contract is created unfunded
- contract funding remains owned by the contract runtime from `PRD-34`
- hiring must happen inside the running Forge app process because it mutates the live in-memory agent registry

Still pending:

- richer hiring logic beyond the current prompt-generation step
- broader provisioning derived from the requested function
