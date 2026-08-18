/**
 * Centralised conversational voice for every customer-facing reply.
 * It reformulates authorised facts; it never adds commercial rules or data.
 */
export class CommercialAdvisorVoice {
  modalityExplanation(modality, data) {
    if (modality === 'maquila') {
      return 'Con la maquila puedes comercializar agua con tu propia marca. Nosotros nos encargamos de fabricar y envasar el producto, mientras tú defines tu precio de venta y desarrollas tu cartera de clientes.';
    }
    if (modality === 'distribution_agua_renew') {
      return 'Con la distribución puedes adquirir productos terminados de nuestra marca Agua ReNew para revenderlos. No necesitas diseñar ni imprimir etiquetas personalizadas.';
    }
    if (modality === 'final_customer') {
      return 'Para compra directa, podemos revisar los precios de planta documentados para recarga y bidón completo de 20 L.';
    }
    return data.documented_description;
  }

  productsIntroduction() { return 'Estas son las presentaciones que podemos revisar:'; }
  deliveryIntroduction() { return 'Sobre la entrega, esto es lo que podemos confirmar:'; }
  additionalServiceIntroduction(name) { return `Sobre ${name}:`; }
  suggestedResaleIntroduction() { return 'Estos son los precios sugeridos de reventa documentados:'; }

  purchasePrice(data) {
    const amount = (value) => `S/ ${Number(value).toFixed(2)}`;
    const lines = [];
    if (data.tier) {
      lines.push(`Para la escala de ${data.tier.quantity}, te corresponde ${amount(data.tier.price.amount_pen)} por ${data.tier.price.per}.`);
      if (data.tier.package_price_pen !== undefined) lines.push(`Eso equivale a ${amount(data.tier.package_price_pen)} por paquete.`);
    }
    if (data.price) {
      lines.push(`El precio que corresponde es ${amount(data.price.amount_pen)} por ${data.price.per}.`);
      if (data.price.includes?.length) lines.push(`Incluye: ${data.price.includes.join(', ')}.`);
    }
    if (data.collection) lines.push(data.collection);
    lines.push('Si quieres, también podemos revisar cómo cambia el precio con otra cantidad.');
    return lines.join('\n');
  }

  greeting() { return 'Hola, gracias por escribirnos a Agua ReNew. Con gusto puedo ayudarte. ¿Qué estás buscando hoy?'; }
  greetingPrefix() { return 'Hola, gracias por escribirnos a Agua ReNew. Con gusto te ayudo.'; }
  modalityNextStep() { return 'Si te parece, puedo mostrarte las presentaciones disponibles o revisar una cotización según la cantidad que tienes en mente.'; }
  askModality() { return 'Para orientarte mejor, ¿quieres trabajar con tu propia marca o comercializar productos de Agua ReNew?'; }
  askPurchaseGoal() { return 'Claro, con gusto te ayudo. Para orientarte bien, ¿los productos los buscas para consumo propio o para comercializarlos?'; }
  distributionRecognition(data) {
    return `Entiendo, entonces buscas comercializar productos con nuestra marca Agua ReNew.\n\n${this.modalityExplanation('distribution_agua_renew', data)}\n\nPara ayudarte a ubicar la opción adecuada, ¿qué presentación te interesa manejar?`;
  }
  maquilaRecognition(data) {
    return `Entiendo, entonces estás evaluando trabajar con una marca propia.\n\n${this.modalityExplanation('maquila', data)}\n\nPara orientarte mejor, ¿qué presentación te interesa manejar?`;
  }
  directPurchaseRecognition(products) {
    const productWithContainer = products.find((product) => product.price?.includes?.includes('envase'));
    const otherProduct = products.find((product) => product.id !== productWithContainer?.id);
    const sections = ['Entiendo, buscas Agua ReNew para tu consumo.'];
    if (otherProduct) sections.push(`🔁 ${otherProduct.name}\nEsta opción corresponde si ya cuentas con tu envase.`);
    if (productWithContainer) sections.push(`💧 ${productWithContainer.name}\nIncluye ${productWithContainer.price.includes.join(' y ')}.`);
    sections.push('¿Cuál de las dos opciones necesitas?');
    return sections.join('\n\n');
  }
  acknowledgeBusiness(businessType) {
    return businessType ? `Qué bueno. Entonces estás evaluando una opción para comercializar agua desde ${businessType}.` : 'Qué bueno. Entonces estás evaluando una opción para comercializar agua desde tu negocio.';
  }
  explainBusinessPaths() {
    return 'Para empezar tienes dos caminos: comercializar productos de Agua ReNew o desarrollar una marca propia mediante maquila. La diferencia principal es si quieres salir al mercado con nuestra marca o construir la tuya.';
  }
  askBrandPreference() { return '¿Cuál de las dos ideas se parece más a lo que tienes pensado?'; }
  priceConcern() { return 'Entiendo. El precio depende de la presentación y del volumen que estés evaluando. Si quieres, puedo revisar las escalas documentadas para ver si otra cantidad cambia el precio, o derivarte con un asesor si buscas evaluar una condición comercial especial.'; }
  indecision() { return 'Te ayudo a ubicarlo. ¿Quieres desarrollar una marca propia o buscas productos listos para comercializar con Agua ReNew?'; }
  commercialServicesOverview() {
    return 'Claro, con gusto te explico. En Agua ReNew podemos ayudarte principalmente de dos maneras:\n\n💧 Distribución con nuestra marca\nTrabajas con producto terminado de Agua ReNew, listo para comercializar.\n\n🏷️ Maquila / marca propia\nDesarrollas tu propia marca y nosotros nos encargamos de la fabricación y el envasado.\n\nSi me cuentas qué tienes en mente, te ayudo a revisar cuál de las dos opciones encaja mejor contigo.';
  }
  productListClosing() { return '¿Cuál de estas opciones te interesa revisar primero?'; }
  askMoreContext() { return 'Cuéntame un poco más qué buscas y lo revisamos juntos.'; }
  thankYou() { return 'Con gusto. Si tienes otra duda, la revisamos.'; }
  farewell() { return 'Gracias por escribirnos. Cuando quieras, seguimos revisando la opción que tengas en mente.'; }
  acknowledge() { return 'De acuerdo. Dime qué te gustaría revisar y te ayudo.'; }
}
