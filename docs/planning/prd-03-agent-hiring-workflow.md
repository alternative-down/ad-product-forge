# PRD-03: Agent Hiring Workflow

**Status:** Draft
**Data:** 2026-03-18

## Objective

Define the internal hiring workflow used when one agent requests that the company hire a new permanent agent.

This workflow should behave like a simplified internal HR process:
- one agent requests a new hire
- the hiring workflow validates whether the company can afford the process
- the workflow creates the new agent
- the workflow creates the first execution contract for that agent
- the workflow funds that contract from company cash
- the workflow instantiates the hired agent in the runtime

## Scope

This PRD covers:
- the hiring request
- the hiring workflow itself
- initial agent creation
- first contract creation
- first contract funding
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
- funding that first contract from company cash
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

### 3. Check First Contract Affordability

Before creating the hired agent, the system checks whether the company can fund the first weekly execution contract.

This first contract:
- is created immediately during hiring
- already starts with `autoRenew = true`

### 4. Generate the Hired Agent Prompt

The workflow generates the system prompt for the hired agent.

This prompt should be based on:
- the requested function
- the hiring context
- the company's internal conventions

This is part of the hiring process itself and can generate LLM cost.

### 5. Create the Agent Record

The workflow creates the hired agent record in the company registry.

This is the moment where the new agent becomes a formal company entity.

### 6. Create the First Contract

The workflow creates the first weekly execution contract for the hired agent.

Rules:
- weekly amount is mandatory
- auto-renew starts as `true`

### 7. Register Cash Movements

The workflow records at least two distinct financial movements:

1. hiring process cost
2. first contract funding

These are separate records and should not be merged.

Their detailed ledger behavior belongs to `PRD-08`.

### 8. Instantiate the Hired Agent

After the record and first contract exist, the workflow instantiates the hired agent in the runtime.

The current likely direction is:
- a singleton/registry in memory with the active instantiated agents

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
- ledger entry for first contract funding

## Initial Provisioning

The hiring workflow is responsible for initial provisioning, but the requester does not control that provisioning directly.

For the first version, the practical result is very small:
- create the hired agent
- instantiate it in the runtime
- make it available for internal communication

Future provisioning may include things such as:
- email account
- GitHub account
- workspace preparation
- seeded files
- additional provider setup

But these should be derived by the workflow, not manually specified by the hiring requester.

## Cost Recording Rule

The workflow should only register financial cost after a real cost-generating operation has effectively happened.

The simple rule for now is:
- if a costly LLM operation actually ran, its cost is recorded
- if the process fails before any real costly operation happened, there is nothing to record yet

The current understanding is that the only meaningfully costly external part of this workflow is the LLM work involved in the hiring process itself.
The rest is mostly internal system work.

## Design Rules

- Hiring creates both the agent and the first contract.
- Weekly amount is mandatory at hiring time.
- New hired agents start with `autoRenew = true`.
- Hiring process cost and first contract funding are separate financial movements.
- Requesters describe the professional function needed, not the technical provisioning details.
- Tool assignment and role-capability mapping do not belong in this PRD.

## Summary

This PRD defines hiring as a company workflow, not just a technical agent creation step.

The workflow receives a hiring request, checks affordability, generates the hired agent prompt, creates the agent record, creates the first renewable weekly contract, records the required cash movements, and makes the hired agent available in the runtime.

This keeps hiring aligned with both the financial model of the company and the execution contract model of the hired agent.
