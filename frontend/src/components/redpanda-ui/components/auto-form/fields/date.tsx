'use client';

import { format } from 'date-fns';
import { CalendarIcon, Clock3Icon } from 'lucide-react';
import { Calendar } from '../../calendar';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from '../../input-group';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../ui-config';
import {
  buildTimestampValue,
  getControlLabel,
  normalizeDateValue,
  normalizeTimeValue,
  parseCalendarDate,
  resolveControlTestId,
} from './field-values';
import { useFieldTestIds } from './use-field-test-ids';

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
          onChange={(event) => {
            inputProps.onValueChange(event.target.value);
          }}
          placeholder={getFieldUiConfig(field).placeholder ?? 'YYYY-MM-DD'}
          testId={`${controlTestId}-input`}
          value={value}
        />
        <InputGroupAddon align="inline-end">
          <PopoverTrigger
            render={
              <InputGroupButton
                aria-label={`Open calendar for ${getControlLabel(label, field)}`}
                disabled={inputProps.disabled}
                testId={`${controlTestId}-calendar`}
              >
                <CalendarIcon className="size-4" />
              </InputGroupButton>
            }
          />
        </InputGroupAddon>
      </InputGroup>
      <PopoverContent className="w-auto" padding="none">
        <Calendar
          mode="single"
          onSelect={(date) => {
            inputProps.onValueChange(date === undefined ? '' : format(date, 'yyyy-MM-dd'));
          }}
          selected={selectedDate}
        />
      </PopoverContent>
    </Popover>
  );
}

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
          onValueChange: (nextDate: string) => {
            inputProps.onValueChange(buildTimestampValue(nextDate, timeValue));
          },
        }}
        label={label}
        path={[]}
        value={dateValue}
      />
      <InputGroup testId={testIds.controlPart('time')}>
        <InputGroupAddon>
          <InputGroupText>
            <Clock3Icon className="size-4" />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-invalid={Boolean(error)}
          disabled={inputProps.disabled}
          onBlur={inputProps.onBlur}
          onChange={(event) => {
            inputProps.onValueChange(buildTimestampValue(dateValue, event.target.value));
          }}
          placeholder="HH:mm"
          testId={testIds.controlPart('time-input')}
          value={timeValue}
        />
      </InputGroup>
    </div>
  );
}

export { DateFieldComponent, TimestampFieldComponent };
