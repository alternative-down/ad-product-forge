# PRD-15: Domain Management

**Status:** Planning

**Note:** This is a personal project from a solo developer. Built with KISS (Keep It Simple, Stupid) and YAGNI (You Aren't Gonna Need It) principles in mind.

---

## 1. Overview

Automatic subdomain provisioning for deployed agent applications. Each deployed app gets a unique subdomain under a wildcard domain configuration.

**Core flow:**
1. Agent deploys application
2. Domain system creates unique subdomain
3. DNS A record points to Hetzner IP
4. Wildcard TLS certificate covers subdomain
5. App accessible at unique URL

---

## 2. Use Cases

### 2.1 New Agent Deployment
Agent deploys → domain system auto-creates subdomain → app accessible at unique URL.

### 2.2 Subdomain Management
List, get status, delete subdomains for agents.

### 2.3 DNS Status Check
Query if DNS resolves correctly, certificate validity.

---

## 3. Core Concepts

**Wildcard Domain:** Single domain (domain.com) with wildcard DNS record (*.domain.com) pointing to Hetzner IP.

**Subdomain:** Unique DNS name per agent app (e.g., agent-sales-01.domain.com). Auto-created on deployment.

**DNS Provider:** Cloudflare or Route53 for API-based record management.

**SSL Certificate:** Wildcard certificate (*.domain.com) covers all subdomains.

---

## 4. Tools

**Subdomain Management:**
- `createSubdomain(agentId)` — Create subdomain, return FQDN
- `getSubdomain(agentId)` — Get subdomain details
- `deleteSubdomain(agentId)` — Delete subdomain

**DNS Status:**
- `getDnsStatus(subdomain)` — Check if DNS resolves, certificate expiry
- `updateDnsRecord(subdomain, ip)` — Update DNS A record (for IP changes)

---

## 5. Storage

Simple database schema:

- `domain_config` — primary_domain, dns_provider, hertzner_server_id, hertzner_ip, api_key (encrypted)
- `subdomains` — subdomain_id, agent_id, subdomain, fqdn, status, created_at
- `certificates` — cert_id, domain, expires_at, created_at

---

## 6. Implementation

- **Week 1:** DNS provider API client + subdomain creation
- **Week 2:** Certificate provisioning via Let's Encrypt
- **Week 3:** Hetzner IP polling + DNS updates + tests

---

## 7. Out of Scope

- Multiple domain registrars
- DNS failover to secondary provider
- Advanced monitoring dashboards
- DNSSEC signing
- Multi-cloud DNS management
- Domain renewal automation (initial setup only)
- Custom domain support per agent

---

**Document Version:** 0.1 (Simplified)
**Last Updated:** 2026-03-15
