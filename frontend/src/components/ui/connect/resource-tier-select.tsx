/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';

export const RESOURCE_TIERS = [
  {
    id: 'XSmall',
    name: 'XSmall',
    cpu: '100m',
    memory: '400M',
    displayName: 'XSmall - 100m CPU, 400M RAM',
    index: 0,
  },
  {
    id: 'Small',
    name: 'Small',
    cpu: '200m',
    memory: '800M',
    displayName: 'Small - 200m CPU, 800M RAM',
    index: 1,
  },
  {
    id: 'Medium',
    name: 'Medium',
    cpu: '300m',
    memory: '1200M',
    displayName: 'Medium - 300m CPU, 1200M RAM',
    index: 2,
  },
  {
    id: 'Large',
    name: 'Large',
    cpu: '400m',
    memory: '1600M',
    displayName: 'Large - 400m CPU, 1600M RAM',
    index: 3,
  },
  {
    id: 'XLarge',
    name: 'XLarge',
    cpu: '500m',
    memory: '2G',
    displayName: 'XLarge - 500m CPU, 2G RAM',
    index: 4,
  },
];

type ResourceTierSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
};

/**
 * Reusable resource tier selector component for AI Agents and MCP Servers
 *
 * @example
 * // In your form component:
 * <FormField
 *   control={form.control}
 *   name="resourcesTier"
 *   render={({ field }) => (
 *     <FormItem>
 *       <FormLabel>Resources</FormLabel>
 *       <FormControl>
 *         <ResourceTierSelect
 *           value={field.value}
 *           onValueChange={field.onChange}
 *         />
 *       </FormControl>
 *       <FormMessage />
 *     </FormItem>
 *   )}
 * />
 */
export const ResourceTierSelect: React.FC<ResourceTierSelectProps> = ({
  value,
  onValueChange,
  placeholder = 'Select resource tier',
}) => (
  <Select onValueChange={onValueChange} value={value}>
    <SelectTrigger>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      {RESOURCE_TIERS.map((tier) => (
        <SelectItem key={tier.id} value={tier.id}>
          {tier.displayName}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
