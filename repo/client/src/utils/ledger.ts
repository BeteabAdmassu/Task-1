export function getLedgerTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    DEPOSIT: 'Deposit',
    ESCROW_HOLD: 'Escrow Hold',
    ESCROW_RELEASE: 'Escrow Release',
    PAYMENT: 'Payment',
    REFUND: 'Refund',
    ADJUSTMENT: 'Adjustment',
  };
  return labels[type] ?? type;
}

export function getLedgerTypeClass(type: string): string {
  const classes: Record<string, string> = {
    DEPOSIT: 'ledger-positive',
    ESCROW_RELEASE: 'ledger-positive',
    REFUND: 'ledger-positive',
    ESCROW_HOLD: 'ledger-negative',
    PAYMENT: 'ledger-negative',
    ADJUSTMENT: 'ledger-neutral',
  };
  return classes[type] ?? 'ledger-neutral';
}

export function formatAmount(amount: number): string {
  const abs = Math.abs(amount).toFixed(2);
  return amount < 0 ? `-$${abs}` : `+$${abs}`;
}
