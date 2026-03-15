# PRD-13: Gerenciamento de Domínio

**Status:** Planejamento

**Nota:** Este é um projeto pessoal de um desenvolvedor solo. Construído com os princípios KISS (Keep It Simple, Stupid) e YAGNI (You Aren't Gonna Need It) em mente.

---

## 1. Visão Geral

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de gerenciamento de domínio específica para ad-product-forge.** Provisionamento automático de subdomínio permite que agentes de Nicolas façam launch de aplicações com URLs exclusivas e publicamente acessíveis sem gerenciamento de DNS manual. Esta é infraestrutura específica da aplicação para deployment de produto autônomo.

Provisionamento automático de subdomínio para aplicações de agentes implantadas. Cada app implantada recebe um subdomínio único sob configuração de domínio wildcard.

**Fluxo principal (para ad-product-forge):**
1. Agentes de desenvolvimento fazem deploy de aplicações
2. Sistema de domínio cria automaticamente subdomínio único
3. Registro A de DNS aponta para IP de Hetzner
4. Certificado TLS wildcard cobre subdomínio
5. App acessível em URL única (ex: app-sales-tool.domain.com)

---

## 2. Casos de Uso

### 2.1 Deploy de Novo Agente
Agente faz deploy → sistema de domínio cria automaticamente subdomínio → app acessível em URL única.

### 2.2 Gerenciamento de Subdomínio
Listar, obter status, deletar subdomínios para agentes.

### 2.3 Verificação de Status de DNS
Consultar se DNS resolve corretamente, validade de certificado.

---

## 3. Conceitos Principais

**Domínio Wildcard:** Domínio único (domain.com) com registro de DNS wildcard (*.domain.com) apontando para IP de Hetzner.

**Subdomínio:** Nome de DNS único por app de agente (ex: app-sales-01.domain.com). Auto-criado em deployment.

**Provedor de DNS:** Cloudflare ou Route53 para gerenciamento de registro baseado em API.

**Certificado SSL:** Certificado wildcard (*.domain.com) cobre todos os subdomínios.

---

## 4. Ferramentas

**Gerenciamento de Subdomínio:**
- `createSubdomain(appName)` — Criar subdomínio, retornar FQDN
- `deleteSubdomain(subdomain)` — Deletar subdomínio

---

## 5. Armazenamento

Schema de banco de dados simples:

- `domain_config` — primary_domain, dns_provider, hetzner_ip, api_key (criptografado)
- `subdomains` — subdomain_id, subdomain, fqdn, status, created_at

---

## 6. Implementação

- **Semana 1:** Cliente de API de provedor de DNS + operações CRUD de subdomínio
- **Semana 2:** Provisionamento de certificado via Let's Encrypt
- **Semana 3:** Testes de integração + tratamento de erros

---

## 7. Fora do Escopo

- Múltiplos registradores de domínio
- Failover de DNS para provedor secundário
- Dashboards de monitoramento avançado
- Assinatura DNSSEC
- Gerenciamento de DNS multi-nuvem
- Automação de renovação de domínio
- Suporte a domínio customizado por agente
- Monitoramento de mudança de IP/failover
- Automação de renovação de certificado (Let's Encrypt lida com isso)
- Gerenciamento de TTL

---

**Versão do Documento:** 0.1 (Simplificado)
**Última Atualização:** 2026-03-15
