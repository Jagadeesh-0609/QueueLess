
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 8) {
      setError('Password must contain at least 8 characters.');
      return;
    }

    if (new TextEncoder().encode(password).length > 72) {
      setError('Password must not exceed 72 bytes.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      await register(fullName.trim(), email.trim(), password);
      setSuccess('Account created successfully. Please sign in.');
      setTimeout(() => navigate('/login', { replace: true }), 1000);
    } catch (err) {
      setError(err.message || 'Unable to create your account.');
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
        maxWidth: '460px',
        margin: '40px auto',
        padding: '28px',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        color: '#1f2937',
      }}
    >
      <h1 style={{ marginTop: 0, marginBottom: '8px' }}>
        Create your account
      </h1>

      <p style={{ color: '#6b7280', marginBottom: '24px' }}>
        Register as a QueueLess customer.
      </p>

      <form onSubmit={handleSubmit}>
        <label htmlFor="register-name">
          Full name
          <input
            id="register-name"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            minLength={2}
            maxLength={100}
            required
            style={fieldStyle}
          />
        </label>

        <label
          htmlFor="register-email"
          style={{ display: 'block', marginTop: '16px' }}
        >
          Email address
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            required
            style={fieldStyle}
          />
        </label>

        <label
          htmlFor="register-password"
          style={{ display: 'block', marginTop: '16px' }}
        >
          Password
          <input
            id="register-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
            style={fieldStyle}
          />
        </label>

        <label
          htmlFor="register-confirm-password"
          style={{ display: 'block', marginTop: '16px' }}
        >
          Confirm password
          <input
            id="register-confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={8}
            required
            style={fieldStyle}
          />
        </label>

        {error && (
          <p role="alert" style={{ color: '#b91c1c', marginTop: '14px' }}>
            {error}
          </p>
        )}

        {success && (
          <p role="status" style={{ color: '#166534', marginTop: '14px' }}>
            {success}
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
          {submitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p style={{ marginTop: '22px', marginBottom: 0 }}>
        Already registered?{' '}
        <Link to="/login" style={{ color: '#166534' }}>
          Sign in
        </Link>
      </p>
    </section>
  );
}
