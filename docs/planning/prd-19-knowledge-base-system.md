# PRD-19: Sistema de Base de Conhecimento

**Status:** Planejamento

**Data:** 2026-03-15

**Nota:** Este é um projeto pessoal de um desenvolvedor solo. Construído com princípios KISS (Keep It Simple, Stupid) e YAGNI (You Aren't Gonna Need It) em mente.

---

## Resumo Executivo

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Usar o workspace do Mastra para fornecer base de conhecimento compartilhada** com embeddings, busca semântica e GraphRAG. Aproveitar infraestrutura existente do Mastra em vez de construir sistema próprio.

**Objetivo:** Fornecer aos agentes uma base de conhecimento compartilhada, integrada ao ERP, que permita embeddings, busca semântica full-text e GraphRAG.

---

## Problema

- Agentes precisam de base de conhecimento compartilhada
- Necessidade de busca semântica e embeddings
- Memória institucional entre agentes

---

## Solução

Aproveitar o **workspace do Mastra** que já fornece:
- Acesso a arquivos
- Embeddings
- Busca semântica
- Suporte a GraphRAG

**Abordagem:**
- Usar workspace como base de conhecimento
- Path compartilhado entre agentes (pasta/storage unificado)
- Integração com embeddings e busca semântica
- GraphRAG para análise relacional de conhecimento

---

## Arquitetura

- **Armazenamento:** Workspace do Mastra
- **Embeddings:** Modelo de embeddings do Mastra
- **Busca:** Semântica + full-text
- **Análise:** GraphRAG para relações entre documentos
- **Integração:** ERP como backend de persistência de metadados

---

## Critérios de Sucesso

- [ ] Agentes conseguem armazenar documentos no workspace
- [ ] Busca semântica funciona
- [ ] GraphRAG consegue mapear relações
- [ ] Metadados persistem no ERP
- [ ] Acesso compartilhado entre agentes

---

## Dependências

- Mastra workspace
- ERP (PRD-22)
- Modelo de embeddings

---

**Histórico do Documento:**
- v1.0 (2026-03-15): Abordagem via Mastra workspace com embeddings e GraphRAG
