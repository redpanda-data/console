import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';

import { type BreadcrumbEntry, uiState } from '../../../state/ui-state';

// Shared by the edit-mode and edit-compatibility pages, which edit one setting
// for a subject, a context, or the whole registry.

/** What an edit page edits: one subject, one context, or (neither) the global config. */
export type SchemaEditTarget = { subjectName?: string; contextName?: string };

/** An edit page's title, breadcrumb label and route segment, e.g. `Edit Mode` at `…/edit-mode`. */
export type SchemaEditPageKind = { pageTitle: string; crumbTitle: string; segment: string };

export function decodeSchemaEditTarget(subjectNameEncoded?: string, contextNameEncoded?: string): SchemaEditTarget {
  return {
    subjectName: subjectNameEncoded ? decodeURIComponent(subjectNameEncoded) : undefined,
    contextName: contextNameEncoded ? decodeURIComponent(contextNameEncoded) : undefined,
  };
}

export function schemaEditBreadcrumbs(
  { subjectName, contextName }: SchemaEditTarget,
  { crumbTitle, segment }: SchemaEditPageKind
): BreadcrumbEntry[] {
  const root = { title: 'Schema Registry', linkTo: '/schema-registry' };
  if (contextName) {
    return [
      root,
      { title: crumbTitle, linkTo: `/schema-registry/contexts/${encodeURIComponent(contextName)}/${segment}` },
    ];
  }
  if (subjectName) {
    return [
      root,
      { title: subjectName, linkTo: `/schema-registry/subjects/${subjectName}` },
      { title: crumbTitle, linkTo: `/schema-registry/subjects/${subjectName}/${segment}` },
    ];
  }
  return [root, { title: crumbTitle, linkTo: `/schema-registry/${segment}` }];
}

export function useSchemaEditPageHeader({ subjectName, contextName }: SchemaEditTarget, kind: SchemaEditPageKind) {
  useEffect(
    function syncSchemaEditPageHeader() {
      uiState.pageTitle = kind.pageTitle;
      uiState.pageBreadcrumbs = schemaEditBreadcrumbs({ subjectName, contextName }, kind);
    },
    [subjectName, contextName, kind]
  );
}

// Closing runs from button clicks and mutation callbacks, so report a failed navigation instead of dropping it.
function reportCloseError(error: unknown) {
  toast.error('Failed to navigate', { description: String(error) });
}

/** Navigates back to where the edit page was opened from. */
export function useSchemaEditClose({ subjectName, contextName }: SchemaEditTarget) {
  const navigate = useNavigate();
  return useCallback(() => {
    if (subjectName) {
      navigate({ to: `/schema-registry/subjects/${encodeURIComponent(subjectName)}` }).catch(reportCloseError);
    } else if (contextName) {
      navigate({ to: '/schema-registry', search: { context: contextName } }).catch(reportCloseError);
    } else {
      navigate({ to: '/schema-registry' }).catch(reportCloseError);
    }
  }, [subjectName, contextName, navigate]);
}

export type SchemaEditPageStatus = 'contexts-unsupported' | 'loading' | 'not-configured' | 'ready';

export function schemaEditPageStatus({
  contextsUnsupported,
  isLoading,
  schemaMode,
}: {
  contextsUnsupported: boolean;
  isLoading: boolean;
  schemaMode: string | null | undefined;
}): SchemaEditPageStatus {
  if (contextsUnsupported) {
    return 'contexts-unsupported';
  }
  if (isLoading) {
    return 'loading';
  }
  return schemaMode === null ? 'not-configured' : 'ready';
}
