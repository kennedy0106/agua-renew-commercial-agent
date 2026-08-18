import { CommercialAdvisorVoice } from './commercial-advisor-voice.mjs';

/** Renders only fields returned by CommercialService; it contains no price rules. */
export class AIResponseComposer {
  constructor({ advisorVoice = new CommercialAdvisorVoice() } = {}) { this.advisorVoice = advisorVoice; }

  composePurchasePrice(data) {
    return this.advisorVoice.purchasePrice(data);
  }

  composeProducts(products) {
    const groups = new Map();
    for (const product of products) {
      const key = product.modality ?? 'other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(product);
    }
    const headings = {
      distribution_agua_renew: '💧 Para comercializar con nuestra marca Agua ReNew',
      maquila: '🏷️ Para trabajar con una marca propia',
      final_customer: '🏠 Para compra directa',
    };
    const sections = [this.advisorVoice.productsIntroduction()];
    for (const [modality, groupedProducts] of groups) {
      if (headings[modality]) sections.push(`${headings[modality]}\n${groupedProducts.map((product) => `• ${product.name}`).join('\n')}`);
      else sections.push(groupedProducts.map((product) => `• ${product.name}`).join('\n'));
    }
    sections.push(this.advisorVoice.productListClosing());
    return sections.join('\n\n');
  }

  composeDelivery(data) {
    const lines = [this.advisorVoice.deliveryIntroduction()];
    if (data.collection_points?.length) lines.push(`Puntos de recojo: ${data.collection_points.join(', ')}.`);
    if (data.free_delivery) lines.push(`Delivery gratuito: ${data.free_delivery}.`);
    if (data.delivery) lines.push(`Delivery: ${data.delivery}.`);
    if (data.other_districts) lines.push(data.other_districts);
    return lines.join('\n');
  }

  composeAdditionalService(data) {
    const lines = [this.advisorVoice.additionalServiceIntroduction(data.name)];
    if (data.price?.amount_pen !== undefined) lines.push(`El precio que podemos confirmar es S/ ${Number(data.price.amount_pen).toFixed(2)}.`);
    if (data.documented_description) lines.push(data.documented_description);
    if (data.response_rule) lines.push(data.response_rule);
    return lines.join('\n');
  }

  composeSuggestedResale(data) {
    return [this.advisorVoice.suggestedResaleIntroduction(), ...data.prices.map((item) => `${item.product}: ${item.range_pen}.`)].join('\n');
  }

  composeProductComparison(data) {
    const wantsPrices = data.requested_information.includes('prices');
    const wantsMinimums = data.requested_information.includes('minimums');
    const lines = ['Te resumo las opciones para que puedas compararlas con tranquilidad:'];
    for (const product of data.products) {
      const details = [];
      if (wantsMinimums) {
        details.push(product.minimum
          ? `Pedido mínimo: ${product.minimum.value} ${product.minimum.unit}.`
          : 'Pedido mínimo: no está indicado en la información disponible.');
      }
      if (wantsPrices) {
        if (product.exact_price) details.push(`Precio: S/ ${Number(product.exact_price.amount_pen).toFixed(2)} por ${product.exact_price.per}.`);
        else if (product.price_requires_context) details.push('El precio cambia según la cantidad. Dime cuántas unidades o paquetes tienes en mente y revisamos el valor que te corresponde.');
        else details.push('El precio necesita revisión con un asesor.');
      }
      lines.push(`• ${product.name}\n${details.map((detail) => `  ${detail}`).join('\n')}`);
    }
    if (wantsPrices && data.products.some((product) => product.price_requires_context)) {
      lines.push('Cuando tengas una cantidad aproximada, dime cuál presentación quieres cotizar primero y revisamos el valor que te corresponde.');
    }
    return lines.join('\n\n');
  }
}
