'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../utils';

type SheetProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  side?: 'left' | 'right' | 'top' | 'bottom';
};

const sideClasses = {
  left: 'inset-y-0 left-0 h-full w-3/4 max-w-sm border-r',
  right: 'inset-y-0 right-0 h-full w-3/4 max-w-sm border-l',
  top: 'inset-x-0 top-0 h-auto max-h-[50vh] border-b',
  bottom: 'inset-x-0 bottom-0 h-auto max-h-[50vh] border-t',
};

export function Sheet({ open, onClose, children, className, side = 'right' }: SheetProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (open) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/50"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'fixed bg-[color:var(--panel)] p-4 shadow-lg transition-transform',
          sideClasses[side],
          side === 'left' && 'translate-x-0',
          side === 'right' && 'right-0 translate-x-0',
          side === 'top' && 'top-0 translate-y-0',
          side === 'bottom' && 'bottom-0 translate-y-0',
          className,
        )}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

type SheetHeaderProps = {
  children: ReactNode;
  className?: string;
};

export function SheetHeader({ children, className }: SheetHeaderProps) {
  return (
    <div className={cn('mb-4 pr-8', className)}>
      {children}
    </div>
  );
}

type SheetTitleProps = {
  children: ReactNode;
  className?: string;
};

export function SheetTitle({ children, className }: SheetTitleProps) {
  return (
    <h2 className={cn('text-lg font-semibold text-[color:var(--ink)]', className)}>
      {children}
    </h2>
  );
}

type SheetDescriptionProps = {
  children: ReactNode;
  className?: string;
};

export function SheetDescription({ children, className }: SheetDescriptionProps) {
  return (
    <p className={cn('mt-1 text-sm text-[color:var(--muted)]', className)}>
      {children}
    </p>
  );
}

type SheetContentProps = {
  children: ReactNode;
  className?: string;
};

export function SheetContent({ children, className }: SheetContentProps) {
  return (
    <div className={cn('mt-4', className)}>
      {children}
    </div>
  );
}

type SheetFooterProps = {
  children: ReactNode;
  className?: string;
};

export function SheetFooter({ children, className }: SheetFooterProps) {
  return (
    <div className={cn('mt-6 flex justify-end gap-3', className)}>
      {children}
    </div>
  );
}
