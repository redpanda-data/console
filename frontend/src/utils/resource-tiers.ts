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

export interface ResourceTier {
  id: string;
  name: string;
  cpu: string;
  memory: string;
  displayName: string;
  fullSpec: string;
}

export const RESOURCE_TIERS: ResourceTier[] = [
  {
    id: 'XSmall',
    name: 'XSmall',
    cpu: '100m',
    memory: '256MiB',
    displayName: 'XSmall',
    fullSpec: 'XSmall (100m CPU, 256MiB RAM)',
  },
  {
    id: 'Small',
    name: 'Small',
    cpu: '200m',
    memory: '512MiB',
    displayName: 'Small',
    fullSpec: 'Small (200m CPU, 512MiB RAM)',
  },
  {
    id: 'Medium',
    name: 'Medium',
    cpu: '500m',
    memory: '1GiB',
    displayName: 'Medium',
    fullSpec: 'Medium (500m CPU, 1GiB RAM)',
  },
  {
    id: 'Large',
    name: 'Large',
    cpu: '1000m',
    memory: '2GiB',
    displayName: 'Large',
    fullSpec: 'Large (1000m CPU, 2GiB RAM)',
  },
  {
    id: 'XLarge',
    name: 'XLarge',
    cpu: '2000m',
    memory: '4GiB',
    displayName: 'XLarge',
    fullSpec: 'XLarge (2000m CPU, 4GiB RAM)',
  },
];

export const getResourceTierByName = (name: string): ResourceTier | undefined => {
  return RESOURCE_TIERS.find((tier) => tier.name === name || tier.id === name);
};

export const getResourceTierFullSpec = (name: string): string => {
  const tier = getResourceTierByName(name);
  return tier ? tier.fullSpec : name;
};
