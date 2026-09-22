'use client';

import React from 'react';
import { useAutoForm } from '../context';
import type { ParsedField } from '../core-types';
import { defaultRegistry } from '../fields';
import { getFieldUiConfig, resolveRenderFieldType } from '../helpers';
import { buildFieldMatchContext, type FieldTypeRegistry } from '../registry';
import type { AutoFormSlotProps } from '../slot';
import type { FieldTypes } from '../types';
import { ArrayFieldRenderer } from './array';
import { ControlledFieldRenderer } from './controlled';
import { MapFieldRenderer } from './map';
import { ObjectFieldRenderer } from './object';
import { OneofFieldRenderer } from './oneof';
import type { AutoFormFieldRendererProps } from './renderer-types';

function resolveFieldType(field: ParsedField, registry: FieldTypeRegistry): FieldTypes {
  const explicitControl = getFieldUiConfig(field).control;
  if (explicitControl) {
    return explicitControl;
  }

  const matchContext = buildFieldMatchContext(field);
  const resolved = registry.resolve(field, matchContext);
  return (resolved?.name as FieldTypes) ?? resolveRenderFieldType(field);
}

export function AutoFormFieldRenderer({
  field,
  path,
  inheritedDisabled = false,
  registry,
}: AutoFormFieldRendererProps) {
  const activeRegistry = registry ?? defaultRegistry;
  const renderType = resolveFieldType(field, activeRegistry);

  if ((field.type === 'array' || field.type === 'map' || field.type === 'object') && renderType !== field.type) {
    return (
      <ControlledFieldRenderer
        field={field}
        inheritedDisabled={inheritedDisabled}
        path={path}
        renderType={renderType}
      />
    );
  }

  switch (field.type) {
    case 'object':
      return (
        <ObjectFieldRenderer
          field={field}
          inheritedDisabled={inheritedDisabled}
          NestedField={AutoFormFieldRenderer}
          path={path}
        />
      );
    case 'array':
      return (
        <ArrayFieldRenderer
          field={field}
          inheritedDisabled={inheritedDisabled}
          NestedField={AutoFormFieldRenderer}
          path={path}
        />
      );
    case 'map':
      return (
        <MapFieldRenderer
          field={field}
          inheritedDisabled={inheritedDisabled}
          NestedField={AutoFormFieldRenderer}
          path={path}
        />
      );
    case 'oneof':
      return (
        <OneofFieldRenderer
          field={field}
          inheritedDisabled={inheritedDisabled}
          NestedField={AutoFormFieldRenderer}
          path={path}
        />
      );
    default:
      return (
        <ControlledFieldRenderer
          field={field}
          inheritedDisabled={inheritedDisabled}
          path={path}
          renderType={renderType}
        />
      );
  }
}

interface SlotEntry {
  after?: string;
  before?: string;
  content: React.ReactNode;
}

function extractSlots(children: React.ReactNode): { slots: SlotEntry[]; other: React.ReactNode[] } {
  const slots: SlotEntry[] = [];
  const other: React.ReactNode[] = [];

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && (child.type as { displayName?: string }).displayName === 'AutoFormSlot') {
      const props = child.props as AutoFormSlotProps;
      slots.push({
        before: props.before,
        after: props.after,
        content: props.children,
      });
    } else if (child !== null && child !== undefined) {
      other.push(child);
    }
  });

  return { slots, other };
}

export function AutoFormFields({ fields, children }: { fields: ParsedField[]; children?: React.ReactNode }) {
  const { fieldRegistry } = useAutoForm();
  const { slots, other } = React.useMemo(() => extractSlots(children), [children]);

  const beforeSlots = React.useMemo(() => {
    const map = new Map<string, React.ReactNode[]>();
    for (const slot of slots) {
      if (slot.before) {
        const existing = map.get(slot.before) ?? [];
        existing.push(slot.content);
        map.set(slot.before, existing);
      }
    }
    return map;
  }, [slots]);

  const afterSlots = React.useMemo(() => {
    const map = new Map<string, React.ReactNode[]>();
    for (const slot of slots) {
      if (slot.after) {
        const existing = map.get(slot.after) ?? [];
        existing.push(slot.content);
        map.set(slot.after, existing);
      }
    }
    return map;
  }, [slots]);

  const topSlots = slots.filter((s) => !(s.before || s.after)).map((s) => s.content);

  return (
    <>
      {React.Children.toArray(topSlots)}
      {React.Children.toArray(other)}
      {fields.map((field) => (
        <React.Fragment key={field.key}>
          {React.Children.toArray(beforeSlots.get(field.key))}
          <AutoFormFieldRenderer field={field} path={[field.key]} registry={fieldRegistry} />
          {React.Children.toArray(afterSlots.get(field.key))}
        </React.Fragment>
      ))}
    </>
  );
}
