import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || "Something went wrong.";

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#d6d3cb] p-4 transition-colors duration-500">
          <div className="backdrop-blur-xl bg-white/40 border border-white/20 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl">
            <AlertCircle className="w-12 h-12 text-[#f08924] mx-auto mb-4" />
            <h2 className="text-xl font-bold text-[#333333] mb-2">Application Error</h2>
            <p className="text-[#333333]/60 mb-6">{message}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-[#f08924] text-white px-6 py-2.5 rounded-xl font-bold w-full transition-all hover:bg-[#f08924]/90 active:scale-[0.98]"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
