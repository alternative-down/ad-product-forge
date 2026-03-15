# PRD-16: Integração com GitHub

**Status:** Planejamento

**Nota:** Este é um projeto pessoal de um desenvolvedor solo. Construído com princípios KISS (Keep It Simple, Stupid) e YAGNI (You Aren't Gonna Need It) em mente.

---

## 1. Visão Geral

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de integração específica do ad-product-forge.** A integração com GitHub permite que agentes de desenvolvimento autônomos de Nicolas gerenciem repositórios de código, criem pull requests e respondam a eventos de repositório. Esta é infraestrutura específica da aplicação para fluxos de trabalho de desenvolvimento autônomo.

Permitir que agentes leiam/escrevam repositórios GitHub, criem commits, abram PRs e respondam a eventos GitHub via webhooks.

**Capacidades principais (para ad-product-forge):**
- Agentes de desenvolvimento leem/escrevem código da aplicação
- Criam commits para novos recursos e correções
- Criam branches e PRs para revisão de código
- Respondem a eventos GitHub (push, PR, issue) via webhooks
- Gerenciam repositórios sob a organização GitHub de Nicolas

---

## 2. Casos de Uso

### 2.1 Criar Repositório
Agente provisiona um novo repositório GitHub sob organização/conta autenticada.

### 2.2 Fazer Push de Código
Agente faz commit de código para repositório (novos commits, push de alterações).

### 2.3 Abrir Pull Request
Agente cria pull request com código/alterações geradas.

### 2.4 Escutar Eventos
Agente recebe eventos GitHub push/PR/issue via webhooks.

---

## 3. Ferramentas Principais

**Gerenciamento de Repositório:**
- `readFile(repo, path)` — Ler arquivo do repositório
- `writeFile(repo, path, content)` — Criar/atualizar arquivo
- `listFiles(repo, path)` — Listar arquivos do repositório

**Commits & Branches:**
- `createCommit(repo, branch, message, files)` — Criar commit
- `createPullRequest(repo, title, body, changes)` — Abrir PR para main

**Eventos:**
- Webhook recebe eventos GitHub
- Agente processa via `listQueuedEvents()` e `processWebhookEvent(eventId)`

---

## 4. Armazenamento

Configuração simples:

- Token de acesso pessoal GitHub armazenado em variáveis de ambiente (não banco de dados)
- Agente mantém contexto único de repositório padrão

---

## 5. Autenticação

Token de acesso pessoal GitHub via variáveis de ambiente:
- `repo` — Controle total de repositórios privados
- `webhooks` — Gerenciar webhooks

---

## 6. Implementação

- **Semana 1:** Cliente da API GitHub + operações de ler/escrever/commit de arquivo
- **Semana 2:** Criação de PR + integração com webhook
- **Semana 3:** Tratamento de erro + testes

---

## 7. Fora do Escopo

- Criação de repositório (usar UI do GitHub)
- Configuração do GitHub Actions
- Fluxos de trabalho de revisão de issue/PR
- Operações Git avançadas
- Gerenciamento de equipe/organização
- Regras de proteção de branch
- Busca/consulta de código
- Gerenciamento de release
- Suporte a múltiplos repositórios por agente

---

**Versão do Documento:** 0.1 (Simplificado)
**Última Atualização:** 2026-03-15
