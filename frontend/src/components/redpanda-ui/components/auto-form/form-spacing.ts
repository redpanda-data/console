export const formSpacing = {
  /** Top-level form children: sections, root fields, submit slot. */
  form: 'space-y-8',
  /** Sibling fields inside a section or nested field-list. */
  field: 'space-y-6',
  /** Inside a single field: label → control → help/error. */
  labelStack: 'space-y-2',
  /** Inside a section header: title → description. */
  sectionHeader: 'space-y-1',
  /** Divider under a section heading when shown. */
  sectionDivider: 'pb-4 border-b border-border/60',
  /** Separator between array items (applied to every item except the first). */
  arrayItemSeparator: 'pt-4 border-t border-border/60',
  /** Gap between sibling rows inside an array/map body (before separator). */
  collectionRow: 'space-y-4',
  /** Gap between a oneof selector and the field it reveals. */
  oneofStack: 'space-y-4',
} as const;

export type FormSpacingToken = keyof typeof formSpacing;
