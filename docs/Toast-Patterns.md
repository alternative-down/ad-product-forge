# Toast Patterns — forge-admin

> Padrões de toast notifications para o forge-admin UI.
> Baseado em shadcn/ui com customização para o brand voice.

---

## 1. Visão Geral

Toasts são notificações momentâneas que confirmam ações ou alertam sobre problemas.

### Comportamento por Tipo

| Tipo | Duração | Comportamento | Ícone | Cor |
|------|---------|---------------|-------|-----|
| **Success** | 3s auto-dismiss | Desaparece automaticamente | ✅ | Verde |
| **Error** | Persiste | Requer ação ou dismiss manual | ❌ | Vermelho |
| **Warning** | Persiste | Atenção necessária | ⚠️ | Amarelo/Laranja |
| **Info** | 3s auto-dismiss | Informativo geral | ℹ️ | Azul |

---

## 2. Templates de Toast

### 2.1 Success Toasts

**Estrutura:**
```
✅ [Título da ação]
[Descrição opcional com contexto]
```

**Exemplos:**

| Contexto | Toast Title | Toast Description |
|----------|-------------|-------------------|
| Agent contratado | "Agent contratado" | "Vox está inicializando..." |
| Config salvo | "Configurações salvas" | "Changes aplicam-se em até 30s" |
| Budget atualizado | "Budget atualizado" | "Novo limite: R$ 500/semana" |
| Schedule criado | "Agendamento criado" | "Próxima execução: sex 14h" |
| Agent acordado | "Agent acordado" | "Vox está respondendo" |
| Agent terminado | "Agent desativado" | "Runtime limpo com sucesso" |
| Agent removido | "Agent removido" | — |

### 2.2 Error Toasts

**Estrutura:**
```
❌ [Título descritivo]
[Motivo técnico resumido]
[Ação sugerida]
```

**Exemplos:**

| Contexto | Toast Title | Toast Description |
|----------|-------------|-------------------|
| Contratação falhou | "Falha ao contratar" | "Verifique o budget e tente novamente" |
| Budget esgotado | "Budget insuficiente" | "Agent não pode executar" |
| Provider offline | "Provider offline" | "Discord não está respondendo" |
| Network error | "Erro de conexão" | "Verifique sua internet" |
| Timeout | "Tempo esgotado" | "Operação demorou demais" |

### 2.3 Warning Toasts

**Estrutura:**
```
⚠️ [Título descritivo]
[Contexto ou motivo]
```

**Exemplos:**

| Contexto | Toast Title | Toast Description |
|----------|-------------|-------------------|
| Budget baixo | "Budget baixo" | "15% restantes — R$ 3,75 de R$ 25,00" |
| Token expirando | "Token prestes a expirar" | "Renove nas próximas 24h" |
| Agent ocioso | "Agent ocioso" | "Vox sem atividade há 2h" |
| Concurrent limit | "Limite de agents" | "Máximo de 5 agents ativos" |

### 2.4 Info Toasts

**Estrutura:**
```
ℹ️ [Informação]
[Contexto opcional]
```

**Exemplos:**

| Contexto | Toast Title | Toast Description |
|----------|-------------|-------------------|
| Agent idle | "Agent em espera" | "Aguardando próxima execução" |
| Memory saving | "Salvando memória" | "Consolidação em andamento..." |
| Sync completo | "Sincronizado" | "Dados atualizados" |

---

## 3. Posicionamento

| Posição | Uso |
|---------|-----|
| **Top-right** | Toasts de ação do usuário (contratar, salvar, etc.) |
| **Top-center** | Alertas de sistema (budget baixo, provider offline) |
| **Bottom-right** | Histórico de notifications |

---

## 4. Anatomia do Toast (shadcn/ui)

```tsx
<Toast>
  <ToastIcon type="success" />  {/* ✅ ❌ ⚠️ ℹ️ */}
  <ToastTitle>Agent contratado</ToastTitle>
  <ToastDescription>Vox está inicializando...</ToastDescription>
  {action && <ToastAction>Ver runtime</ToastAction>}
  {dismissible && <ToastClose />}
</Toast>
```

### Elementos Opcionais

| Elemento | Quando Usar | Exemplo |
|----------|-------------|---------|
| **ToastAction** | Link para ação relacionada | "Ver runtime", "Aumentar budget" |
| **ToastClose** | Permitir dismiss manual | X no canto |
| **ToastDescription** | Contexto adicional | — |

---

## 5. Exemplos de Implementação

### Contratar Agent

```tsx
// Loading
<Toast>
  <ToastIcon type="loading" />
  <ToastTitle>Contratando agent...</ToastTitle>
</Toast>

// Success
<Toast>
  <ToastIcon type="success" />
  <ToastTitle>Agent contratado</ToastTitle>
  <ToastDescription>Vox está inicializando...</ToastDescription>
  <ToastAction altText="Ver runtime">Ver runtime</ToastAction>
</Toast>

// Error
<Toast>
  <ToastIcon type="error" />
  <ToastTitle>Falha ao contratar</ToastTitle>
  <ToastDescription>Verifique o budget e tente novamente</ToastDescription>
  <ToastAction altText="Aumentar budget">Aumentar budget</ToastAction>
</Toast>
```

### Atualizar Budget

```tsx
// Success
<Toast>
  <ToastIcon type="success" />
  <ToastTitle>Budget atualizado</ToastTitle>
  <ToastDescription>Novo limite: R$ 500/semana</ToastDescription>
</Toast>

// Error - insufficient
<Toast>
  <ToastIcon type="error" />
  <ToastTitle>Budget insuficiente</ToastTitle>
  <ToastDescription>Mínimo: R$ 1,00</ToastDescription>
</Toast>

// Warning - low
<Toast>
  <ToastIcon type="warning" />
  <ToastTitle>Budget baixo</ToastTitle>
  <ToastDescription>15% restantes — R$ 3,75 de R$ 25,00</ToastDescription>
  <ToastAction altText="Aumentar">Aumentar</ToastAction>
</Toast>
```

---

## 6. Regras de Copy

### Título do Toast

| Regra | ❌ Evitar | ✅ Preferir |
|-------|----------|-------------|
| Seja específico | "Erro" | "Falha ao contratar agent" |
| Use verbos | "Configuração salva" | "Configurações salvas" |
| Seja conciso | "Agent vox foi atualizado com sucesso" | "Budget atualizado" |

### Descrição do Toast

| Regra | ❌ Evitar | ✅ Preferir |
|-------|----------|-------------|
| Adicione contexto | — | "Vox está inicializando..." |
| Seja útil | "Algo deu errado" | "Verifique o budget e tente novamente" |
| Inclua dados | — | "R$ 3,75 de R$ 25,00 restantes" |

---

## 7. Version History

| Versão | Data | Mudanças |
|--------|------|---------|
| 1.0 | 2026-03-27 | Versão inicial com templates por tipo e implementação |

---

*Documento mantido por: Vox (Brand Voice)*
