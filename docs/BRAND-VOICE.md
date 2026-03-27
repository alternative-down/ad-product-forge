# Brand Voice — ad-product-forge

> Documento de Brand Voice e Copy Guidelines para o forge-admin UI.
> Aplicável a todas as interfaces, mensagens, labels, e comunicações do sistema de administração.

---

## 1. Visão Geral

### 1.1 O que é o forge-admin?

O forge-admin é a **interface de controle administrativo** do sistema ad-product-forge. É onde humanos (admins) gerenciam agents, supervisionam execução, configuram budgets e mantêm visibilidade operacional.

### 1.2 Público-Alvo

- **Admins técnicos** da Alternative Down
- **Desenvolvedores** que precisam de visibilidade operacional
- Agentes de **suporte** que auxiliam em troubleshooting

### 1.3 Diferencial

O forge-admin não é um produto para clientes finais. É uma **ferramenta interna** — como um cockpit de controle. A experiência deve ser:

- **Clara e direta** — cada ação tem consequência óbvia
- **Informativa** — o estado do sistema é sempre visível
- **Eficiente** — admins experientes completam tarefas em segundos

---

## 2. Pilares do Brand Voice

### 2.1 Precisão Técnica

O forge-admin fala com pessoas que entendem o sistema. Não simplifique demais, mas também não assombre com jargão desnecessário.

| ❌ Evitar | ✅ Preferir |
|----------|-------------|
| "O robô está fazendo coisas" | "Agent em execução" |
| "Erro Happened" | "Falha na comunicação com Discord" |
| "Deu ruim" | "Budget excedido" |
| "Aquele negócio do agent" | "Agent vox-the-brand-voice" |

### 2.2 Clareza Operacional

Cada mensagem deve responder: **O que está acontecendo? O que eu preciso fazer?**

| Contexto | Copy 예시 |
|----------|-----------|
| Agent parado | "Agent inativo há 2h. Deseja acordá-lo?" |
| Budget baixo | "Budget剩余 15%. Agent serão suspensos quando zerar." |
| Erro de conexão | "Discord provider desconectado. Credenciais inválidas." |
| Ação concluída | "Agent acorddo. Iniciando comunicação em instantes." |

### 2.3 Profissionalismo Caloroso

Somos uma equipe pequena e ágil. A interface pode ser técnica sem ser fria.

| ❌ Robótico | ✅ Acessível mas profissional |
|------------|-------------------------------|
| "Agent terminated" | "Agent desativado com sucesso" |
| "Schedule created" | "Agendamento criado para sextas 14h" |
| "Error 500" | "Ops! Erro interno. Tente novamente em alguns minutos." |

### 2.4 Consistência de Estado

Sempre deixe claro **o que o sistema está fazendo** e **qual é o estado atual**.

- Loading states: "Carregando agents...", "Salvando configuração..."
- Empty states: "Nenhum agent ainda. Hire seu primeiro agent →"
- Error states: Mostrar a mensagem de erro técnica + ação sugerida

---

## 3. Tom e Estilo

### 3.1 Tom Predominante

**Técnico-Profissional com Acessibilidade**

- Formalidade: **Média** (nem super formal, nem slack)
- Clareza: **Alta** (prioridade #1)
- Calor: **Moderado** (somos humanos, não robôs)

### 3.2 Diretrizes de Escrita

#### Seja Específico
```
❌ "Algo deu errado"
✅ "Falha ao conectar com Discord: token expirado"

❌ "Agent atualizado"
✅ "Budget do agent vox aumentado para R$50/semana"
```

#### Use Verbos de Ação
```
❌ "Configurações salvas"
✅ "Salvar configurações" (botão)
✅ "Configurações salvas com sucesso" (confirmação)

❌ "Agent"
✅ "Contratar agent" (ação)
✅ "Agent contratado" (resultado)
```

#### Formate Números e Dados
```
✅ "R$ 1.250,00"
✅ "15 agents ativos"
✅ "Token expirou em 23/03/2026 14:32"
```

#### Mensagens de Erro — Estrutura
```
[O que aconteceu] + [Por que aconteceu] + [O que fazer]
"Não foi possível contratar agent. Budget insuficiente. 
Aumente o budget em Configuração > Contract."
```

---

## 4. Vocabulário Controlado

### 4.1 Termos do Sistema

| Termo | Uso correto | ❌ Evitar |
|-------|-------------|----------|
| Agent | "Agent vox em execução" | "Robô", "Bot", "IA" |
| Hire | "Contratar agent" | "Criar", "Gerar", "Spawnar" |
| Terminate | "Desativar agent" | "Matar", "Deletar", "Remover" |
| Wake | "Acordar agent" | "Ligar", "Ativar" |
| Budget | "Budget semanal" | "Crédito", "Saldo", "Limite" |
| Workspace | "Workspace de produção" | "Ambiente", "Área" |
| Function | "Function de copywriter" | "Papel", "Cargo", "Tipo" |
| Contract | "Contract do agent" | "Acordo", "Plano" |

### 4.2 Termos Técnicos

| Termo | Contexto |
|-------|----------|
| Runtime | "Ver runtime do agent" |
| Schedule | "Criar schedule para execução periódica" |
| Provider | "Discord provider configurado" |
| Tool | "Tool de GitHub disponível" |
| Trigger | "Trigger: mensagem no Discord" |

---

## 5. Diretrizes por Tipo de Mensagem

### 5.1 Títulos de Página

**Estrutura:** [Contexto] — [Ação Principal]

| Página | Título | Subtítulo |
|--------|--------|-----------|
| Overview | "Forge Control Center" | "Visão geral do sistema e atalhos rápidos" |
| Agents | "Agents" | "Gerencie agents, budgets e execuções" |
| Hire | "Contratar Agent" | "Configure e inicie um novo agent" |
| Finance | "Financeiro" | "Capital, payables e ledger" |
| System | "Sistema" | "Configs globais e integrações" |
| Roles | "Capabilities" | "Funções, permissões e ferramentas" |

### 5.2 Botões

| Ação | Label | Estado loading |
|------|-------|----------------|
| Confirmar criação | "Contratar Agent" | "Contratando..." |
| Cancelar | "Cancelar" | — |
| Salvar | "Salvar" | "Salvando..." |
| Deletar | "Remover" | "Removendo..." |
| Acordar agent | "Wake Agent" | "Acordando..." |
| Terminar agent | "Terminate" | "Terminando..." |

### 5.3 Mensagens de Sucesso

```
✅ "Agent contratado com sucesso. Vox está inicializando."
✅ "Schedule criado para sextas às 14h."
✅ "Configurações salvas. Changes aplicam-se em até 30s."
✅ "Budget atualizado. Novo limite: R$500/semana."
```

### 5.4 Mensagens de Erro

**Estrutura:**
```
⚠️ [Título do erro]
[Explicação técnica concisa]
[Ação sugerida]
```

**Exemplos:**
```
⚠️ Erro de conexão
Não foi possível conectar ao Discord. 
Verifique se o token ainda é válido.

[Ações:] Verificar credenciais | Tentar novamente
```

```
⚠️ Budget insuficiente
O agent não pode executar: budget esgotado.
R$ 0.00 de R$ 25.00/semana restantes.

[Ações:] Aumentar budget | Ver histórico de gastos
```

```
⚠️ Agent não encontrado
O agent especificado não existe ou foi removido.

[Ações:] Voltar para Agents | Criar novo agent
```

### 5.5 Empty States

| Contexto | Mensagem | Ação |
|----------|----------|------|
| Sem agents | "Nenhum agent ainda. Hora de montar seu time!" | "Contratar primeiro agent →" |
| Sem schedules | "Sem agendamentos. Programe execuções periódicas." | "Criar schedule →" |
| Sem transactions | "Nenhuma movimentação ainda." | — |
| Sem notifications | "Tudo quieto por aqui." | — |

### 5.6 Toast Notifications

```
✅ "Agent acordado"              — sucesso, auto-dismiss 3s
✅ "Configurações salvas"        — sucesso, auto-dismiss 3s
⚠️ "Budget baixo: 15% restante"  — warning, persistir
❌ "Erro ao contratar agent"      — error, persistir + ação
```

### 5.7 Tooltips e Help

| Elemento | Tooltip |
|----------|---------|
| Budget | "Valor máximo que o agent pode gastar por período." |
| Workspace | "Diretório onde o agent armazena arquivos e memória." |
| Schedule | "Quando e com que frequência o agent deve executar." |
| Function | "Papel e responsabilidades do agent no sistema." |

---

## 6. copy para Workflows

### 6.1 Wizard de Hiring (Issue #242)

#### Step 1: Basic Info
| Campo | Placeholder | Help |
|-------|-------------|------|
| agentName | "ex: vox-brand-voice" | "Nome único. 3-50 caracteres." |
| function | "Selecione uma função" | "Define permissões e ferramentas." |
| description | "Descreva o propósito do agent..." | — |

#### Step 2: Configuration
| Campo | Placeholder | Validação |
|-------|-------------|-----------|
| model | "Selecione o modelo" | "gpt-4o, gpt-4o-mini, claude-3-5..." |
| instructions | "Descreva o que este agent deve fazer..." | "Mínimo 50 caracteres." |
| workspace | "Selecione workspace" | "Diretório de trabalho do agent." |

#### Step 3: Contract (Budget)
| Campo | Placeholder | Warning |
|-------|-------------|---------|
| budgetAmount | "R$ 0.00" | "Atenção: gpt-4o pode consumir R$5-20/hora." |
| schedule | "Sob demanda" | — |

#### Step 4: Review
- Título: "Revise antes de confirmar"
- Labels: "Informações básicas", "Configuração", "Budget e Schedule"

#### Step 5: Confirmation
| Estado | Mensagem |
|--------|----------|
| Loading | "Contratando agent... Isso pode levar alguns segundos." |
| Sucesso | "✅ Agent contratado! Vox está inicializando." |
| Erro | "❌ Ops! Não foi possível contratar. [Motivo]" |

### 6.2 Formulário de Configuração

| Campo | Label | Placeholder |
|-------|-------|-------------|
| name | "Nome do Agent" | "vox-brand-voice" |
| description | "Descrição" | "Agent responsável por copywriting..." |
| instructions | "Instruções" | "Você é um copywriter especialista..." |
| model | "Modelo" | "gpt-4o-mini" |

---

## 7. Consistência Visual de Copy

### 7.1 Capitalização

| Tipo | Estilo | Exemplo |
|------|--------|---------|
| Títulos de página | Title Case | "Forge Control Center" |
| Títulos de seção | Sentence case | "Configurações do agent" |
| Botões | Title Case | "Salvar Configurações" |
| Labels | Sentence case | "Nome do agent" |
| Placeholders | lowercase | "ex: vox-brand-voice" |
| Tooltips | Sentence case | "Valor máximo por período." |

### 7.2 Pontuação

- Use **vírgulas** para separar itens em listas (3+ itens)
- Use **•** ou **—** para separadores em uma linha
- Não use **...** no final de mensagens de loading (já implícito)
- Use **:** após labels em formulários

### 7.3 Números e Datas

```
✅ R$ 1.250,00
✅ 15 agents
✅ 14:32
✅ 23/03/2026
✅ 15% restante
```

---

## 8. Referências

### 8.1 Team Contacts

| Papel | Responsável |
|-------|-------------|
| Design | Pixelia |
| Requirements | SpecQuest |
| Implementation | Pixel Architect |
| Brand Voice | Vox |

### 8.2 Documentos Relacionados

- Issue #241 — Heuristic UX Review (spec completa)
- Issue #242 — Hiring Workflow UX (spec completa)
- Issue #244 — Documentation Tracking

### 8.3 Inspiração

- **Linear** — clareza operacional, labels minimalistas
- **Vercel Dashboard** — feedback de estado, mensagens concisas
- **Stripe Dashboard** — erros acionáveis, consistência

---

## 9. Version History

| Versão | Data | Mudanças |
|--------|------|---------|
| 1.0 | 2026-03-27 | Versão inicial — 4 pilares, tom, vocabulário, diretrizes por tipo de mensagem |

---

*Documento mantido por: Vox (Brand Voice)*
