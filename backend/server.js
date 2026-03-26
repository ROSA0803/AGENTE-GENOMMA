import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import nodemailer from "nodemailer";
import multer from "multer";
import cron from "node-cron";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = 4000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.join(__dirname, "documents.json");
const EMAIL_LOGS_PATH = path.join(__dirname, "emailLogs.json");
const DESKTOP_PNO_FOLDER = path.join(process.env.USERPROFILE || "", "Desktop", "PNO");
const UPLOADS_DIR = path.join(__dirname, "uploads");

if (!fs.existsSync(DATA_PATH)) {
  fs.writeFileSync(DATA_PATH, JSON.stringify([], null, 2));
}

if (!fs.existsSync(EMAIL_LOGS_PATH)) {
  fs.writeFileSync(EMAIL_LOGS_PATH, JSON.stringify([], null, 2));
}

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const codigo = String(req.body.codigo || "SIN-CODIGO")
      .replace(/[^\w\-]/g, "_")
      .toUpperCase();

    const ext = path.extname(file.originalname);
    const base =
      file.fieldname === "pdfFile"
        ? "PDF"
        : file.fieldname === "wordFile"
        ? "WORD"
        : "FILE";

    cb(null, `${codigo}-${base}-${Date.now()}${ext}`);
  }
});

const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));

function getDocuments() {
  const data = fs.readFileSync(DATA_PATH, "utf-8");
  const docs = JSON.parse(data);

  let changed = false;

  const normalized = docs.map((doc) => {
    if (!doc.id) {
      changed = true;
      return { ...doc, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    }
    return doc;
  });

  if (changed) {
    saveDocuments(normalized);
  }

  return normalized;
}

function saveDocuments(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function getEmailLogs() {
  const data = fs.readFileSync(EMAIL_LOGS_PATH, "utf-8");
  return JSON.parse(data);
}

function saveEmailLogs(data) {
  fs.writeFileSync(EMAIL_LOGS_PATH, JSON.stringify(data, null, 2));
}

function registrarBitacoraCorreo({
  codigo,
  nombre,
  area,
  tipoAviso,
  fechaVencimiento,
  responsable,
  backup,
  correoResponsable,
  correoBackup,
  destinatarios,
  enviado,
  motivo,
  modo,
  omitido
}) {
  const logs = getEmailLogs();

  logs.unshift({
    codigo: codigo || "",
    nombre: nombre || "",
    area: area || "",
    tipoAviso: tipoAviso || "",
    fechaVencimiento: fechaVencimiento || "",
    responsable: responsable || "",
    backup: backup || "",
    correoResponsable: correoResponsable || "",
    correoBackup: correoBackup || "",
    destinatarios: destinatarios || [],
    enviado: Boolean(enviado),
    omitido: Boolean(omitido),
    motivo: motivo || "",
    modo: modo || "manual",
    fechaEnvio: dayjs().format("YYYY-MM-DD HH:mm:ss")
  });

  saveEmailLogs(logs);
}

function codigoValido(codigo) {
  return /^PNO-[A-Z]+-\d{3}-V\d{2}$/i.test(String(codigo || "").trim());
}

function correoValido(correo) {
  if (!correo) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(correo).trim());
}

function calcularEstado(fechaVencimiento) {
  if (!fechaVencimiento) {
    return {
      diasRestantes: null,
      estado: "Sin fecha",
      tipoAviso: "Dato faltante"
    };
  }

  const hoy = dayjs().startOf("day");
  const vencimiento = dayjs(fechaVencimiento).startOf("day");

  if (!vencimiento.isValid()) {
    return {
      diasRestantes: null,
      estado: "Fecha inválida",
      tipoAviso: "Inconsistencia"
    };
  }

  const dias = vencimiento.diff(hoy, "day");

  if (dias < 0) {
    return {
      diasRestantes: dias,
      estado: "Vencido",
      tipoAviso: "Documento vencido"
    };
  }

  if (dias === 0) {
    return {
      diasRestantes: dias,
      estado: "Último aviso",
      tipoAviso: "Último aviso"
    };
  }

  if (dias === 1) {
    return {
      diasRestantes: dias,
      estado: "Tercer aviso",
      tipoAviso: "Tercer aviso"
    };
  }

  if (dias === 2) {
    return {
      diasRestantes: dias,
      estado: "Segundo aviso",
      tipoAviso: "Segundo aviso"
    };
  }

  if (dias === 30) {
    return {
      diasRestantes: dias,
      estado: "Primer aviso",
      tipoAviso: "Primer aviso"
    };
  }

  return {
    diasRestantes: dias,
    estado: "En regla",
    tipoAviso: "Sin aviso"
  };
}

function buscarArchivosPorCodigo(codigo) {
  const result = {
    pdf: "",
    editable: ""
  };

  if (!codigo) return result;

  if (fs.existsSync(DESKTOP_PNO_FOLDER)) {
    const files = fs.readdirSync(DESKTOP_PNO_FOLDER, { withFileTypes: true });

    for (const file of files) {
      if (!file.isFile()) continue;

      const nombre = file.name.toLowerCase();
      const codigoLower = codigo.toLowerCase();

      if (nombre.startsWith(codigoLower) && nombre.endsWith(".pdf")) {
        result.pdf = path.join(DESKTOP_PNO_FOLDER, file.name);
      }

      if (
        nombre.startsWith(codigoLower) &&
        (nombre.endsWith(".docx") || nombre.endsWith(".doc"))
      ) {
        result.editable = path.join(DESKTOP_PNO_FOLDER, file.name);
      }
    }
  }

  if (fs.existsSync(UPLOADS_DIR)) {
    const files = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true });

    for (const file of files) {
      if (!file.isFile()) continue;

      const nombre = file.name.toLowerCase();
      const codigoLower = codigo.toLowerCase();

      if (nombre.startsWith(codigoLower) && nombre.includes("-pdf-")) {
        result.pdf = `/uploads/${file.name}`;
      }

      if (nombre.startsWith(codigoLower) && nombre.includes("-word-")) {
        result.editable = `/uploads/${file.name}`;
      }
    }
  }

  return result;
}

function detectarFaltantes(doc) {
  const faltantes = [];

  if (!doc.codigo) faltantes.push("Código PNO");
  if (!doc.nombre) faltantes.push("Nombre");
  if (!doc.area) faltantes.push("Área");
  if (!doc.responsable) faltantes.push("Responsable");
  if (!doc.backup) faltantes.push("Backup");
  if (!doc.fechaVencimiento) faltantes.push("Fecha de vencimiento");
  if (!doc.correoResponsable) faltantes.push("Correo responsable");
  if (!doc.correoBackup) faltantes.push("Correo backup");

  return faltantes;
}

function detectarInconsistencias(doc) {
  const inconsistencias = [];

  if (doc.codigo && !codigoValido(doc.codigo)) {
    inconsistencias.push("Formato de código inválido");
  }

  if (doc.correoResponsable && !correoValido(doc.correoResponsable)) {
    inconsistencias.push("Correo responsable inválido");
  }

  if (doc.correoBackup && !correoValido(doc.correoBackup)) {
    inconsistencias.push("Correo backup inválido");
  }

  if (doc.fechaVencimiento && !dayjs(doc.fechaVencimiento).isValid()) {
    inconsistencias.push("Fecha de vencimiento inválida");
  }

  return inconsistencias;
}

function generarMensajeFormal(doc) {
  return `Estimado(a) ${doc.responsable} / ${doc.backup}:

Se informa que el documento ${doc.codigo} correspondiente a "${doc.nombre}" del área ${doc.area} presenta el siguiente estatus: ${doc.tipoAviso}.

Fecha de vencimiento: ${doc.fechaVencimiento}
Tipo de aviso: ${doc.tipoAviso}
Ruta del archivo editable: ${doc.editable || "No disponible"}

Responsable principal: ${doc.responsable}
Responsable backup: ${doc.backup}

Se solicita dar seguimiento oportuno conforme al procedimiento de control documental.

Atentamente,
Agente de Control Documental`;
}

function enriquecerDocumento(doc) {
  const archivos = buscarArchivosPorCodigo(doc.codigo);

  const documento = {
    ...doc,
    pdf: doc.pdf || archivos.pdf || "",
    editable: doc.editable || archivos.editable || ""
  };

  const calculo = calcularEstado(documento.fechaVencimiento);
  const faltantes = detectarFaltantes(documento);
  const inconsistencias = detectarInconsistencias(documento);

  return {
    ...documento,
    ...calculo,
    faltantes,
    inconsistencias,
    mensajeFormal: generarMensajeFormal({
      ...documento,
      ...calculo
    })
  };
}

function getDocumentsProcessed() {
  const docs = getDocuments().map(enriquecerDocumento);

  docs.sort((a, b) => {
    const aPrioridad =
      a.estado === "Vencido"
        ? 0
        : a.estado === "Último aviso"
        ? 1
        : a.estado === "Tercer aviso"
        ? 2
        : a.estado === "Segundo aviso"
        ? 3
        : a.estado === "Primer aviso"
        ? 4
        : 5;

    const bPrioridad =
      b.estado === "Vencido"
        ? 0
        : b.estado === "Último aviso"
        ? 1
        : b.estado === "Tercer aviso"
        ? 2
        : b.estado === "Segundo aviso"
        ? 3
        : b.estado === "Primer aviso"
        ? 4
        : 5;

    if (aPrioridad !== bPrioridad) return aPrioridad - bPrioridad;

    const aDias = a.diasRestantes ?? 999999;
    const bDias = b.diasRestantes ?? 999999;

    return aDias - bDias;
  });

  return docs;
}

function getSummary(docs) {
  return {
    totalDocumentos: docs.length,
    porVencer: docs.filter((d) =>
      ["Primer aviso", "Segundo aviso", "Tercer aviso", "Último aviso"].includes(d.estado)
    ).length,
    vencidos: docs.filter((d) => d.estado === "Vencido").length,
    enRegla: docs.filter((d) => d.estado === "En regla").length,
    conFaltantes: docs.filter((d) => d.faltantes.length > 0).length,
    conInconsistencias: docs.filter((d) => d.inconsistencias.length > 0).length
  };
}

function getNotificaciones(docs) {
  return docs.filter((d) =>
    ["Primer aviso", "Segundo aviso", "Tercer aviso", "Último aviso", "Vencido"].includes(d.estado)
  );
}

function getLocalFilePath(fileReference) {
  if (!fileReference) return "";

  if (fileReference.startsWith("/uploads/")) {
    return path.join(UPLOADS_DIR, path.basename(fileReference));
  }

  return fileReference;
}

function fileExistsSafe(filePath) {
  if (!filePath) return false;
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function wasAlreadySentToday(codigo, tipoAviso) {
  const logs = getEmailLogs();
  const hoy = dayjs().format("YYYY-MM-DD");

  return logs.some(
    (log) =>
      log.codigo === codigo &&
      log.tipoAviso === tipoAviso &&
      log.enviado === true &&
      String(log.fechaEnvio || "").startsWith(hoy)
  );
}

async function enviarCorreoDocumento(doc, modo = "manual") {
  const SMTP_HOST = process.env.SMTP_HOST || "";
  const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
  const SMTP_USER = process.env.SMTP_USER || "";
  const SMTP_PASS = process.env.SMTP_PASS || "";
  const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return {
      codigo: doc.codigo,
      enviado: false,
      motivo: "SMTP no configurado"
    };
  }

  const destinatarios = [doc.correoResponsable, doc.correoBackup].filter(Boolean);

  if (destinatarios.length === 0) {
    registrarBitacoraCorreo({
      codigo: doc.codigo,
      nombre: doc.nombre,
      area: doc.area,
      tipoAviso: doc.tipoAviso,
      fechaVencimiento: doc.fechaVencimiento,
      responsable: doc.responsable,
      backup: doc.backup,
      correoResponsable: doc.correoResponsable,
      correoBackup: doc.correoBackup,
      destinatarios: [],
      enviado: false,
      motivo: "Sin correos válidos",
      modo
    });

    return {
      codigo: doc.codigo,
      enviado: false,
      motivo: "Sin correos válidos"
    };
  }

  if (wasAlreadySentToday(doc.codigo, doc.tipoAviso)) {
    registrarBitacoraCorreo({
      codigo: doc.codigo,
      nombre: doc.nombre,
      area: doc.area,
      tipoAviso: doc.tipoAviso,
      fechaVencimiento: doc.fechaVencimiento,
      responsable: doc.responsable,
      backup: doc.backup,
      correoResponsable: doc.correoResponsable,
      correoBackup: doc.correoBackup,
      destinatarios,
      enviado: false,
      omitido: true,
      motivo: "Aviso ya enviado hoy",
      modo
    });

    return {
      codigo: doc.codigo,
      enviado: false,
      omitido: true,
      motivo: "Aviso ya enviado hoy"
    };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  const attachments = [];
  const editablePath = getLocalFilePath(doc.editable);

  if (editablePath && fileExistsSafe(editablePath)) {
    attachments.push({
      filename: path.basename(editablePath),
      path: editablePath
    });
  }

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: destinatarios.join(","),
      subject: `${doc.tipoAviso} - ${doc.codigo} - ${doc.nombre}`,
      text: doc.mensajeFormal,
      attachments
    });

    registrarBitacoraCorreo({
      codigo: doc.codigo,
      nombre: doc.nombre,
      area: doc.area,
      tipoAviso: doc.tipoAviso,
      fechaVencimiento: doc.fechaVencimiento,
      responsable: doc.responsable,
      backup: doc.backup,
      correoResponsable: doc.correoResponsable,
      correoBackup: doc.correoBackup,
      destinatarios,
      enviado: true,
      motivo: attachments.length
        ? "Correo enviado correctamente con Word adjunto"
        : "Correo enviado correctamente",
      modo
    });

    return {
      codigo: doc.codigo,
      enviado: true,
      destinatarios
    };
  } catch (error) {
    registrarBitacoraCorreo({
      codigo: doc.codigo,
      nombre: doc.nombre,
      area: doc.area,
      tipoAviso: doc.tipoAviso,
      fechaVencimiento: doc.fechaVencimiento,
      responsable: doc.responsable,
      backup: doc.backup,
      correoResponsable: doc.correoResponsable,
      correoBackup: doc.correoBackup,
      destinatarios,
      enviado: false,
      motivo: error.message,
      modo
    });

    return {
      codigo: doc.codigo,
      enviado: false,
      motivo: error.message
    };
  }
}

function removeInternalUpload(fileReference) {
  if (!fileReference || !fileReference.startsWith("/uploads/")) return;

  const localPath = getLocalFilePath(fileReference);
  if (fileExistsSafe(localPath)) {
    fs.unlinkSync(localPath);
  }
}

app.get("/api/documents", (req, res) => {
  const docs = getDocumentsProcessed();
  const summary = getSummary(docs);
  res.json({ documents: docs, summary });
});

app.get("/api/notifications", (req, res) => {
  const docs = getDocumentsProcessed();
  const notificaciones = getNotificaciones(docs);
  res.json(notificaciones);
});

app.get("/api/email-logs", (req, res) => {
  const logs = getEmailLogs();
  res.json(logs);
});

app.post(
  "/api/documents",
  upload.fields([
    { name: "pdfFile", maxCount: 1 },
    { name: "wordFile", maxCount: 1 }
  ]),
  async (req, res) => {
    const body = req.body;
    const pdfFile = req.files?.pdfFile?.[0] || null;
    const wordFile = req.files?.wordFile?.[0] || null;

    const nuevoDocumento = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      codigo: body.codigo || "",
      nombre: body.nombre || "",
      area: body.area || "",
      responsable: body.responsable || "",
      backup: body.backup || "",
      correoResponsable: body.correoResponsable || "",
      correoBackup: body.correoBackup || "",
      fechaVencimiento: body.fechaVencimiento || "",
      pdf: pdfFile ? `/uploads/${pdfFile.filename}` : "",
      editable: wordFile ? `/uploads/${wordFile.filename}` : ""
    };

    const docs = getDocuments();
    docs.push(nuevoDocumento);
    saveDocuments(docs);

    const documentoProcesado = enriquecerDocumento(nuevoDocumento);
    const estadosNotificables = [
      "Primer aviso",
      "Segundo aviso",
      "Tercer aviso",
      "Último aviso",
      "Vencido"
    ];

    if (!estadosNotificables.includes(documentoProcesado.estado)) {
      return res.json({
        ok: true,
        message: "Documento guardado correctamente",
        emailEnviado: false
      });
    }

    const resultado = await enviarCorreoDocumento(documentoProcesado, "alta");

    return res.json({
      ok: true,
      message: resultado.enviado
        ? "Documento guardado y correo enviado correctamente"
        : resultado.omitido
        ? "Documento guardado. El aviso ya había sido enviado hoy"
        : "Documento guardado, pero el correo no se pudo enviar",
      emailEnviado: resultado.enviado || false,
      detalle: resultado
    });
  }
);

app.put(
  "/api/documents/:id",
  upload.fields([
    { name: "pdfFile", maxCount: 1 },
    { name: "wordFile", maxCount: 1 }
  ]),
  async (req, res) => {
    const { id } = req.params;
    const docs = getDocuments();
    const index = docs.findIndex((d) => d.id === id);

    if (index === -1) {
      return res.status(404).json({ ok: false, message: "Documento no encontrado" });
    }

    const actual = docs[index];
    const pdfFile = req.files?.pdfFile?.[0] || null;
    const wordFile = req.files?.wordFile?.[0] || null;

    if (pdfFile && actual.pdf) {
      removeInternalUpload(actual.pdf);
    }

    if (wordFile && actual.editable) {
      removeInternalUpload(actual.editable);
    }

    const actualizado = {
      ...actual,
      codigo: req.body.codigo || actual.codigo,
      nombre: req.body.nombre || actual.nombre,
      area: req.body.area || actual.area,
      responsable: req.body.responsable || actual.responsable,
      backup: req.body.backup || actual.backup,
      correoResponsable: req.body.correoResponsable || actual.correoResponsable,
      correoBackup: req.body.correoBackup || actual.correoBackup,
      fechaVencimiento: req.body.fechaVencimiento || actual.fechaVencimiento,
      pdf: pdfFile ? `/uploads/${pdfFile.filename}` : actual.pdf,
      editable: wordFile ? `/uploads/${wordFile.filename}` : actual.editable
    };

    docs[index] = actualizado;
    saveDocuments(docs);

    const docProcesado = enriquecerDocumento(actualizado);
    const estadosNotificables = [
      "Primer aviso",
      "Segundo aviso",
      "Tercer aviso",
      "Último aviso",
      "Vencido"
    ];

    if (!estadosNotificables.includes(docProcesado.estado)) {
      return res.json({
        ok: true,
        message: "Documento actualizado correctamente",
        emailEnviado: false
      });
    }

    const resultado = await enviarCorreoDocumento(docProcesado, "edicion");

    return res.json({
      ok: true,
      message: resultado.enviado
        ? "Documento actualizado y correo enviado correctamente"
        : resultado.omitido
        ? "Documento actualizado. El aviso ya había sido enviado hoy"
        : "Documento actualizado, pero el correo no se pudo enviar",
      emailEnviado: resultado.enviado || false,
      detalle: resultado
    });
  }
);

app.delete("/api/documents/:id", (req, res) => {
  const { id } = req.params;
  const docs = getDocuments();
  const index = docs.findIndex((d) => d.id === id);

  if (index === -1) {
    return res.status(404).json({ ok: false, message: "Documento no encontrado" });
  }

  const doc = docs[index];

  removeInternalUpload(doc.pdf);
  removeInternalUpload(doc.editable);

  docs.splice(index, 1);
  saveDocuments(docs);

  res.json({ ok: true, message: "Documento eliminado correctamente" });
});

app.post("/api/send-emails", async (req, res) => {
  const docs = getDocumentsProcessed();
  const notificaciones = getNotificaciones(docs);

  const resultados = [];

  for (const doc of notificaciones) {
    const resultado = await enviarCorreoDocumento(doc, "manual");
    resultados.push(resultado);
  }

  res.json({
    ok: true,
    message: "Proceso de correos ejecutado",
    total: resultados.length,
    resultados
  });
});

cron.schedule("0 8 * * *", async () => {
  const docs = getDocumentsProcessed();
  const notificaciones = getNotificaciones(docs);

  for (const doc of notificaciones) {
    await enviarCorreoDocumento(doc, "automatico");
  }

  console.log(`[${dayjs().format("YYYY-MM-DD HH:mm:ss")}] Revisión automática ejecutada`);
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Buscando archivos en: ${DESKTOP_PNO_FOLDER}`);
});