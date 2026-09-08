import { useMemo, useRef, useState } from "react";
import { CheckCircle2, KeyRound, Plus, ShieldCheck, UserRound, UsersRound, X } from "lucide-react";
import { PageHeader } from "./Shell.jsx";
import { DataState } from "./patterns.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.jsx";

const ROLES = {
  ADMIN: { label: "Administrador", description: "Configuración y control completo" },
  SUPERVISOR: { label: "Supervisor", description: "Seguimiento del equipo y la cartera" },
  ADVISOR: { label: "Asesor", description: "Gestión de oportunidades asignadas" },
};

function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "—";
}

export function Users({ users, onCreate, busy, ready = true, loading = false, error = "", onRetry }) {
  const [open, setOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const createTriggerRef = useRef(null);
  const [form, setForm] = useState({ displayName: "", email: "", role: "ADVISOR", password: "" });
  const counts = useMemo(() => ({
    active: users.filter((user) => user.active).length,
    advisors: users.filter((user) => user.role === "ADVISOR").length,
    leaders: users.filter((user) => user.role === "ADMIN" || user.role === "SUPERVISOR").length,
  }), [users]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const created = await onCreate(form);
    if (created === false) return;
    setForm({ displayName: "", email: "", role: "ADVISOR", password: "" });
    setOpen(false);
    window.setTimeout(() => createTriggerRef.current?.focus(), 0);
  }

  return (
    <div className="renew-users-page">
      <PageHeader
        title="Equipo comercial"
        description="Administre identidades, permisos y propiedad de oportunidades."
        actions={
          <Button
            type="button"
            ref={createTriggerRef}
            className="renew-users-create-trigger"
            disabled={busy}
            aria-expanded={open}
            aria-controls="renew-create-user"
            onClick={(event) => {
              setKeyboardOpen(event.detail === 0);
              setOpen((value) => !value);
            }}
          >
            {open ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {open ? "Cancelar" : "Nuevo usuario"}
          </Button>
        }
      />

      {open ? (
        <form id="renew-create-user" className={`renew-create-user ${keyboardOpen ? "is-keyboard-navigation" : ""}`} autoComplete="off" aria-busy={busy} onSubmit={submit}>
          <header>
            <span><UserRound aria-hidden="true" /></span>
            <div><h2>Incorporar al equipo</h2><p>Cree un acceso individual con el alcance correcto desde el inicio.</p></div>
          </header>
          <div className="renew-create-user-fields">
            <label>
              <span>Nombre <small>Obligatorio</small></span>
              <Input autoFocus disabled={busy} value={form.displayName} name="new-user-name" autoComplete="off" onChange={(event) => setForm({ ...form, displayName: event.target.value })} required />
            </label>
            <label>
              <span>Correo <small>Obligatorio</small></span>
              <Input disabled={busy} type="email" name="new-user-email" autoComplete="off" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
            </label>
            <label className="renew-create-user-role">
              <span>Rol <small>Obligatorio</small></span>
              <Select disabled={busy} value={form.role} onValueChange={(role) => setForm({ ...form, role })}>
                <SelectTrigger aria-label="Rol del nuevo usuario"><SelectValue /></SelectTrigger>
                <SelectContent position="popper" side="bottom" align="start" sideOffset={8} collisionPadding={12} className="renew-users-role-menu">
                  <SelectGroup>{Object.entries(ROLES).map(([value, role]) => <SelectItem key={value} value={value}>{role.label}</SelectItem>)}</SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <label>
              <span>Contraseña temporal <small>Obligatorio</small></span>
              <Input disabled={busy} type="password" name="new-user-password" autoComplete="new-password" minLength="12" aria-describedby="temporary-password-hint" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
              <small className="field-hint" id="temporary-password-hint">Mínimo 12 caracteres; podrá cambiarla después.</small>
            </label>
          </div>
          <div className="renew-create-user-actions">
            <span><KeyRound aria-hidden="true" /> El acceso queda activo al crearlo.</span>
            <Button type="submit" disabled={busy}>{busy ? "Creando usuario…" : "Crear usuario"}</Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <section className="renew-users-error" role="alert">
          <div><strong>No pudimos actualizar el equipo</strong><span>{error}</span></div>
          <Button type="button" variant="outline" onClick={onRetry} disabled={loading}>Reintentar</Button>
        </section>
      ) : null}

      <section className="renew-team-summary" aria-label="Resumen del equipo">
        <div className="renew-team-summary-copy">
          <span><UsersRound aria-hidden="true" /></span>
          <div><h2>{ready ? `${users.length} ${users.length === 1 ? "integrante" : "integrantes"}` : loading ? "Equipo en carga" : "Equipo no disponible"}</h2><p>{ready ? "Directorio habilitado para operar la cartera comercial." : loading ? "Estamos recuperando identidades y permisos." : "Reintente la carga para consultar identidades y permisos."}</p></div>
        </div>
        <dl>
          <div><dt>Activos</dt><dd>{ready ? counts.active : "—"}</dd></div>
          <div><dt>Asesores</dt><dd>{ready ? counts.advisors : "—"}</dd></div>
          <div><dt>Liderazgo</dt><dd>{ready ? counts.leaders : "—"}</dd></div>
        </dl>
      </section>

      <section className="renew-users-workspace">
        <article className="renew-users-directory">
          <header>
            <div><h2>Directorio</h2><p>Personas con acceso y su nivel de responsabilidad.</p></div>
            <span>{ready ? `${counts.active} activos` : loading ? "Actualizando" : "No disponible"}</span>
          </header>
          {!ready && loading ? <div className="renew-users-skeleton content-skeleton skeleton" role="status" aria-label="Cargando equipo comercial" /> : null}
          {ready && !users.length ? <DataState title="Sin integrantes configurados" description="El equipo aparecerá aquí cuando el servidor entregue usuarios dentro de su alcance." /> : null}
          {ready && users.length ? (
            <div className="renew-users-table-wrap">
              <table>
                <thead><tr><th scope="col">Persona</th><th scope="col">Correo</th><th scope="col">Rol</th><th scope="col">Estado</th></tr></thead>
                <tbody>{users.map((user) => (
                  <tr key={user.id} className={user.active ? "" : "is-inactive"}>
                    <td data-label="Persona"><span className="renew-team-person"><i>{initials(user.displayName)}</i><strong>{user.displayName}</strong></span></td>
                    <td data-label="Correo"><span className="renew-user-email">{user.email}</span></td>
                    <td data-label="Rol"><span className={`renew-role-chip is-${user.role.toLowerCase()}`}>{ROLES[user.role]?.label || user.role}</span></td>
                    <td data-label="Estado"><span className={user.active ? "renew-user-active" : "renew-user-inactive"}>{user.active ? "Activo" : "Inactivo"}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : null}
        </article>

        <aside className="renew-role-guide" aria-label="Alcance de los roles">
          <header><span><ShieldCheck aria-hidden="true" /></span><div><h2>Alcance de roles</h2><p>Una lectura rápida antes de asignar permisos.</p></div></header>
          {Object.entries(ROLES).map(([key, role]) => (
            <div key={key}><span><strong>{role.label}</strong><small>{role.description}</small></span><CheckCircle2 aria-hidden="true" /></div>
          ))}
        </aside>
      </section>
    </div>
  );
}
