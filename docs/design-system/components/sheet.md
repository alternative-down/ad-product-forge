# Sheet

Componente de panel deslizante (slide-over) para exibir conteúdo em um panel lateral ou inferior.

## Anatomia

```
┌────────────────────────────────────┐
│                                    │
│                                    │
│  Título do Sheet                   │  ← SheetTitle
│  Descrição opcional                │  ← SheetDescription
│                                    │
│  ┌────────────────────────────┐   │
│  │                            │   │
│  │    Conteúdo principal     │   │  ← SheetContent
│  │                            │   │
│  └────────────────────────────┘   │
│                                    │
│         [Cancelar]  [Ação]         │  ← SheetFooter
│                                    │
└────────────────────────────────────┘
```

## Posições

O componente pode aparecer em 4 posições:

| Posição | Uso típico |
|---------|-----------|
| `right` | Painel lateral direito (default) |
| `left` | Painel lateral esquerdo |
| `top` | Banner/drawer superior |
| `bottom` | Bottom sheet para mobile |

## Componentes

### Sheet

Container principal que gerencia o estado e a posição do sheet.

| Propriedade | Tipo | Obrigatório | Padrão | Descrição |
|-------------|------|-------------|--------|-----------|
| `open` | `boolean` | ✅ | - | Controla visibilidade |
| `onClose` | `() => void` | ✅ | - | Callback ao fechar |
| `children` | `ReactNode` | ✅ | - | Conteúdo interno |
| `className` | `string` | ❌ | - | Classes CSS adicionais |
| `side` | `'left'` \| `'right'` \| `'top'` \| `'bottom'` | ❌ | `'right'` | Posição do sheet |

### SheetHeader

Cabeçalho do sheet com margem para o botão fechar.

| Propriedade | Tipo | Obrigatório | Descrição |
|-------------|------|-------------|-----------|
| `children` | `ReactNode` | ✅ | Título e descrição |
| `className` | `string` | ❌ | Classes CSS adicionais |

### SheetTitle

Título do sheet.

| Propriedade | Tipo | Obrigatório | Descrição |
|-------------|------|-------------|-----------|
| `children` | `ReactNode` | ✅ | Texto do título |
| `className` | `string` | ❌ | Classes CSS adicionais |

### SheetDescription

Descrição complementar.

| Propriedade | Tipo | Obrigatório | Descrição |
|-------------|------|-------------|-----------|
| `children` | `ReactNode` | ✅ | Texto da descrição |
| `className` | `string` | ❌ | Classes CSS adicionais |

### SheetContent

Área principal de conteúdo.

| Propriedade | Tipo | Obrigatório | Descrição |
|-------------|------|-------------|-----------|
| `children` | `ReactNode` | ✅ | Conteúdo principal |
| `className` | `string` | ❌ | Classes CSS adicionais |

### SheetFooter

Rodapé com ações.

| Propriedade | Tipo | Obrigatório | Descrição |
|-------------|------|-------------|-----------|
| `children` | `ReactNode` | ✅ | Botões de ação |
| `className` | `string` | ❌ | Classes CSS adicionais |

## Uso

```tsx
import { useState } from 'react';
import {
  Sheet,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetContent,
  SheetFooter,
} from '@forge/ui';
import { Button } from '@forge/ui';

function SlideOverPanel() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        Abrir Panel
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)}>
        <SheetHeader>
          <SheetTitle>Configurações</SheetTitle>
          <SheetDescription>
            Ajuste as configurações do sistema.
          </SheetDescription>
        </SheetHeader>

        <SheetContent>
          <p>Conteúdo do panel aqui.</p>
        </SheetContent>

        <SheetFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => setOpen(false)}>
            Salvar
          </Button>
        </SheetFooter>
      </Sheet>
    </>
  );
}
```

### Bottom Sheet (Mobile)

```tsx
<Sheet open={open} onClose={() => setOpen(false)} side="bottom">
  <SheetHeader>
    <SheetTitle>Mais Opções</SheetTitle>
  </SheetHeader>
  <SheetContent>
    {/* Conteúdo scrollável */}
  </SheetContent>
</Sheet>
```

## Acessibilidade

- Fecha ao pressionar `Escape`
- Trapa rolagem do body quando aberto
- Click no overlay fecha o sheet
- Atributos ARIA corretos (`role="dialog"`, `aria-modal="true"`)

## Tamanhos

| Posição | Largura/Altura |
|---------|----------------|
| `left` / `right` | 75% da tela, max 384px (sm) |
| `top` / `bottom` | 50vh máximo |

## Estilização

Utiliza as mesmas variáveis CSS do Dialog:

| Variável | Uso |
|----------|-----|
| `--panel` | Background do sheet |
| `--ink` | Cor do título |
| `--muted` | Cor da descrição |
| `--accent` | Cor do foco |

## Localização

`packages/forge-ui/src/components/sheet.tsx`
