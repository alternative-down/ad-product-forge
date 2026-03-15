# PRD-07: Serviço de Navegador

**Status:** Planejamento
**Data:** 2026-03-15
**Versão:** 1.0

---

## Nota de Projeto Pessoal

Este é um projeto de desenvolvimento pessoal. Recursos seguem os princípios KISS (Keep It Simple, Stupid) e YAGNI (You Aren't Gonna Need It). Escopo focado em funcionalidade principal para fluxo de trabalho de desenvolvedor solo.

---

## 1. Visão Geral

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de automação de navegador específica para ad-product-forge.** Serviço de navegador permite que agentes de Nicolas interajam com páginas web para pesquisa, coleta de dados e testes. Esta é capacidade específica da aplicação, não infraestrutura do framework.

**Objetivo:** Fornecer agentes com capacidades de automação web e web scraping via serviço de navegador externo.

**Por quê (para ad-product-forge):** Agentes de pesquisa e desenvolvimento de Nicolas precisam interagir com interfaces web, preencher formulários e fazer scraping de conteúdo dinâmico sem restrições de sandbox. Habilita pesquisa de mercado baseada em web e testes.

**Prioridade:** Média
**Timeline:** 2-3 semanas

---

## 2. Problema

- Agentes não conseguem interagir com interfaces web
- Não conseguem fazer scraping de conteúdo renderizado por JavaScript dinâmico
- Automação de navegador em ambientes sandboxed é problemática
- Precisa de infraestrutura de navegador isolada e escalável

---

## 3. Casos de Uso

1. **Agente faz scraping de um site:** Agente navega para site, extrai dados
2. **Agente preenche e submete formulários:** Agente automatiza fluxo de preenchimento de formulário
3. **Agente aguarda conteúdo dinâmico:** Agente aguarda JavaScript renderizar, depois extrai
4. **Agente tira screenshots:** Agente captura estado da página para análise

---

## 4. Requisitos

### Recursos Principais

**FR1: Gerenciamento de Sessão de Navegador**
- Criar novas sessões de navegador sob demanda
- Manter estado de sessão através de múltiplas operações
- Limpeza automática de sessões inativas (timeout: 30 minutos)

**FR2: Navegação de Página & Conteúdo**
- Navegar para URLs
- Recuperar HTML e conteúdo de texto da página
- Obter metadados da página (título, URL, status)

**FR3: Interação com Elementos**
- Clicar elementos por seletor CSS
- Preencher campos de formulário
- Submeter formulários

**FR4: Extração de Conteúdo**
- Consultar elementos por seletor CSS
- Extrair texto e atributos
- Extração básica de dados de tabela

**FR5: Execução de JavaScript**
- Executar JavaScript simples no contexto de página
- Condições básicas de espera

### Ferramentas Voltadas para Agentes

```typescript
createBrowserSession(): Promise<{sessionId}>
closeBrowserSession(sessionId: string): Promise<void>
navigateTo(sessionId: string, url: string): Promise<{url, status, title}>
getPageContent(sessionId: string): Promise<{html, text, url}>
clickElement(sessionId: string, selector: string): Promise<{success}>
fillField(sessionId: string, selector: string, value: string): Promise<{success}>
submitForm(sessionId: string, formSelector?: string): Promise<{success}>
querySelector(sessionId: string, selector: string): Promise<{element}>
querySelectorAll(sessionId: string, selector: string): Promise<{elements}>
executeScript(sessionId: string, script: string): Promise<{result}>
```

---

## 5. Critérios de Sucesso

- Agentes podem navegar para URLs e recuperar conteúdo
- Automação de formulário funciona através de diferentes tipos de formulário
- Web scraping lida com conteúdo dinâmico
- Operações de navegador se completam em <30 segundos
- Sessões propriamente isoladas e limpas
- Serviço lida com requisições concorrentes de múltiplos agentes

---

## 6. Requisitos Não-Funcionais

**Performance:**
- Criação de sessão: <5 segundos
- Navegação: <15 segundos
- Interação com elementos: resposta rápida
- Velocidade de execução razoável para uso de desenvolvedor solo

**Confiabilidade:**
- Isolamento de sessão (sem interferência entre sessões)
- Limpeza apropriada de processos obsoletos
- Lógica básica de timeout e retry

**Segurança:**
- Isolamento de sessão entre agentes
- Validação de entrada (prevenir injeção)
- Tratamento de erros sem expor internals

---

## 7. Arquitetura

### Componentes

1. **Serviço de Navegador Externo** (processo/container separado)
   - Gerencia instâncias de navegador Playwright
   - API HTTP para controle remoto
   - Gerenciamento de ciclo de vida de sessão
   - Roda fora do sandbox

2. **Ferramentas de Navegador Voltadas para Agentes** (em Motor Mastra)
   - Ferramentas de alto nível para agentes
   - Cliente HTTP para serviço de navegador
   - Tratamento de erros e lógica de retry
   - Gerenciamento de timeout

### Arquitetura de Rede

```
Agente (em Motor Mastra)
  ↓
Ferramentas de Navegador
  ↓
Cliente HTTP
  ↓
Serviço de Navegador (Externo)
  ├─ Playwright
```
