import { type CelInput, type CelUint, celMap, isCelList, isCelMap, isCelType, isCelUint } from '@bufbuild/cel';
import { isMessage } from '@bufbuild/protobuf';
import { isReflectList, isReflectMap, isReflectMessage } from '@bufbuild/protobuf/reflect';

type CelKey = bigint | boolean | string | CelUint;

/** Validate values when CEL reads them, not unrelated optional/custom fields. */
class RuleInputMap implements ReadonlyMap<CelKey, CelInput> {
  private readonly source: ReadonlyMap<CelKey, unknown>;

  constructor(source: ReadonlyMap<CelKey, unknown>) {
    this.source = source;
  }

  get size() {
    return this.source.size;
  }

  get(key: CelKey): CelInput | undefined {
    const value = this.source.get(key);
    return value === undefined ? undefined : toRuleInput(value);
  }

  has(key: CelKey) {
    return this.source.has(key);
  }

  keys() {
    return this.source.keys();
  }

  *entries(): MapIterator<[CelKey, CelInput]> {
    for (const [key, value] of this.source) {
      yield [key, toRuleInput(value)];
    }
  }

  *values(): MapIterator<CelInput> {
    for (const value of this.source.values()) {
      yield toRuleInput(value);
    }
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  forEach(callback: (value: CelInput, key: CelKey, map: ReadonlyMap<CelKey, CelInput>) => void, thisArg?: unknown) {
    for (const [key, value] of this) {
      callback.call(thisArg, value, key, this);
    }
  }
}

function toRuleKey(value: unknown): CelKey {
  if (typeof value === 'bigint' || typeof value === 'boolean' || typeof value === 'string' || isCelUint(value)) {
    return value;
  }
  throw new TypeError('Unsupported CEL map key.');
}

function toRuleInput(value: unknown): CelInput {
  if (
    value === null ||
    typeof value === 'bigint' ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string' ||
    value instanceof Uint8Array ||
    isMessage(value) ||
    isReflectMessage(value) ||
    isReflectList(value) ||
    isReflectMap(value) ||
    isCelList(value) ||
    isCelMap(value) ||
    isCelUint(value) ||
    isCelType(value)
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const list: CelInput[] = [];
    list.length = value.length;
    const length = value.length;
    for (let index = 0; index < length; index++) {
      if (index in value) {
        const item: unknown = value[index];
        Object.defineProperty(list, index, { enumerable: true, get: () => toRuleInput(item) });
      }
    }
    return list;
  }
  if (value instanceof Map) {
    const source: ReadonlyMap<unknown, unknown> = value;
    const entries = new Map<CelKey, unknown>();
    for (const [key, item] of source) {
      entries.set(toRuleKey(key), item);
    }
    return celMap(new RuleInputMap(entries));
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = new Map(Object.entries(value));
    return celMap(new RuleInputMap(entries));
  }
  throw new TypeError(`Unsupported CEL input type: ${typeof value}.`);
}

export function createRuleBindings(form: Record<string, unknown>, thisValue: unknown): Record<string, CelInput> {
  const bindings: Record<string, CelInput> = {};
  const inputs: Record<string, unknown> = { form, this: thisValue };
  for (const [name, value] of Object.entries(inputs)) {
    if (value !== undefined) {
      Object.defineProperty(bindings, name, { enumerable: true, get: () => toRuleInput(value) });
    }
  }
  return bindings;
}
