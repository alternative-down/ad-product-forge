# Como Configurar Permissões e Ferramentas

Entenda o sistema de permissões do Ad Product Forge e como configurar o acesso de cada agente.

## Visão Geral do Sistema

O Ad Product Forge possui um sistema de **Capabilities** (capacidades) baseado em **Roles** (papéis). Cada agente recebe permissões específicas através de funções que definem quais ferramentas e fluxos de trabalho ele pode acessar.

### Componentes Principais

- **Roles (Funções)**: Conjuntos de permissões nomeadas
- **Capabilities (Capacidades)**: Permissões individuais para ferramentas específicas
- **Tools (Ferramentas)**: Ações que o agente pode executar
- **Workflows (Fluxos)**: Processos completos como contratação e rescisão

---

## Funções Padrão do Sistema

O sistema vem com funções pré-definidas que cobrem a maioria dos casos de uso:

| Função | Descrição | Permissões Típicas |
|--------|-----------|-------------------|
| **OWNER** | Dono da empresa | Todas as permissões |
| **ADMIN** | Administrador | Gerenciamento completo de agentes |
| **COORDINATOR** | Coordenador | Criar e gerenciar tarefas entre agentes |
| **FINANCE** | Financeiro | Apenas operações de orçamento |
| **AGENT** | Agente padrão | Usar ferramentas, listar próprias tarefas |

### Permissões por Função

**OWNER e ADMIN**
- Criar e gerenciar agentes
- Configurar orçamentos e contratos
- Alterar permissões de outros
- Acessar todas as ferramentas do sistema

**COORDINATOR**
- Criar tarefas para outros agentes
- Listar tarefas de toda a equipe
- Cancelar e atualizar tarefas
- Monitore o progresso geral

**FINANCE**
- Ver orçamentos de todos os agentes
- Fazer top-up de contratos
- Ajustar limites de orçamento
- Visualizar relatórios financeiros

**AGENT**
- Executar tarefas atribuídas
- Usar ferramentas permitidas
- Listar próprias tarefas
- Atualizar status de execução

---

## Como Atribuir Funções a Agentes

### Passo a Passo

1. Acesse a página de gerenciamento de agentes
2. Selecione o agente que deseja configurar
3. Navegue até a seção "Permissões" ou "Configurações"
4. Localize o campo "Função" ou "Role"
5. Selecione a função apropriada
6. Salve as alterações

### Exemplo: Configurando um Agente Financeiro

```
1. Vá para Agentes → Detalhes do Agente
2. Clique em "Editar Configuração"
3. Selecione Role: FINANCE
4. O agente terá acesso apenas a:
   - Ver orçamentos
   - Fazer top-up
   - Ver relatórios
5. O agente NÃO terá acesso a:
   - Criar novos agentes
   - Alterar configurações de outros
   - Usar ferramentas de desenvolvimento
```

---

## Gerenciando Ferramentas por Função

Cada função pode ter permissões de ferramentas personalizadas.

### Ferramentas Disponíveis (64 ferramentas)

O sistema possui mais de 60 ferramentas organizadas em categorias:

**Desenvolvimento**
- `list_github_issues` - Listar issues do GitHub
- `create_github_issue` - Criar issue
- `list_github_pull_requests` - Listar PRs
- `create_github_pull_request` - Criar PR
- `list_github_pull_request_comments` - Listar comentários de PR
- `create_github_repository` - Criar repositório
- `manage_github_webhook` - Gerenciar webhooks
- `write_file`, `read_file`, `edit_file`, `delete_file` - Operações de arquivo
- `execute_command` - Executar comandos shell

**Gestão de Crons**
- `manage_self_crons` - Criar, atualizar ou deletar cron próprio
- `list_self_crons` - Listar crons próprios
- `manage_crons` - Criar, atualizar ou deletar cron para outro agente
- `list_crons` - Listar crons criados para outros agentes

**Comunicação**
- `send_message` - Enviar mensagem
- `change_chat_group` - Criar ou atualizar grupo

**Financeiro**
- `get_company_financial_summary` - Ver resumo financeiro
- `get_company_balance` - Ver saldo da empresa
- `adjust_agent_contract_budget` - Ajustar orçamento
- `get_agent_contract_details` - Ver detalhes do contrato

**Sistema**
- `list_agents` - Listar agentes
- `get_agent_status` - Ver status do agente
- `hire_agent` - Contratar agente
- `terminate_agent` - Desligar agente

### Adicionando Permissão de Ferramenta a uma Função

1. Acesse "Configurações → Roles"
2. Selecione a função que deseja editar
3. Clique em "Adicionar Permissão de Ferramenta"
4. Busque e selecione a ferramenta desejada
5. Confirme a adição

### Removendo Permissão de Ferramenta

1. Na página da função, localize a ferramenta
2. Clique no botão de remover (X)
3. Confirme a remoção

---

## Como Criar Funções Personalizadas

Se as funções padrão não atendem, você pode criar funções específicas.

### Passo a Passo

1. Acesse "Configurações → Roles"
2. Clique em "Criar Nova Função"
3. Defina:
   - Nome da função (ex: "QA Engineer")
   - Descrição (opcional)
   - Permissões de ferramentas (selecione as permitidas)
   - Permissões de workflows (selecione os permitidos)
4. Salve a nova função

### Exemplo: Função "QA Engineer"

```yaml
Nome: QA Engineer
Descrição: Agente responsável por controle de qualidade

Permissões de Ferramentas:
  - list_github_issues ✓
  - list_github_pull_requests ✓
  - list_github_pull_request_comments ✓
  - write_file ✓
  - read_file ✓

Permissões de Workflows:
  - Nenhuma (QA não contrata/desliga agentes)
```

---

## Fluxos de Trabalho (Workflows)

Além de ferramentas individuais, o sistema possui workflows completos:

| Workflow | Descrição | Quem Pode Executar |
|----------|-----------|--------------------|
| `hire_agent` | Contratar novo agente | OWNER, ADMIN |
| `terminate_agent` | Desligar agente | OWNER, ADMIN |

### Configurando Permissão de Workflow

1. Edite a função desejada
2. Na seção "Workflow Permissions"
3. Marque/desmarque os workflows permitidos
4. Salve as alterações

---

## Aliases de Permissões Legadas

Para compatibilidade, o sistema ainda suporta aliases antigos:

| Alias Antigo | Equivalente Novo |
|--------------|------------------|
| `github` | Múltiplas ferramentas GitHub |
| `filesystem` | Operações de arquivo |
| `system` | Gerenciamento de agentes |
| `finance` | Operações financeiras |

---

## Boas Práticas

### Princípio do Mínimo Privilégio

**Dê apenas as permissões necessárias para cada função.**

- Não dê permissões de ADMIN para todos
- Agentes específicos devem ter funções específicas
- Revise permissões regularmente

### Exemplo de Configuração Segura

```
Função: "Agente de Revisão de Código"
✅ Permissões:
  - list_github_issues
  - list_github_pull_requests
  - list_github_pull_request_comments
  - read_file

❌ Não deve ter:
  - create_github_repository
  - delete_file
  - execute_command
  - hire_agent
  - terminate_agent
```

### Auditoria de Permissões

- Revise permissões mensalmente
- Remova acessos não utilizados
- Documente mudanças de configuração
- Monitore uso de ferramentas sensíveis

---

## FAQ

**P: Posso dar permissões diretamente a um agente sem função?**
R: Sim, você pode configurar permissões individuais por agente, mas o recomendado é usar funções para facilitar a gestão.

**P: Um agente pode ter múltiplas funções?**
R: Sim, um agente pode herdar permissões de múltiplas funções. As permissões são combinadas.

**P: Como sei quais ferramentas um agente pode usar?**
R: Acesse os detalhes do agente e veja a seção "Permissões Ativas" ou "Allowed Tools".

**P: O que acontece se eu remover uma ferramenta de uma função?**
R: Todos os agentes com essa função perdem acesso imediatamente. Use com cautela.

**P: Posso limitar o uso de uma ferramenta?**
R: Atualmente não há limite por ferramenta. O controle é feito pelo orçamento total do contrato.

---

## Tópicos Relacionados

- [Sistema de Permissões Detalhado](../guias/permissions.md)
- [Ciclo de Vida do Agente](../guias/agent-lifecycle.md)
- [Como Contratar um Agente](./como-contratar-agente.md)
