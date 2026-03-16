# PRD-19: Sistema de Base de Conhecimento

**Status:** ❌ Não Alinhado - Interpretação Incorreta
**Data:** 2026-03-15
**Escopo:** Projeto pessoal de desenvolvedor - Princípios KISS & YAGNI

---

## ❌ Nota de Desalinhamento

**Problema:** PRD propõe construir um novo sistema de base de conhecimento, mas Mastra já fornece isso nativamente.

**Intenção Original:**
Aproveitar o workspace/sandbox do Mastra que já tem:
- Acesso a arquivos
- Embeddings
- Busca semântica

Ideia: Montar um Path compartilhado entre todos agentes (pasta compartilhada) usando o próprio workspace do Mastra, só adicionando um Path extra.

**Diferença:** Não precisa de novo PRD de feature. É questão de configuração do workspace Mastra e exposição como tool para agentes.

**Status:** Não é um PRD de desenvolvimento. Será necessário pensar em como expor o workspace compartilhado aos agentes como tool.

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

## Critérios de Sucesso

- [ ] Agente consegue armazenar documentos
- [ ] Agente consegue buscar e recuperar documentos relevantes por significado
- [ ] Embeddings são gerados e armazenados
- [ ] API é acessível de ferramentas de agente

