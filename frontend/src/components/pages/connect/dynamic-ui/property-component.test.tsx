import { describe, expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'react';

import { PropertyComponent } from './property-component';
import type { Property } from '../../../../state/connect/state';

const makeProperty = (type: 'DOUBLE' | 'FLOAT' | 'PASSWORD', crud: 'create' | 'update' = 'create'): Property => ({
  name: 'example',
  entry: {
    definition: {
      name: 'example',
      type,
      required: false,
      default_value: null,
      importance: 'HIGH',
      documentation: 'Example configuration',
      width: 'MEDIUM',
      display_name: 'Example',
      dependents: [],
      order: 0,
    },
    value: { name: 'example', value: null, recommended_values: [], errors: [], visible: true },
    metadata: {},
  },
  value: type === 'PASSWORD' ? 'secret' : '1.5',
  isHidden: false,
  errors: [],
  showErrors: false,
  lastErrors: [],
  currentErrorIndex: 0,
  lastErrorValue: null,
  propertyGroup: {
    step: { name: 'General', groups: [], stepIndex: 0 },
    group: { config_keys: [] },
    properties: [],
    filteredProperties: [],
    propertiesWithErrors: [],
  },
  crud,
  isDisabled: false,
  notifyChange: () => undefined,
});

const Form = ({ property }: { property: Property }) => {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  property.notifyChange = refresh;
  return <PropertyComponent property={property} />;
};

describe('connector property controls', () => {
  test.each(['DOUBLE', 'FLOAT'] as const)('%s steppers preserve fractional configuration values', async (type) => {
    const user = userEvent.setup();
    const property = makeProperty(type);
    render(<Form property={property} />);
    await user.click(screen.getByRole('button', { name: 'Increment value' }));
    expect(screen.getByRole('spinbutton', { name: 'Example' })).toHaveValue(2.5);
    expect(property.value).toBe('2.5');
    await user.click(screen.getByRole('button', { name: 'Decrement value' }));
    expect(screen.getByRole('spinbutton', { name: 'Example' })).toHaveValue(1.5);
    expect(property.value).toBe('1.5');
  });

  test('password label stays associated after edit and undo', async () => {
    const user = userEvent.setup();
    render(<Form property={makeProperty('PASSWORD', 'update')} />);
    expect(screen.getByLabelText('Example')).toHaveValue('secret');
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Example')).toHaveAttribute('type', 'text');
    await user.click(screen.getByText('Example', { selector: 'label' }));
    expect(screen.getByLabelText('Example')).toHaveFocus();
    await user.type(screen.getByLabelText('Example'), 'replacement');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Example')).toHaveValue('secret');
    expect(screen.getByLabelText('Example')).toHaveAttribute('type', 'password');
  });
});
