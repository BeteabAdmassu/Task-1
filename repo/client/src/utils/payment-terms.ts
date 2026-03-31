export const PAYMENT_TERMS = [
  'NET_30',
  'TWO_TEN_NET_30',
  'NET_60',
  'COD',
  'CUSTOM',
] as const;

export function getPaymentTermsLabel(terms: string): string {
  switch (terms) {
    case 'NET_30':
      return 'Net 30';
    case 'TWO_TEN_NET_30':
      return '2% discount if paid in 10 days, net 30 days';
    case 'NET_60':
      return 'Net 60';
    case 'COD':
      return 'Cash on Delivery';
    case 'CUSTOM':
      return 'Custom Terms';
    default:
      return terms;
  }
}
