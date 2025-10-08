import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Group } from 'components/redpanda-ui/components/group';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { memo, useMemo } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import type { AddTopicFormData } from '../types/wizard';
import {
  createFloatChangeHandler,
  createNumberChangeHandler,
  getRetentionSizeUnitOptions,
  getRetentionTimeUnitOptions,
  isRetentionUnitDisabled,
} from '../utils/topic';

interface AdvancedTopicSettingsProps {
  form: UseFormReturn<AddTopicFormData>;
  isExistingTopic: boolean;
  disabled?: boolean;
}

export const AdvancedTopicSettings = memo<AdvancedTopicSettingsProps>(({ form, isExistingTopic, disabled = false }) => {
  // Generate unit options from CreateTopicModal factors for consistency
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
          <FormItem className={isExistingTopic ? '' : 'opacity-70'}>
            <FormLabel>Replication Factor</FormLabel>
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
        )}
      />

      <RetentionInputGroup
        disabled={disabled}
        form={form}
        isExistingTopic={isExistingTopic}
        label="Retention Time"
        onChange={createFloatChangeHandler}
        unitField="retentionTimeUnit"
        units={retentionTimeUnits}
        valueField="retentionTimeMs"
      />

      <RetentionInputGroup
        disabled={disabled}
        form={form}
        isExistingTopic={isExistingTopic}
        label="Retention Size"
        onChange={createFloatChangeHandler}
        unitField="retentionSizeUnit"
        units={retentionSizeUnits}
        valueField="retentionSize"
      />
    </div>
  );
});

AdvancedTopicSettings.displayName = 'AdvancedTopicSettings';

interface RetentionInputGroupProps {
  form: UseFormReturn<AddTopicFormData>;
  isExistingTopic: boolean;
  disabled?: boolean;
  label: string;
  valueField: keyof AddTopicFormData;
  unitField: keyof AddTopicFormData;
  units: { value: string; label: string }[];
  onChange: (onChange: (value?: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const RetentionInputGroup = memo<RetentionInputGroupProps>(
  ({ form, isExistingTopic, disabled = false, label, valueField, unitField, units, onChange }) => {
    const unitValue = form.watch(unitField as 'retentionTimeUnit' | 'retentionSizeUnit');
    const isRetentionDisabled = isRetentionUnitDisabled(unitValue) || isExistingTopic || disabled;

    return (
      <div className="space-y-2">
        <FormLabel>{label}</FormLabel>
        {isExistingTopic && <p className="mb-2 text-gray-500 text-xs">Existing topic values cannot be modified</p>}
        <Group attached>
          <FormField
            control={form.control}
            disabled={isRetentionDisabled}
            name={valueField as 'retentionTimeMs' | 'retentionSize'}
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input
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
            disabled={isExistingTopic || disabled}
            name={unitField as 'retentionTimeUnit' | 'retentionSizeUnit'}
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className="w-32 bg-gray-200">
                      <SelectValue defaultValue={field.value} />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            )}
          />
        </Group>
        <FormMessage />
      </div>
    );
  }
);

RetentionInputGroup.displayName = 'RetentionInputGroup';
