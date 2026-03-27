# Unsaved Changes Warning — forge-admin

> Padrões de warning para dados não salvos no forge-admin UI.
> Quick Win #3 do issue #241 — Nielsen Heuristic #6 (Recognition vs Recall)

---

## 1. Visão Geral

O warning de "unsaved changes" impede que o usuário perca dados ao navegar fora de um formulário ou página com alterações pendentes.

### Quando Mostrar

| Cenário | Exemplo | Trigger |
|---------|---------|---------|
| Navegação via menu | Clicou em outro item do sidebar | BeforeNavigate |
| Fechamento de modal | Clicou fora do modal ou X | BeforeDismiss |
| Refresh da página | F5 ou Ctrl+R | BeforeUnload |
| Timeout de sessão | Sessão expirou com dados pendentes | SessionTimeout |

---

## 2. Tipos de Componente

### 2.1 Browser Native (BeforeUnload)

**Uso:** Refresh/navegação away da página

```tsx
// Evento onbeforeunload (browser native)
window.addEventListener('beforeunload', (event) => {
  if (hasUnsavedChanges) {
    event.preventDefault();
    event.returnValue = ''; // Chrome requer isso
  }
});
```

**Nota:** Não é possível customizar o texto do browser native dialog. O browser mostra uma mensagem genérica.

### 2.2 Modal de Confirmação (React)

**Uso:** Navegação interna ou saída de modal

```tsx
<AlertDialog>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>
        <AlertTriangle className="w-5 h-5 text-yellow-500" />
        Discard changes?
      </AlertDialogTitle>
      <AlertDialogDescription>
        You have unsaved changes. Are you sure you want to leave?
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Keep editing</AlertDialogCancel>
      <AlertDialogAction onClick={handleDiscard}>
        Discard
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## 3. Copy Templates

### 3.1 Modal Title

| Cenário | Copy |
|---------|------|
| Formulário genérico | "Descartar alterações?" |
| Hiring wizard | "Sair da contratação?" |
| Edição de agent | "Descartar mudanças do agent?" |
| Configuração | "Descartar configurações?" |

### 3.2 Modal Description

| Cenário | Copy |
|---------|------|
| Genérico | "Você tem alterações não salvas. Se sair agora, perderá o progresso." |
| Hiring wizard | "As informações preenchidas no wizard serão perdidas." |
| Com dados específicos | "Você alterou {{count}} campo(s). Estas mudanças não foram salvas." |
| Timeout | "Sua sessão expirou. As alterações não salvas foram perdidas." |

### 3.3 Button Labels

| Botão | Label | Ação |
|-------|-------|------|
| Cancel/Destructive | "Descartar" | Navega para fora, perde dados |
| Confirm/Primary | "Continuar editando" | Mantém o usuário no formulário |
| Neutral | "Cancelar" | Fecha o modal, mantém estado |

### 3.4 Opções de ação para Hiring Wizard

| Ação | Label | Comportamento |
|------|-------|---------------|
| Manter dados | "Continuar preenchendo" | Fecha modal, mantém formulário |
| Descartar | "Descartar e sair" | Volta para /agents, limpa formulário |
| Salvar rascunho | "Salvar como rascunho" | Persiste dados, sai do wizard |

---

## 4. Copy por Contexto

### 4.1 Hiring Wizard — Descartar

```
⚠️ Sair da contratação?

As informações preenchidas no wizard serão perdidas.

[Continuar preenchendo]  [Descartar e sair]
```

### 4.2 Agent Config — Alterações pendentes

```
⚠️ Discard changes?

You modified {{count}} field(s). Your changes will not be saved.

[Keep editing]  [Discard]
```

### 4.3 Timeout de Sessão

```
⏱️ Sessão expirada

Sua sessão expirou. Por favor, faça login novamente.

[Login novamente]
```

### 4.4 Refresh da Página

```
⚠️ Confirm refresh?

Você tem alterações não salvas. Se atualizar a página, perderá seu progresso.

[Stay on page]  [Leave page]
```

---

## 5. Estados de Detecção

### Condição para mostrar warning

```tsx
const hasUnsavedChanges = useMemo(() => {
  // Comparar estado atual com estado inicial/salvo
  return !isEqual(currentFormState, savedFormState);
}, [currentFormState, savedFormState]);
```

### Estados do Formulário

| Estado | Indicador Visual | Has Warning |
|--------|-------------------|-------------|
| Pristine | Nenhum | Não |
| Modified | Badge "Unsaved" | Sim |
| Saving | Spinner no botão | Não |
| Saved | Toast success | Não |
| Error | Toast error | Não |

---

## 6. UX Guidelines

### Quando NÃO mostrar warning

| Cenário | Razão |
|---------|-------|
| Formulário já salvo | Mudanças já persistidas |
| Form empty/pristine | Nada para perder |
| Loading state | Operação em progresso |
| Timeout de rede | Error toast já mostrado |

### Performance

- Detectar mudanças em tempo real, não apenas no blur
- Debounce validações para evitar flickering
- Usar `isEqual` para comparações profundas de objetos

---

## 7. Version History

| Versão | Data | Mudanças |
|--------|------|----------|
| 1.0 | 2026-03-27 | Versão inicial com templates para modal e browser native |

---

*Documento mantido por: Vox (Brand Voice)*
