# Error Message Dictionary — forge-admin

> Mapa de mensagens técnicas → copy user-friendly para admins.
> Aplicável a todas as mensagens de erro exibidas no forge-admin UI.

---

## 1. Visão Geral

Este documento define como traduzir mensagens técnicas de erro em textos que admins entendam e saibam como agir.

### Estrutura de Erro User-Friendly

```
⚠️ [Título descritivo]
[Mensagem técnica contextualizada]
[Ação sugerida]
```

### Níveis de Severidade

| Nível | Ícone | Comportamento | Exemplos |
|-------|-------|---------------|----------|
| **Error** | ❌ | Persiste na tela, requer ação | Falha de conexão, budget zerado |
| **Warning** | ⚠️ | Persiste, atenção necessária | Budget baixo, token expirando |
| **Info** | ℹ️ | Auto-dismiss 3s | Ação concluída, configuração salva |

---

## 2. Dicionário de Erros

### 2.1 Erros de Autenticação / Provider

| Código Técnico | Mensagem User-Friendly |
|----------------|------------------------|
| `AUTH_TOKEN_INVALID` | ⚠️ **Token inválido**<br>As credenciais do Discord não são mais válidas.<br>[Verificar credenciais] [Tentar novamente] |
| `AUTH_TOKEN_EXPIRED` | ⚠️ **Token expirado**<br>O token de acesso expirou.<br>[Renovar token] |
| `PROVIDER_DISCONNECTED` | ❌ **Provider desconectado**<br>Não foi possível conectar ao Discord. Verifique a configuração.<br>[Verificar configuração] |
| `AUTH_RATE_LIMITED` | ⚠️ **Many requests**<br>Demais tentativas de autenticação. Aguarde alguns minutos.<br>[Tentar novamente em 5 min] |

### 2.2 Erros de Budget / Financeiro

| Código Técnico | Mensagem User-Friendly |
|----------------|------------------------|
| `BUDGET_INSUFFICIENT` | ❌ **Budget insuficiente**<br>O agent não pode executar: budget esgotado.<br>R$ 0,00 de R$ {{amount}}/semana restantes.<br>[Aumentar budget] [Ver histórico] |
| `BUDGET_TOO_LOW` | ⚠️ **Budget muito baixo**<br>Valor mínimo para este agent: R$ {{min}}.<br>[Ajustar budget] |
| `BUDGET_NEAR_LIMIT` | ⚠️ **Budget quase esgotado**<br>R$ {{remaining}} ({{percent}}%) restantes de R$ {{total}}/semana.<br>[Aumentar budget] |
| `BUDGET_EXCEEDED` | ❌ **Budget excedido**<br>O agent foi suspenso até o próximo ciclo.<br>[Ver detalhes] [Aumentar budget] |

### 2.3 Erros de Agent

| Código Técnico | Mensagem User-Friendly |
|----------------|------------------------|
| `AGENT_NOT_FOUND` | ❌ **Agent não encontrado**<br>O agent especificado não existe ou foi removido.<br>[Voltar para Agents] [Criar novo agent] |
| `AGENT_ALREADY_RUNNING` | ℹ️ **Agent já em execução**<br>{{agentName}} já está ativo.<br>[Ver runtime] |
| `AGENT_TERMINATED` | ℹ️ **Agent desativado**<br>{{agentName}} foi removido com sucesso. |
| `AGENT_HIRE_FAILED` | ❌ **Falha ao contratar agent**<br>Não foi possível inicializar o agent.<br>[Motivo: {{reason}}]<br>[Tentar novamente] |
| `AGENT_PROVISIONING_FAILED` | ⚠️ **Agent não inicializou**<br>O agent está demorando mais que o esperado.<br>[Verificar status] [Tentar novamente] |
| `AGENT_WAKE_FAILED` | ❌ **Agent não acordou**<br>Não foi possível ativar {{agentName}}.<br>[Verificar logs] [Tentar novamente] |

### 2.4 Erros de Workspace / Memória

| Código Técnico | Mensagem User-Friendly |
|----------------|------------------------|
| `WORKSPACE_NOT_FOUND` | ❌ **Workspace não encontrado**<br>O diretório de trabalho não existe.<br>[Selecionar workspace válido] |
| `WORKSPACE_INIT_FAILED` | ⚠️ **Workspace não pode ser criado**<br>Não foi possível inicializar o workspace.<br>[Verificar permissões] |
| `MEMORY_CONSOLIDATION_FAILED` | ⚠️ **Memória não salva**<br>As últimas interações podem não ter sido salvas.<br>[Tentar novamente] |

### 2.5 Erros de Schedule

| Código Técnico | Mensagem User-Friendly |
|----------------|------------------------|
| `SCHEDULE_NOT_FOUND` | ❌ **Agendamento não encontrado**<br>Este schedule não existe ou foi removido.<br>[Voltar para schedules] |
| `SCHEDULE_CONFLICT` | ⚠️ **Conflito de horário**<br>Já existe um schedule para este agent neste horário.<br>[Ver schedule existente] |
| `SCHEDULE_CRON_INVALID` | ❌ **Formato inválido**<br>A expressão cron não é válida.<br>[Verificar formato] [Ver exemplos] |

### 2.6 Erros de GitHub

| Código Técnico | Mensagem User-Friendly |
|----------------|------------------------|
| `GITHUB_REPO_NOT_FOUND` | ❌ **Repositório não encontrado**<br>O repositório especificado não existe ou você não tem acesso.<br>[Verificar nome] |
| `GITHUB_PERMISSION_DENIED` | ⚠️ **Sem permissão**<br>Você não tem permissão para acessar este repositório.<br>[Solicitar acesso] |
| `GITHUB_RATE_LIMITED` | ⚠️ **Limite de requisições**<br>Muitas solicitações ao GitHub. Aguarde para tentar novamente.<br>[Tentar novamente em {{minutes}} min] |

### 2.7 Erros Genéricos / Sistema

| Código Técnico | Mensagem User-Friendly |
|----------------|------------------------|
| `INTERNAL_ERROR` | ❌ **Erro interno**<br>Algo inesperado aconteceu. Nossa equipe foi notificada.<br>[Tentar novamente] [Reportar problema] |
| `NETWORK_ERROR` | ❌ **Erro de conexão**<br>Não foi possível conectar ao servidor.<br>[Verificar internet] [Tentar novamente] |
| `TIMEOUT` | ⚠️ **Tempo esgotado**<br>A operação demorou mais que o esperado.<br>[Tentar novamente] |
| `VALIDATION_ERROR` | ❌ **Dados inválidos**<br>Alguns campos não estão no formato esperado.<br>[Verificar campos] |
| `UNAUTHORIZED` | ❌ **Sem autorização**<br>Você não tem permissão para esta ação.<br>[Entrar em contato com admin] |

---

## 3. Termos Técnicos para Tooltips

| Termo | Tooltip | Exemplo de Uso |
|-------|---------|----------------|
| Wake queue | "Lista de agents esperando para acordar" | "2 agents na wake queue" |
| Runner state | "Status atual da execução do agent" | "Runner: idle" |
| Provisioning | "Inicialização do agent" | "Agent em provisioning..." |
| Execution state | "O que o agent está fazendo agora" | "Execution: waiting_input" |
| Memory consolidation | "Salvamento periódico de memórias" | "Última consolidação: 14:32" |
| Budget cycle | "Período de renovação do budget" | "Ciclo: semanal (renova sex)" |

---

## 4. Validação Inline

### Campos Obrigatórios

| Campo | Mensagem de Validação |
|-------|----------------------|
| Nome do agent | "Nome é obrigatório" |
| Budget | "Budget é obrigatório" |
| Workspace | "Selecione um workspace" |
| Função | "Selecione uma função" |

### Formato Inválido

| Campo | Mensagem de Validação |
|-------|----------------------|
| Nome do agent | "Use apenas letras, números e hífens" |
| Budget | "Use valores numéricos (ex: 50.00)" |
| Cron expression | "Formato inválido. Use: * * * * *" |

### Limites

| Campo | Mensagem |
|-------|----------|
| Nome do agent (min) | "Nome precisa ter pelo menos 3 caracteres" |
| Nome do agent (max) | "Nome pode ter no máximo 50 caracteres" |
| Budget (min) | "Budget mínimo: R$ 1,00" |
| Budget (max) | "Budget máximo: R$ 50.000,00" |

---

## 5. Version History

| Versão | Data | Mudanças |
|--------|------|---------|
| 1.0 | 2026-03-27 | Versão inicial com erros de Auth, Budget, Agent, Workspace, Schedule, GitHub |

---

*Documento mantido por: Vox (Brand Voice)*
