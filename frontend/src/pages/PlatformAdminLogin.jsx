import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const PlatformAdminLogin = () => {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  useEffect(() => { if (user?.platformRole === "super_admin") navigate("/platform-admin", { replace: true }); }, [user, navigate]);
  const submit = async (event) => {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const result = await login(form);
      if (result.user.platformRole !== "super_admin") { logout(); setError("This account is not authorized for the Platform Command Center."); return; }
      navigate("/platform-admin", { replace: true });
    } catch (err) { setError(err.response?.data?.message || "Login failed."); } finally { setLoading(false); }
  };
  return <div className="auth-page"><div className="auth-intro"><p className="eyebrow">STAGEPASS OWNER ACCESS</p><h1>Platform<br /><em>control.</em></h1><p>Private command center for platform-wide organizations, performance, and operations.</p></div><div className="card auth-card"><div className="auth-card-heading"><span>SUPER ADMIN</span><b><ShieldCheck size={16} style={{ verticalAlign: "-3px" }} /> Secure access</b></div>{error && <div className="error-banner">{error}</div>}<form onSubmit={submit}><div className="field"><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div><div className="field"><label>Password</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div><button className="btn btn-primary auth-submit" style={{ width: "100%" }} disabled={loading}>{loading ? "Verifying…" : "Enter Command Center"}</button></form></div></div>;
};
export default PlatformAdminLogin;
