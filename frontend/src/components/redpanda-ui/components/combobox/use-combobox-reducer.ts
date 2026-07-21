import { resolveLabel } from './combobox-utils';
import type { ComboboxOption } from './index';

// Readonly at every level — the reducer MUST return a new object.
export type ComboboxState = Readonly<{
  open: boolean;
  inputValue: string;
  highlightedValue: string;
  activeDescendantId: string | undefined;
  userHasTyped: boolean;
}>;

export type ComboboxAction =
  | { readonly type: 'OPEN' }
  | { readonly type: 'CLOSE' }
  | { readonly type: 'ARROW_OPEN' }
  | { readonly type: 'INPUT_CLICK' }
  | { readonly type: 'TYPE'; readonly value: string; readonly firstMatch: string }
  | { readonly type: 'SELECT'; readonly label: string }
  | { readonly type: 'TOGGLE_OFF' }
  | { readonly type: 'CLEAR' }
  | { readonly type: 'CREATE_SUBMIT'; readonly inputValue: string }
  | { readonly type: 'NAVIGATE'; readonly nextHighlight: string }
  | { readonly type: 'ENTER_REVERT'; readonly controlledLabel: string }
  | { readonly type: 'ENTER_CLEAR' }
  | { readonly type: 'ESCAPE_CLEAR' }
  | { readonly type: 'BLUR_CLEAR' }
  | { readonly type: 'BLUR_REVERT'; readonly controlledLabel: string }
  | { readonly type: 'SYNC_CONTROLLED'; readonly controlledLabel: string }
  | { readonly type: 'SET_ACTIVE_DESCENDANT'; readonly id: string | undefined };

// Exhaustiveness guard: an unhandled action variant becomes a `never` type error here.
const assertNever = (action: never): never => {
  throw new Error(`Unhandled combobox action: ${(action as ComboboxAction).type}`);
};

export const comboboxReducer = (state: ComboboxState, action: ComboboxAction): ComboboxState => {
  switch (action.type) {
    case 'OPEN':
      return { ...state, open: true, highlightedValue: '', userHasTyped: false };
    case 'CLOSE':
      return { ...state, open: false, highlightedValue: '', activeDescendantId: undefined };
    case 'ARROW_OPEN':
      return { ...state, open: true };
    case 'INPUT_CLICK':
      return { ...state, open: true, inputValue: '', userHasTyped: false };
    case 'TYPE':
      return {
        ...state,
        open: true,
        inputValue: action.value,
        highlightedValue: action.firstMatch,
        userHasTyped: true,
      };
    case 'SELECT':
      return { ...state, open: false, inputValue: action.label };
    case 'TOGGLE_OFF':
      return { ...state, open: false, inputValue: '' };
    case 'CLEAR':
      return { ...state, inputValue: '' };
    case 'CREATE_SUBMIT':
      return { ...state, open: false, inputValue: action.inputValue };
    case 'NAVIGATE':
      return { ...state, highlightedValue: action.nextHighlight };
    case 'ENTER_REVERT':
      return { ...state, open: false, inputValue: action.controlledLabel };
    case 'ENTER_CLEAR':
      return { ...state, open: false, inputValue: '' };
    case 'ESCAPE_CLEAR':
      return { ...state, inputValue: '' };
    case 'BLUR_CLEAR':
      return { ...state, inputValue: '', userHasTyped: false };
    case 'BLUR_REVERT':
      return { ...state, inputValue: action.controlledLabel, userHasTyped: false };
    case 'SYNC_CONTROLLED':
      if (state.inputValue === action.controlledLabel) return state;
      return { ...state, inputValue: action.controlledLabel };
    case 'SET_ACTIVE_DESCENDANT':
      return { ...state, activeDescendantId: action.id };
    default:
      return assertNever(action);
  }
};

export const createInitialState = (
  options: ReadonlyArray<ComboboxOption>,
  controlledValue: string,
  defaultOpen: boolean
): ComboboxState => ({
  open: defaultOpen,
  inputValue: resolveLabel(options, controlledValue),
  highlightedValue: '',
  activeDescendantId: undefined,
  userHasTyped: false,
});
