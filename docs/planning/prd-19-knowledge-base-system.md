# PRD-19: Sistema de Base de Conhecimento

**Status:** Planejamento - Design Técnico
**Data:** 2026-03-15
**Escopo:** Projeto pessoal de desenvolvedor - Princípios KISS & YAGNI

---

## Resumo Executivo

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de gerenciamento de conhecimento específica do ad-product-forge.** A base de conhecimento permite que agentes de Nicolas construam memória institucional e pesquisem por significado. Isto é específico da aplicação, não infraestrutura de framework.

Implementar uma base de conhecimento simples que permita agentes armazenar e recuperar documentos usando busca semântica (baseada em embeddings).

**Objetivo Principal (para ad-product-forge):** Agentes conseguem armazenar documentos de texto e buscar conteúdo relevante por significado, não apenas keywords. Permite agentes de pesquisa construir conhecimento ao longo do tempo.

---

## Declaração do Problema

Atualmente, agentes não conseguem:
- Armazenar e recuperar documentos entre conversas
- Buscar conhecimento por significado (busca semântica)
- Organizar informação para reutilização

**Cenários Alvo:**
1. Agente armazena melhores práticas de cliente e as encontra depois via busca semântica
2. Agente faz upload de documentação de produto e recupera seções relevantes
3. Agente constrói conhecimento institucional que persiste entre conversas

---

## Características Principais

### 1. Armazenamento de Documento
- Armazenar documentos com título e conteúdo
- Suportar conteúdo de texto (markdown, texto simples)

### 2. Busca Semântica
- Converter documentos para embeddings usando Mastra
- Encontrar documentos por similaridade com consulta
- Retornar resultados classificados por relevância

### 3. API de Gerenciamento de Conhecimento
```typescript
// Armazenar documento
storeDocument(input: {
  title: string;
  content: string;
}): Promise<{ documentId: string; }>;

// Buscar documentos
searchDocuments(query: string, limit?: number): Promise<Array<{
  documentId: string;
  title: string;
  content: string;
  similarity: number;
}>>;

// Deletar documento
deleteDocument(documentId: string): Promise<{ success: boolean; }>;
```

---

## Schema do Banco de Dados

**knowledge_base_documents**
```
- documentId (TEXT, PRIMARY KEY)
- title (TEXT, NOT NULL)
- content (TEXT, NOT NULL)
- embedding (BLOB)  -- embeddings armazenados
- createdAt (TEXT, NOT NULL)
```

---

## Implementação

### Fase 1: Core (2 semanas)
- [ ] Armazenamento e recuperação de documento
- [ ] Geração de embedding usando Mastra
- [ ] Busca semântica básica
- [ ] Integração com API de agente

### Fase 2: Aprimoramento (Futuro)
- [ ] Busca de texto completo (BM25)
- [ ] Busca híbrida (semântica + keyword)

---

## Critérios de Sucesso

- [ ] Agente consegue armazenar documentos
- [ ] Agente consegue buscar e recuperar documentos relevantes por significado
- [ ] Embeddings são gerados e armazenados
- [ ] API é acessível de ferramentas de agente

---

## Riscos

- Qualidade de embedding depende de serviço Mastra
- Documentos grandes podem ser lentos para embeddings
- Armazenamento de vetor em SQLite pode não escalar (consegue migrar para DB de vetor depois)

---

## Aprimoramentos Futuros

- Busca híbrida (BM25 + semântica)
- Importação em massa de arquivos
