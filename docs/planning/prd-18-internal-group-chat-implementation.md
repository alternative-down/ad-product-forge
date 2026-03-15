# PRD-18: Implementação de Bate-papo Interno em Grupo

> **Nota:** Este é um projeto pessoal para um desenvolvedor solo usando agentes LLM. Simplificado para facilidade e praticidade (KISS + YAGNI). Recursos corporativos como acesso baseado em função, webhooks e permissões avançadas estão fora do escopo.

**Recurso**: Implementação de Bate-papo Interno em Grupo
**Versão**: 1.0
**Status**: Em Análise & Planejamento
**Última Atualização**: 2026-03-15

---

## 1. Resumo Executivo

### Classificação: FRAMEWORK MASTRA

**Este PRD descreve infraestrutura core de comunicação multi-agente para o framework Mastra.** Mensagens em grupo é um padrão fundamental para coordenar múltiplos agentes. Esta é infraestrutura nível de framework aplicável a qualquer deployment Mastra suportando coordenação de agentes em equipe.

Este PRD descreve a implementação de capacidades de bate-papo em grupo dentro do sistema de comunicação interna. Atualmente, o módulo de comunicação suporta apenas mensagens diretas (conversas 1-a-1). Este recurso estende esse sistema para permitir múltiplos agentes coordenarem através de mensagens baseadas em grupo.

**Objetivo Principal (Framework)**: Permitir que qualquer agente Mastra crie e participe de conversas em grupo para coordenação, habilitando fluxos de trabalho de agentes em equipe.

**Objetivo Principal (ad-product-forge)**: Permitir que agentes de Nicolas formem equipes (pesquisa, desenvolvimento, operações) e coordenem através de mensagens de grupo internas.

---

## 2. Visão

Construir infraestrutura de comunicação simples onde agentes conseguem se organizar em grupos e coordenar assincronamente.

---

## 3. Declaração do Problema

### 3.1 Estado Atual
- **Módulo de comunicação** suporta apenas mensagens diretas entre agentes e contatos externos
- **Limitação**: Nenhum mecanismo para coordenação multi-agente sem plataformas externas (Discord, Email)
- **Escopo**: Sistema interno carece de recursos nativos de comunicação em grupo
- **Impacto**: Agentes não conseguem coordenar facilmente como equipes; toda colaboração requer integração de provedor externo

### 3.2 Necessidades do Usuário
- **Coordenação multi-agente**: Criar equipes de projeto e forças-tarefa
- **Compartilhamento assincrono de informação**: Passar contexto e estado entre agentes sem espera em tempo real
- **Histórico de mensagem**: Manter registro completo de conversa para auditoria e recuperação de contexto
- **Limites de permissão**: Controlar quem consegue acessar quais grupos
- **Organização de canal**: Estruturar conversas por domínio, projeto ou função de equipe

---

## 4. Objetivos & Métricas de Sucesso

### 4.1 Objetivos Primários
1. **Estender módulo de comunicação** para suportar modelo de conversa 1-para-N (grupos)
2. **Criar gerenciamento de ciclo de vida de grupo**: Criação de grupo, associação e exclusão
3. **Permitir mensagens baseadas em grupo**: Enviar e receber mensagens dentro de contexto de grupo
4. **Manter compatibilidade**: Garantir que funcionalidade de DM existente permaneça inalterada
5. **Fornecer API voltada para agente**: Grupos acessíveis via mesma interface de ferramenta que conversas

### 4.2 Métricas de Sucesso
| Métrica | Alvo |
|---|---|
| Criação de grupo | Funciona confiávelmente |
| Entrega de mensagem | Grupos recebem mensagens |
| Compatibilidade de API | 100% compatível com versões anteriores |
| Implementação simples | Desenvolvedor solo consegue manter em 2-3 semanas |

---

## 5. Requisitos Funcionais

### 5.1 Modelo de Entidade de Grupo

#### 5.1.1 Schema de Grupo
```
Group {
  groupId: UUID                 // Identificador único interno
  internalProvider: "internal"  // Provedor fixo para grupos internos
  name: string                  // Nome de exibição do grupo
  description?: string          // Propósito e notas opcionais do grupo
  ownerId: string              // ID do agente criador do grupo
  createdAt: ISO8601           // Timestamp de criação
  updatedAt: ISO8601           // Timestamp de última modificação
  isActive: boolean            // Flag de exclusão suave
  metadata?: Record<string,any>// Extensibilidade agnóstica de provedor
}
```

#### 5.1.2 Schema de Associação de Grupo
```
GroupMember {
  groupId: UUID                // Qual grupo
  contactSlug: string          // Qual agente (via sistema de Contato existente)
  joinedAt: ISO8601           // Quando adicionado ao grupo
  role?: string               // Futuro: admin, moderador, membro
  isActive: boolean           // Remover suavemente do grupo
}
```

#### 5.1.3 Decisões Chave de Design
- Grupos usam o **provedor interno** (nenhuma plataforma externa requerida)
- Grupos alavancam **sistema de Contato existente**: membros identificados por `contactSlug`
- Grupos identificados por `(provider="internal", providerGroupKey=groupId)`
- Mensagens fluem através da **camada de persistência de mensagem existente**

---

## 6. Critérios de Sucesso

- [ ] Grupos conseguem ser criados e listados
- [ ] Membros conseguem ser adicionados e removidos
- [ ] Mensagens conseguem ser enviadas para grupos
- [ ] Histórico de mensagem é mantido e recuperável
- [ ] API é compatível com versões anteriores
- [ ] Sem impacto em operações DM existentes

---

## 7. Dependências

- Sistema de Comunicação Mastra (PRD-02)
- Sistema de Contato existente
- Armazenamento de mensagem existente (LibSQL)

---

## 8. Timeline

- **Semana 1-2**: Implementação core
- **Semana 3**: Testes e documentação

**Total**: ~15 horas para desenvolvedor solo

---

**Histórico do Documento:**
- v1.0 (2026-03-15): Simplificado para projeto pessoal de desenvolvedor solo
