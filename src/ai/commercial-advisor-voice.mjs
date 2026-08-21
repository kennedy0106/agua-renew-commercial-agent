/**
 * Centralised conversational voice for every customer-facing reply.
 * It reformulates authorised facts; it never adds commercial rules or data.
 * Registro predeterminado: “usted” (tratamiento comercial), “nosotros” para
 * Agua ReNew, tono cercano y no burocrático.
 */
export class CommercialAdvisorVoice {
  modalityExplanation(modality, data) {
    if (modality === 'maquila') {
      return 'Con la maquila puede comercializar agua con su propia marca. Nosotros nos encargamos de fabricar y envasar el producto, mientras usted define su precio de venta y desarrolla su cartera de clientes.';
    }
    if (modality === 'distribution_agua_renew') {
      return 'Con la distribución puede adquirir productos terminados de nuestra marca Agua ReNew para revenderlos. No necesita diseñar ni imprimir etiquetas personalizadas.';
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
      lines.push(`Para la escala de ${data.tier.quantity}, le corresponde ${amount(data.tier.price.amount_pen)} por ${data.tier.price.per}.`);
      if (data.tier.package_price_pen !== undefined) lines.push(`Eso equivale a ${amount(data.tier.package_price_pen)} por paquete.`);
    }
    if (data.price) {
      lines.push(`El precio que corresponde es ${amount(data.price.amount_pen)} por ${data.price.per}.`);
      if (data.price.includes?.length) lines.push(`Incluye: ${data.price.includes.join(', ')}.`);
    }
    if (data.package?.contents) lines.push(`Cada paquete contiene ${data.package.contents} ${data.package.unit}.`);
    if (data.minimum?.value) lines.push(`Pedido mínimo vigente: ${data.minimum.value} ${data.minimum.unit}.`);
    if (data.label_included === true) lines.push('La etiqueta personalizada está incluida.');
    else if (data.label_included === false && data.exclusions?.includes('etiqueta personalizada')) lines.push('No incluye etiqueta personalizada.');
    if (data.collection) lines.push(data.collection);
    lines.push('Si desea, también podemos revisar cómo cambia el precio con otra cantidad.');
    return lines.join('\n');
  }

  greeting() { return 'Hola, gracias por escribirnos a Agua ReNew. ¿En qué podemos ayudarle hoy?'; }
  greetingPrefix() { return 'Hola, gracias por escribirnos a Agua ReNew. Con gusto le ayudamos.'; }
  modalityNextStep() { return 'Si le parece, puedo mostrarle las presentaciones disponibles o revisar una cotización según la cantidad que tiene en mente.'; }
  askModality() { return 'Para orientarle mejor, ¿desea trabajar con su propia marca o comercializar productos de Agua ReNew?'; }
  askPurchaseGoal() { return 'Claro, con gusto le ayudamos. Para orientarle bien, ¿los productos los busca para consumo propio o para comercializarlos?'; }
  distributionRecognition(data) {
    return `Entiendo, entonces busca comercializar productos con nuestra marca Agua ReNew.\n\n${this.modalityExplanation('distribution_agua_renew', data)}\n\nPara ayudarle a ubicar la opción adecuada, ¿qué presentación le interesa manejar?`;
  }
  maquilaRecognition(data) {
    return `Entiendo, entonces está evaluando trabajar con una marca propia.\n\n${this.modalityExplanation('maquila', data)}\n\nPara orientarle mejor, ¿qué presentación le interesa manejar?`;
  }
  directPurchaseRecognition(products) {
    const productWithContainer = products.find((product) => product.price?.includes?.includes('envase'));
    const otherProduct = products.find((product) => product.id !== productWithContainer?.id);
    const sections = ['Entiendo, busca Agua ReNew para su consumo.'];
    if (otherProduct) sections.push(`🔁 ${otherProduct.name}\nEsta opción corresponde si ya cuenta con su envase.`);
    if (productWithContainer) sections.push(`💧 ${productWithContainer.name}\nIncluye ${productWithContainer.price.includes.join(' y ')}.`);
    sections.push('¿Cuál de las dos opciones necesita?');
    return sections.join('\n\n');
  }
  acknowledgeBusiness(businessType) {
    return businessType ? `Qué bueno. Entonces está evaluando una opción para comercializar agua desde ${businessType}.` : 'Qué bueno. Entonces está evaluando una opción para comercializar agua desde su negocio.';
  }
  explainBusinessPaths() {
    return 'Para empezar tiene dos caminos: comercializar productos de Agua ReNew o desarrollar una marca propia mediante maquila. La diferencia principal es si quiere salir al mercado con nuestra marca o construir la suya.';
  }
  askBrandPreference() { return '¿Cuál de las dos ideas se parece más a lo que tiene pensado?'; }
  priceConcern() { return 'Entiendo. El precio depende de la presentación y del volumen que está evaluando. Si desea, puedo revisar las escalas documentadas para ver si otra cantidad cambia el precio, o derivarlo con un asesor si busca evaluar una condición comercial especial.'; }
  indecision() { return 'Podemos ayudarlo a identificar la opción más conveniente. ¿Desea desarrollar una marca propia o busca productos listos para comercializar con Agua ReNew?'; }
  commercialServicesOverview() {
    return 'Claro, con gusto le explicamos. En Agua ReNew podemos ayudarlo principalmente de dos maneras:\n\n💧 Distribución con nuestra marca\nTrabaja con producto terminado de Agua ReNew, listo para comercializar.\n\n🏷️ Maquila / marca propia\nDesarrolla su propia marca y nosotros nos encargamos de la fabricación y el envasado.\n\nSi nos cuenta qué tiene en mente, le ayudamos a revisar cuál de las dos opciones encaja mejor con su caso.';
  }
  productListClosing() { return '¿Cuál de estas opciones le interesa revisar primero?'; }
  askMoreContext() { return 'Cuéntenos un poco más qué busca y lo revisamos juntos.'; }
  thankYou() { return 'Con gusto. Si tiene otra duda, la revisamos.'; }
  farewell() { return 'Gracias por escribirnos. Cuando quiera, seguimos revisando la opción que tenga en mente.'; }
  acknowledge() { return 'De acuerdo. Dígame qué le gustaría revisar y le ayudamos.'; }
}
