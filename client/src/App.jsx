import { Routes, Route, Navigate } from 'react-router-dom';

import Navbar from './components/Navbar';
import ProtectedRoute, {
  PublicOnlyRoute,
} from './components/ProtectedRoute';

import HomePage from './pages/HomePage';
import CustomerPage from './pages/CustomerPage';
import SelectServicePage from './pages/SelectServicePage';
import StaffPage from './pages/StaffPage';
import DisplayPage from './pages/DisplayPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AdminPage from './pages/AdminPage';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

export default function App() {
  return (
    <div className="ql-app">
      <Navbar />

      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />

          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* Customer routes */}
          <Route element={<ProtectedRoute allowedRoles={['customer']} />}>
            <Route path="/select-service" element={<SelectServicePage />} />
            <Route path="/customer" element={<CustomerPage />} />
          </Route>

          {/* Staff and Admin routes */}
          <Route element={<ProtectedRoute allowedRoles={['staff', 'admin']} />}>
            <Route path="/staff" element={<StaffPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
          </Route>

          {/* Admin-only route */}
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>

          {/* Authenticated display access */}
          <Route
            element={
              <ProtectedRoute
                allowedRoles={['customer', 'staff', 'admin']}
              />
            }
          >
            <Route path="/display" element={<DisplayPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}