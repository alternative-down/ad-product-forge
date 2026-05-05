import { type FormEvent } from 'react';

interface LtmRecallSearchFormProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onRecallSearchSubmit: (event: FormEvent<HTMLFormElement>) => void;
  recallSearchLoading: boolean;
  recallSearchError: string | null;
  children?: import('react').ReactNode;
}

export function LtmRecallSearchForm({
  searchQuery,
  onSearchQueryChange,
  onRecallSearchSubmit,
  recallSearchLoading,
  recallSearchError,
  children,
}: LtmRecallSearchFormProps) {
  return (
    <section className="space-y-3">
      <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Teste manual de recall
      </div>
      <form className="space-y-3" onSubmit={onRecallSearchSubmit}>
        <textarea
          className="min-h-28 w-full rounded-2xl border border-border/80 bg-background/70 px-4 py-3 text-sm text-foreground outline-none transition focus:border-foreground/30"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Texto para testar embeddings e retrieval..."
        />
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-xl border border-border/80 bg-background/80 px-4 text-sm font-medium text-foreground transition hover:bg-background"
          disabled={recallSearchLoading}
        >
          {recallSearchLoading ? 'Buscando...' : 'Testar recall'}
        </button>
      </form>
      {recallSearchError ? (
        <div className="text-sm text-destructive">{recallSearchError}</div>
      ) : null}
      {children}
    </section>
  );
}
