import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Zap,
  Star,
  Clock,
  CheckCircle2,
  Building2,
  AlertCircle,
  RefreshCw,
  Ticket,
  ArrowRight,
} from 'lucide-react';

import {
  getServices,
  createToken,
} from '../services/api';

import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

export default function SelectServicePage() {
  const navigate = useNavigate();

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedService, setSelectedService] = useState(null);
  const [priority, setPriority] = useState(0);
  const [creating, setCreating] = useState(false);

  const fetchServices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await getServices();
      setServices(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Unable to load services.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const handleCreateToken = async () => {
    if (!selectedService || creating) return;

    try {
      setCreating(true);
      setError(null);

      const token = await createToken(
        selectedService.id,
        priority
      );

      if (!token?.id) {
        throw new Error(
          'The server did not return the created token ID.'
        );
      }

      navigate(
        `/display?tokenId=${encodeURIComponent(token.id)}`
      );
    } catch (err) {
      setError(err.message || 'Unable to create your token.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading available services..." />;
  }

  if (error && services.length === 0) {
    return <ErrorMessage message={error} onRetry={fetchServices} />;
  }

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-6 py-8">
      <section className="page-header">
        <p className="text-sm font-semibold text-amber-800 mb-2">
          QUEUELESS · CUSTOMER SERVICE
        </p>

        <h1 className="page-title text-3xl sm:text-4xl">
          Select a Service
        </h1>

        <p className="page-subtitle text-base mt-3 max-w-2xl">
          Choose the service you need, take a token and monitor your
          service-specific queue in real time.
        </p>
      </section>

      <section className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-4">
          <div>
            <h2 className="text-xl font-bold text-surface-100">
              Available Services
            </h2>

            <p className="text-sm text-surface-500 mt-1">
              Choose the service you want to visit.
            </p>
          </div>

          <span className="text-sm text-surface-500">
            {services.length} services available
          </span>
        </div>

        {services.length === 0 ? (
          <div className="card p-6">
            <p className="text-surface-500">
              No services are currently available.
            </p>

            <button
              type="button"
              onClick={fetchServices}
              className="btn-secondary mt-4"
            >
              <RefreshCw size={16} />
              Refresh services
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((service) => {
              const isSelected =
                Number(selectedService?.id) === Number(service.id);

              return (
                <button
                  type="button"
                  key={service.id}
                  id={`service-${service.id}`}
                  aria-pressed={isSelected}
                  onClick={() =>
                    setSelectedService(isSelected ? null : service)
                  }
                  className={`card-hover p-5 text-left ${
                    isSelected ? 'border-brand-500 bg-amber-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-start gap-3">
                      <span
                        className={`inline-flex items-center justify-center min-w-11 h-11 px-2 border font-bold text-sm ${
                          isSelected
                            ? 'bg-amber-300 border-amber-500 text-black'
                            : 'bg-stone-100 border-stone-200 text-stone-800'
                        }`}
                      >
                        {service.code}
                      </span>

                      <div>
                        <h3 className="font-bold text-base text-surface-100">
                          {service.name}
                        </h3>

                        <p className="text-sm text-surface-500 mt-1 flex items-center gap-1">
                          <Clock size={14} />
                          About {service.avg_time_min} min per service
                        </p>
                      </div>
                    </div>

                    {isSelected && (
                      <CheckCircle2
                        size={19}
                        className="text-amber-800 shrink-0"
                      />
                    )}
                  </div>

                  <p className="text-sm text-surface-400 leading-relaxed">
                    {service.description}
                  </p>

                  <p className="mt-4 pt-3 border-t border-surface-800 text-sm font-semibold text-surface-200">
                    {isSelected ? 'Selected' : 'Select service'}
                    <ArrowRight size={15} className="inline ml-2" />
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selectedService && (
        <section className="card mb-8">
          <div className="p-5 sm:p-6">
            <div className="flex items-start gap-3 mb-5">
              <span className="flex items-center justify-center w-10 h-10 bg-amber-100 text-amber-900 border border-amber-200 shrink-0">
                <Ticket size={21} />
              </span>

              <div>
                <h2 className="text-xl font-bold text-surface-100">
                  Join the {selectedService.name} queue
                </h2>

                <p className="text-sm text-surface-500 mt-1">
                  Select the appropriate priority and generate your token.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <div className="border border-surface-800 p-4">
                <p className="text-xs text-surface-500 mb-1">
                  Selected service
                </p>

                <div className="flex items-center gap-2">
                  <Building2 size={18} className="text-amber-800" />
                  <strong className="text-surface-200">
                    {selectedService.name}
                  </strong>
                </div>
              </div>

              <fieldset>
                <legend className="block text-sm font-semibold text-surface-300 mb-2">
                  Priority
                </legend>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { value: 0, label: 'Normal', icon: Users },
                    { value: 1, label: 'High', icon: Star },
                    { value: 2, label: 'Urgent', icon: Zap },
                  ].map(({ value, label, icon: Icon }) => {
                    const active = priority === value;

                    return (
                      <button
                        type="button"
                        key={value}
                        id={`priority-${value}`}
                        aria-pressed={active}
                        onClick={() => setPriority(value)}
                        className={`btn ${
                          active
                            ? 'bg-amber-100 text-surface-100 border border-amber-400'
                            : 'btn-secondary'
                        }`}
                      >
                        <Icon size={17} />
                        {label}
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs text-surface-500 mt-2">
                  Select a priority only when it applies. Staff may need
                  to verify priority requests.
                </p>
              </fieldset>

              {error && (
                <div
                  role="alert"
                  className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm"
                >
                  {error}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  id="join-queue-btn"
                  onClick={handleCreateToken}
                  disabled={creating}
                  className="btn-primary w-full sm:w-auto sm:min-w-48 py-3"
                >
                  <Ticket size={19} />
                  {creating ? 'Generating token...' : 'Get my token'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedService(null);
                    setPriority(0);
                    setError(null);
                  }}
                  disabled={creating}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {error && !selectedService && (
        <div
          role="alert"
          className="mb-6 p-3 bg-red-50 border border-red-200 text-red-800 text-sm"
        >
          {error}
        </div>
      )}

      <section className="card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <AlertCircle
            size={21}
            className="text-amber-800 mt-0.5 shrink-0"
          />

          <div>
            <h2 className="text-lg font-bold text-surface-100">
              How it works
            </h2>

            <ol className="mt-3 space-y-3 text-sm text-surface-500">
              <li className="flex gap-3">
                <span className="font-bold text-amber-800">01</span>
                Select the service you need.
              </li>

              <li className="flex gap-3">
                <span className="font-bold text-amber-800">02</span>
                Generate your token.
              </li>

              <li className="flex gap-3">
                <span className="font-bold text-amber-800">03</span>
                Monitor your service queue and token status on the live display.
              </li>

              <li className="flex gap-3">
                <span className="font-bold text-amber-800">04</span>
                Proceed to the assigned counter when your token is called.
              </li>
            </ol>
          </div>
        </div>
      </section>

      <footer className="mt-8 pt-4 border-t border-surface-800 text-sm text-surface-500">
        QueueLess helps visitors check their queue status and plan their visit.
        Please follow the instructions displayed at your service centre.
      </footer>
    </div>
  );
}