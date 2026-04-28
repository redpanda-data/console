'use client';

import { format } from 'date-fns';
import { CalendarIcon, Clock3Icon } from 'lucide-react';

import {
  buildTimestampValue,
  getControlLabel,
  normalizeDateValue,
  normalizeTimeValue,
  parseCalendarDate,
  resolveControlTestId,
  useFieldTestIds,
} from './shared';
import { Calendar } from '../../calendar';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from '../../input-group';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../helpers';
import type { FieldTypeDefinition } from '../registry';

// ---------------------------------------------------------------------------
// DateFieldComponent
// ---------------------------------------------------------------------------

function DateFieldComponent({ error, field, id, inputProps, label }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const controlTestId = resolveControlTestId(inputProps, testIds.control);
  const value = normalizeDateValue(inputProps.value);
  const selectedDate = parseCalendarDate(value);

  return (
    <Popover>
      <InputGroup testId={controlTestId}>
        <InputGroupInput
          aria-invalid={Boolean(error)}
          disabled={inputProps.disabled}
          id={id}
          onBlur={inputProps.onBlur}
          onChange={(event) => inputProps.onValueChange(event.target.value)}
          placeholder={getFieldUiConfig(field).placeholder || 'YYYY-MM-DD'}
          testId={`${controlTestId}-input`}
          value={value}
        />
        <InputGroupAddon align="inline-end">
          <PopoverTrigger asChild>
            <InputGroupButton
              aria-label={`Open calendar for ${getControlLabel(label, field)}`}
              disabled={inputProps.disabled}
              testId={`${controlTestId}-calendar`}
            >
              <CalendarIcon className="h-4 w-4" />
            </InputGroupButton>
          </PopoverTrigger>
        </InputGroupAddon>
      </InputGroup>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          onSelect={(date) => {
            inputProps.onValueChange(date ? format(date, 'yyyy-MM-dd') : '');
          }}
          selected={selectedDate}
        />
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// TimestampFieldComponent
// ---------------------------------------------------------------------------

function TimestampFieldComponent({ error, field, id, inputProps, label }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const dateValue = normalizeDateValue(inputProps.value);
  const timeValue = normalizeTimeValue(inputProps.value);

  return (
    <div className="space-y-2" data-testid={testIds.control}>
      <DateFieldComponent
        error={error}
        field={field}
        id={id}
        inputProps={{
          ...inputProps,
          testId: testIds.controlPart('date'),
          value: dateValue,
          onValueChange: (nextDate: string) => inputProps.onValueChange(buildTimestampValue(nextDate, timeValue)),
        }}
        label={label}
        path={[]}
        value={dateValue}
      />
      <InputGroup testId={testIds.controlPart('time')}>
        <InputGroupAddon>
          <InputGroupText>
            <Clock3Icon className="h-4 w-4" />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-invalid={Boolean(error)}
          disabled={inputProps.disabled}
          onBlur={inputProps.onBlur}
          onChange={(event) => inputProps.onValueChange(buildTimestampValue(dateValue, event.target.value))}
          placeholder="HH:mm"
          testId={testIds.controlPart('time-input')}
          value={timeValue}
        />
      </InputGroup>
    </div>
  );
}

export { DateFieldComponent, TimestampFieldComponent };

export const dateFieldDefinition: FieldTypeDefinition = {
  name: 'date',
  priority: 10,
  match: (field) => field.type === 'date',
  component: DateFieldComponent,
};

export const timestampFieldDefinition: FieldTypeDefinition = {
  name: 'timestamp',
  priority: 10,
  match: (field) => field.type === 'timestamp',
  component: TimestampFieldComponent,
};
