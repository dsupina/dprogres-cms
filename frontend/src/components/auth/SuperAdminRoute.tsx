import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore, isSuperAdmin } from '@/lib/auth';

interface SuperAdminRouteProps {
  children: ReactNode;
}

export default function SuperAdminRoute({ children }: SuperAdminRouteProps) {
  const { user } = useAuthStore();

  if (!isSuperAdmin(user)) {
    // Redirect non-super-admins to the regular admin dashboard
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
