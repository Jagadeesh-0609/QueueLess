
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  getCurrentUser,
  loginUser,
  registerUser,
} from '../services/api';

const AuthContext = createContext(null);
const TOKEN_KEY = 'queueless_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const login = useCallback(async (email, password) => {
    const result = await loginUser(email, password);

    if (!result.token || !result.user) {
      throw new Error('Invalid login response from server.');
    }

    localStorage.setItem('queueless_token', result.token);
    setUser(result.user);

    return result.user;
  }, []);

  const register = useCallback(
    async (fullName, email, password) => {
      const result = await registerUser(fullName, email, password);
      return result;
    },
    [],
  );

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      const token = localStorage.getItem(TOKEN_KEY);

      if (!token) {
        if (active) setLoading(false);
        return;
      }

      try {
        const result = await getCurrentUser(token);

        if (active && result.user) {
          setUser(result.user);
        } else if (active) {
          logout();
        }
      } catch {
        if (active) logout();
      } finally {
        if (active) setLoading(false);
      }
    }

    restoreSession();

    return () => {
      active = false;
    };
  }, [logout]);

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    isAuthenticated: Boolean(user),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
}
