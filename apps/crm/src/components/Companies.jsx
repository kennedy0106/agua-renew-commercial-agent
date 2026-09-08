import { LegacyButton, LegacyInput, LegacyTextarea } from "./controls.jsx";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Building2, ContactRound, MapPin, Plus, Search, X } from "lucide-react";
import { api, queryString } from "../api.js";
import { Drawer } from "./Drawer.jsx";
import { PageHeader } from "./Shell.jsx";
import { DataState } from "./patterns.jsx";
import { Button } from "@/components/ui/button.jsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.jsx";

const empty = { name: "", taxId: "", phoneE164: "", email: "", district: "", address: "", notes: "" };

function initials(value = "") {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "EM";
}

export function Companies({ user, notify, onError, initialSelection = null }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const requests = useRef({ list: 0, detail: 0 });
  const load = async () => {
    const request = ++requests.current.list;
    setLoading(true);
    setLoadError("");
    try {
      const result = await api(`/api/crm/v1/companies?${queryString({ page, pageSize: 25, q })}`);
      if (request === requests.current.list) setData(result);
    } catch (error) {
      if (request === requests.current.list) {
        setLoadError(error?.message || "No pudimos cargar las empresas.");
        onError(error);
      }
    } finally {
      if (request === requests.current.list) setLoading(false);
    }
  };
  useEffect(() => {
    const timer = setTimeout(load, 220);
    return () => clearTimeout(timer);
  }, [q, page]);
  async function open(id) {
    const request = ++requests.current.detail;
    try {
      const result = await api(`/api/crm/v1/companies/${id}`);
      if (request === requests.current.detail) setDetail(result);
    } catch (error) {
      if (request === requests.current.detail) onError(error);
    }
  }
  useEffect(() => { if (initialSelection?.id) open(initialSelection.id); }, [initialSelection?.requestKey]);
  async function create(form) {
    setBusy(true);
    try {
      const result = await api("/api/crm/v1/companies", { method: "POST", body: form });
      setDetail(result);
      setCreating(false);
      notify("Empresa creada");
      await load();
    } catch (error) { onError(error); } finally { setBusy(false); }
  }
  async function save(form) {
    setBusy(true);
    try {
      const result = await api(`/api/crm/v1/companies/${detail.company.id}`, {
        method: "PATCH",
        body: { version: detail.company.version, patch: form },
      });
      setDetail(result);
      notify("Empresa actualizada");
      await load();
    } catch (error) { onError(error); } finally { setBusy(false); }
  }
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 25)));

  return (
    <div className="renew-companies-page">
      <PageHeader
        title="Empresas"
        description="Cuentas comerciales, datos fiscales y contactos vinculados en una sola vista."
        actions={user.role !== "ADVISOR" ? (
          <Button className="renew-company-create" onClick={() => setCreating(true)}><Plus aria-hidden="true" /> Nueva empresa</Button>
        ) : null}
      />

      <section className="renew-companies-toolbar" aria-label="Herramientas de empresas">
        <div className="renew-company-search">
          <label htmlFor="company-search">Buscar empresas</label>
          <InputGroup>
            <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput
              id="company-search"
              value={q}
              onChange={(event) => { setQ(event.target.value); setPage(1); }}
              placeholder="Buscar por razón social o RUC"
            />
          </InputGroup>
        </div>
        <div className="renew-company-count" role="status" aria-live="polite">
          <span className="renew-company-count-icon"><Building2 aria-hidden="true" /></span>
          <span><strong>{data ? data.total : "—"}</strong><small>{data ? "empresas registradas" : "Cargando empresas…"}</small></span>
        </div>
      </section>

      <section className="renew-company-list entity-list" aria-label="Directorio de empresas" aria-busy={loading}>
        {!data && loading ? (
          <DataState kind="loading" title="Cargando empresas" className="renew-list-loading" />
        ) : !data && loadError ? (
          <DataState kind="error" title="No se pudieron cargar las empresas" description={loadError} onAction={load} className="renew-list-error" />
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead><tr><th scope="col">Empresa</th><th scope="col">RUC</th><th scope="col">Datos de contacto</th><th scope="col">Relaciones</th><th scope="col" aria-label="Acciones" /></tr></thead>
                <tbody>
                  {data.items.map((item, index) => (
                    <tr key={item.id} style={{ "--company-index": index }}>
                      <td data-label="Empresa">
                        <LegacyButton className="company-cell" onClick={() => open(item.id)}>
                          <span className="renew-company-avatar" aria-hidden="true">{initials(item.name)}</span>
                          <span className="renew-company-copy"><strong>{item.name}</strong><small><MapPin aria-hidden="true" /> {item.district || "Distrito pendiente"}</small></span>
                        </LegacyButton>
                      </td>
                      <td data-label="RUC"><strong>{item.taxId || "Sin RUC"}</strong><small>{item.taxId ? "Registro fiscal" : "Dato pendiente"}</small></td>
                      <td data-label="Datos de contacto"><strong>{item.phoneE164 || "Sin teléfono"}</strong><small>{item.email || "Sin correo"}</small></td>
                      <td data-label="Relaciones"><strong>{item.contacts} {item.contacts === 1 ? "contacto" : "contactos"}</strong><small>{item.opportunities} {item.opportunities === 1 ? "oportunidad" : "oportunidades"}</small></td>
                      <td className="renew-company-row-action">
                        <LegacyButton className="icon-button quiet" onClick={() => open(item.id)} aria-label={`Abrir ${item.name}`}><ArrowRight aria-hidden="true" /></LegacyButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.items.length ? (
              <div className="renew-company-empty">
                <span><Building2 aria-hidden="true" /></span>
                <div><strong>No encontramos empresas</strong><p>{q ? "Pruebe con otra razón social o RUC." : "Registre la primera cuenta comercial para comenzar."}</p></div>
                {user.role !== "ADVISOR" ? <Button variant="outline" onClick={() => setCreating(true)}><Plus aria-hidden="true" /> Crear empresa</Button> : null}
              </div>
            ) : null}
          </>
        )}
      </section>

      {data ? (
        <nav className="pagination renew-company-pagination" aria-label="Paginación de empresas">
          <span>{data.total} registros</span>
          <div>
            <LegacyButton disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Anterior</LegacyButton>
            <span>Página {page} de {pages}</span>
            <LegacyButton disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>Siguiente</LegacyButton>
          </div>
        </nav>
      ) : null}

      {creating ? <CompanyDrawer title="Nueva empresa" initial={empty} busy={busy} editable onClose={() => setCreating(false)} onSave={create} /> : null}
      {detail ? <CompanyDrawer title={detail.company.name} initial={detail.company} contacts={detail.contacts} busy={busy} editable={user.role !== "ADVISOR"} onClose={() => setDetail(null)} onSave={save} /> : null}
    </div>
  );
}

function CompanyDrawer({ title, initial, contacts = [], busy, editable, onClose, onSave }) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);
  const field = (key) => ({
    value: form[key] ?? "",
    onChange: (event) => setForm((current) => ({ ...current, [key]: event.target.value })),
    disabled: !editable,
  });
  return (
    <Drawer label={title} onClose={onClose} className="company-drawer">
      <header className="company-drawer-header">
        <div className="drawer-company">
          <span aria-hidden="true">{initials(title)}</span>
          <div><h2>{title}</h2><p>{initial.id ? "Cuenta comercial" : "Nueva cuenta comercial"} · {initial.district || "Ubicación pendiente"}</p></div>
        </div>
        <LegacyButton className="icon-button quiet" onClick={onClose} aria-label="Cerrar empresa" data-drawer-close><X aria-hidden="true" /></LegacyButton>
      </header>

      <div className="entity-drawer-body">
        <form className="drawer-section company-data-section" onSubmit={(event) => {
          event.preventDefault();
          onSave(Object.fromEntries(Object.keys(empty).map((key) => [key, form[key] ?? ""])));
        }}>
          <div className="company-section-heading"><span><Building2 aria-hidden="true" /></span><div><h3>Datos de la empresa</h3><p>Información fiscal, ubicación y canales de contacto.</p></div></div>
          <div className="field-grid">
            <label className="span-2"><span>Razón social <small className="required-mark">Obligatorio</small></span><LegacyInput required {...field("name")} /></label>
            <label><span>RUC</span><LegacyInput inputMode="numeric" pattern="[0-9]{11}" title="Ingrese los 11 dígitos del RUC" maxLength="11" {...field("taxId")} /></label>
            <label><span>Distrito</span><LegacyInput {...field("district")} /></label>
            <label><span>Teléfono</span><LegacyInput inputMode="tel" {...field("phoneE164")} /></label>
            <label><span>Correo</span><LegacyInput type="email" {...field("email")} /></label>
            <label className="span-2"><span>Dirección</span><LegacyInput {...field("address")} /></label>
            <label className="span-2"><span>Notas</span><LegacyTextarea rows="3" {...field("notes")} /></label>
          </div>
          {editable ? <LegacyButton className="button primary" disabled={busy}>{busy ? "Guardando…" : "Guardar empresa"}</LegacyButton> : null}
        </form>

        {initial.id ? (
          <section className="drawer-section company-relations-section">
            <div className="company-section-heading"><span><ContactRound aria-hidden="true" /></span><div><h3>Contactos vinculados</h3><p>{contacts.length ? `${contacts.length} ${contacts.length === 1 ? "persona relacionada" : "personas relacionadas"}` : "Sin contactos registrados"}</p></div></div>
            <div className="company-relations-list">
              {contacts.map((contact) => (
                <div className="relation-row" key={contact.id}>
                  <span className="relation-avatar" aria-hidden="true">{initials(contact.displayName)}</span>
                  <span className="relation-copy"><strong>{contact.displayName}</strong><small>{contact.jobTitle || "Cargo pendiente"}</small></span>
                  <span className="relation-meta">{contact.phoneE164 || "Sin teléfono"}</span>
                </div>
              ))}
              {!contacts.length ? <div className="company-relations-empty"><ContactRound aria-hidden="true" /><span><strong>Aún no hay contactos</strong><small>Los contactos vinculados aparecerán aquí.</small></span></div> : null}
            </div>
          </section>
        ) : (
          <aside className="company-create-note"><span><ContactRound aria-hidden="true" /></span><p>Después de crear la empresa podrá vincular contactos y oportunidades.</p></aside>
        )}
      </div>
    </Drawer>
  );
}
