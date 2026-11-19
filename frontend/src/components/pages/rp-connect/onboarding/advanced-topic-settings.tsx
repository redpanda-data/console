import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { labelStyles } from 'components/redpanda-ui/components/label/label-styles';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { cn } from 'components/redpanda-ui/lib/utils';
import { memo, useMemo } from 'react';
import { type UseFormReturn, useFormState, useWatch } from 'react-hook-form';
import { attachedFirstClassName, attachedLastClassName } from 'utils/attached-controls';

import type { AddTopicFormData } from '../types/wizard';
import {
  createFloatChangeHandler,
  createNumberChangeHandler,
  getRetentionSizeUnitOptions,
  getRetentionTimeUnitOptions,
  isRetentionUnitDisabled,
} from '../utils/topic';

type AdvancedTopicSettingsProps = {
  form: UseFormReturn<AddTopicFormData>;
  isExistingTopic: boolean;
  disabled?: boolean;
};

export const AdvancedTopicSettings = memo<AdvancedTopicSettingsProps>(({ form, isExistingTopic, disabled = false }) => {
  // Generate unit options from create-topic-dialog factors for consistency
  const retentionTimeUnits = useMemo(() => getRetentionTimeUnitOptions(), []);
  const retentionSizeUnits = useMemo(() => getRetentionSizeUnitOptions(), []);

  return (
    <div className="grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
      <FormField
        control={form.control}
        disabled={isExistingTopic || disabled}
        name="partitions"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Partitions</FormLabel>
            <FormControl>
              <Input {...field} onChange={createNumberChangeHandler(field.onChange)} showStepControls type="number" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        disabled={isExistingTopic || disabled}
        name="replicationFactor"
        render={({ field }) => (
          // Dimmed while creating a topic: the replication factor is read-only there.
          <div className={isExistingTopic ? undefined : 'opacity-70'}>
            <FormItem>
              <FormLabel>Replication factor</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  onChange={createNumberChangeHandler(field.onChange)}
                  readOnly
                  showStepControls
                  type="number"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </div>
        )}
      />

      <RetentionInputGroup
        disabled={disabled}
        form={form}
        isExistingTopic={isExistingTopic}
        label="Retention time"
        onChange={createFloatChangeHandler}
        unitField="retentionTimeUnit"
        units={retentionTimeUnits}
        valueField="retentionTimeMs"
      />

      <RetentionInputGroup
        disabled={disabled}
        form={form}
        isExistingTopic={isExistingTopic}
        label="Retention size"
        onChange={createFloatChangeHandler}
        unitField="retentionSizeUnit"
        units={retentionSizeUnits}
        valueField="retentionSize"
      />
    </div>
  );
});

AdvancedTopicSettings.displayName = 'AdvancedTopicSettings';

type RetentionInputGroupProps = {
  form: UseFormReturn<AddTopicFormData>;
  isExistingTopic: boolean;
  disabled?: boolean;
  label: string;
  valueField: keyof AddTopicFormData;
  unitField: keyof AddTopicFormData;
  units: { value: string; label: string }[];
  onChange: (onChange: (value?: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => void;
};

const RetentionInputGroup = memo<RetentionInputGroupProps>(
  ({ form, isExistingTopic, disabled = false, label, valueField, unitField, units, onChange }) => {
    const unitValue = useWatch({
      control: form.control,
      name: unitField as 'retentionTimeUnit' | 'retentionSizeUnit',
    });
    // The numeric input is disabled when the unit is "infinite" (no value to
    // enter) or when editing an existing topic. The unit selector itself must
    // stay interactive in both cases so the user can switch back off "infinite".
    const lockedForEdit = isExistingTopic || disabled;
    const isValueDisabled = isRetentionUnitDisabled(unitValue) || lockedForEdit;
    // Below the attached row rather than in the value's FormItem, which would stretch the unit select.
    const { errors } = useFormState({ control: form.control, name: valueField });
    const valueError = errors[valueField]?.message;

    return (
      <div className="space-y-2">
        <div className={labelStyles({})}>{label}</div>
        {Boolean(isExistingTopic) && (
          <p className="mb-2 text-body-sm text-subtle">Existing topic values cannot be modified</p>
        )}
        <div className="flex w-full items-stretch">
          <FormField
            control={form.control}
            disabled={isValueDisabled}
            name={valueField as 'retentionTimeMs' | 'retentionSize'}
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input
                    className={attachedFirstClassName}
                    min="0"
                    placeholder={field.value?.toString() || '0'}
                    type="number"
                    {...field}
                    onChange={onChange(field.onChange)}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            disabled={lockedForEdit}
            name={unitField as 'retentionTimeUnit' | 'retentionSizeUnit'}
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Select disabled={field.disabled} items={units} onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className={cn(attachedLastClassName, 'w-32')} disabled={field.disabled}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map(({ value, label: unitLabel }) => (
                        <SelectItem disabled={field.disabled} key={value} value={value}>
                          {unitLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        {valueError ? <p className="text-body text-destructive">{String(valueError)}</p> : null}
      </div>
    );
  }
);

RetentionInputGroup.displayName = 'RetentionInputGroup';
