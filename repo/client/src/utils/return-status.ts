export function getReturnStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    APPROVED: 'Approved',
    SHIPPED: 'Shipped',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  };
  return labels[status] ?? status;
}

export function getReturnStatusClass(status: string): string {
  const classes: Record<string, string> = {
    DRAFT: 'status-draft',
    SUBMITTED: 'status-pending_approval',
    APPROVED: 'status-approved',
    SHIPPED: 'status-issued',
    COMPLETED: 'status-fully_received',
    CANCELLED: 'status-cancelled',
  };
  return classes[status] ?? '';
}

export function getReturnReasonLabel(code: string): string {
  const labels: Record<string, string> = {
    DAMAGED: 'Damaged',
    WRONG_ITEM: 'Wrong Item',
    QUALITY_ISSUE: 'Quality Issue',
    OVERSTOCK: 'Overstock',
    OTHER: 'Other',
  };
  return labels[code] ?? code;
}
