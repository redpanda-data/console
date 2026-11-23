import React, { type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

function reportBoundaryError(error: Error, errorInfo: ErrorInfo) {
  // Log the error to an error reporting service, if needed
  // biome-ignore lint/suspicious/noConsole: error boundary logging for debugging component errors
  console.error('NullFallbackBoundary caught an error', error, errorInfo);
}

class NullFallbackBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    // Update state to indicate an error has occurred
    return { hasError: true };
  }

  componentDidCatch = reportBoundaryError;

  render() {
    if (this.state.hasError) {
      // Render nothing in case of an error
      return null;
    }

    return this.props.children;
  }
}

export { NullFallbackBoundary };
