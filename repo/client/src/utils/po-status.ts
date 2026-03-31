export const PO_STATUSES = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_RECEIVED',
  'FULLY_RECEIVED',
  'CLOSED',
  'CANCELLED',
] as const;

export function getPoStatusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

export function getPoStatusClass(status: string): string {
  switch (status) {
    case 'DRAFT': return 'status-draft';
    case 'ISSUED': return 'status-issued';
    case 'PARTIALLY_RECEIVED': return 'status-partial';
    case 'FULLY_RECEIVED': return 'status-received';
    case 'CLOSED': return 'status-closed';
    case 'CANCELLED': return 'status-cancelled';
    default: return '';
  }
}
