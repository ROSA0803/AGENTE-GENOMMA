import { useEffect, useMemo, useState } from "react";

const initialForm = {
  id: "",
  codigo: "",
  nombre: "",
  area: "",
  responsable: "",
  backup: "",
  correoResponsable: "",
  correoBackup: "",
  fechaVencimiento: "",
  pdfFile: null,
  wordFile: null
};

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [summary, setSummary] = useState({
    totalDocumentos: 0,
    porVencer: 0,
    vencidos: 0,
    enRegla: 0,
    conFaltantes: 0,
    conInconsistencias: 0
  });
  const [notifications, setNotifications] = useState([]);
  const [emailLogs, setEmailLogs] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [modoEdicion, setModoEdicion] = useState(false);

  const [filters, setFilters] = useState({
    search: "",
    area: "Todas",
    estado: "Todos"
  });

  async function cargarTodo() {
    try {
      const resDocs = await fetch("http://localhost:4000/api/documents");
      const dataDocs = await resDocs.json();
      setDocuments(dataDocs.documents || []);
      setSummary(
        dataDocs.summary || {
          totalDocumentos: 0,
          porVencer: 0,
          vencidos: 0,
          enRegla: 0,
          conFaltantes: 0,
          conInconsistencias: 0
        }
      );

      const resNoti = await fetch("http://localhost:4000/api/notifications");
      const dataNoti = await resNoti.json();
      setNotifications(dataNoti || []);

      const resLogs = await fetch("http://localhost:4000/api/email-logs");
      const dataLogs = await resLogs.json();
      setEmailLogs(dataLogs || []);
    } catch (error) {
      console.error("Error cargando datos:", error);
      alert("No se pudieron cargar los datos");
    }
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  async function guardarDocumento() {
    try {
      const formData = new FormData();
      formData.append("codigo", form.codigo);
      formData.append("nombre", form.nombre);
      formData.append("area", form.area);
      formData.append("responsable", form.responsable);
      formData.append("backup", form.backup);
      formData.append("correoResponsable", form.correoResponsable);
      formData.append("correoBackup", form.correoBackup);
      formData.append("fechaVencimiento", form.fechaVencimiento);

      if (form.pdfFile) formData.append("pdfFile", form.pdfFile);
      if (form.wordFile) formData.append("wordFile", form.wordFile);

      const url = modoEdicion
        ? `http://localhost:4000/api/documents/${form.id}`
        : "http://localhost:4000/api/documents";

      const method = modoEdicion ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        body: formData
      });

      const data = await res.json();

      alert(data.message || "Proceso realizado");

      setForm(initialForm);
      setModoEdicion(false);
      cargarTodo();
    } catch (error) {
      console.error("Error guardando documento:", error);
      alert("Ocurrió un error al guardar el documento");
    }
  }

  function editarDocumento(doc) {
    setForm({
      id: doc.id,
      codigo: doc.codigo || "",
      nombre: doc.nombre || "",
      area: doc.area || "",
      responsable: doc.responsable || "",
      backup: doc.backup || "",
      correoResponsable: doc.correoResponsable || "",
      correoBackup: doc.correoBackup || "",
      fechaVencimiento: doc.fechaVencimiento || "",
      pdfFile: null,
      wordFile: null
    });

    setModoEdicion(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function eliminarDocumento(id) {
    const confirmar = window.confirm("¿Seguro que deseas eliminar este documento?");
    if (!confirmar) return;

    try {
      const res = await fetch(`http://localhost:4000/api/documents/${id}`, {
        method: "DELETE"
      });

      const data = await res.json();
      alert(data.message || "Documento eliminado");
      cargarTodo();
    } catch (error) {
      console.error("Error eliminando documento:", error);
      alert("No se pudo eliminar el documento");
    }
  }

  async function enviarCorreos() {
    try {
      const res = await fetch("http://localhost:4000/api/send-emails", {
        method: "POST"
      });

      const data = await res.json();
      alert(data.message || "Proceso ejecutado");
      cargarTodo();
    } catch (error) {
      console.error("Error enviando correos:", error);
      alert("No se pudieron enviar los correos");
    }
  }

  function limpiarFormulario() {
    setForm(initialForm);
    setModoEdicion(false);
  }

  function badgeClass(estado) {
    if (estado === "Vencido") return "badge danger";
    if (estado === "Último aviso") return "badge today";
    if (
      estado === "Primer aviso" ||
      estado === "Segundo aviso" ||
      estado === "Tercer aviso"
    ) {
      return "badge warning";
    }
    return "badge ok";
  }

  const areasDisponibles = useMemo(() => {
    const setAreas = new Set(documents.map((d) => d.area).filter(Boolean));
    return ["Todas", ...Array.from(setAreas)];
  }, [documents]);

  const estadosDisponibles = [
    "Todos",
    "En regla",
    "Primer aviso",
    "Segundo aviso",
    "Tercer aviso",
    "Último aviso",
    "Vencido",
    "Sin fecha",
    "Fecha inválida"
  ];

  const documentosFiltrados = useMemo(() => {
    return documents.filter((doc) => {
      const matchSearch =
        !filters.search ||
        [
          doc.codigo,
          doc.nombre,
          doc.area,
          doc.responsable,
          doc.backup
        ]
          .join(" ")
          .toLowerCase()
          .includes(filters.search.toLowerCase());

      const matchArea =
        filters.area === "Todas" || doc.area === filters.area;

      const matchEstado =
        filters.estado === "Todos" || doc.estado === filters.estado;

      return matchSearch && matchArea && matchEstado;
    });
  }, [documents, filters]);

  return (
    <div className="page">
      <div className="hero">
        <div>
          <h1>Agente de Control Documental</h1>
          <p>Gestión de PNO para empresa farmacéutica</p>
        </div>
        <button className="primary-btn" onClick={enviarCorreos}>
          Ejecutar correos
        </button>
      </div>

      <div className="summary-grid">
        <div className="summary-card">
          <span>Total</span>
          <strong>{summary.totalDocumentos}</strong>
        </div>
        <div className="summary-card">
          <span>Por vencer</span>
          <strong>{summary.porVencer}</strong>
        </div>
        <div className="summary-card">
          <span>Vencidos</span>
          <strong>{summary.vencidos}</strong>
        </div>
        <div className="summary-card">
          <span>En regla</span>
          <strong>{summary.enRegla}</strong>
        </div>
        <div className="summary-card">
          <span>Faltantes</span>
          <strong>{summary.conFaltantes}</strong>
        </div>
        <div className="summary-card">
          <span>Inconsistencias</span>
          <strong>{summary.conInconsistencias}</strong>
        </div>
      </div>

      <div className="card">
        <h2>{modoEdicion ? "Editar documento PNO" : "Nuevo documento PNO"}</h2>

        <div className="form-grid">
          <input
            placeholder="Código PNO"
            value={form.codigo}
            onChange={(e) => setForm({ ...form, codigo: e.target.value })}
          />
          <input
            placeholder="Nombre"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          />
          <input
            placeholder="Área"
            value={form.area}
            onChange={(e) => setForm({ ...form, area: e.target.value })}
          />
          <input
            placeholder="Responsable"
            value={form.responsable}
            onChange={(e) => setForm({ ...form, responsable: e.target.value })}
          />
          <input
            placeholder="Backup"
            value={form.backup}
            onChange={(e) => setForm({ ...form, backup: e.target.value })}
          />
          <input
            placeholder="Correo responsable"
            value={form.correoResponsable}
            onChange={(e) =>
              setForm({ ...form, correoResponsable: e.target.value })
            }
          />
          <input
            placeholder="Correo backup"
            value={form.correoBackup}
            onChange={(e) =>
              setForm({ ...form, correoBackup: e.target.value })
            }
          />
          <input
            type="date"
            value={form.fechaVencimiento}
            onChange={(e) =>
              setForm({ ...form, fechaVencimiento: e.target.value })
            }
          />
          <div>
            <label>Subir PDF</label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) =>
                setForm({ ...form, pdfFile: e.target.files?.[0] || null })
              }
            />
          </div>
          <div>
            <label>Subir Word</label>
            <input
              type="file"
              accept=".doc,.docx"
              onChange={(e) =>
                setForm({ ...form, wordFile: e.target.files?.[0] || null })
              }
            />
          </div>
        </div>

        <div className="action-row">
          <button className="primary-btn" onClick={guardarDocumento}>
            {modoEdicion ? "Actualizar documento" : "Guardar documento"}
          </button>

          {modoEdicion && (
            <button className="secondary-btn" onClick={limpiarFormulario}>
              Cancelar edición
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Filtros</h2>
        <div className="filter-grid">
          <input
            placeholder="Buscar por código, nombre, área o responsable"
            value={filters.search}
            onChange={(e) =>
              setFilters({ ...filters, search: e.target.value })
            }
          />

          <select
            value={filters.area}
            onChange={(e) => setFilters({ ...filters, area: e.target.value })}
          >
            {areasDisponibles.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>

          <select
            value={filters.estado}
            onChange={(e) =>
              setFilters({ ...filters, estado: e.target.value })
            }
          >
            {estadosDisponibles.map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <h2>Resumen de notificaciones</h2>

        {notifications.length === 0 ? (
          <p>No hay documentos en aviso por ahora.</p>
        ) : (
          <div className="notification-list">
            {notifications.map((item) => (
              <div key={item.id} className="notification-item">
                <div className="notification-header">
                  <strong>{item.codigo}</strong>
                  <span className={badgeClass(item.estado)}>{item.estado}</span>
                </div>
                <p><strong>Nombre:</strong> {item.nombre || "-"}</p>
                <p><strong>Área:</strong> {item.area || "-"}</p>
                <p><strong>Vencimiento:</strong> {item.fechaVencimiento || "-"}</p>
                <p><strong>Responsable:</strong> {item.responsable || "-"}</p>
                <p><strong>Backup:</strong> {item.backup || "-"}</p>
                <p><strong>Editable:</strong> {item.editable || "No disponible"}</p>
                <div className="message-box">
                  <strong>Mensaje formal</strong>
                  <pre>{item.mensajeFormal}</pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Listado de documentos</h2>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Área</th>
                <th>Responsable</th>
                <th>Backup</th>
                <th>Fecha vencimiento</th>
                <th>Días restantes</th>
                <th>Estado</th>
                <th>PDF</th>
                <th>Editable</th>
                <th>Faltantes</th>
                <th>Inconsistencias</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {documentosFiltrados.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.codigo}</td>
                  <td>{doc.nombre}</td>
                  <td>{doc.area}</td>
                  <td>{doc.responsable}</td>
                  <td>{doc.backup}</td>
                  <td>{doc.fechaVencimiento}</td>
                  <td>{doc.diasRestantes ?? "-"}</td>
                  <td>
                    <span className={badgeClass(doc.estado)}>{doc.estado}</span>
                  </td>
                  <td>
                    {doc.pdf ? (
                      <a
                        className="file-btn"
                        href={
                          doc.pdf.startsWith("/uploads/")
                            ? `http://localhost:4000${doc.pdf}`
                            : `file:///${doc.pdf.replaceAll("\\", "/")}`
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver PDF
                      </a>
                    ) : (
                      "No"
                    )}
                  </td>
                  <td>
                    {doc.editable ? (
                      ["Último aviso", "Vencido"].includes(doc.estado) ? (
                        <a
                          className="file-btn"
                          href={
                            doc.editable.startsWith("/uploads/")
                              ? `http://localhost:4000${doc.editable}`
                              : `file:///${doc.editable.replaceAll("\\", "/")}`
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          Descargar Word
                        </a>
                      ) : (
                        <span className="locked-text">
                          Disponible al último aviso
                        </span>
                      )
                    ) : (
                      "No"
                    )}
                  </td>
                  <td>
                    {doc.faltantes?.length ? (
                      <span className="error-text">{doc.faltantes.join(", ")}</span>
                    ) : (
                      "OK"
                    )}
                  </td>
                  <td>
                    {doc.inconsistencias?.length ? (
                      <span className="error-text">
                        {doc.inconsistencias.join(", ")}
                      </span>
                    ) : (
                      "OK"
                    )}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button className="mini-btn edit-btn" onClick={() => editarDocumento(doc)}>
                        Editar
                      </button>
                      <button className="mini-btn delete-btn" onClick={() => eliminarDocumento(doc.id)}>
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {documentosFiltrados.length === 0 && (
                <tr>
                  <td colSpan="13" className="empty-cell">
                    No hay documentos con esos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Bitácora de correos enviados</h2>

        {emailLogs.length === 0 ? (
          <p>No hay correos registrados todavía.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Fecha envío</th>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Área</th>
                  <th>Tipo aviso</th>
                  <th>Modo</th>
                  <th>Responsable</th>
                  <th>Backup</th>
                  <th>Destinatarios</th>
                  <th>Estatus</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {emailLogs.map((log, index) => (
                  <tr key={`${log.codigo}-${index}`}>
                    <td>{log.fechaEnvio}</td>
                    <td>{log.codigo}</td>
                    <td>{log.nombre}</td>
                    <td>{log.area}</td>
                    <td>{log.tipoAviso}</td>
                    <td>{log.modo || "-"}</td>
                    <td>{log.responsable}</td>
                    <td>{log.backup}</td>
                    <td>
                      {Array.isArray(log.destinatarios) && log.destinatarios.length
                        ? log.destinatarios.join(", ")
                        : "Sin destinatarios"}
                    </td>
                    <td>
                      <span
                        className={
                          log.omitido
                            ? "badge warning"
                            : log.enviado
                            ? "badge ok"
                            : "badge danger"
                        }
                      >
                        {log.omitido ? "Omitido" : log.enviado ? "Enviado" : "Error"}
                      </span>
                    </td>
                    <td>{log.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}