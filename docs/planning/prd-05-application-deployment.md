# PRD-05: Implantação de Aplicações

**Status:** Planejamento

**Nota:** Este é um projeto pessoal de um desenvolvedor solo. Construído com os princípios KISS (Keep It Simple, Stupid) e YAGNI (You Aren't Gonna Need It) em mente.

---

## Objetivo

Permitir que agentes de desenvolvimento façam deploy autônomo de aplicações da empresa (ad-product-forge) para Coolify (auto-hospedado em Hetzner), com URLs de subdomínio gerado automaticamente. Os agentes geram código, fazem deploy em nome da empresa via API Coolify, e agentes de operações monitoram o status.

---

## Requisitos Funcionais

**FR1: Fazer Deploy de Aplicação via Workflow**
- Agente invoca workflow de deployment (similar a hireAgent/terminateAgent)
- Entrada: nome da app, repositório Git, Dockerfile
- Mastra workflow executa deployment
- Retorna: ID de deployment, URL completa, status inicial
- Subdomínio único é criado automaticamente (ex: `https://app-{nome}.domain.com`)

**FR2: Monitorar Status de Deployment**
- Agente consulta status via `getDeploymentStatus(deploymentId)`
- Retorna: estado atual (building, deploying, running, failed), logs, mensagens de erro
- Webhook do Coolify atualiza status automaticamente

**FR3: Notificações via Webhook**
- Coolify envia webhook ao completar deployment (sucesso ou erro)
- Webhook inclui: deployment_id, status (success/error), logs resumidos, erro (se houver)
- Sistema atualiza tabela deployments com novo status
- Agente de ops pode ser notificado automaticamente

**FR4: Remover Aplicação**
- Agente invoca deletar via ferramenta ou workflow
- Sistema para container, remove app do Coolify, marca como deletada

**FR5: Integração com Gerenciamento de Domínio**
- Na criação do deployment, sistema:
  - Cria subdomínio único via sistema de gerenciamento de domínios
  - Aponta para IP da instância Coolify
  - Retorna FQDN ao agente
  - Certificado SSL wildcard cobre o subdomínio

---

## Arquitetura

```
Agente de Desenvolvimento invoca workflow
        ↓
Mastra workflow: deployApplication({app_name, repo_url, dockerfile})
        ↓
   API Coolify + Gerenciador de Domínios
        ↓
   [Build Docker]
   [Deploy Container]
   [Criar Subdomínio]
        ↓
URL Acessível + ID Deployment retornado
        ↓
Coolify executa build/deploy
        ↓
Coolify dispara webhook com status (success/error)
        ↓
Sistema recebe webhook, atualiza deployment status
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

## Webhook de Notificação do Coolify

**Endpoint:** `POST /api/webhooks/coolify/deployment`

**Payload recebido do Coolify:**
```json
{
  "deploymentId": "coolify-app-id",
  "deployment_id": "id-deployment-interno",
  "status": "success" | "error",
  "logs": "últimas 500 caracteres do log de build",
  "error": "mensagem de erro (se aplicável)",
  "url": "https://app-nome.domain.com",
  "timestamp": "ISO 8601 timestamp"
}
```

**Ações ao receber webhook:**
1. Validar assinatura de webhook do Coolify
2. Localizar deployment por `deployment_id`
3. Atualizar status em tabela deployments
4. Se error: armazenar mensagem de erro
5. Se success: marcar como running, armazenar URL final
6. Disparar notificação para agente de ops (opcional: via internal chat)

**Adição ao schema deployments:**
- `coolify_webhook_signature` — para validação de webhook (opcional, se Coolify suportar)
- `error_message` — mensagem de erro se deployment falhar
- `completed_at` — timestamp quando deployment se completou
- `final_url` — URL final do app deployado

---

## Decisões Técnicas

1. **Apenas Coolify:** Suportar somente Coolify como alvo de deployment. Sem multi-cloud.
2. **Subdomínio Automático:** Sistema gera subdomínios únicos baseado em nome da app + timestamp para evitar conflitos.
3. **Estados Simples:** Quatro estados básicos (building, deploying, running, failed) sem transições complexas.
4. **SSL Wildcard:** Certificado wildcard cobre todos os subdomínios, sem provisioning individual.

---

**Versão do Documento:** 0.1 (Simplificado)
**Última Atualização:** 2026-03-15
