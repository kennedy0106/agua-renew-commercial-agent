import { LegacyButton, LegacyInput } from "./controls.jsx";
import { useEffect, useRef, useState } from "react";
import { api, queryString } from "../api.js";
import { Icon } from "../icons.jsx";
import { ConfirmDialog, Drawer } from "./Drawer.jsx";
import { PageHeader } from "./Shell.jsx";
import { DataState } from "./patterns.jsx";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  Plus,
  Search,
  SearchX,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button.jsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group.jsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.jsx";

const emptyContact = {
  displayName: "",
  phoneE164: "",
  secondaryPhoneE164: "",
  email: "",
  jobTitle: "",
  district: "",
  address: "",
};
const conflictLabels = {
  displayName: "Nombre",
  email: "Correo",
  phoneE164: "Teléfono",
  secondaryPhoneE164: "Teléfono alternativo",
  jobTitle: "Cargo",
  district: "Distrito",
  address: "Dirección",
  companyId: "Empresa",
  ownerId: "Responsable",
  consentStatus: "Consentimiento",
};

export function Contacts({ user, users = [], notify, onError, initialSelection = null }) {
  const [query, setQuery] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
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
      const result = await api(
        `/api/crm/v1/contacts?${queryString({ page, pageSize: 25, q: query, ownerId })}`,
      );
      if (request === requests.current.list) setData(result);
    } catch (error) {
      if (request === requests.current.list) {
        setLoadError(error?.message || "No pudimos cargar los contactos.");
        onError(error);
      }
    } finally {
      if (request === requests.current.list) setLoading(false);
    }
  };
  useEffect(() => {
    const timer = setTimeout(load, 220);
    return () => clearTimeout(timer);
  }, [query, ownerId, page]);
  async function open(id) {
    const request = ++requests.current.detail;
    try {
      const result = await api(`/api/crm/v1/contacts/${id}`);
      if (request === requests.current.detail) setSelected(result);
    } catch (error) {
      if (request === requests.current.detail) onError(error);
    }
  }
  useEffect(() => {
    if (initialSelection?.id) open(initialSelection.id);
  }, [initialSelection?.requestKey]);
  async function create(form) {
    setBusy(true);
    try {
      const detail = await api("/api/crm/v1/contacts", {
        method: "POST",
        body: form,
      });
      setCreating(false);
      setSelected(detail);
      notify("Contacto creado");
      await load();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  async function save(patch) {
    setBusy(true);
    try {
      const detail = await api(`/api/crm/v1/contacts/${selected.contact.id}`, {
        method: "PATCH",
        body: { version: selected.contact.version, patch },
      });
      setSelected(detail);
      notify("Contacto actualizado");
      await load();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="renew-contacts-page">
      <PageHeader
        title="Contactos"
        description="Personas, datos de contacto y contexto comercial en una sola ficha."
        actions={
          <Button className="renew-contact-create" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" /> Nuevo contacto
          </Button>
        }
      />
      <section className={`renew-contacts-toolbar ${user.role !== "ADVISOR" && users.length ? "has-owner-filter" : ""}`} aria-label="Herramientas de contactos">
        <div className="renew-contact-search">
          <label htmlFor="contact-search">Buscar contactos</label>
          <InputGroup>
            <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput
            id="contact-search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar por nombre, teléfono, correo o empresa"
          />
          </InputGroup>
        </div>
        {user.role !== "ADVISOR" && users.length ? (
          <div className="renew-contact-filter">
            <label htmlFor="contact-owner-filter">Responsable</label>
            <Select
              value={ownerId || "__all"}
              onValueChange={(value) => {
                setOwnerId(value === "__all" ? "" : value);
                setPage(1);
              }}
            >
              <SelectTrigger id="contact-owner-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom" align="start" sideOffset={8} avoidCollisions={false} className="renew-contact-select-menu">
                <SelectGroup>
                  <SelectItem value="__all">Todos los responsables</SelectItem>
                  {users.filter((item) => item.active !== false).map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.displayName}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="renew-contact-count" role="status" aria-live="polite">
          <span className="renew-contact-count-icon"><UsersRound aria-hidden="true" /></span>
          <span><strong>{data ? data.total : "—"}</strong><small>{data ? "contactos registrados" : "Cargando contactos…"}</small></span>
        </div>
      </section>
      <section className="renew-contact-list entity-list" aria-busy={loading}>
        {!data && loading ? (
          <DataState kind="loading" title="Cargando contactos" className="renew-list-loading" />
        ) : !data && loadError ? (
          <DataState kind="error" title="No se pudieron cargar los contactos" description={loadError} onAction={load} className="renew-list-error" />
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Contacto</th>
                    <th scope="col">Empresa y cargo</th>
                    <th scope="col">Datos</th>
                    <th scope="col">Responsable</th>
                    <th scope="col" aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, index) => (
                    <tr key={item.id} style={{ "--contact-index": index }}>
                      <td data-label="Contacto">
                        <LegacyButton
                          className="person-cell"
                          onClick={() => open(item.id)}
                        >
                          <span>{initials(item.displayName)}</span>
                          <div>
                            <strong>{item.displayName}</strong>
                            <small>
                              {item.district || "Distrito pendiente"}
                            </small>
                          </div>
                        </LegacyButton>
                      </td>
                      <td data-label="Empresa y cargo">
                        <strong>{item.companyName || "Sin empresa"}</strong>
                        <small>{item.jobTitle || "Cargo pendiente"}</small>
                      </td>
                      <td data-label="Datos">
                        {item.phoneE164 || (
                          <span className="muted">Sin teléfono</span>
                        )}
                        <small>{item.email || "Sin correo"}</small>
                      </td>
                      <td data-label="Responsable">{item.ownerName || <span className="muted">Sin responsable</span>}</td>
                      <td className="renew-contact-row-action">
                        <LegacyButton
                          className="icon-button quiet"
                          onClick={() => open(item.id)}
                          aria-label={`Abrir ${item.displayName}`}
                        >
                          <ArrowRight aria-hidden="true" />
                        </LegacyButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.items.length ? (
              <div className="empty-state">
                <Icon name="contact" size={32} />
                <strong>No encontramos contactos</strong>
                <p>Pruebe otro término o cree el primer contacto.</p>
              </div>
            ) : null}
          </>
        )}
      </section>
      {data ? (
        <Pagination
          page={page}
          total={data.total}
          pageSize={data.pageSize ?? 25}
          onChange={(nextPage) => {
            setPage(nextPage);
          }}
        />
      ) : null}
      {creating ? (
        <ContactPanel
          title="Nuevo contacto"
          initial={emptyContact}
          busy={busy}
          onClose={() => setCreating(false)}
          onSubmit={create}
        />
      ) : null}
      {selected ? (
        <ContactDetail
          detail={selected}
          user={user}
          busy={busy}
          onClose={() => setSelected(null)}
          onSave={save}
          onMerged={async (detail) => {
            setSelected(detail);
            await load();
            notify("Contactos fusionados");
          }}
          onError={onError}
        />
      ) : null}
    </div>
  );
}

function ContactPanel({ title, initial, busy, onClose, onSubmit, children }) {
  const [form, setForm] = useState(initial);
  return (
    <Drawer label={title} onClose={onClose} className="contact-drawer contact-create-drawer">
      <header className="contact-drawer-header">
        <div>
          <h2>{title}</h2>
          <p>Los teléfonos se guardan en formato internacional +51.</p>
        </div>
        <LegacyButton
          className="icon-button quiet"
          onClick={onClose}
          aria-label="Cerrar contacto"
        >
          <Icon name="close" />
        </LegacyButton>
      </header>
      <form className="contact-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(form);
        }}
      >
        <ContactFields form={form} setForm={setForm} />
        <LegacyButton className="button primary full" disabled={busy}>
          {busy ? "Guardando…" : "Guardar contacto"}
        </LegacyButton>
      </form>
      {children}
    </Drawer>
  );
}

function ContactDetail({
  detail,
  user,
  busy,
  onClose,
  onSave,
  onMerged,
  onError,
}) {
  const [form, setForm] = useState(detail.contact);
  const [merging, setMerging] = useState(false);
  useEffect(() => setForm(detail.contact), [detail]);
  return (
    <Drawer label={`Contacto ${detail.contact.displayName}`} onClose={onClose} className="contact-drawer contact-detail-drawer">
      <header className="contact-drawer-header">
        <div className="drawer-person">
          <span>{initials(detail.contact.displayName)}</span>
          <div>
            <h2>{detail.contact.displayName}</h2>
            <p>
              {detail.contact.companyName || "Contacto independiente"} ·{" "}
              {detail.contact.ownerName || "Sin responsable"}
            </p>
          </div>
        </div>
        <LegacyButton
          className="icon-button quiet"
          onClick={onClose}
          aria-label="Cerrar contacto"
        >
          <Icon name="close" />
        </LegacyButton>
      </header>
      <div className="entity-drawer-body">
        <form
          className="drawer-section"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(pickContact(form));
          }}
        >
          <h3>Datos generales</h3>
          <ContactFields form={form} setForm={setForm} />
          <LegacyButton className="button primary" disabled={busy}>
            Guardar cambios
          </LegacyButton>
        </form>
        <DetailRelations detail={detail} />
        {user.role !== "ADVISOR" ? (
          <section className="drawer-section">
            <h3>Posibles duplicados</h3>
            <p className="section-copy">
              La fusión siempre requiere vista previa y confirmación.
            </p>
            <LegacyButton
              className="button secondary"
              onClick={() => setMerging(true)}
            >
              <Icon name="merge" /> Revisar coincidencias
            </LegacyButton>
          </section>
        ) : null}
      </div>
      {merging ? (
        <MergeFlow
          current={detail.contact}
          onClose={() => setMerging(false)}
          onMerged={(merged) => {
            setMerging(false);
            onMerged(merged);
          }}
          onError={onError}
        />
      ) : null}
    </Drawer>
  );
}

function ContactFields({ form, setForm }) {
  const field = (key) => ({
    value: form[key] ?? "",
    onChange: (event) =>
      setForm((current) => ({ ...current, [key]: event.target.value })),
  });
  return (
    <div className="field-grid">
      <label className="span-2">
        <span>
          Nombre completo <small className="required-mark">Obligatorio</small>
        </span>
        <LegacyInput required {...field("displayName")} />
      </label>
      <label>
        <span>Teléfono</span>
        <LegacyInput
          inputMode="tel"
          placeholder="987 654 321"
          {...field("phoneE164")}
        />
      </label>
      <label>
        <span>Teléfono alternativo</span>
        <LegacyInput inputMode="tel" {...field("secondaryPhoneE164")} />
      </label>
      <label>
        <span>Correo</span>
        <LegacyInput type="email" {...field("email")} />
      </label>
      <label>
        <span>Cargo</span>
        <LegacyInput {...field("jobTitle")} />
      </label>
      <label>
        <span>Distrito</span>
        <LegacyInput {...field("district")} />
      </label>
      <label className="span-2">
        <span>Dirección</span>
        <LegacyInput {...field("address")} />
      </label>
    </div>
  );
}

function DetailRelations({ detail }) {
  return (
    <>
      <section className="drawer-section">
        <h3>Oportunidades ({detail.opportunities.length})</h3>
        {detail.opportunities.length ? (
          detail.opportunities.map((item) => (
            <div className="relation-row" key={item.id}>
              <span>
                <strong>{item.title}</strong>
                <small>{item.stageName}</small>
              </span>
              <b>{item.lifecycleStatus}</b>
            </div>
          ))
        ) : (
          <p className="muted">Sin oportunidades vinculadas.</p>
        )}
      </section>
      <section className="drawer-section">
        <h3>Tareas ({detail.tasks.length})</h3>
        {detail.tasks.slice(0, 8).map((item) => (
          <div className="relation-row" key={item.id}>
            <span>
              <strong>{item.title}</strong>
              <small>{formatDate(item.due_at)}</small>
            </span>
            <b>{item.status}</b>
          </div>
        ))}
        {!detail.tasks.length ? (
          <p className="muted">Sin tareas vinculadas.</p>
        ) : null}
      </section>
      <section className="drawer-section">
        <h3>Actividad reciente</h3>
        {detail.activities.slice(0, 8).map((item) => (
          <div className="relation-row" key={item.id}>
            <span>
              <strong>{item.summary}</strong>
              <small>{formatDate(item.occurred_at)}</small>
            </span>
          </div>
        ))}
        {!detail.activities.length ? (
          <p className="muted">Aún no hay actividad.</p>
        ) : null}
      </section>
    </>
  );
}

function MergeFlow({ current, onClose, onMerged, onError }) {
  const [candidates, setCandidates] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [targetId, setTargetId] = useState(current.id);
  const [preview, setPreview] = useState(null);
  const [resolution, setResolution] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => {
    api(`/api/crm/v1/contacts/${current.id}/duplicates`)
      .then((result) => setCandidates(result.candidates))
      .catch(onError);
  }, [current.id]);
  async function review() {
    setBusy(true);
    try {
      const ids = [current.id, ...chosen];
      const sourceIds = ids.filter((id) => id !== targetId);
      const result = await api("/api/crm/v1/contacts/merge-preview", {
        method: "POST",
        body: { targetId, sourceIds },
      });
      setPreview(result);
      setResolution(
        Object.fromEntries(
          Object.entries(result.conflicts).map(([key, values]) => [
            key,
            values[0],
          ]),
        ),
      );
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    try {
      onMerged(
        await api("/api/crm/v1/contacts/merge", {
          method: "POST",
          body: {
            targetId,
            sourceIds: preview.sources.map((item) => item.id),
            versions: preview.versions,
            resolution,
          },
        }),
      );
      setConfirmOpen(false);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      label="fusionar contactos"
      onClose={onClose}
      className="merge-sheet"
      layerClassName="merge-dialog-layer"
    >
      <header className="merge-header">
        <div className="merge-heading">
          <span className="merge-heading-icon"><Icon name="merge" /></span>
          <div>
            <h3>Fusionar contactos</h3>
            <p>Consolide registros repetidos sin perder su historial comercial.</p>
          </div>
        </div>
        <LegacyButton
          className="icon-button quiet"
          onClick={onClose}
          aria-label="Cerrar fusión"
        >
          <Icon name="close" />
        </LegacyButton>
      </header>
      <ol className="merge-steps" aria-label="Progreso de la fusión">
        <li className={preview ? "is-complete" : "is-active"}>
          <span>{preview ? <Check aria-hidden="true" /> : "1"}</span>
          Elegir duplicados
        </li>
        <li className={preview ? "is-active" : ""}>
          <span>2</span>
          Resolver datos
        </li>
      </ol>
      {!preview ? (
        <div className="merge-body">
          {candidates === null ? (
            <div className="merge-loading" role="status">
              <LoaderCircle aria-hidden="true" />
              <span><strong>Buscando coincidencias</strong><small>Comparamos nombre, teléfono y correo.</small></span>
            </div>
          ) : (
            <>
              <div className="merge-selection-heading">
                <span>
                  <strong>Seleccione los registros duplicados</strong>
                  <small>Después podrá decidir qué contacto conservar como principal.</small>
                </span>
                <b>{chosen.length} seleccionados</b>
              </div>
              <div className="candidate-list">
                <label className="candidate-row is-current">
                  <span className="candidate-avatar">{initials(current.displayName)}</span>
                  <span className="candidate-copy">
                    <strong>{current.displayName}</strong>
                    <small>{current.phoneE164 || current.email || "Sin datos de contacto"}</small>
                  </span>
                  <span className="candidate-primary-choice">
                    <LegacyInput
                      type="radio"
                      name="target"
                      checked={targetId === current.id}
                      onChange={() => setTargetId(current.id)}
                    />
                    <span>Principal</span>
                  </span>
                </label>
                {candidates.map(({ contact, reasons }) => (
                  <div className={`candidate-row ${chosen.includes(contact.id) ? "is-selected" : ""}`} key={contact.id}>
                    <label className="candidate-control">
                      <LegacyInput
                        type="checkbox"
                        checked={chosen.includes(contact.id)}
                        onChange={(event) =>
                          setChosen((items) =>
                            event.target.checked
                              ? [...items, contact.id]
                              : items.filter((id) => id !== contact.id),
                          )
                        }
                      />
                      <span className="sr-only">Seleccionar {contact.displayName}</span>
                    </label>
                    <span className="candidate-avatar">{initials(contact.displayName)}</span>
                    <span className="candidate-copy">
                      <strong>{contact.displayName}</strong>
                      <small>{reasons.join(" · ")}</small>
                    </span>
                    {chosen.includes(contact.id) ? (
                      <label className="candidate-primary-choice">
                        <LegacyInput
                          type="radio"
                          name="target"
                          checked={targetId === contact.id}
                          onChange={() => setTargetId(contact.id)}
                        />
                        <span>Principal</span>
                      </label>
                    ) : null}
                  </div>
                ))}
              </div>
              {!candidates.length ? (
                <div className="merge-empty-state">
                  <span><SearchX aria-hidden="true" /></span>
                  <div>
                    <strong>No encontramos coincidencias seguras</strong>
                    <p>Este contacto no comparte teléfono, correo ni un nombre suficientemente similar con otro registro.</p>
                  </div>
                  <LegacyButton className="button secondary" onClick={onClose}>Volver al contacto</LegacyButton>
                </div>
              ) : (
                <footer className="merge-footer">
                  <span><ShieldCheck aria-hidden="true" /> Nada se modificará antes de la confirmación final.</span>
                  <LegacyButton
                    className="button primary"
                    disabled={!chosen.length || busy}
                    onClick={review}
                  >
                    {busy ? "Preparando…" : `Revisar ${chosen.length || ""} ${chosen.length === 1 ? "contacto" : "contactos"}`.replace("  ", " ")}
                    <ArrowRight aria-hidden="true" />
                  </LegacyButton>
                </footer>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="merge-body">
          <LegacyButton className="merge-back" onClick={() => setPreview(null)}>
            <ArrowLeft aria-hidden="true" /> Cambiar selección
          </LegacyButton>
          <div className="merge-summary">
            <span className="candidate-avatar">{initials(preview.target.displayName)}</span>
            <span>
              <small>Contacto principal</small>
              <strong>{preview.target.displayName}</strong>
              <small>{preview.sources.length} {preview.sources.length === 1 ? "registro se integrará" : "registros se integrarán"} en este contacto.</small>
            </span>
          </div>
          <div className="merge-conflicts-heading">
            <strong>Información que necesita revisión</strong>
            <small>Seleccione el valor definitivo para cada campo diferente.</small>
          </div>
          <div className="merge-conflicts">
            {Object.entries(preview.conflicts).map(([key, values]) => (
              <div className="merge-conflict-field" key={key}>
              <label id={`merge-conflict-${key}`}>{conflictLabels[key] ?? key}</label>
              <Select
                value={resolution[key] === "" ? "__empty__" : resolution[key] ?? undefined}
                onValueChange={(value) =>
                  setResolution((currentValue) => ({
                    ...currentValue,
                    [key]: value === "__empty__" ? "" : value,
                  }))
                }
              >
                <SelectTrigger aria-labelledby={`merge-conflict-${key}`}>
                  <SelectValue placeholder="Seleccione la información a conservar" />
                </SelectTrigger>
                <SelectContent position="popper" side="bottom" align="start" sideOffset={8} avoidCollisions={false} className="renew-contact-select-menu">
                  <SelectGroup>
                    {values.map((value) => (
                      <SelectItem key={value || "__empty__"} value={value || "__empty__"}>
                        {value || "Sin información"}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              </div>
            ))}
            {!Object.keys(preview.conflicts).length ? <p className="merge-no-conflicts">Los registros no tienen campos contradictorios. Puede continuar con seguridad.</p> : null}
          </div>
          <footer className="merge-footer">
            <span><ShieldCheck aria-hidden="true" /> Las fuentes permanecerán disponibles en auditoría.</span>
            <LegacyButton
              className="button primary"
              disabled={busy}
              onClick={() => setConfirmOpen(true)}
            >
              {busy ? "Fusionando…" : "Continuar y confirmar"}
              <ArrowRight aria-hidden="true" />
            </LegacyButton>
          </footer>
        </div>
      )}
      {confirmOpen ? (
        <ConfirmDialog
          title="Fusionar contactos definitivamente"
          description={`Toda la información de ${preview.sources.length} contacto(s) se reasignará a ${preview.target.displayName}. Las fuentes quedarán disponibles en auditoría para recuperación manual.`}
          confirmLabel="Fusionar contactos"
          tone="danger"
          busy={busy}
          onClose={() => setConfirmOpen(false)}
          onConfirm={confirm}
        />
      ) : null}
    </Drawer>
  );
}

function Pagination({ page, total, pageSize, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="pagination">
      <span>{total} registros</span>
      <div>
        <LegacyButton disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Anterior
        </LegacyButton>
        <span>
          Página {page} de {pages}
        </span>
        <LegacyButton disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Siguiente
        </LegacyButton>
      </div>
    </nav>
  );
}
function pickContact(value) {
  return Object.fromEntries(
    Object.keys(emptyContact).map((key) => [key, value[key] ?? ""]),
  );
}
function initials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "AR"
  );
}
function formatDate(value) {
  return value
    ? new Date(value).toLocaleString("es-PE", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Sin fecha";
}
