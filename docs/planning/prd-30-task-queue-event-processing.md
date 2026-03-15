# PRD-30: Fila de Tarefa & Processamento de Evento

**Recurso**: Fila de Tarefa & Processamento de Evento
**Versão**: 1.0
**Status**: Em Análise & Planejamento
**Última Atualização**: 2026-03-15
**Escopo**: Projeto de desenvolvedor pessoal - Princípios KISS & YAGNI aplicam

---

## 1. Resumo Executivo

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de execução de tarefa assíncrona específica do ad-product-forge.** Enfileiramento de tarefa permite que agentes de Nicolas difiram trabalho longo (deployments, processamento de pesquisa, geração de código) sem bloquear. Enquanto padrões de enfileiramento sejam gerais, esta implementação é específica da aplicação.

Permitir que agentes enfilearem tarefas longas assincronamente usando BullMQ para persistência de job e Redis para coordenação.

**Objetivo Principal (para ad-product-forge)**: Permitir que agentes difira trabalho sem bloquear, com retries automáticas em falha.

---

## 2. Visão & Contexto Estratégico

Construir um sistema simples de execução de tarefa assíncrona onde agentes conseguem diferir trabalho para filas de job sem bloquear operações.

---

## 3. Declaração do Problema

### 3.1 Estado Atual
- **Modelo de execução de agente**: Primariamente síncrono com capacidade limitada de diferir trabalho
- **Sem enfileiramento de job**: Tarefas longas bloqueiam agentes; sem retry ou mecanismos de recuperação de falha

### 3.2 Necessidades do Usuário
- **Diferir trabalho longo**: Execução fire-and-forget de tarefa sem bloquear loops de agente
- **Lógica de retry confiável**: Retry automático em falhas transitórias com backoff exponencial

---

## 4. Objetivos & Métricas de Sucesso

### 4.1 Objetivos Primários
1. **Integrar BullMQ** como fila de job para persistência de tarefa confiável
2. **Fornecer API voltada para agente** para enfileiramento de tarefa e recuperação de status
3. **Suportar retries automáticas** com backoff exponencial

### 4.2 Métricas de Sucesso
| Métrica | Alvo |
|---|---|
| Latência de enfileiramento de tarefa | <100ms |
| Lógica de retry de job funciona | 3 tentativas máximas |

---

## 5. Requisitos Funcionais

### 5.1 Modelo de Entidade de Fila de Tarefa

#### 5.1.1 Schema de Definição de Fila
```
Queue {
  queueId: UUID                    // Identificador único interno
  name: string                     // Nome da fila (ex: "email-delivery", "data-export")
  concurrency: number              // Max workers concorrentes (padrão: 5)
  maxRetries: number               // Max tentativas de retry (padrão: 3)
  createdAt: ISO8601              // Timestamp de criação
}
```

#### 5.1.2 Schema de Job
```
Job {
  jobId: UUID                      // Identificador único global de job
  queueId: UUID                    // Qual fila este job pertence
  type: string                     // Tipo de job (ex: "send-email", "process-csv")
  payload: Record<string,any>      // Parâmetros de job
  status: "pending" | "processing" | "completed" | "failed"
  attempts: number                 // Contagem de tentativa atual
  result?: Record<string,any>      // Output de job (na conclusão)
  error?: string                   // Mensagem de erro (em falha)
  createdAt: ISO8601              // Quando job foi criado
  completedAt?: ISO8601           // Quando job terminou/falhou
}
```

---

## 6. Critérios de Sucesso

- [ ] Agente consegue criar fila e enfileirar jobs
- [ ] Jobs executam e são recuperáveis
- [ ] Jobs falhados fazem retry corretamente
- [ ] Subscrições de evento disparam criação de job
- [ ] Correspondência de padrão funciona (ex: "payment.*")

---

## 7. Dependências

- **BullMQ**: Biblioteca de fila de job
- **Redis**: Data store em memória para coordenação de job
- **LibSQL**: Para trilha de auditoria e histórico de job

---

## 8. Timeline

- **Fase 1 (Infraestrutura de Fila)**: 2 semanas
- **Total MVP**: 2 semanas

---

**Fim do documento**
