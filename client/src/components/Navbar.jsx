import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Users,
  MonitorPlay,
  LayoutDashboard,
  BarChart3,
  Ticket,
  Menu,
  X,
  LogIn,
  UserPlus,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const navigationByRole = {
  customer: [
    {
      path: '/customer',
      label: 'My Queue',
      icon: Ticket,
      id: 'nav-customer',
    },
  ],

  staff: [
    {
      path: '/staff',
      label: 'Staff',
      icon: LayoutDashboard,
      id: 'nav-staff',
    },
    {
      path: '/analytics',
      label: 'Analytics',
      icon: BarChart3,
      id: 'nav-analytics',
    },
  ],

  admin: [
    {
      path: '/admin',
      label: 'Admin',
      icon: ShieldCheck,
      id: 'nav-admin',
    },
    {
      path: '/staff',
      label: 'Staff',
      icon: LayoutDashboard,
      id: 'nav-staff',
    },
    {
      path: '/analytics',
      label: 'Analytics',
      icon: BarChart3,
      id: 'nav-analytics',
    },
    {
      path: '/display',
      label: 'Display',
      icon: MonitorPlay,
      id: 'nav-display',
    },
  ],
};

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const { user, loading, logout } = useAuth();

  // The live display uses its own full-screen layout.
  if (location.pathname === '/display') return null;

  const navItems = user
    ? navigationByRole[user.role] || []
    : [];

  function closeMobileMenu() {
    setMobileOpen(false);
  }

  function handleLogout() {
    logout();
    setMobileOpen(false);
    navigate('/login', { replace: true });
  }

  return (
    <header className="ql-header">
      <nav className="ql-navbar" aria-label="Main navigation">
        <NavLink
          to="/"
          className="ql-brand"
          aria-label="QueueLess home"
          onClick={closeMobileMenu}
        >
          <span className="ql-brand-mark">
            <Users size={21} strokeWidth={2.2} />
          </span>

          <span className="ql-brand-name">
            <span>Queue</span>
            <span>Less</span>
          </span>
        </NavLink>

        {/* Desktop Navigation */}
        <div className="ql-desktop-nav">
          {!loading &&
            navItems.map(({ path, label, icon: Icon, id }) => (
              <NavLink
                key={path}
                to={path}
                id={id}
                className={({ isActive }) =>
                  `ql-nav-link ${isActive ? 'active' : ''}`
                }
              >
                <Icon size={17} strokeWidth={1.9} />
                <span>{label}</span>
              </NavLink>
            ))}

          {!loading && !user && (
            <>
              <NavLink to="/login" className="ql-nav-link">
                <LogIn size={17} />
                <span>Login</span>
              </NavLink>

              <NavLink to="/register" className="ql-nav-link">
                <UserPlus size={17} />
                <span>Register</span>
              </NavLink>
            </>
          )}

          {!loading && user && (
            <div
              className="ql-nav-link"
              style={{ cursor: 'default' }}
            >
              <Users size={17} />
              <span>
                {user.fullName || user.full_name || user.email}
              </span>
            </div>
          )}

          {!loading && user && (
            <button
              type="button"
              className="ql-nav-link"
              onClick={handleLogout}
              style={{
                border: 0,
                background: 'transparent',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              <LogOut size={17} />
              <span>Logout</span>
            </button>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          className="ql-menu-button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={
            mobileOpen
              ? 'Close navigation menu'
              : 'Open navigation menu'
          }
          aria-expanded={mobileOpen}
          id="mobile-menu-toggle"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {/* Mobile Navigation */}
      {mobileOpen && (
        <div className="ql-mobile-nav">
          {!loading &&
            navItems.map(({ path, label, icon: Icon, id }) => (
              <NavLink
                key={path}
                to={path}
                id={`${id}-mobile`}
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  `ql-mobile-link ${isActive ? 'active' : ''}`
                }
              >
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}

          {!loading && !user && (
            <>
              <NavLink
                to="/login"
                className="ql-mobile-link"
                onClick={closeMobileMenu}
              >
                <LogIn size={18} />
                <span>Login</span>
              </NavLink>

              <NavLink
                to="/register"
                className="ql-mobile-link"
                onClick={closeMobileMenu}
              >
                <UserPlus size={18} />
                <span>Register</span>
              </NavLink>
            </>
          )}

          {!loading && user && (
            <div className="ql-mobile-link">
              <Users size={18} />
              <span>
                {user.fullName || user.full_name || user.email}
              </span>
            </div>
          )}

          {!loading && user && (
            <button
              type="button"
              className="ql-mobile-link"
              onClick={handleLogout}
              style={{
                width: '100%',
                border: 0,
                background: 'transparent',
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
}