import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: ErrorInfo) {
    console.error("Uncaught error in ErrorBoundary:", error, errorInfo);
  }

  resetErrorBoundary = () => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.state.error instanceof Error 
        ? this.state.error.message 
        : typeof this.state.error === 'string' 
            ? this.state.error 
            : JSON.stringify(this.state.error) || "Erro desconhecido";

      return (
        <div className="flex flex-col items-center justify-center h-full w-full p-6 text-center bg-bg text-text animate-in fade-in">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mb-6 border border-red-500/20">
            <AlertTriangle size={40} />
          </div>
          <h2 className="text-2xl font-bold mb-2">Ops! Algo deu errado.</h2>
          <p className="text-text-sec max-w-md mb-8 leading-relaxed">
            Ocorreu um erro inesperado ao renderizar esta tela.
            <br />
            <span className="text-xs font-mono bg-surface px-2 py-1 rounded mt-2 inline-block border border-border text-red-400 max-w-full overflow-hidden text-ellipsis">
              {errorMessage}
            </span>
          </p>
          
          <div className="flex gap-4">
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-6 py-3 rounded-full border border-border hover:bg-surface transition-colors font-medium text-text"
            >
              <RefreshCw size={18} />
              Recarregar App
            </button>
            
            <button
              onClick={this.resetErrorBoundary}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-brand text-bg hover:brightness-110 transition-colors font-bold"
            >
              <Home size={18} />
              Voltar ao Início
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}