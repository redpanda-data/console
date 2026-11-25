import { z } from 'zod';

import { readFileSync } from 'node:fs';

const portsSchema = z.record(z.string(), z.number().int().min(1).max(65_535));
const variantSchema = z.looseObject({
  name: z.string().min(1),
  displayName: z.string(),
  isEnterprise: z.boolean(),
  needsShadowlink: z.boolean(),
  needsAuth: z.boolean(),
  isKafka: z.boolean().optional(),
  ports: portsSchema,
});

/** @typedef {z.infer<typeof variantSchema>} VariantConfig */
/** @typedef {VariantConfig['ports']} VariantPorts */

/** @param {unknown} value */
export function parseVariantConfig(value) {
  return variantSchema.parse(value);
}

/** @param {unknown} value */
export function parseVariantPorts(value) {
  return portsSchema.parse(value);
}

/** @param {string} file */
export function readVariantConfig(file) {
  /** @type {unknown} */
  const value = JSON.parse(readFileSync(file, 'utf8'));
  return parseVariantConfig(value);
}
