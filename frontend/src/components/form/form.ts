import { createFormHook } from '@tanstack/react-form';
import { fieldContext, formContext } from './form-hook-contexts';
import { KeyValueField } from './key-value-field';
import { PasswordField } from './password-field';
import { SubscribeButton } from './subscribe-button';
import { TextField } from './text-field';

/**
 * If we want to lazy load the components, we would need to wrap the forms
 * in a <Suspense> boundary with a fallback for loading the missing assets.
 */
// const TextField = lazy(() => import('./text-field').then((module) => ({ default: module.TextField })));
// const PasswordField = lazy(() => import('./password-field').then((module) => ({ default: module.PasswordField })));
// const KeyValueField = lazy(() => import('./key-value-field').then((module) => ({ default: module.KeyValueField })));
// const SubscribeButton = lazy(() =>
//   import('./subscribe-button').then((module) => ({ default: module.SubscribeButton })),
// );

// Create custom form hook with our field components
export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    PasswordField,
    KeyValueField,
  },
  formComponents: {
    SubscribeButton,
  },
});
