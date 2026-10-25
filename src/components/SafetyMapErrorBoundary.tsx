import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface SafetyMapErrorBoundaryProps {
  children: ReactNode;
}

interface SafetyMapErrorBoundaryState {
  hasError: boolean;
}

export class SafetyMapErrorBoundary extends Component<
  SafetyMapErrorBoundaryProps,
  SafetyMapErrorBoundaryState
> {
  state: SafetyMapErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SafetyMapErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Safety map failed to render', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section
          role="alert"
          className="rounded-[28px] border border-[#EFE6E1] bg-white p-6 text-[#221F20] shadow-sm"
        >
          <h2 className="text-lg font-semibold">Safety map unavailable</h2>
          <p className="mt-2 text-sm text-[#6E676A]">
            The map could not be displayed. You can try loading it again.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="mt-4 rounded-full bg-[#A7194B] px-4 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}
