import { flushSync } from 'react-dom';

export function commitAgentChange<Value, Details extends { source: string }>(
  callback: ((value: Value, details: Details) => void) | undefined,
  value: Value,
  details: Details
) {
  // SDK history verifies controlled values as soon as act resolves, before React's async commit.
  if (details.source === 'agent') flushSync(() => callback?.(value, details));
  else callback?.(value, details);
}

export function withAgentChanges<Props extends object>(props: Props): Props {
  const result = { ...props };
  for (const key of ['onValueChange', 'onCheckedChange', 'onPressedChange']) {
    const callback = Reflect.get(props, key);
    if (typeof callback !== 'function') continue;
    Reflect.set(result, key, (...args: unknown[]) => {
      const details = args[1];
      const invoke = () => Reflect.apply(callback, undefined, args);
      if (details && typeof details === 'object' && Reflect.get(details, 'source') === 'agent') flushSync(invoke);
      else invoke();
    });
  }
  return result;
}
