---
title: Zustand Persistence Pattern
impact: HIGH
impactDescription: Proper persistence ensures state survives navigation and page reloads
tags: zustand, persist, sessionStorage, middleware
---

# Zustand Persistence Pattern (HIGH)

## Explanation

Use Zustand's persist middleware with sessionStorage for state that should survive page navigation but not browser sessions. Use `createFlatStorage` from `src/utils/store.ts` as the storage adapter.

## Incorrect

```tsx
// No persistence - state lost on navigation
const useWizardStore = create<WizardState>((set) => ({
  step: 1,
  formData: {},
  setStep: (step) => set({ step }),
}));

// Using localStorage when sessionStorage is appropriate
const useStore = create<State>()(
  persist(
    (set) => ({ /* ... */ }),
    {
      name: 'store',
      storage: createJSONStorage(() => localStorage), // Too persistent
    }
  )
);
```

## Correct

```tsx
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createFlatStorage } from 'utils/store';

type WizardData = {
  step: number;
  formData: Record<string, unknown>;
  setStep: (step: number) => void;
  setFormData: (data: Record<string, unknown>) => void;
  reset: () => void;
};

const useWizardStore = create<WizardData>()(
  persist(
    (set) => ({
      step: 1,
      formData: {},
      setStep: (step) => set({ step }),
      setFormData: (formData) => set({ formData }),
      reset: () => set({ step: 1, formData: {} }),
    }),
    {
      name: 'wizard-state',
      storage: createFlatStorage<
        Omit<WizardData, 'setStep' | 'setFormData' | 'reset'>
      >(),
    }
  )
);
```

## Include Reset Function

Always include a reset function for:
- Clearing state after completion
- Testing isolation
- Error recovery

## Reference

- `src/utils/store.ts` — `createFlatStorage` implementation (uses sessionStorage)
- [Zustand Persist Middleware](https://docs.pmnd.rs/zustand/integrations/persisting-store-data)
