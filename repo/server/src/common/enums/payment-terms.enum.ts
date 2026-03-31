export enum PaymentTerms {
  NET_30 = 'NET_30',
  TWO_TEN_NET_30 = 'TWO_TEN_NET_30',
  NET_60 = 'NET_60',
  COD = 'COD',
  CUSTOM = 'CUSTOM',
}

export const PaymentTermsLabels: Record<PaymentTerms, string> = {
  [PaymentTerms.NET_30]: 'Net 30',
  [PaymentTerms.TWO_TEN_NET_30]: '2% discount if paid in 10 days, net 30 days',
  [PaymentTerms.NET_60]: 'Net 60',
  [PaymentTerms.COD]: 'Cash on Delivery',
  [PaymentTerms.CUSTOM]: 'Custom Terms',
};
