# PRD-17: Sistema de Batida do Coração e Agendamento

> **Nota:** Este é um projeto pessoal para um desenvolvedor solo usando agentes LLM. Simplificado para facilidade e praticidade (KISS + YAGNI). Agendamento corporativo, sistemas distribuídos e orquestração complexa estão fora do escopo.

**Status:** Rascunho
**Versão:** 1.0
**Criado:** 2026-03-15
**Última Atualização:** 2026-03-15

---

## Resumo Executivo

### Classificação: FRAMEWORK MASTRA

**Este PRD descreve infraestrutura core de ciclo de vida de agente para o framework Mastra.** A capacidade dos agentes se auto-agendarem e permanecerem responsivos é fundamental para sistemas multi-agente autônomos. Esta é infraestrutura nível de framework aplicável a qualquer deployment Mastra.

O **Sistema de Batida do Coração e Agendamento** permite que agentes permaneçam ativos e autônomos implementando verificações periódicas de saúde e capacidades de agendamento autônomo.

**Objetivo Principal (Framework):** Permitir que qualquer agente Mastra agende suas próprias tarefas e permaneça responsivo mesmo sem eventos externos, habilitando hierarquias de agentes auto-gerenciadas.

**Objetivo Principal (ad-product-forge):** Permitir que agentes de Nicolas agendendem autonomamente pesquisa, desenvolvimento e tarefas de deployment sem intervenção humana.

---

## 1. Declaração do Problema

### Estado Atual

Agentes operam em um modelo baseado em eventos:
- Agentes acordam apenas quando mensagens externas chegam
- Nenhum mecanismo para agentes agendarem tarefas recorrentes
- Agentes não conseguem verificar por trabalho pendente ou retomar operações interrompidas

### Pontos de Dor

1. **Sem Tarefas Autônomas**: Agentes não conseguem agendar trabalho recorrente
2. **Sem Retomada de Trabalho**: Execuções interrompidas não conseguem ser retomadas
3. **Sem Visibilidade**: Nenhuma batida de coração indica saúde do agente

---

## 2. Objetivos Comerciais & Métricas de Sucesso

### Objetivos Primários

| Objetivo | Descrição | Métrica de Sucesso |
| --- | --- | --- |
| **Autonomia de Agente** | Permitir agentes agendarem e executarem suas próprias tarefas | Agentes executam tarefas agendadas sem triggers externos |
| **Continuidade de Trabalho** | Retomar execuções interrompidas automaticamente | 100% de tarefas pendentes retomadas no intervalo de batida do coração |
| **Saúde do Sistema** | Manter visibilidade na vivacidade do agente | Todos os agentes relatam status de batida do coração; zero agentes obsoletos |
| **Acordar Eficientemente** | Minimizar overhead de CPU de verificações periódicas | Intervalo de batida do coração ≥ 5 minutos; debounce < 1 segundo |
| **Agendamento Autônomo** | Permitir agentes criarem e gerenciarem cron jobs | Agentes criam cron jobs via mensageria interna |

### Métricas de Sucesso

- **Entrega de Batida do Coração**: Agentes acordam confiávelmente na batida do coração
- **Execução de Cron**: Jobs executam em horários agendados
- **Simples & Confiável**: Nenhum tratamento de erro complexo necessário

---

## 3. Histórias de Usuário & Casos de Uso

### História de Usuário 1: Geração Diária de Relatório
**Como um** agente de relatório autônomo
**Quero** executar uma tarefa de resumo diário sem triggers externos
**Para que** stakeholders recebam relatórios consistentes todo dia de manhã às 8 AM

**Critérios de Aceitação:**
- Agente cria um cron job: `0 8 * * *` (diariamente às 8 AM)
- Agente acorda no horário agendado
- Execução gera relatório e envia via provedor de comunicação
- Execuções falhadas são registradas e podem ser retentadas

**Notas de Implementação:**
- Agente usa mensageria interna para registrar cron job
- Sistema de batida do coração agenda execução
- Execução agendada do agente usa mesmo loop de execução que execução baseada em eventos

---

### História de Usuário 2: Verificações Periódicas de Saúde
**Como um** agente de monitoramento autônomo
**Quero** verificar saúde do sistema a cada 30 minutos
**Para que** problemas sejam detectados e registrados cedo

**Critérios de Aceitação:**
- Agente agenda: `*/30 * * * *` (a cada 30 minutos)
- Sistema de batida do coração dispara execução confiávelmente
- Agente consulta sistemas conectados e registra resultados
- Status de saúde é atualizado na memória do agente

**Notas de Implementação:**
- Cron job é armazenado duramente (sobrevive reinicialização do agente)
- Execução inclui contexto sobre última verificação
- Sistema de memória rastreia histórico de saúde

---

### História de Usuário 3: Retomada de Execução Interrompida
**Como um** agente de desenvolvimento autônomo
**Quero** retomar uma tarefa de compilação multi-dia que foi interrompida
**Para que** operações longas se completem apesar de pausas temporárias

**Critérios de Aceitação:**
- Agente detecta tarefas pendentes/incompletas na batida do coração
- Execução retoma do último checkpoint
- Progresso é preservado na memória do agente
- Resumo final atualiza thread com status de conclusão

**Notas de Implementação:**
- Tarefas pendentes armazenadas na memória do agente
- Cada tarefa armazena estado de execução (iniciado, em-progresso, pausado, completado)
- Execução de retomada inclui contexto anterior e progresso

---

### História de Usuário 4: Visibilidade de Saúde do Agente
**Como um** operador de sistema
**Quero** verificar se todos agentes são responsivos e saudáveis
**Para que** eu possa detectar problemas antes que impactem operações

**Critérios de Aceitação:**
- Cada agente mantém timestamp da última batida do coração
- Endpoint da API mostra status de batida do coração de todos agentes
- Agentes obsoletos (sem batida do coração > 2x intervalo) são sinalizados
- Sistema alerta sobre silêncio inesperado de agente

**Notas de Implementação:**
- Status de batida do coração armazenado em metadados do agente
- Dashboard de status consulta runtime do agente para vivacidade
- Alertas opcionais em email/Slack em agentes obsoletos

---

## 4. Requisitos de Características & Especificações

### 4.1 Requisitos Funcionais

#### FR-1: Infraestrutura de Batida do Coração
- **FR-1.1**: Runtime implementa loop periódico de batida do coração para cada agente
- **FR-1.2**: Intervalo de batida do coração configurável por agente (padrão: 5 minutos)
- **FR-1.3**: Batida do coração pode ser disparada manualmente para testes/debugging
- **FR-1.4**: Batida do coração inclui metadados mínimos (timestamp, agent-id, status)
- **FR-1.5**: Eventos de batida do coração são debounced para prevenir wake-ups duplicadas (janela de debounce: 1000ms)

#### FR-2: Agendamento Autônomo de Cron Job
- **FR-2.1**: Agentes podem criar cron jobs via mensageria interna (`internalMessage.sendScheduleJob()`)
- **FR-2.2**: Sintaxe de Cron segue formato padrão Unix cron: `minuto hora dia mês dia-da-semana`
- **FR-2.3**: Cada cron job tem: job-id, cron-expression, agent-id, descrição, status habilitado
- **FR-2.4**: Agentes podem listar, atualizar, deletar seus próprios cron jobs
- **FR-2.5**: Cron jobs persistem através de reinicializações de agente (armazenados na tabela de agendamento)
- **FR-2.6**: Máximo 50 cron jobs por agente (para prevenir esgotamento de recursos)

#### FR-3: Execução Disparada por Batida do Coração
- **FR-3.1**: Runtime avalia todos cron jobs em cada batida do coração
- **FR-3.2**: Cron jobs correspondentes disparam execução de agente com `type: "scheduled"`
- **FR-3.3**: Execução agendada usa mesmo loop de execução que execução baseada em eventos
- **FR-3.4**: Contexto de execução inclui metadados de job e histórico de execução
- **FR-3.5**: Execução pula cron job se execução anterior ainda está rodando (previne overlap)

#### FR-4: Detecção de Tarefa Pendente
- **FR-4.1**: Agentes podem consultar tarefas pendentes via ferramenta `getPendingTasks()`
- **FR-4.2**: Tarefas pendentes incluem: execuções incompletas, jobs falhados, workflows pausados
- **FR-4.3**: Agente pode retomar tarefa pendente chamando `resumeTask(taskId)`
- **FR-4.4**: Execução de retomada preserva contexto anterior e progresso da memória
- **FR-4.5**: Execução de retomada é rastreada separadamente da execução original em logging

#### FR-5: Monitoramento de Saúde do Agente
- **FR-5.1**: Cada agente mantém timestamp `lastHeartbeatAt`
- **FR-5.2**: Runtime atualiza timestamp em cada batida do coração bem-sucedida
- **FR-5.3**: Status do agente inclui: ativo, ocioso, obsoleto (sem batida do coração > 2x intervalo)
- **FR-5.4**: API expõe status do agente via `GET /agents/{agentId}/status`
- **FR-5.5**: Agentes obsoletos são sinalizados no dashboard do sistema

#### FR-6: Configuração de Agendamento
- **FR-6.1**: Configuração de sistema habilita/desabilita batida do coração por agente ou globalmente
- **FR-6.2**: Intervalo de batida do coração configurável: `agentConfig.heartbeat.interval` (ms)
- **FR-6.3**: Janela de debounce configurável: `agentConfig.heartbeat.debounceMs` (padrão: 1000)
- **FR-6.4**: Duração máxima de execução para tarefas agendadas configurável (padrão: 1 hora)
- **FR-6.5**: Suporte a fuso horário para cron jobs (UTC padrão, configurável por agente)

---

### 4.2 Requisitos Não-Funcionais

| Requisito | Especificação |
| --- | --- |
| **Performance** | Avaliação de batida do coração < 100ms por agente |
| **Confiabilidade** | Cron jobs executam confiávelmente em horários agendados |
| **Durabilidade** | Cron jobs persistidos em banco de dados LibSQL do agente |
| **Segurança** | Agentes conseguem apenas gerenciar seus próprios cron jobs |
| **Isolamento** | Execuções agendadas isoladas por agente |

---

## 5. Arquitetura Técnica & Design

### 5.1 Componentes Principais

```
Agent Runtime
├─ Heartbeat Manager
│  ├─ Heartbeat Loop (interval-based)
│  ├─ Debouncer (prevents duplicate wake-ups)
│  └─ Cron Evaluator (matches pending jobs)
│
├─ Scheduling Store (LibSQL)
│  ├─ CronJobs table (job-id, agent-id, expression, enabled, lastRun, nextRun)
│  ├─ PendingTasks table (task-id, agent-id, status, context, createdAt)
│  └─ ExecutionHistory table (execution-id, job-id, status, startedAt, completedAt)
│
└─ Agent API
   ├─ sendScheduleJob(expression, description) → job-id
   ├─ listJobs() → CronJob[]
   ├─ deleteJob(job-id) → success
   ├─ getPendingTasks() → PendingTask[]
   └─ resumeTask(task-id) → execution-id
```

---

## 6. Critérios de Sucesso & Testes de Aceitação

- [ ] Agentes recebem batida do coração em intervalo configurado
- [ ] Cron jobs criam-se e armazenam-se corretamente
- [ ] Cron jobs executam em horários agendados
- [ ] Sobreposição de execução é prevenida
- [ ] Agentes podem retomar tarefas interrompidas
- [ ] Status do agente é visível e preciso

---

## 7. Riscos & Mitigação

### Risco 1: Sobreposição de Cron Job (Execução Duplicada)
**Risco**: Se execução leva mais tempo que intervalo de batida do coração, próxima execução inicia antes da anterior terminar
**Mitigação**: Verificar se job já está rodando antes de disparar nova execução; armazenar flag `isRunning` na tabela de cron_jobs; registrar tentativas de sobreposição para monitoramento

### Risco 2: Cron Jobs Perdidos (Corrupção de Banco de Dados)
**Risco**: Cron jobs perdidos devido a falha de armazenamento
**Mitigação**: Armazenar cron jobs no banco de dados LibSQL do agente (mesmo que comunicação/memória)

### Risco 3: Misconfiguration de Fuso Horário
**Risco**: Cron jobs executam no horário errado devido a problemas de fuso horário
**Mitigação**: Padrão para UTC; horário de verão manipulado pela biblioteca cron padrão

---

## 8. Plano de Implementação & Roadmap

### Fase 1: Batida do Coração Core (Semanas 1-2)
**Objetivo**: Infraestrutura de loop de batida do coração em funcionamento

- [ ] Implementar classe `HeartbeatManager`
- [ ] Criar schema de banco de dados de agendamento
- [ ] Adicionar configuração de batida do coração à interface de config de agente
- [ ] Implementar loop de batida do coração na fiação de `createAgent()`
- [ ] Adicionar logging e métricas para eventos de batida do coração
- [ ] Escrever testes unitários para loop de batida do coração

**Entregáveis**: Eventos de batida do coração registrados; agentes mostram lastHeartbeatAt

---

### Fase 2: Gerenciamento de Cron Job (Semanas 3-4)
**Objetivo**: Agentes conseguem criar e gerenciar cron jobs

- [ ] Implementar ferramentas CRUD de cron job em API de agente
- [ ] Integrar biblioteca cron-parser para validação de expressão
- [ ] Adicionar ferramenta de mensageria interna `sendScheduleJob()`
- [ ] Implementar lógica de avaliação de cron (`evaluateCronJobs()`)
- [ ] Conectar cron jobs à fila de wake
- [ ] Escrever testes de integração

**Entregáveis**: Agentes conseguem criar cron jobs via mensagens internas; cron jobs persistidos; avaliação de cron em batida do coração

---

### Fase 3: Execução Agendada (Semanas 5-6)
**Objetivo**: Fluxos de execução disparados por batida do coração funcionam end-to-end

- [ ] Estender fila de wake para lidar com eventos agendados
- [ ] Implementar contexto de execução para execuções agendadas
- [ ] Adicionar logging de histórico de execução
- [ ] Implementar prevenção de sobreposição (flag isRunning)
- [ ] Testar com 2-3 agentes de amostra
- [ ] Testes de performance (100 agentes, batidas do coração concorrentes)

**Entregáveis**: Cron jobs disparam execução de agente confiávelmente; histórico de execução rastreado; zero execuções duplicadas

---

## 9. Dependências & Pontos de Integração

### Dependências Internas

| Dependência | Status | Impacto | Mitigação |
| --- | --- | --- | --- |
| LibSQL Storage | ✅ Implementado | Dados de agendamento persistidos | Nenhuma ação necessária |
| Wake Queue | ✅ Implementado | Eventos disparam execuções | Estender para eventos agendados |
| Memory System | ✅ Implementado | Injeção de contexto para retomadas | Integrar via processadores existentes |
| Communication Module | ✅ Implementado | Tarefas agendadas conseguem enviar mensagens | Nenhuma mudança necessária |
| Agent Config | ✅ Implementado | Intervalo de batida do coração configurável | Estender schema de config |

### Dependências Externas

| Dependência | Versão | Propósito | Licença |
| --- | --- | --- | --- |
| `cron-parser` | ^4.0+ | Parsear e avaliar expressões cron | MIT |
| (Opcional) `node-cron` | ^3.0+ | Avaliação cron alternativa | ISC |

---

## 10. Futuros Aprimoramentos

1. **Dashboard de Cron Job**: Editor visual (se necessário)
2. **Lógica de Retry**: Política de retry configurável para execuções falhadas
3. **Dependências de Job**: Se coordenação multi-agente for necessária

---

## Glossário

| Termo | Definição |
| --- | --- |
| **Batida do Coração** | Sinal periódico indicando que um agente está vivo e pronto |
| **Cron Job** | Tarefa agendada autônoma definida por expressão cron (formato cron Unix) |
| **Execução Agendada** | Execução de agente disparada por cron job, não evento externo |
| **Tarefa Pendente** | Execução incompleta armazenada para retomada em tempo posterior |
| **Retomada de Tarefa** | Continuação de tarefa pendente do seu último checkpoint |
| **Debounce** | Mecanismo para prevenir duplicate wake-ups dentro de curta janela de tempo |
| **Agente Obsoleto** | Agente que não reportou batida do coração dentro de 2x intervalo configurado |

---

**Status do Documento:** Pronto para Revisão
**Próximos Passos:** Revisão de engenharia, avaliação de viabilidade técnica, iniciar implementação da Fase 1
