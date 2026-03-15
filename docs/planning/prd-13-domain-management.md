# PRD-15: Domain Management

**Status:** Planning

**Note:** This is a personal project from a solo developer. Built with KISS (Keep It Simple, Stupid) and YAGNI (You Aren't Gonna Need It) principles in mind.

---

## 1. Overview

### Classification: AD-PRODUCT-FORGE APPLICATION

**This PRD describes domain management infrastructure specific to ad-product-forge.** Automatic subdomain provisioning enables Nicolas' agents to launch applications with unique, publicly accessible URLs without manual DNS management. This is application-specific infrastructure for autonomous product deployment.

Automatic subdomain provisioning for deployed agent applications. Each deployed app gets a unique subdomain under a wildcard domain configuration.

**Core flow (for ad-product-forge):**
1. Development agents deploy applications
2. Domain system automatically creates unique subdomain
3. DNS A record points to Hetzner IP
4. Wildcard TLS certificate covers subdomain
5. App accessible at unique URL (e.g., agent-sales-tool.domain.com)

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
- `createSubdomain(appName)` — Create subdomain, return FQDN
- `deleteSubdomain(subdomain)` — Delete subdomain

---

## 5. Storage

Simple database schema:

- `domain_config` — primary_domain, dns_provider, hetzner_ip, api_key (encrypted)
- `subdomains` — subdomain_id, subdomain, fqdn, status, created_at

---

## 6. Implementation

- **Week 1:** DNS provider API client + subdomain CRUD operations
- **Week 2:** Certificate provisioning via Let's Encrypt
- **Week 3:** Integration tests + error handling

---

## 7. Out of Scope

- Multiple domain registrars
- DNS failover to secondary provider
- Advanced monitoring dashboards
- DNSSEC signing
- Multi-cloud DNS management
- Domain renewal automation
- Custom domain support per agent
- IP change monitoring/failover
- Certificate renewal automation (Let's Encrypt handles this)
- TTL management

---

**Document Version:** 0.1 (Simplified)
**Last Updated:** 2026-03-15
