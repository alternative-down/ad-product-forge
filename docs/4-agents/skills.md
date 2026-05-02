# Skills

## O que são Skills

**Skills** são módulos reutilizáveis que fornecem capacidades adicionais aos agentes. Diferente das tools padrão, skills podem incluir código, prompts, e arquivos de suporte.

## Estrutura de uma Skill

```
skill-name/
├── SKILL.md              # Definição da skill
├── src/
│   ├── index.ts         # Entry point
│   └── ...              # Implementação
├── references/          # Referências e documentação
│   └── ...
└── assets/             # Assets (imagens, etc)
```

### SKILL.md

```markdown
# Skill: github-api

## Descrição
Fornece capacidades de integração com GitHub.

## Capabilities
- Criar e gerenciar issues
- Criar e gerenciar pull requests
- Commitar arquivos
- Gerenciar labels e milestones

## Permissões Necessárias
- github.create-issue
- github.create-pull-request
- github.commit-file

## Uso
O agente pode usar esta skill para:
1. Criar issues para tracking de tasks
2. Criar PRs para code review
3. Atualizar documentação

## Configuração
Nenhuma configuração adicional necessária.
```

## Tipos de Skills

### Workspace Skills

Skills instaladas no workspace do agente.

```
workspaces/{agentId}/skills/
├── github-api/
│   └── SKILL.md
├── coolify-api/
│   └── SKILL.md
└── custom-skill/
    ├── SKILL.md
    └── src/index.ts
```

### Global Skills

Skills compartilhadas disponíveis para todos os agentes.

```typescript
// packages/forge-runtime-core/src/global-skills.ts
export const globalSkills: SkillDefinition[] = [
  {
    id: 'core.information-retrieval',
    name: 'Information Retrieval',
    description: 'Busca informações relevantes',
  },
  {
    id: 'core.code-analysis',
    name: 'Code Analysis',
    description: 'Analisa código fonte',
  },
];
```

## Carregar Skills

```typescript
// apps/forge/src/agents/skills/manager.ts
interface SkillManager {
  loadWorkspaceSkills(workspacePath: string): Promise<Skill[]>;
  loadGlobalSkills(): Promise<Skill[]>;
  getSkill(skillId: string): Skill | null;
  activateSkill(skillId: string): void;
  deactivateSkill(skillId: string): void;
}

async function loadSkills(workspacePath: string): Promise<Skill[]> {
  const global = await loadGlobalSkills();
  const workspace = await loadWorkspaceSkills(workspacePath);
  
  return [...global, ...workspace];
}
```

## Skill Definition

```typescript
interface SkillDefinition {
  id: string;                    // Identificador único
  name: string;                  // Nome descritivo
  description: string;           // Descrição para o LLM
  version: string;              // Versão semântica
  type: 'workspace' | 'global';
  capabilities: string[];        // Lista de capabilities
  toolPermissions: string[];     // Permissões necessárias
  files: SkillFile[];           // Arquivos da skill
}

interface SkillFile {
  path: string;
  content: string;
  type: 'code' | 'markdown' | 'config' | 'asset';
}
```

## Instalar Skill

### Via API

```bash
curl -X POST http://localhost:3000/admin/agent/{agentId}/skill \
  -H "Content-Type: multipart/form-data" \
  -F "file=@my-skill.zip"
```

### Via Código

```typescript
import { loadWorkspaceSkills } from './skills/manager';

async function installSkill(
  agentId: string,
  skillZip: Buffer
): Promise<void> {
  const skillDir = `workspaces/${agentId}/skills/${skillName}`;
  
  // Extrair ZIP
  await extractZip(skillZip, skillDir);
  
  // Validar SKILL.md
  const skillDef = await loadSkillDefinition(skillDir);
  if (!skillDef) {
    throw new Error('Invalid skill: missing SKILL.md');
  }
  
  // Registrar skill
  await db.insert(agentSkills).values({
    agentId,
    skillId: skillDef.id,
    skillPath: skillDir,
    isActive: true,
  });
}
```

## Usar Skill

```typescript
// Em tempo de execução
const skill = skillManager.getSkill('github-api');
if (skill) {
  // Carregar capabilities
  const capabilities = skill.getCapabilities();
  
  // Executar capability
  await skill.execute('create-issue', { title: 'Bug', body: '...' });
}
```

## Skill Registry

```typescript
// Global registry de skills
const skillRegistry = new Map<string, Skill>();

function registerSkill(skill: Skill): void {
  skillRegistry.set(skill.id, skill);
}

function getSkill(skillId: string): Skill | undefined {
  return skillRegistry.get(skillId);
}

function listSkills(): Skill[] {
  return Array.from(skillRegistry.values());
}
```

## Criar Nova Skill

### 1. Criar estrutura

```
my-skill/
├── SKILL.md
├── src/
│   └── index.ts
└── README.md
```

### 2. Definir SKILL.md

```markdown
# Skill: my-skill

## Descrição
Descrição da skill.

## Capabilities
- capability-1
- capability-2

## Permissões
- tool.permission-1
- tool.permission-2

## Uso
Instruções de uso.
```

### 3. Implementar

```typescript
// src/index.ts
export const mySkill: Skill = {
  id: 'my-skill',
  name: 'My Skill',
  description: 'Descrição',
  version: '1.0.0',
  
  async initialize(config: SkillConfig): Promise<void> {
    // Inicialização
  },
  
  getCapabilities(): Capability[] {
    return [
      {
        id: 'capability-1',
        name: 'Capability 1',
        description: 'Descrição',
        execute: async (input) => { /* ... */ },
      },
    ];
  },
  
  async dispose(): Promise<void> {
    // Limpeza
  },
};
```

## Best Practices

1. **Documente bem** o SKILL.md
2. **Use versionamento** semântico
3. **Valide inputs** com Zod schemas
4. **Log erros** com forgeDebug
5. **Limpe recursos** no dispose
