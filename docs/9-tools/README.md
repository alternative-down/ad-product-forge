# Ferramentas - Visão Geral

## O que são Tools

**Tools** são funções que os agentes podem chamar durante a execução para performar ações específicas.

## Estrutura

```typescript
interface ToolDefinition {
  id: string;           // ex: "github.create-issue"
  name: string;
  description: string;   // Descrição para o LLM
  inputSchema: z.ZodType;
  outputSchema?: z.ZodType;
  handler: Function;
}
```

## Categories

| Categoria | Prefixo | Descrição |
|-----------|---------|-----------|
| GitHub | `github.` | Issues, PRs, Repos |
| Coolify | `coolify.` | Deploys, Logs |
| Discord | `discord.` | Mensagens |
| Email | `email.` | Enviar/Listar |
| Schedules | `schedules.` | Agendamento |
| MCP | `mcp.` | Tools custom |

## Execution Flow

```
Agent generates response
       ↓
Se tool_call identificado
       ↓
Verificar permission (role)
       ↓
Validar input (schema)
       ↓
Executar handler
       ↓
Retornar resultado
       ↓
LLM processa resultado
```
