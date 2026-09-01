# Como Monitorar Agentes

Guia completo para acompanhar o desempenho e status dos seus agentes.

## Visão Geral

O monitoramento é essencial para garantir que seus agentes estão funcionando corretamente, dentro do orçamento e produzindo resultados esperados.

---

## Status dos Agentes

Cada agente pode estar em um destes estados:

| Status         | Descrição         | O que fazer                  |
| -------------- | ----------------- | ---------------------------- |
| **idle**       | Aguardando tarefa | Normal. Agente disponível.   |
| **running**    | Executando tarefa | Normal. Agente trabalhando.  |
| **paused**     | Pausado           | Verificar se foi intencional |
| **error**      | Erro detectado    | Investigar e resolver        |
| **terminated** | Desligado         | Remover ou recontratar       |

### Como Verificar Status

1. Acesse a lista de agentes no painel
2. Observe a coluna de status
3. Clique no agente para detalhes

---

## Métricas de Performance

### Dashboard Principal

O painel mostra métricas importantes:

```
┌─────────────────────────────────────────────────┐
│ Agente: Code Review Bot                         │
├─────────────────────────────────────────────────┤
│ Status: ● running                               │
│ Uptime: 5d 12h 34m                             │
│ Tarefas concluídas: 47                         │
│ Taxa de sucesso: 94.5%                         │
├─────────────────────────────────────────────────┤
│ 💰 Financeiro                                   │
│ Orçamento: R$ 500,00                            │
│ Gasto: R$ 312,45                               │
│ Saldo: R$ 187,55 (37%)                         │
├─────────────────────────────────────────────────┤
│ 🔧 Ferramentas mais usadas                      │
│ list_github_pull_requests: 156x                │
│ list_github_issues: 89x                        │
│ read_file: 234x                                │
└─────────────────────────────────────────────────┘
```

### Indicadores de Alerta

Fique atento a estes sinais:

| Indicador                | Limite | Ação Recomendada                  |
| ------------------------ | ------ | --------------------------------- |
| Saldo < 20%              | ⚠️     | Fazer top-up ou ajustar orçamento |
| Taxa de erro > 10%       | ⚠️     | Investigar logs do agente         |
| Tempo de resposta > 5min | ⚠️     | Verificar carga ou modelo         |
| Tasks pendentes > 10     | ⚠️     | Verificar capacidade              |

---

## Logs e Histórico

### Acessando Logs

1. Clique no agente desejado
2. Navegue até "Logs" ou "Histórico"
3. Filtre por data, tipo ou palavra-chave

### Tipos de Log

| Tipo        | Descrição              | Para que serve         |
| ----------- | ---------------------- | ---------------------- |
| `execution` | Execução de tarefa     | Ver o que foi feito    |
| `error`     | Erros ocurridos        | Diagnosticar problemas |
| `tool_call` | Chamadas de ferramenta | Entender comportamento |
| `budget`    | Operações financeiras  | Auditar gastos         |

### Exemplo de Entrada de Log

```
[2026-03-27 10:45:12] INFO execution
Agent: code-reviewer-01
Task: Review PR #257
Status: completed
Duration: 2m 34s
Tools used: list_github_pull_requests, read_file
Cost: R$ 0.45
```

---

## Relatórios Automatizados

### Configurar Relatórios

1. Acesse "Configurações → Relatórios"
2. Ative relatórios automatizados
3. Defina frequência (diário, semanal, mensal)
4. Escolha os destinatários

### Conteúdo do Relatório

```
═══════════════════════════════════════
RELATÓRIO SEMANAL - Ad Product Forge
Período: 20/03 a 27/03/2026
═══════════════════════════════════════

📊 RESUMO GERAL
• Total de agentes: 8
• Agentes ativos: 6
• Tarefas concluídas: 234
• Taxa de sucesso: 96.2%

💰 GASTOS
• Total gasto: R$ 1.234,56
• Maior gasto: Agente A (R$ 456,78)
• Saldo médio: R$ 2.345,00

⚠️ ALERTAS
• 2 agentes com saldo < 20%
• 1 tarefa falhou 3x consecutivas

📈 PERFORMANCE
• Tempo médio por tarefa: 4m 23s
• Agent mais usado: code-reviewer
• Tool mais chamada: list_github_issues
```

---

## Troubleshooting Rápido

### Problemas Comuns e Soluções

| Problema            | Causa Provável    | Solução                  |
| ------------------- | ----------------- | ------------------------ |
| Agente não responde | Sem saldo         | Fazer top-up             |
| Erro de ferramenta  | Sem permissão     | Verificar role           |
| Tarefa travada      | Timeout           | Cancelar e recriar       |
| Alto custo          | Modelo muito caro | Trocar para modelo menor |

### Como Resolver

**1. Agente Parado (sem resposta)**

```bash
# Passo 1: Verificar status
GET /admin/agent/{id}/status

# Passo 2: Verificar orçamento
GET /admin/agent/{id}/contract

# Passo 3: Se orçamento ok, verificar logs
GET /admin/agent/{id}/logs?type=error

# Passo 4: Reiniciar se necessário
POST /admin/agent/{id}/reload
```

**2. Saldo Esgotado**

```
Situação: "Orçamento do contrato insuficiente"

Soluções:
1. Top-up rápido: POST /admin/agent/contract/top-up
2. Ajuste de orçamento: POST /admin/agent/contract/adjust-budget
3. Encerrar contrato: POST /admin/agent/terminate
```

**3. Erro de Permissão**

```
Situação: "Ferramenta não autorizada"

Soluções:
1. Verificar role do agente: GET /admin/roles/{roleId}
2. Adicionar permissão: POST /admin/role-tool-permission/add
3. Trocar role: PUT /admin/agent/{id}/role
```

---

## Alertas e Notificações

### Configurar Alertas

1. Acesse "Configurações → Notificações"
2. Ative os alertas desejados:
   - ✅ Saldo abaixo de X%
   - ✅ Erro de agente
   - ✅ Tarefa falhou
   - ✅ Novo PR para review

### Canais de Notificação

| Canal     | Configuração           | Uso                   |
| --------- | ---------------------- | --------------------- |
| Dashboard | Automático             | Visualizar online     |
| Email     | Configurar SMTP        | Relatórios diários    |
| Slack     | Integração via webhook | Alertas em tempo real |
| Discord   | Integração via webhook | Alertas em tempo real |

---

## Boas Práticas

### Check-list Diário

- [ ] Verificar status de todos os agentes
- [ ] Revisar saldo disponível
- [ ] Analisar tarefas pendentes
- [ ] Verificar alertas do dia

### Check-list Semanal

- [ ] Relatório de performance
- [ ] Análise de custos
- [ ] Revisar tarefas falhadas
- [ ] Otimizar orçamento

### Check-list Mensal

- [ ] Relatório financeiro completo
- [ ] Avaliação de ROI dos agentes
- [ ] Revisão de permissões
- [ ] Planejamento de novos agentes

---

## Tópicos Relacionados

- [Ciclo de Vida do Agente](../guias/agent-lifecycle.md)
- [Gerenciamento de Orçamento](../guias/budget-management.md)
- [Sistema de Permissões](../guias/permissions.md)
- [FAQ e Troubleshooting](../faq/faq.md)
