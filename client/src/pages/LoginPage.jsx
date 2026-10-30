import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function getDashboardPath(role) {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'staff':
      return '/staff';
    case 'customer':
      return '/select-service';
    default:
      return '/login';
  }
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const loggedInUser = await login(email.trim(), password);

      navigate(getDashboardPath(loggedInUser.role), {
        replace: true,
      });
    } catch (err) {
      setError(err.message || 'Unable to log in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const fieldStyle = {
    display: 'block',
    width: '100%',
    padding: '11px 12px',
    marginTop: '6px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    boxSizing: 'border-box',
    fontSize: '15px',
  };

  return (
    <section
      style={{
        maxWidth: '420px',
        margin: '48px auto',
        padding: '28px',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        color: '#1f2937',
      }}
    >
      <h1 style={{ marginTop: 0, marginBottom: '8px' }}>
        Sign in to QueueLess
      </h1>

      <p style={{ color: '#6b7280', marginBottom: '24px' }}>
        Log in to continue to your account.
      </p>

      <form onSubmit={handleSubmit}>
        <label htmlFor="login-email">
          Email address
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            style={fieldStyle}
          />
        </label>

        <label
          htmlFor="login-password"
          style={{ display: 'block', marginTop: '18px' }}
        >
          Password
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            style={fieldStyle}
          />
        </label>

        {error && (
          <p role="alert" style={{ color: '#b91c1c', marginTop: '14px' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%',
            padding: '12px',
            marginTop: '22px',
            border: 0,
            borderRadius: '4px',
            background: '#166534',
            color: '#ffffff',
            fontSize: '15px',
            fontWeight: 600,
            cursor: submitting ? 'wait' : 'pointer',
          }}
        >
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p style={{ marginTop: '22px', marginBottom: 0 }}>
        Don't have an account?{' '}
        <Link to="/register" style={{ color: '#166534' }}>
          Create an account
        </Link>
      </p>
    </section>
  );
}