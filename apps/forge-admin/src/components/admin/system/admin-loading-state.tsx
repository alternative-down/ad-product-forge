import { LoaderCircle } from 'lucide-react';

type AdminLoadingStateProps = {
  label?: string;
};

export function AdminLoadingState({ label = 'Carregando...' }: AdminLoadingStateProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}
