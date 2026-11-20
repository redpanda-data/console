'use client';

// Copyright 2026 Redpanda Data, Inc.

import React from 'react';
import type { StepperConfigProps } from './types';

export const StepperContext = React.createContext<StepperConfigProps | null>(null);
export const ActiveStepContext = React.createContext<string | null>(null);
export const TriggerRefsContext = React.createContext<React.RefObject<Map<string, HTMLButtonElement>> | null>(null);

export function useStepperProvider(): StepperConfigProps {
  const context = React.useContext(StepperContext);
  if (context === null) {
    throw new Error('Stepper parts must be rendered inside Stepper.Provider.');
  }
  return context;
}
