import { useLayoutEffect } from 'react';

import { type BreadcrumbEntry, setPageHeader } from '../../../../state/ui-state';

const SECURITY_PAGE_BREADCRUMBS: Record<'users' | 'roles' | 'permissions', BreadcrumbEntry[]> = {
  users: [
    { title: 'Security', linkTo: '/security' },
    { title: 'Users', linkTo: '/security/users' },
  ],
  roles: [
    { title: 'Security', linkTo: '/security/users' },
    { title: 'Roles', linkTo: '/security/roles' },
  ],
  permissions: [
    { title: 'Security', linkTo: '/security/users' },
    { title: 'Permissions', linkTo: '/security/permissions' },
  ],
};

export type SecurityTabPage = keyof typeof SECURITY_PAGE_BREADCRUMBS;

/** Page header of the Security tabs: the "Security" title over the tab's breadcrumb trail. */
export function useSecurityPageHeader(page: SecurityTabPage) {
  useLayoutEffect(
    function setSecurityPageHeader() {
      setPageHeader('Security', SECURITY_PAGE_BREADCRUMBS[page]);
    },
    [page]
  );
}
