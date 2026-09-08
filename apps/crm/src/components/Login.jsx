import { useState } from "react";
import {
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  MessageCircleMore,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import { api, setCsrfToken } from "../api.js";
import { useTheme } from "./ThemeProvider.jsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field.jsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.jsx";

export function Login({ onAuthenticated }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const result = await api("/api/crm/v1/auth/login", {
        method: "POST",
        body: { email: email.trim(), password },
      });
      setCsrfToken(result.csrfToken);
      onAuthenticated(result.user);
    } catch (requestError) {
      setError(requestError?.message || "No pudimos conectar con el CRM. Inténtelo nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  const isDark = resolvedTheme === "dark";

  return (
    <main className="login-world">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="login-theme-toggle"
        aria-label={isDark ? "Usar tema claro" : "Usar tema oscuro"}
        onClick={() => setTheme(isDark ? "light" : "dark")}
      >
        {isDark ? <Sun /> : <Moon />}
      </Button>

      <section className="login-story" aria-label="Bienvenida al CRM">
        <header className="login-brand">
          <span className="login-brand-mark"><img src="/brand/logo-gotita.svg" alt="" /></span>
          <span><strong>Agua ReNew</strong><small>CRM comercial</small></span>
        </header>

        <div className="login-copy">
          <h1>El seguimiento comercial, <span>en una sola corriente.</span></h1>
          <p>Prospectos, conversaciones, próximas acciones y cotizaciones conectados sin perder el contexto de Meta.</p>
        </div>

        <ol className="login-flow" aria-label="Flujo comercial">
          <li><span><MessageCircleMore /></span><div><small>Origen</small><strong>Meta observado</strong></div></li>
          <li><span><Sparkles /></span><div><small>Contexto</small><strong>Información ordenada</strong></div></li>
          <li><span><ArrowRight /></span><div><small>Continuidad</small><strong>Listo para WhatsApp</strong></div></li>
        </ol>

        <div className="login-status"><i /> Meta continúa en modo observación</div>
      </section>

      <section className="login-access" aria-labelledby="login-title">
        <div className="login-mobile-brand" aria-hidden="true">
          <span className="login-brand-mark"><img src="/brand/logo-gotita.svg" alt="" /></span>
          <strong>Agua ReNew</strong>
        </div>
        <div className="login-card">
          <div className="login-heading">
            <span className="login-heading-icon" aria-hidden="true"><ShieldCheck /></span>
            <div>
              <h2 id="login-title">Ingresar al CRM</h2>
              <p>Use las credenciales asignadas por el administrador.</p>
            </div>
          </div>

          <form onSubmit={submit} className="login-form" aria-describedby={error ? "login-error" : undefined}>
            <FieldGroup>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="login-email">Correo corporativo <small>Obligatorio</small></FieldLabel>
                <InputGroup>
                  <InputGroupAddon><Mail /></InputGroupAddon>
                  <InputGroupInput
                    id="login-email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    placeholder="nombre@aguarenew.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-invalid={Boolean(error)}
                    disabled={loading}
                    required
                  />
                </InputGroup>
              </Field>

              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="login-password">Contraseña <small>Obligatorio</small></FieldLabel>
                <InputGroup>
                  <InputGroupAddon><LockKeyhole /></InputGroupAddon>
                  <InputGroupInput
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Ingrese su contraseña"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-invalid={Boolean(error)}
                    disabled={loading}
                    minLength={12}
                    required
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="button"
                      size="icon-sm"
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((value) => !value)}
                      disabled={loading}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            </FieldGroup>

            {error ? (
              <Alert id="login-error" variant="destructive" className="login-alert">
                <CircleAlert />
                <AlertTitle>No pudimos iniciar sesión</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" size="lg" className="login-submit" disabled={loading}>
              <span className="login-submit-label">
                {loading ? <><i className="login-spinner" aria-hidden="true" />Verificando…</> : <>Ingresar<ArrowRight data-icon="inline-end" /></>}
              </span>
            </Button>
          </form>

          <p className="login-security"><LockKeyhole />Acceso protegido · Sesión individual y auditable</p>
        </div>
      </section>
    </main>
  );
}
