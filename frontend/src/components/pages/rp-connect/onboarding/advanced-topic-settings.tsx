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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
      <FormField
        control={form.control}
        name="partitions"
        disabled={isExistingTopic || disabled}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Partitions</FormLabel>
            <FormControl>
              <Input {...field} type="number" showStepControls onChange={createNumberChangeHandler(field.onChange)} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="replicationFactor"
        disabled={isExistingTopic || disabled}
        render={({ field }) => (
          <FormItem className={isExistingTopic ? '' : 'opacity-70'}>
            <FormLabel>Replication Factor</FormLabel>
            <FormControl>
              <Input
                {...field}
                showStepControls
                type="number"
                readOnly
                onChange={createNumberChangeHandler(field.onChange)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <RetentionInputGroup
        form={form}
        isExistingTopic={isExistingTopic}
        disabled={disabled}
        label="Retention Time"
        valueField="retentionTimeMs"
        unitField="retentionTimeUnit"
        units={retentionTimeUnits}
        onChange={createFloatChangeHandler}
      />

      <RetentionInputGroup
        form={form}
        isExistingTopic={isExistingTopic}
        disabled={disabled}
        label="Retention Size"
        valueField="retentionSize"
        unitField="retentionSizeUnit"
        units={retentionSizeUnits}
        onChange={createFloatChangeHandler}
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
        {isExistingTopic && <p className="text-xs text-gray-500 mb-2">Existing topic values cannot be modified</p>}
        <Group attached>
          <FormField
            control={form.control}
            name={valueField as 'retentionTimeMs' | 'retentionSize'}
            disabled={isRetentionDisabled}
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    placeholder={field.value?.toString() || '0'}
                    {...field}
                    onChange={onChange(field.onChange)}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={unitField as 'retentionTimeUnit' | 'retentionSizeUnit'}
            disabled={isExistingTopic || disabled}
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
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
  },
);

RetentionInputGroup.displayName = 'RetentionInputGroup';
