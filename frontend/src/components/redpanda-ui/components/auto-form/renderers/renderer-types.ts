// Copyright 2026 Redpanda Data, Inc.

import type React from 'react';
import type { ParsedField } from '../core-types';
import type { FieldTypeRegistry } from '../registry';

export interface AutoFormFieldRendererProps {
  field: ParsedField;
  inheritedDisabled?: boolean | undefined;
  path: string[];
  registry?: FieldTypeRegistry | undefined;
}

export type NestedFieldRenderer = React.ComponentType<AutoFormFieldRendererProps>;
