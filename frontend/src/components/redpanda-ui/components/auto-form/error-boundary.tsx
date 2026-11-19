'use client';

import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '../alert';
import type { AutoFormSlotDescriptor } from './slots';

interface AutoFormErrorBoundaryProps {
  children: React.ReactNode;
  resetKey: unknown;
  slotsKey: readonly AutoFormSlotDescriptor[] | undefined;
}

interface AutoFormErrorBoundaryState {
  error: Error | null;
  resetKey: unknown;
  schemaGeneration: number;
  slotsKey: readonly AutoFormSlotDescriptor[] | undefined;
}

export class AutoFormErrorBoundary extends React.Component<AutoFormErrorBoundaryProps, AutoFormErrorBoundaryState> {
  override state: AutoFormErrorBoundaryState = {
    error: null,
    resetKey: this.props.resetKey,
    schemaGeneration: 0,
    slotsKey: this.props.slotsKey,
  };

  static getDerivedStateFromError(thrown: unknown): Partial<AutoFormErrorBoundaryState> {
    return { error: thrown instanceof Error ? thrown : new Error(`Non-error value thrown: ${String(thrown)}`) };
  }

  static getDerivedStateFromProps(
    props: AutoFormErrorBoundaryProps,
    state: AutoFormErrorBoundaryState
  ): AutoFormErrorBoundaryState | null {
    if (props.resetKey === state.resetKey && props.slotsKey === state.slotsKey) {
      return null;
    }
    return {
      error: null,
      resetKey: props.resetKey,
      slotsKey: props.slotsKey,
      // Schema changes reset valid forms; slot identity only makes an error fallback retry.
      schemaGeneration: state.schemaGeneration + (props.resetKey === state.resetKey ? 0 : 1),
    };
  }

  override render() {
    if (this.state.error !== null) {
      return (
        <Alert variant="destructive">
          <AlertTitle>AutoForm failed to render</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">{this.state.error.message}</AlertDescription>
        </Alert>
      );
    }
    return <React.Fragment key={this.state.schemaGeneration}>{this.props.children}</React.Fragment>;
  }
}
