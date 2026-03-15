# PRD-07: Serviço de Navegador — Investigação Necessária

**Status:** ⚠️ Investigação Necessária - Não Implementado
**Data:** 2026-03-15
**Versão:** 0.1 (Rascunho - Requer Pesquisa)

---

## Nota de Projeto Pessoal

Este é um projeto de desenvolvimento pessoal. Recursos seguem os princípios KISS (Keep It Simple, Stupid) e YAGNI (You Aren't Gonna Need It). Escopo focado em funcionalidade principal para fluxo de trabalho de desenvolvedor solo.

---

## Objetivo (Tentativo)

Permitir que agentes de Nicolas interajam com páginas web para pesquisa, coleta de dados e testes via automação de navegador.

---

## Problema Identificado

- Agentes não conseguem interagir com interfaces web
- Não conseguem fazer scraping de conteúdo renderizado por JavaScript dinâmico
- Automação de navegador em ambientes sandboxed é problemática (Playwright não encontra navegador quando testado em sandbox Mastra)
- Solução ideal ainda desconhecida

---

## O Que Precisa Ser Investigado

### 1. Viabilidade em Sandbox
- [ ] Playwright pode rodar em sandbox Mastra com configuração correta?
- [ ] Qual é a configuração necessária?
- [ ] Existem limitações fundamentais do sandbox que impedem browser automation?

### 2. Soluções Existentes
- [ ] Como **openclaw** implementa browser automation? (referência conhecida que funciona)
- [ ] Qual abordagem eles usam? (sandbox, externo, container, etc)
- [ ] Podemos adaptar a solução deles?
- [ ] Existem outras projetos de code agents que resolvem isso?

### 3. Alternativas Possíveis
- [ ] Serviço externo separado (como descrito no rascunho anterior)
- [ ] Container Docker com Playwright
- [ ] API de browser automation como serviço (BrowserStack, etc)
- [ ] Biblioteca alternativa a Playwright (Puppeteer, Selenium, etc)
- [ ] Abordagem sem navegador (busca por API endpoints em vez de scraping UI)

### 4. Trade-offs de Cada Abordagem
- [ ] Complexidade de implementação
- [ ] Performance
- [ ] Confiabilidade
- [ ] Custo de recursos (CPU, memória)
- [ ] Manutenibilidade

---

## Requisitos Funcionais (Esperados)

Se viável, espera-se:

**FR1: Web Navigation**
- Navegar para URLs
- Recuperar conteúdo (HTML, texto)
- Seguir redirects

**FR2: Web Interaction**
- Clicar elementos
- Preencher formulários
- Submeter dados
- Aguardar conteúdo dinâmico

**FR3: Content Extraction**
- Consultar elementos por CSS/XPath
- Extrair texto e atributos
- Fazer scraping de dados estruturados (tabelas, listas)

**FR4: Session Management**
- Manter cookies/estado entre operações
- Cleanup automático de sessões

---

## Próximos Passos

1. **Investigar openclaw** — Entender como implementam browser automation
2. **Testar Playwright** — Com diferentes configurações de sandbox
3. **Documentar soluções alternativas** — Pesquisar opções
4. **POC (Proof of Concept)** — Testar a abordagem mais promissora
5. **Decidir** — Qual solução seguir

---

## Notas

- Não implementar até investigação ser concluída
- Não usar a solução descrita em versões anteriores (foi inventada sem teste)
- Priorizar baseado no que já funciona (openclaw)
- Considerar simplicidade para solo dev

---

**Status do Documento:** Aguardando Investigação
**Última Atualização:** 2026-03-15
