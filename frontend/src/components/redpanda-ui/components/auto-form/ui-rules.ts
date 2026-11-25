import { celEnv, isCelError, parse, plan } from '@bufbuild/cel';

import { createRuleBindings } from './cel-input';
import type { AutoFormUiRule } from './types';

const env = celEnv();
const CEL_CACHE_MAX_SIZE = 256;
const compiledRuleCache = new Map<string, ReturnType<typeof plan>>();

function getCompiledRule(expression: string) {
  const cached = compiledRuleCache.get(expression);
  if (cached !== undefined) {
    return cached;
  }

  if (compiledRuleCache.size >= CEL_CACHE_MAX_SIZE) {
    const firstKey = compiledRuleCache.keys().next().value;
    if (firstKey !== undefined) {
      compiledRuleCache.delete(firstKey);
    }
  }

  let compiled: ReturnType<typeof plan>;
  try {
    compiled = plan(env, parse(expression));
  } catch (error) {
    throw new Error('Invalid UI rule expression.', { cause: error });
  }
  compiledRuleCache.set(expression, compiled);
  return compiled;
}

export function evaluateUiRules(
  rules: AutoFormUiRule[] | undefined,
  context: {
    form: Record<string, unknown>;
    thisValue: unknown;
  }
): boolean {
  if (!(rules !== undefined && rules.length > 0)) {
    return true;
  }

  return rules.every((rule) => {
    const compiled = getCompiledRule(rule.expression);
    try {
      const result = compiled(createRuleBindings(context.form, context.thisValue));

      if (isCelError(result)) {
        return false;
      }

      return result === true;
    } catch {
      return false;
    }
  });
}
