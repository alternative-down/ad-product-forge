# Dialog

Componente de modal/dialog para exibir conteúdo em foco sobreposto à interface principal.

## Anatomia

```
┌─────────────────────────────────────┐
│  [X]                                │  ← Botão fechar (top-right)
│                                     │
│  Título do Dialog                   │  ← DialogTitle
│  Descrição do conteúdo aqui         │  ← DialogDescription
│                                     │
│  ┌─────────────────────────────┐    │
│  │                             │    │  ← DialogContent
│  │     Conteúdo principal     │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│         [Cancelar]  [Confirmar]     │  ← DialogFooter
└─────────────────────────────────────┘
```

## Componentes

### Dialog

Container principal que gerencia o estado de abertura/fechamento e accessibility.

| Propriedade | Tipo | Obrigatório | Descrição |
|-------------|------|-------------|-----------|
| `open` | `boolean` | ✅ | Controla visibilidade do dialog |
| `onClose` | `() => void` | ✅ | Callback chamado ao fechar |
| `children` | `ReactNode` | ✅ | Conteúdo interno |
| `className` | `string` | ❌ | Classes CSS adicionais |

### DialogHeader

Agrupa título e descrição no cabeçalho do dialog.

| Propriedade | Tipo | Obrigatório | Descrição |
|-------------|------|-------------|-----------|
| `children` | `ReactNode` | ✅ | Título e descrição |
| `className` | `string` | ❌ | Classes CSS adicionais |

### DialogTitle

Título do dialog.

| Propriedade | Tipo | Obrigatório | Descrição |
|-------------|------|-------------|-----------|
| `children` | `ReactNode` | ✅ | Texto do título |
| `className` | `string` | ❌ | Classes CSS adicionais |

### DialogDescription

Descrição complementar ao título.

| Propriedade | Tipo | Obrigatório | Descrição |
|-------------|------|-------------|-----------|
| `children` | `ReactNode` | ✅ | Texto da descrição |
| `className` | `string` | ❌ | Classes CSS adicionais |

### DialogContent

Área principal para conteúdo do dialog.

| Propriedade | Tipo | Obrigatório | Descrição |
|-------------|------|-------------|-----------|
| `children` | `ReactNode` | ✅ | Conteúdo principal |
| `className` | `string` | ❌ | Classes CSS adicionais |

### DialogFooter

Área para ações/botões no rodapé do dialog.

| Propriedade | Tipo | Obrigatório | Descrição |
|-------------|------|-------------|-----------|
| `children` | `ReactNode` | ✅ | Botões de ação |
| `className` | `string` | ❌ | Classes CSS adicionais |

## Uso

```tsx
import { useState } from 'react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
} from '@forge/ui';
import { Button } from '@forge/ui';

function ConfirmDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        Abrir Dialog
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogHeader>
          <DialogTitle>Confirmar Ação</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja executar esta ação? Esta operação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>

        <DialogContent>
          <p>Conteúdo adicional do dialog aqui.</p>
        </DialogContent>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => setOpen(false)}>
            Confirmar
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
```

## Acessibilidade

- Fecha ao pressionar `Escape`
- Trapa rolagem do body quando aberto
- Click no overlay fecha o dialog
- Focus trap interno
- Atributos ARIA corretos (`role="dialog"`, `aria-modal="true"`)

## Estilização

O componente utiliza variáveis CSS do tema:

| Variável | Uso |
|----------|-----|
| `--panel` | Background do dialog |
| `--ink` | Cor do texto (título) |
| `--muted` | Cor do texto secundário (descrição) |
| `--accent` | Cor do foco |

## Localização

`packages/forge-ui/src/components/dialog.tsx`
