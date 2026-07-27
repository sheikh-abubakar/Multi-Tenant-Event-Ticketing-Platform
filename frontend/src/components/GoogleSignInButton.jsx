import { useEffect, useRef, useState } from "react";

const GOOGLE_SCRIPT_URL = "https://accounts.google.com/gsi/client";

const GoogleSignInButton = ({ onSuccess, onError }) => {
  const containerRef = useRef(null);
  const [loadError, setLoadError] = useState("");
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) {
      setLoadError("Google sign-in has not been configured yet.");
      return undefined;
    }

    const renderButton = () => {
      if (!window.google || !containerRef.current) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: ({ credential }) => onSuccess(credential) });
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: "outline", size: "large", text: "continue_with", shape: "rectangular",
        width: containerRef.current.clientWidth || 320,
      });
    };

    const existingScript = document.querySelector(`script[src="${GOOGLE_SCRIPT_URL}"]`);
    if (existingScript) {
      if (window.google) renderButton();
      else existingScript.addEventListener("load", renderButton, { once: true });
      return () => existingScript.removeEventListener("load", renderButton);
    }

    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = renderButton;
    script.onerror = () => {
      const message = "Google sign-in could not be loaded. Please try again later.";
      setLoadError(message);
      onError?.(message);
    };
    document.head.appendChild(script);
    return () => { script.onload = null; script.onerror = null; };
  }, [clientId, onError, onSuccess]);

  if (loadError) return <p className="auth-switch" style={{ margin: "12px 0 0" }}>{loadError}</p>;
  return <div ref={containerRef} style={{ display: "flex", justifyContent: "center", marginTop: 16 }} />;
};

export default GoogleSignInButton;
