# PRD-05: Implantação de Aplicações

**Status:** Planejamento

**Nota:** Este é um projeto pessoal de um desenvolvedor solo. Construído com os princípios KISS (Keep It Simple, Stupid) e YAGNI (You Aren't Gonna Need It) em mente.

---

## Objetivo

Permitir que agentes de desenvolvimento façam deploy autônomo de aplicações da empresa (ad-product-forge) para Coolify (auto-hospedado em Hetzner), com URLs de subdomínio gerado automaticamente. Os agentes geram código, fazem deploy em nome da empresa via API Coolify, e agentes de operações monitoram o status.

---

## Requisitos Funcionais

**FR1: Fazer Deploy de Aplicação**
- Agente fornece: nome da app, repositório Git, Dockerfile
- Sistema retorna: ID de deployment, URL completa, status
- Subdomínio único é criado automaticamente (ex: `https://app-{nome}.domain.com`)

**FR2: Monitorar Status de Deployment**
- Agente consulta status via `getDeploymentStatus(deploymentId)`
- Retorna: estado atual (building, deploying, running, failed), logs, mensagens de erro

**FR3: Remover Aplicação**
- Agente invoca `deleteApplication(deploymentId)`
- Sistema para container, remove app do Coolify, marca como deletada

**FR4: Integração com Gerenciamento de Domínio**
- Na criação do deployment, sistema:
  - Cria subdomínio único via sistema de gerenciamento de domínios
  - Aponta para IP da instância Coolify
  - Retorna FQDN ao agente
  - Certificado SSL wildcard cobre o subdomínio

---

## Arquitetura

```
Agente de Desenvolvimento
        ↓
   deployApplication()
        ↓
API Coolify + Gerenciador de Domínios
        ↓
   [Build Docker]
   [Deploy Container]
   [Criar Subdomínio]
        ↓
URL Acessível + ID Deployment
        ↓
Agente de Operações monitora via getDeploymentStatus()
```

---

## Schema do Banco de Dados

**Tabela: deployments**
- `deployment_id` — Identificador único
- `agent_id` — Qual agente fez o deploy
- `app_name` — Nome da aplicação
- `repo_url` — URL do repositório Git
- `status` — Estado atual (building, deploying, running, failed)
- `subdomain` — Subdomínio atribuído (ex: app-invoice-1)
- `coolify_app_id` — ID da app no Coolify
- `deployed_at` — Timestamp do deployment

---

## Decisões Técnicas

1. **Apenas Coolify:** Suportar somente Coolify como alvo de deployment. Sem multi-cloud.
2. **Subdomínio Automático:** Sistema gera subdomínios únicos baseado em nome da app + timestamp para evitar conflitos.
3. **Estados Simples:** Quatro estados básicos (building, deploying, running, failed) sem transições complexas.
4. **SSL Wildcard:** Certificado wildcard cobre todos os subdomínios, sem provisioning individual.

---

**Versão do Documento:** 0.1 (Simplificado)
**Última Atualização:** 2026-03-15
