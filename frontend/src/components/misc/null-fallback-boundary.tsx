import React, { type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

function reportBoundaryError(error: Error, errorInfo: ErrorInfo) {
  // biome-ignore lint/suspicious/noConsole: error boundary logging for debugging component errors
  console.error('NullFallbackBoundary caught an error', error, errorInfo);
}

class NullFallbackBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true } satisfies ErrorBoundaryState;
  }

  componentDidCatch = reportBoundaryError;

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

export { NullFallbackBoundary };
