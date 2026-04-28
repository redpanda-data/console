import { celEnv, isCelError, parse, plan } from '@bufbuild/cel';

import type { AutoFormUiRule } from './types';

const env = celEnv();
const CEL_CACHE_MAX_SIZE = 256;
const compiledRuleCache = new Map<string, ReturnType<typeof plan>>();

function getCompiledRule(expression: string) {
  const cached = compiledRuleCache.get(expression);
  if (cached) {
    return cached;
  }

  if (compiledRuleCache.size >= CEL_CACHE_MAX_SIZE) {
    const firstKey = compiledRuleCache.keys().next().value;
    if (firstKey !== undefined) {
      compiledRuleCache.delete(firstKey);
    }
  }

  const compiled = plan(env, parse(expression));
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
  if (!rules?.length) {
    return true;
  }

  return rules.every((rule) => {
    try {
      const result = getCompiledRule(rule.expression)({
        form: context.form as never,
        this: context.thisValue as never,
      } as never);

      if (isCelError(result)) {
        return false;
      }

      return result === true;
    } catch {
      return false;
    }
  });
}
