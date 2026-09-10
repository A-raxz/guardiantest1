export const ROLES = {
  MASTER_ADMIN: 'MASTER_ADMIN',
  HR_BP: 'HR_BP',
  SALES_MANAGER: 'SALES_MANAGER',
  SALES_REP: 'SALES_REP',
};

export const ROLE_LABELS = {
  MASTER_ADMIN: 'Master Admin (CHRO)',
  HR_BP: 'HR Business Partner',
  SALES_MANAGER: 'Sales Manager',
  SALES_REP: 'Sales Representative',
};

export const ALL_ROLES = Object.values(ROLES);

/**
 * Who may create whom.
 * Master Admin creates HR BP accounts, and can also issue any credential directly
 * as a fallback for the HR BP's normal job. HR BPs staff their own zone only.
 */
export const CREATABLE_ROLES = {
  [ROLES.MASTER_ADMIN]: [ROLES.HR_BP, ROLES.SALES_MANAGER, ROLES.SALES_REP, ROLES.MASTER_ADMIN],
  [ROLES.HR_BP]: [ROLES.SALES_MANAGER, ROLES.SALES_REP],
  [ROLES.SALES_MANAGER]: [],
  [ROLES.SALES_REP]: [],
};

export const isAdmin = (role) => role === ROLES.MASTER_ADMIN || role === ROLES.HR_BP;
export const isZoneScoped = (role) => role !== ROLES.MASTER_ADMIN;
