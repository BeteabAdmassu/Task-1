export function getNotificationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    REQUEST_APPROVED: 'Request Approved',
    REQUEST_REJECTED: 'Request Rejected',
    PO_ISSUED: 'PO Issued',
    RECEIPT_COMPLETED: 'Receipt Completed',
    RETURN_CREATED: 'Return Created',
    ARTICLE_PUBLISHED: 'Article Published',
    SYSTEM_ALERT: 'System Alert',
    SCHEDULE_CHANGE: 'Schedule Change',
    CANCELLATION: 'Cancellation',
    REVIEW_OUTCOME: 'Review Outcome',
  };
  return labels[type] ?? type;
}

// Returns the route to navigate to when clicking a notification
export function getNotificationRoute(
  referenceType: string | null,
  referenceId: string | null,
): string | null {
  if (!referenceType || !referenceId) return null;
  const routes: Record<string, string> = {
    PurchaseRequest: `/procurement/requests/${referenceId}`,
    PurchaseOrder: `/procurement/purchase-orders/${referenceId}`,
    Receipt: `/warehouse/receipts`,
    ReturnAuthorization: `/procurement/returns/${referenceId}`,
    Article: `/plant-care/articles/${referenceId}`,
  };
  return routes[referenceType] ?? null;
}
