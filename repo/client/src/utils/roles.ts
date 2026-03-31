export function getRoleRedirectPath(role: string): string {
  switch (role) {
    case 'PROCUREMENT_MANAGER':
      return '/procurement';
    case 'WAREHOUSE_CLERK':
      return '/warehouse';
    case 'PLANT_CARE_SPECIALIST':
      return '/plant-care';
    case 'ADMINISTRATOR':
      return '/admin';
    case 'SUPPLIER':
      return '/supplier-portal';
    default:
      return '/';
  }
}

export function getRoleDisplayName(role: string): string {
  switch (role) {
    case 'PROCUREMENT_MANAGER':
      return 'Procurement Manager';
    case 'WAREHOUSE_CLERK':
      return 'Warehouse Clerk';
    case 'PLANT_CARE_SPECIALIST':
      return 'Plant Care Specialist';
    case 'ADMINISTRATOR':
      return 'Administrator';
    case 'SUPPLIER':
      return 'Supplier';
    default:
      return role;
  }
}
