export function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatUsdSigned(value: number, direction: 'in' | 'out') {
  const amount = formatUsd(value);

  return direction === 'out' ? `-${amount}` : `+${amount}`;
}

export function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

export function formatDate(value: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
  }).format(value);
}

export function humanizeMovementType(type: string) {
  if (type === 'owner-investment') {
    return 'Aporte';
  }

  if (type === 'manual-payable') {
    return 'Conta avulsa';
  }

  return type;
}

export function humanizeMovementStatus(status: string) {
  if (status === 'planned') {
    return 'Previsto';
  }

  if (status === 'posted') {
    return 'Postado';
  }

  if (status === 'canceled') {
    return 'Cancelado';
  }

  return status;
}

export function humanizeRecurrencePeriod(value: 'weekly' | 'monthly' | 'yearly') {
  if (value === 'weekly') {
    return 'Semanal';
  }

  if (value === 'monthly') {
    return 'Mensal';
  }

  return 'Anual';
}
