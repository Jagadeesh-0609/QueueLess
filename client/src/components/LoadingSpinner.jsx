import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Loader2 className="w-10 h-10 text-brand-500 animate-spin mb-3" />
      <p className="text-surface-400 text-sm">{message}</p>
    </div>
  );
}
