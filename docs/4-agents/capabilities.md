# Capabilities e Permissões

## Conceitos

### Role

Um **role** é um conjunto de permissões atribuídas a um agente. Roles definem o que um agente pode fazer.

```typescript
interface AgentRole {
  id: string;                          // UUID do role
  name: string;                        // Nome (ex: "developer", "qa")
  description: string;                 // Descrição textual
  agentToolPermissions: string[];      // Tools que o agente pode usar
  agentWorkflowPermissions: string[];  // Workflows que o agente pode executar
}
```

### Capability

**Capabilities** são funcionalidades específicas que um agente pode ter. Capabilities vão além das permissões básicas do role.

```typescript
interface AgentCapability {
  id: string;              // Identificador único
  name: string;           // Nome da capability
  type: 'tool' | 'workflow' | 'feature';
  config?: Record<string, unknown>;
}
```

### Permission (Permissão)

Uma **permissão** é a autorização para executar uma ação específica.

```typescript
type ToolPermission = 
  | 'github.create-issue'
  | 'github.create-pull-request'
  | 'github.commit-file'
  | 'coolify.deploy-application'
  | 'discord.send-message'
  | 'email.send'
  | 'schedules.create';

type WorkflowPermission = 
  | 'workflow.hire-agent'
  | 'workflow.terminate-agent'
  | 'workflow.create-schedule';
```

## Diferença entre Role e Capability

| Aspecto | Role | Capability |
|---------|------|------------|
| Escopo | Conjunto de permissões | Funcionalidade específica |
| Uso | Controle de acesso básico | Habilitar features avançadas |
| Herança | Agente herda todas do role | Adicionada individualmente |
| Persistência | Armazenada no banco | Configurada por feature |

## Criar Role

### Via API

```bash
curl -X POST http://localhost:3000/admin/role \
  -H "Content-Type: application/json" \
  -d '{
    "name": "developer",
    "description": "Desenvolvedor com acesso ao GitHub e Coolify",
    "agentToolPermissions": [
      "github.create-issue",
      "github.create-pull-request",
      "github.commit-file",
      "github.merge-pull-request",
      "coolify.list-applications",
      "coolify.deploy-application",
      "coolify.get-logs"
    ],
    "agentWorkflowPermissions": []
  }'
```

### Resposta

```json
{
  "id": "role-uuid",
  "name": "developer",
  "description": "Desenvolvedor com acesso ao GitHub e Coolify",
  "agentToolPermissions": [
    "github.create-issue",
    "github.create-pull-request",
    "github.commit-file",
    "github.merge-pull-request",
    "coolify.list-applications",
    "coolify.deploy-application",
    "coolify.get-logs"
  ],
  "agentWorkflowPermissions": []
}
```

## Roles Padrão

### developer

```typescript
{
  name: "developer",
  description: "Desenvolvedor full-stack",
  agentToolPermissions: [
    "github.create-issue",
    "github.create-pull-request",
    "github.commit-file",
    "github.merge-pull-request",
    "github.create-repository",
    "github.list-repositories",
    "github.get-repository",
    "coolify.list-applications",
    "coolify.deploy-application",
    "coolify.get-logs",
    "coolify.update-environment-variables",
    "discord.send-message",
    "discord.send-dm",
    "email.send",
    "schedules.create",
    "schedules.update",
    "schedules.delete"
  ]
}
```

### qa

```typescript
{
  name: "qa",
  description: "QA engineer",
  agentToolPermissions: [
    "github.list-issues",
    "github.get-pull-request",
    "github.add-issue-comment",
    "coolify.list-applications",
    "coolify.get-logs",
    "discord.send-message"
  ]
}
```

### readonly

```typescript
{
  name: "readonly",
  description: "Acesso de leitura",
  agentToolPermissions: [
    "github.list-issues",
    "github.list-repositories",
    "github.get-repository",
    "coolify.list-applications"
  ]
}
```

## Verificar Permissão

### Em Runtime

```typescript
// apps/forge/src/capabilities/store.ts
export async function hasPermission(
  roleId: string,
  toolId: string
): Promise<boolean> {
  const role = await db.select().from(agentRoles)
    .where(eq(agentRoles.id, roleId));
  
  if (!role[0]) return false;
  
  return role[0].agentToolPermissions.includes(toolId);
}

// Antes de executar tool
async function executeTool(
  agentId: string,
  toolId: string,
  input: unknown
): Promise<unknown> {
  const agent = await db.select().from(agents)
    .where(eq(agents.id, agentId));
  
  const hasPermission = await capabilities.hasPermission(
    agent[0].roleId,
    toolId
  );
  
  if (!hasPermission) {
    throw new Error(`Tool ${toolId} not permitted for role ${agent[0].roleId}`);
  }
  
  return toolHandler.execute(input);
}
```

### Via API

```bash
curl http://localhost:3000/admin/role/{roleId}/permissions
```

## Adicionar Permissão a Role

```bash
curl -X POST http://localhost:3000/admin/role/{roleId}/tool-permission \
  -H "Content-Type: application/json" \
  -d '{"toolId": "github.create-issue"}'
```

## Remover Permissão de Role

```bash
curl -X DELETE http://localhost:3000/admin/role/{roleId}/tool-permission \
  -H "Content-Type: application/json" \
  -d '{"toolId": "github.create-issue"}'
```

## Capability Store

```typescript
// apps/forge/src/agents/capabilities/store.ts
interface CapabilityStore {
  async getRole(roleId: string): Promise<AgentRole | null>;
  async listRoles(): Promise<AgentRole[]>;
  async createRole(input: CreateRoleInput): Promise<AgentRole>;
  async updateRole(roleId: string, input: UpdateRoleInput): Promise<AgentRole>;
  async deleteRole(roleId: string): Promise<void>;
  
  async hasPermission(roleId: string, toolId: string): Promise<boolean>;
  async addPermission(roleId: string, toolId: string): Promise<void>;
  async removePermission(roleId: string, toolId: string): Promise<void>;
}

export function createCapabilityStore(db: Database): CapabilityStore {
  return {
    async hasPermission(roleId: string, toolId: string) {
      const role = await db.select().from(agentRoles)
        .where(eq(agentRoles.id, roleId));
      
      if (!role[0]) return false;
      
      return role[0].agentToolPermissions.includes(toolId);
    },
    // ... outros métodos
  };
}
```

## Permissões de Tools

### GitHub

| Permission | Descrição |
|------------|-----------|
| `github.create-issue` | Criar issues |
| `github.list-issues` | Listar issues |
| `github.get-issue` | Obter issue |
| `github.update-issue` | Atualizar issue |
| `github.add-issue-comment` | Adicionar comentário em issue |
| `github.create-pull-request` | Criar PR |
| `github.list-pull-requests` | Listar PRs |
| `github.get-pull-request` | Obter PR |
| `github.merge-pull-request` | Merge PR |
| `github.commit-file` | Commitar arquivo |
| `github.create-repository` | Criar repositório |
| `github.list-repositories` | Listar repositórios |
| `github.get-repository` | Obter repositório |
| `github.create-label` | Criar label |
| `github.create-milestone` | Criar milestone |

### Coolify

| Permission | Descrição |
|------------|-----------|
| `coolify.list-applications` | Listar aplicações |
| `coolify.get-application` | Obter aplicação |
| `coolify.deploy-application` | Deployar aplicação |
| `coolify.get-logs` | Obter logs |
| `coolify.update-environment-variables` | Atualizar env vars |

### Discord

| Permission | Descrição |
|------------|-----------|
| `discord.send-message` | Enviar mensagem |
| `discord.send-dm` | Enviar DM |

### Email

| Permission | Descrição |
|------------|-----------|
| `email.send` | Enviar email |
| `email.list-messages` | Listar mensagens |

### Schedules

| Permission | Descrição |
|------------|-----------|
| `schedules.create` | Criar schedule |
| `schedules.update` | Atualizar schedule |
| `schedules.delete` | Deletar schedule |

### MCP

| Permission | Descrição |
|------------|-----------|
| `mcp.execute` | Executar tool MCP |
