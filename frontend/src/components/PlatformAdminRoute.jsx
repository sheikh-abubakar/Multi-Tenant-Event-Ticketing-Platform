import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const PlatformAdminRoute = ({ children }) => {
  const { token, user } = useAuth();
  if (!token) return <Navigate to="/platform-admin/login" replace />;
  if (user?.platformRole !== "super_admin") return <Navigate to="/browse" replace />;
  return children;
};

export default PlatformAdminRoute;
