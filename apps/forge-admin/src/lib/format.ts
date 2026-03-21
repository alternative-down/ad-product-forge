const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatDateTime(value?: number | null) {
  if (!value) {
    return '—';
  }

  return dateTimeFormatter.format(value);
}

export function formatUsd(value?: number | null) {
  if (value === null || value === undefined) {
    return '—';
  }

  return currencyFormatter.format(value);
}

export function formatInteger(value?: number | null) {
  if (value === null || value === undefined) {
    return '—';
  }

  return new Intl.NumberFormat('pt-BR').format(value);
}
