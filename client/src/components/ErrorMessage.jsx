import { AlertTriangle } from 'lucide-react';

export default function ErrorMessage({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-full bg-danger-500/10 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-danger-400" />
      </div>
      <h3 className="text-lg font-semibold text-surface-200 mb-1">Something went wrong</h3>
      <p className="text-surface-400 text-sm max-w-md mb-4">{message || 'An unexpected error occurred.'}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary text-sm">
          Try Again
        </button>
      )}
    </div>
  );
}
