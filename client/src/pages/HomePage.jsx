
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Ticket,
  Users,
  MonitorPlay,
  Clock3,
  BarChart3,
  CheckCircle2,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const features = [
  {
    icon: Ticket,
    title: 'Easy token generation',
    description:
      'Generate a service token and check its status without repeatedly waiting at the counter.',
  },
  {
    icon: Clock3,
    title: 'Clear queue status',
    description:
      'Follow queue progress and understand when your turn is approaching.',
  },
  {
    icon: MonitorPlay,
    title: 'Live queue display',
    description:
      'Display current queue information on a dedicated screen for waiting customers.',
  },
  {
    icon: BarChart3,
    title: 'Service insights',
    description:
      'Help staff and managers review queue activity and service performance.',
  },
];

export default function HomePage() {
  const { user, loading } = useAuth();

  const role = user?.role;
  const isCustomer = role === 'customer';
  const isStaff = role === 'staff';
  const isAdmin = role === 'admin';

  const dashboardPath = isStaff
    ? '/staff'
    : isAdmin
      ? '/admin'
      : '/customer';

  const dashboardLabel = isStaff
    ? 'Open staff dashboard'
    : isAdmin
      ? 'Open admin dashboard'
      : 'Get a token';

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero-content">
          <span className="home-eyebrow">
            <span className="home-status-dot" />
            A simpler way to manage queues
          </span>

          <h1>
            Less waiting.
            <br />
            <span>Better service.</span>
          </h1>

          <p className="home-hero-description">
            QUEUELESS helps service centres organise customer queues,
            manage tokens and keep everyone informed about their turn.
          </p>

          <div className="home-actions">
            {!loading && !user && (
              <>
                <Link
                  to="/login"
                  className="home-button home-button-primary"
                >
                  <LogIn size={18} />
                  Login
                </Link>

                <Link
                  to="/register"
                  className="home-button home-button-secondary"
                >
                  <UserPlus size={18} />
                  Register
                </Link>
              </>
            )}

            {!loading && user && (
              <Link
                to={dashboardPath}
                className="home-button home-button-primary"
              >
                {dashboardLabel}
                <ArrowRight size={18} />
              </Link>
            )}
          </div>

          <div className="home-trust-note">
            <CheckCircle2 size={16} />
            Designed for practical, organised service management
          </div>
        </div>

        <div className="home-preview" aria-label="Queue management preview">
          <div className="home-preview-header">
            <div>
              <span className="home-preview-label">QUEUE OVERVIEW</span>
              <h2>Today's service</h2>
            </div>
            <span className="home-preview-indicator">
              <span className="home-status-dot" />
              Live view
            </span>
          </div>

          <div className="home-preview-current">
            <span>NOW SERVING</span>
            <strong>A-024</strong>
            <span className="home-preview-caption">Counter 02</span>
          </div>

          <div className="home-preview-stats">
            <div>
              <Users size={19} />
              <span>Waiting</span>
              <strong>Queue status</strong>
            </div>
            <div>
              <Clock3 size={19} />
              <span>Service flow</span>
              <strong>Track progress</strong>
            </div>
          </div>

          <p className="home-preview-footnote">
            Illustrative preview — live values are shown in the queue display.
          </p>
        </div>
      </section>

      <section className="home-features">
        <div className="home-section-heading">
          <span className="home-section-label">
            BUILT FOR EVERYDAY SERVICES
          </span>
          <h2>One system. A clearer queue.</h2>
          <p>
            Practical tools for customers, service staff and administrators.
          </p>
        </div>

        <div className="home-feature-grid">
          {features.map(({ icon: Icon, title, description }) => (
            <article className="home-feature-card" key={title}>
              <span className="home-feature-icon">
                <Icon size={22} />
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-bottom-cta">
        <div>
          <h2>
            {user
              ? `Welcome, ${user.fullName || user.full_name || user.email}`
              : 'Ready to join the queue?'}
          </h2>
          <p>
            {user
              ? 'Continue to your QueueLess dashboard.'
              : 'Create an account or sign in to continue.'}
          </p>
        </div>

        {!loading && !user && (
          <Link
            to="/register"
            className="home-button home-button-primary"
          >
            Create account
            <ArrowRight size={18} />
          </Link>
        )}

        {!loading && user && (
          <Link
            to={dashboardPath}
            className="home-button home-button-primary"
          >
            {isCustomer ? 'Open customer portal' : dashboardLabel}
            <ArrowRight size={18} />
          </Link>
        )}
      </section>

      <footer className="home-footer">
        <span>QUEUELESS</span>
        <span>Real-Time Queue and Service Management System</span>
      </footer>
    </div>
  );
}
