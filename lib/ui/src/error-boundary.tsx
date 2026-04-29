import React from "react";

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
  hasError: boolean;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { error, hasError: true };
  }

  override componentDidCatch() {
    // You can log the error to an error reporting service here
    // console.error("Uncaught error:", error, errorInfo)
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return <ErrorBoundaryFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}

export function ErrorBoundaryFallback({ error }: { error: Error | null }) {
  if (!error) {
    return null;
  }

  return (
    <div className="rounded bg-red-50 p-4 text-red-800">
      <h2 className="mb-1 font-bold">Something went wrong.</h2>
      <pre className="text-xs whitespace-pre-wrap">{error.message}</pre>
    </div>
  );
}
