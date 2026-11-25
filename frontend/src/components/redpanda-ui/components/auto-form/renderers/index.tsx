'use client';

import React from 'react';
import { useAutoForm } from '../context';
import type { ParsedField } from '../core-types';
import { defaultRegistry } from '../fields/built-ins';
import { resolveRenderFieldType } from '../helpers';
import { buildFieldMatchContext, type FieldTypeRegistry } from '../registry';
import { type AutoFormSlotDescriptor, EMPTY_AUTO_FORM_SLOTS, indexAutoFormSlots } from '../slots';
import { getFieldUiConfig } from '../ui-config';
import { ArrayFieldRenderer } from './array';
import { ControlledFieldRenderer } from './controlled';
import { MapFieldRenderer } from './map';
import { ObjectFieldRenderer } from './object';
import { OneofFieldRenderer } from './oneof';
import type { AutoFormFieldRendererProps } from './renderer-types';

function resolveFieldType(field: ParsedField, registry: FieldTypeRegistry): string {
  const explicitControl = getFieldUiConfig(field).control;
  if (explicitControl !== undefined && explicitControl !== '') {
    return explicitControl;
  }

  const matchContext = buildFieldMatchContext(field);
  const resolved = registry.resolve(field, matchContext);
  return resolved?.name ?? resolveRenderFieldType(field);
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

function renderSlot({ id, content }: AutoFormSlotDescriptor) {
  return <React.Fragment key={id}>{content}</React.Fragment>;
}

export function AutoFormFields({
  fields,
  children,
  slots = EMPTY_AUTO_FORM_SLOTS,
}: {
  fields: ParsedField[];
  children?: React.ReactNode | undefined;
  slots?: readonly AutoFormSlotDescriptor[] | undefined;
}) {
  const { fieldRegistry } = useAutoForm();
  const indexedSlots = indexAutoFormSlots(slots);

  return (
    <>
      {indexedSlots.start.map(renderSlot)}
      {children}
      {fields.map((field) => (
        <React.Fragment key={field.key}>
          {indexedSlots.before.get(field.key)?.map(renderSlot)}
          <AutoFormFieldRenderer field={field} path={[field.key]} registry={fieldRegistry} />
          {indexedSlots.after.get(field.key)?.map(renderSlot)}
        </React.Fragment>
      ))}
    </>
  );
}
