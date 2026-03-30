import type { ReactNode } from 'react';
import { LoaderCircle, Inbox, FileQuestion } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';

/**
 * Skeleton component with pulse animation for loading states
 */
export function Skeleton(input: { className?: string; width?: string; height?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', input.className)}
      style={{
        width: input.width,
        height: input.height,
      }}
    />
  );
}

/**
 * Skeleton variant for text lines
 */
export function SkeletonText(input: { lines?: number; className?: string }) {
  const lines = input.lines ?? 3;
  return (
    <div className={cn('space-y-2', input.className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
      {lines > 1 && <Skeleton className="h-4 w-3/4" />}
    </div>
  );
}

/**
 * Skeleton variant for cards
 */
export function SkeletonCard() {
  return (
    <Card className="p-6">
      <div className="space-y-4">
        <Skeleton className="h-6 w-1/3" />
        <SkeletonText lines={2} />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
    </Card>
  );
}

/**
 * Skeleton variant for table rows
 */
export function SkeletonTable(input: { rows?: number; columns?: number; className?: string }) {
  const rows = input.rows ?? 5;
  const columns = input.columns ?? 3;
  return (
    <div className={cn('space-y-3', input.className)}>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * EmptyState component for empty lists/collections
 */
export function EmptyState(input: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = input.icon ?? Inbox;
  return (
    <Card className={cn('flex flex-col items-center justify-center p-12 text-center', input.className)}>
      <div className="rounded-full bg-muted p-4">
        {typeof Icon === 'function' ? <Icon className="h-8 w-8 text-muted-foreground" /> : Icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold">{input.title}</h3>
      {input.description && <p className="mt-1 text-sm text-muted-foreground">{input.description}</p>}
      {input.action && <div className="mt-4">{input.action}</div>}
    </Card>
  );
}

/**
 * ErrorState component for error states
 */
export function ErrorState(input: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <Card className={cn('flex flex-col items-center justify-center p-12 text-center', input.className)}>
      <div className="rounded-full bg-muted p-4">
        <FileQuestion className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">Algo deu errado</h3>
      <p className="mt-1 text-sm text-muted-foreground">{input.message}</p>
      {input.onRetry && (
        <Button variant="secondary" className="mt-4" onClick={input.onRetry}>
          Tentar novamente
        </Button>
      )}
    </Card>
  );
}

export function ReadOnlyField(input: { label: string; value: string; wrap?: boolean }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {input.label}
      </div>
      <div className={cn('mt-1 text-sm', input.wrap && 'break-all')}>{input.value}</div>
    </div>
  );
}

export function LabeledField(input: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('grid gap-2 text-sm', input.className)}>
      <span className="font-medium">{input.label}</span>
      {input.children}
    </label>
  );
}

export function PanelLoading(input: { label: string }) {
  return (
    <Card className="flex items-center gap-3 p-6 text-sm">
      <LoaderCircle className="h-4 w-4 animate-spin" />
      {input.label}
    </Card>
  );
}

export function PanelError(input: { message: string }) {
  return <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{input.message}</Card>;
}

export function CompactStat(input: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[color:var(--panel-border)] px-3 py-2 last:border-b-0">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{input.label}</span>
      <span className="text-sm font-semibold">{input.value}</span>
    </div>
  );
}
