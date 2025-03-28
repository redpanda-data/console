import { type DeepKeys, createFormHook } from '@tanstack/react-form';
import { CheckboxField } from './checkbox/checkbox-field';
import { fieldContext, formContext } from './form-hook-contexts';
import { KeyValueField } from './key-value/key-value-field';
import { NumberField } from './number/number-field';
import { PasswordField } from './password/password-field';
import { RadioGroupField } from './radio/radio-group-field';
import { SingleSelectField } from './select/single-select-field';
import { SubscribeButton } from './subscribe/subscribe-button';
import { TextField } from './text/text-field';

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    PasswordField,
    KeyValueField,
    RadioGroupField,
    SingleSelectField,
    CheckboxField,
    NumberField,
  },
  formComponents: {
    SubscribeButton,
  },
});

type PrefixFromDepth<T extends string | number, TDepth extends any[]> = TDepth['length'] extends 0 ? T : `.${T}`;

export type PrefixObjectAccessor<T extends object, TDepth extends any[]> = {
  [K in keyof T]-?: K extends string | number
    ? PrefixFromDepth<K, TDepth> | `${PrefixFromDepth<K, TDepth>}${DeepKeys<T[K], [TDepth]>}`
    : never;
}[keyof T];
