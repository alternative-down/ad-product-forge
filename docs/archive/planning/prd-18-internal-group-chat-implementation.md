# PRD-18: Suporte a Múltiplos Participantes em Mensagens

> **Nota:** Este é um projeto pessoal para um desenvolvedor solo usando agentes LLM. Simplificado para facilidade e praticidade (KISS + YAGNI).

**Recurso**: Suporte a Múltiplos Participantes em Conversa
**Versão**: 1.0
**Status**: Planejamento
**Última Atualização**: 2026-03-15

---

## 1. Resumo Executivo

### Classificação: FRAMEWORK MASTRA

**Este PRD descreve extensão da infraestrutura de mensagens para suportar múltiplos participantes.** Sistema de mensagens atualmente suporta apenas conversas 1-a-1. Esta extensão permite que uma única conversa tenha múltiplos participantes (1-para-N).

**Objetivo:** Estender schema de `conversations` e `messages` para armazenar múltiplos participantes por conversa, permitindo coordenação multi-agente.

---

## 2. Problema

- **Conversas atuais:** Apenas 1-a-1 (pares de agentes/contatos)
- **Necessidade:** Coordenação multi-agente requer conversas com múltiplos participantes
- **Impacto:** Agentes precisam enviar mensagens para grupos sem usar provedores externos

---

## 3. Solução

Adicionar campo `participants` (array de IDs de agente/contato) ao schema de `conversations`.

### 3.1 Schema de Participants

**Tabela: `conversation_participants`** (nova)
```typescript
conversation_participants {
  conversationId: UUID          // FK -> conversations
  participantId: string         // ID do agente ou contato
  joinedAt: ISO8601            // Quando adicionado
  isActive: boolean            // Ativo na conversa
}
```

**OU adicionar à tabela `conversations`:**
```typescript
conversations {
  conversationId: UUID
  participants: string[]        // Array de IDs (agente1, agente2, agente3)
  // ... campos existentes
}
```

### 3.2 Fluxo de Mensagem

1. Mensagem enviada para `conversationId`
2. Sistema insere `message` com `conversationId`
3. **Todos** os `participants` dessa conversa recebem a mensagem (local na sua DB por agente)
4. Cada agente vê mensagem em sua cópia local da conversa

### 3.3 Gestão de Grupos

**IMPORTANTE:** Gestão de grupo (criar/remover/listar grupos) NÃO é responsabilidade da infraestrutura de mensagens.

Gestão de grupos é implementada como **Tools separadas** que agentes usam, acessando o **provider de chat interno** (PRD-02):
- `createGroup(name, participants)` — Cria conversa com múltiplos participants
- `addMemberToGroup(conversationId, participantId)` — Adiciona participant
- `removeMemberFromGroup(conversationId, participantId)` — Remove participant
- `listGroupMembers(conversationId)` — Lista participants

Essas Tools são disponibilizadas via o provider de comunicação interna para que agentes as usem.

---

## 4. Requisitos Funcionais

**FR1: Persistência de Participants**
- Campo `participants` (array ou tabela separada) armazena IDs de todos os members
- Quando conversa criada, participants registrados
- Quando mensagem enviada, vai para todos os participants

**FR2: Retorno de Mensagens para Múltiplos Destinatários**
- Ao enviar mensagem para conversa com N participants, mensagem chega em todos
- Cada agente recebe localmente na sua DB

**FR3: Compatibilidade Retrógrada**
- Conversas 1-a-1 existentes continuam funcionando
- Participants simplesmente [agente1, agente2] para conversas 1-a-1

**FR4: Tools de Gestão (no Provider Interno)**
- Agentes conseguem criar conversas com múltiplos participants via tool
- Agentes conseguem adicionar/remover members via tool

---

## 5. Critérios de Sucesso

- [ ] Conversa com múltiplos participants pode ser criada
- [ ] Mensagem enviada para conversa com N participants chega em todos
- [ ] Conversas 1-a-1 funcionam sem impacto
- [ ] Tools de gestão de grupo acessíveis via provider interno
- [ ] Dados de participant armazenados corretamente

---

## 6. Dependências

- Sistema de Mensagens existente (LibSQL por agente)
- Sistema de Contato existente
- Provider de Chat Interno (PRD-02) para exposição de Tools

---

## 7. Timeline

- **Semana 1:** Schema extension + persistência
- **Semana 2:** Tools de gestão + testes

**Total**: ~10 horas

---

**Histórico do Documento:**
- v1.0 (2026-03-15): Foco em infraestrutura de participants, gestão de grupo como Tools separadas
