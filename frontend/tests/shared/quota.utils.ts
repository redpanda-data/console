import { execRpk } from './rpk.utils';

/**
 * Create a client-id quota with optional rate limits
 */
export async function createClientIdQuota(params: {
  clientId: string;
  producerByteRate?: number;
  consumerByteRate?: number;
  controllerMutationRate?: number;
  variantName?: string;
}): Promise<string> {
  const { clientId, producerByteRate, consumerByteRate, controllerMutationRate, variantName = 'console' } = params;

  const args: string[] = [`--name client-id=${clientId}`];

  if (producerByteRate !== undefined) {
    args.push(`--add producer_byte_rate=${producerByteRate}`);
  }
  if (consumerByteRate !== undefined) {
    args.push(`--add consumer_byte_rate=${consumerByteRate}`);
  }
  if (controllerMutationRate !== undefined) {
    args.push(`--add controller_mutation_rate=${controllerMutationRate}`);
  }

  return await execRpk(`cluster quotas alter ${args.join(' ')}`, variantName);
}

/**
 * Create a user quota with optional rate limits
 */
export async function createUserQuota(params: {
  user: string;
  producerByteRate?: number;
  consumerByteRate?: number;
  controllerMutationRate?: number;
  variantName?: string;
}): Promise<string> {
  const { user, producerByteRate, consumerByteRate, controllerMutationRate, variantName = 'console' } = params;

  const args: string[] = [`--name user=${user}`];

  if (producerByteRate !== undefined) {
    args.push(`--add producer_byte_rate=${producerByteRate}`);
  }
  if (consumerByteRate !== undefined) {
    args.push(`--add consumer_byte_rate=${consumerByteRate}`);
  }
  if (controllerMutationRate !== undefined) {
    args.push(`--add controller_mutation_rate=${controllerMutationRate}`);
  }

  return await execRpk(`cluster quotas alter ${args.join(' ')}`, variantName);
}

/**
 * Delete a client-id quota
 */
export async function deleteClientIdQuota(clientId: string, variantName = 'console'): Promise<string> {
  return await execRpk(
    `cluster quotas alter --delete producer_byte_rate --delete consumer_byte_rate --delete controller_mutation_rate --name client-id=${clientId}`,
    variantName
  );
}

/**
 * Delete a user quota
 */
export async function deleteUserQuota(user: string, variantName = 'console'): Promise<string> {
  return await execRpk(
    `cluster quotas alter --delete producer_byte_rate --delete consumer_byte_rate --delete controller_mutation_rate --name user=${user}`,
    variantName
  );
}

/**
 * List all quotas using RPK
 */
export async function listQuotas(variantName = 'console'): Promise<string> {
  return await execRpk('cluster quotas list', variantName);
}
