import { create, type DescField, type DescMessage, type DescOneof, getExtension } from '@bufbuild/protobuf';
import { FieldOptionsSchema, MessageOptionsSchema, OneofOptionsSchema } from '@bufbuild/protobuf/wkt';
import { omitUndefined } from '../utils/omit-undefined';

import type {
  FieldUiOptions,
  MessageUiOptions,
  OneofUiOptions,
  UiRule as ProtoUiRuleMessage,
} from './gen/auto_form_ui_pb';
import { ControlType, DataProviderId, field_ui, message_ui, oneof_ui } from './gen/auto_form_ui_pb';

export interface ProtoUiRule {
  expression: string;
  id?: string;
  message?: string;
}

export interface ProtoStepConfig {
  completeWhen?: ProtoUiRule[];
  description?: string;
  fields: string[];
  id: string;
  title: string;
  visibleWhen?: ProtoUiRule[];
}

export interface ProtoFieldUiConfig {
  /** Keep empty/whitespace-only entries in a repeated string field instead
   *  of stripping them on submit. Opt-in for fields where an empty entry is
   *  meaningful (e.g. a separator that means "split by individual characters"). */
  allowEmptyItems?: boolean;
  control?: string;
  /** Named data source for dropdown-style controls. Matches a key in
   *  the UI-side `AutoForm.dataProviders` registry. Snake-cased string
   *  derived from the proto `DataProviderId` enum. */
  dataProvider?: string;
  /** Concise one-liner shown directly below the input field. */
  description?: string;
  disabledWhen?: ProtoUiRule[];
  /** Upstream doc link — rendered as a "Learn more" anchor next to
   *  the field's help text. Useful for vendor model catalogs, region
   *  lists, API parameter references, etc. where keeping the canonical
   *  list inline would be stale the moment the vendor ships a change. */
  docsUrl?: string;
  /** When `control === 'json'`: render a drag-and-drop zone alongside
   *  the editor. */
  dropzone?: boolean;
  example?: string;
  /** Detailed help text for tooltip (hover the info icon). */
  help?: string;
  placeholder?: string;
  sensitive?: boolean;
  step?: string;
  summaryLabel?: string;
  visibleWhen?: ProtoUiRule[];
}

export interface ProtoMessageUiConfig {
  /** One-line subtitle rendered under the title. */
  description?: string;
  secretScope?: string;
  steps: ProtoStepConfig[];
  /** Root-level title rendered above the AutoForm body. */
  title?: string;
}

function humanize(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeRule(rule: ProtoUiRuleMessage): ProtoUiRule | undefined {
  if (rule.expression === '') {
    return;
  }

  return omitUndefined({
    id: optionalText(rule.id),
    expression: rule.expression,
    message: optionalText(rule.message),
  });
}

function normalizeRules(rules: ProtoUiRuleMessage[] | undefined): ProtoUiRule[] | undefined {
  if (rules === undefined || rules.length === 0) {
    return;
  }

  const normalized: ProtoUiRule[] = [];
  for (const rule of rules) {
    const nextRule = normalizeRule(rule);
    if (nextRule !== undefined) {
      normalized.push(nextRule);
    }
  }

  return normalized.length > 0 ? normalized : undefined;
}

/** Protobuf strings default to an empty value when an annotation is absent. */
function optionalText(value: string): string | undefined {
  return value === '' ? undefined : value;
}

function controlTypeToFieldType(control: ControlType): string | undefined {
  switch (control) {
    case ControlType.TEXT:
      return 'string';
    case ControlType.TEXTAREA:
      return 'textarea';
    case ControlType.PASSWORD:
      return 'password';
    case ControlType.EMAIL:
      return 'email';
    case ControlType.URL:
      return 'url';
    case ControlType.CURRENCY:
      return 'currency';
    case ControlType.CHECKBOX:
      return 'checkbox';
    case ControlType.SWITCH:
      return 'switch';
    case ControlType.TOGGLE:
      return 'toggle';
    case ControlType.RADIO_GROUP:
      return 'radio';
    case ControlType.SELECT:
      return 'select';
    case ControlType.COMBOBOX:
      return 'combobox';
    case ControlType.MULTI_SELECT:
      return 'multiselect';
    case ControlType.KEY_VALUE:
      return 'keyValue';
    case ControlType.JSON:
      return 'json';
    case ControlType.DATE:
      return 'date';
    case ControlType.TIMESTAMP:
      return 'timestamp';
    case ControlType.SECRET_SELECTOR:
      return 'secretSelector';
    case ControlType.SLIDER:
      return 'slider';
    case ControlType.UNSPECIFIED:
      return;
    default:
      throw new Error('Unsupported protobuf control type', { cause: control satisfies never });
  }
}

/**
 * Convert the generated `DataProviderId` enum value (e.g. `AWS_REGIONS`)
 * into the snake-cased string key used in the UI-side registry
 * (`aws_regions`). Returns `undefined` for `UNSPECIFIED` — the annotation
 * was not set.
 */
function dataProviderIdToKey(id: DataProviderId): string | undefined {
  if (id === DataProviderId.UNSPECIFIED) {
    return;
  }
  // Generated enum member names are already uppercase snake-case
  // (e.g. `AWS_REGIONS`); just lowercase. The UI registry keys use
  // the lowercase form so the mapping is lossless and obvious.
  const name = DataProviderId[id];
  return typeof name === 'string' ? name.toLowerCase() : undefined;
}

function isFieldUiEmpty(options: FieldUiOptions): boolean {
  return !(
    options.control !== ControlType.UNSPECIFIED ||
    options.placeholder !== '' ||
    options.example !== '' ||
    options.help !== '' ||
    options.description !== '' ||
    options.visibleWhen.length > 0 ||
    options.disabledWhen.length > 0 ||
    options.step !== '' ||
    options.summaryLabel !== '' ||
    options.sensitive ||
    options.dataProvider !== DataProviderId.UNSPECIFIED ||
    options.dropzone ||
    options.docsUrl !== '' ||
    options.allowEmptyItems
  );
}

function isOneofUiEmpty(options: OneofUiOptions): boolean {
  return !(
    options.help !== '' ||
    options.description !== '' ||
    options.visibleWhen.length > 0 ||
    options.disabledWhen.length > 0 ||
    options.step !== '' ||
    options.summaryLabel !== ''
  );
}

function isMessageUiEmpty(options: MessageUiOptions): boolean {
  return options.steps.length === 0 && options.secretScope === '' && options.title === '' && options.description === '';
}

export function getProtoMessageUi(desc: DescMessage): ProtoMessageUiConfig | undefined {
  const options = getExtension(desc.proto.options ?? create(MessageOptionsSchema), message_ui);
  if (isMessageUiEmpty(options)) {
    return;
  }

  const steps: ProtoStepConfig[] = [];

  for (const step of options.steps) {
    const fields = step.fieldPaths.filter((fieldPath) => fieldPath !== '');
    const id = step.id;
    if (id === '' || fields.length === 0) {
      continue;
    }

    steps.push(
      omitUndefined({
        id,
        title: optionalText(step.title) ?? humanize(id),
        description: optionalText(step.description),
        fields,
        visibleWhen: normalizeRules(step.visibleWhen),
        completeWhen: normalizeRules(step.completeWhen),
      })
    );
  }

  return omitUndefined({
    steps,
    secretScope: optionalText(options.secretScope),
    title: optionalText(options.title),
    description: optionalText(options.description),
  });
}

export function getProtoFieldUi(field: DescField): ProtoFieldUiConfig | undefined {
  const options = getExtension(field.proto.options ?? create(FieldOptionsSchema), field_ui);
  if (isFieldUiEmpty(options)) {
    return;
  }

  return omitUndefined({
    control: controlTypeToFieldType(options.control),
    placeholder: optionalText(options.placeholder),
    example: optionalText(options.example),
    help: optionalText(options.help),
    description: optionalText(options.description),
    visibleWhen: normalizeRules(options.visibleWhen),
    disabledWhen: normalizeRules(options.disabledWhen),
    step: optionalText(options.step),
    summaryLabel: optionalText(options.summaryLabel),
    sensitive: options.sensitive || options.control === ControlType.PASSWORD ? true : undefined,
    dataProvider: dataProviderIdToKey(options.dataProvider),
    dropzone: options.dropzone ? true : undefined,
    docsUrl: optionalText(options.docsUrl),
    allowEmptyItems: options.allowEmptyItems,
  });
}

export function getProtoOneofUi(oneof: DescOneof): ProtoFieldUiConfig | undefined {
  const options = getExtension(oneof.proto.options ?? create(OneofOptionsSchema), oneof_ui);
  if (isOneofUiEmpty(options)) {
    return;
  }

  return omitUndefined({
    help: optionalText(options.help),
    description: optionalText(options.description),
    visibleWhen: normalizeRules(options.visibleWhen),
    disabledWhen: normalizeRules(options.disabledWhen),
    step: optionalText(options.step),
    summaryLabel: optionalText(options.summaryLabel),
  });
}
