import { createFormHook } from '@tanstack/react-form';
import { CheckboxField } from './checkbox/checkbox-field';
import { fieldContext, formContext } from './form-hook-contexts';
import { KeyValueField } from './key-value/key-value-field';
import { NumberField } from './number/number-field';
import { PasswordField } from './password/password-field';
import { RadioGroupField } from './radio/radio-group-field';
import { SingleSelectField } from './select/single-select-field';
import { SubscribeButton } from './subscribe/subscribe-button';
import { TextAreaField } from './text-area/text-area-field';
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
    TextAreaField,
  },
  formComponents: {
    SubscribeButton,
  },
});
