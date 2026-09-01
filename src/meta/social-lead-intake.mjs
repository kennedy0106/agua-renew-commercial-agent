import { greetingForDate } from '../shared/lima-time.mjs';

/**
 * Plantillas de conversación de la capa de captación (Social Lead Intake).
 * Texto cercano al speech oficial de Agua ReNew; sin lógica de negocio.
 * Directiva de marca: emojis sobrios de la marca (💧📱🏷️✅🙏), máximo 1-2 por
 * mensaje para dar vida sin abusar; español formal; nombre 'Agua ReNew'.
 */
export class SocialLeadIntake {
  /** Apertura ligera para el primer contacto generado automáticamente por un anuncio. */
  lightOpening() {
    return '¡Gracias por escribir a Agua ReNew! 💧 ¿En qué podemos ayudarle?';
  }

  /** Mensaje inicial de captación — texto EXACTO del MD ("Mensaje inicial de redes"). */
  initialCaptureBlock(date = new Date()) {
    const greeting = greetingForDate(date);
    return [
      `${greeting}. Gracias por escribir a Agua ReNew 💧`,
      'Para cotizarle, por favor indíquenos:',
      '',
      '📱 Su número de WhatsApp.',
      '',
      '💧 El producto de su interés:',
      '• Bidón de 20 L',
      '• Botella de 1 L',
      '• Botella de 625 ml',
      '',
      '🏷️ ¿Cómo desea comercializarlo?',
      '✅ Con su propia marca (Maquila)',
      '✅ Con la marca Agua ReNew (Distribución)',
    ].join('\n');
  }

  /** Pedido de WhatsApp cuando falta (producto/modalidad ya conocidos). */
  askPhone() {
    return 'Perfecto. Bríndeme su número de WhatsApp 📱 para enviarle la información, por favor.';
  }

  /** Primer contacto con datos conocidos: SIEMPRE saluda (atención humana) y pide el WhatsApp. */
  greetedAskPhone(date = new Date()) {
    const greeting = greetingForDate(date);
    return `${greeting}. Gracias por escribir a Agua ReNew 💧 ¿Me brinda su número de WhatsApp para enviarle la información, por favor?`;
  }

  /** Pedido de modalidad (maquila / distribución / consumo) cuando el cliente no la mencionó. */
  askModality() {
    return '🏷️ ¿Desea comercializarlo con su propia marca (maquila), con la marca Agua ReNew (distribución) o para consumo propio?';
  }

  /** Primer contacto con teléfono ya aportado: saluda y pregunta la modalidad. */
  greetedAskModality(date = new Date()) {
    const greeting = greetingForDate(date);
    return `${greeting}. Gracias por escribir a Agua ReNew. ${this.askModality()}`;
  }

  /** Confirmación al completar los datos mínimos (teléfono obtenido). */
  complete() {
    return '¡Perfecto! Le enviaremos la información por WhatsApp 💧 ¡Gracias por su tiempo!';
  }

  /** Cliente que vuelve a escribir con datos completos: respuesta cálida, sin recapturar. */
  readyRevisitReply(date = new Date()) {
    return `${greetingForDate(date)}. Gracias por escribirnos de nuevo 💧 Le enviaremos la información por WhatsApp. ¿En qué más podemos ayudarle?`;
  }

  /** Pedido de aclaración para conversaciones ambiguas. */
  clarificationReply() {
    return 'Disculpe, ¿podría indicarme un poco más sobre lo que busca? Así podemos ayudarle mejor 🙏';
  }

  /** Derivación a humano tras agotar intentos de aclaración. */
  handoffToHuman() {
    return 'Un asesor de Agua ReNew le atenderá en un momento. ¡Gracias por su paciencia! 🙏';
  }

  /** Respuesta institucional para no-prospectos. `null` = no responder. */
  nonLeadReply(conversationType) {
    switch (conversationType) {
      case 'service_provider':
        return 'Gracias por escribirnos. Por el momento no estamos buscando nuevos proveedores, pero dejamos registro de su contacto.';
      case 'support_or_complaint':
        return 'Le comunicamos con un asesor para atender su consulta. Gracias por escribirnos.';
      case 'existing_customer':
        return 'Gracias por escribirnos. Le comunicamos con un asesor para atenderlo.';
      case 'employment_or_job':
        return 'Gracias por tu interés en Agua ReNew. Dejamos registro de tu contacto; si hay vacantes, te escribiremos.';
      case 'spam_or_irrelevant':
        return null;
      default:
        return null;
    }
  }

  /** Respuesta cuando el prospecto vuelve a escribir por Meta tras el contacto. */
  postContactReply() {
    return 'Ya le enviamos la información por WhatsApp 💧 Podemos continuar la atención por ese medio.';
  }

  /** Confirmación automática en Meta tras el contacto humano por WhatsApp. */
  metaConfirmationMessage() {
    return 'Ya le enviamos la información por WhatsApp 💧 Podemos continuar la atención por ese medio.';
  }
}
