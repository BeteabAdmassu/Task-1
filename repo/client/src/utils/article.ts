export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    CARE_GUIDE: 'Care Guide',
    PEST_TREATMENT_SOP: 'Pest Treatment SOP',
    SAFETY_NOTE: 'Safety Note',
    GENERAL: 'General',
  };
  return labels[category] ?? category;
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    SPECIALIST_ONLY: 'Specialist Only',
    STOREWIDE: 'Storewide',
    ARCHIVED: 'Archived',
  };
  return labels[status] ?? status;
}

export function getStatusClass(status: string): string {
  const classes: Record<string, string> = {
    DRAFT: 'status-draft',
    SPECIALIST_ONLY: 'status-specialist',
    STOREWIDE: 'status-storewide',
    ARCHIVED: 'status-archived',
  };
  return classes[status] ?? '';
}

export const ARTICLE_CATEGORIES = [
  { value: 'CARE_GUIDE', label: 'Care Guide' },
  { value: 'PEST_TREATMENT_SOP', label: 'Pest Treatment SOP' },
  { value: 'SAFETY_NOTE', label: 'Safety Note' },
  { value: 'GENERAL', label: 'General' },
];

export const ARTICLE_STATUSES = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SPECIALIST_ONLY', label: 'Specialist Only' },
  { value: 'STOREWIDE', label: 'Storewide' },
  { value: 'ARCHIVED', label: 'Archived' },
];

// Status promotion flow: DRAFT → SPECIALIST_ONLY → STOREWIDE → ARCHIVED
export function getNextStatuses(currentStatus: string): Array<{ value: string; label: string }> {
  const flow: Record<string, string[]> = {
    DRAFT: ['SPECIALIST_ONLY', 'STOREWIDE', 'ARCHIVED'],
    SPECIALIST_ONLY: ['STOREWIDE', 'ARCHIVED'],
    STOREWIDE: ['ARCHIVED'],
    ARCHIVED: [],
  };
  const next = flow[currentStatus] ?? [];
  return ARTICLE_STATUSES.filter((s) => next.includes(s.value));
}
