/**
 * Mapeo del catálogo canónico de la capa de captación ({product, modality})
 * a los productId reales del dominio comercial (CommercialAgent).
 * Alineado con knowledge/agua_renew_commercial_data.json.
 */

const CATALOG = {
  '20l': {
    maquila: 'maquila_bidon_20l',
    distribution_agua_renew: 'distribution_bidon_20l',
    final_customer: 'final_customer_bidon_20l_new',
  },
  '1l': {
    maquila: 'maquila_botella_1l_fliptop',
    distribution_agua_renew: 'distribution_botella_1l_fliptop',
  },
  '625ml': {
    maquila: 'maquila_botella_625ml_rosca',
    distribution_agua_renew: 'distribution_botella_625ml_rosca',
  },
  '10_5l': {
    maquila: 'maquila_galonera_10_5l',
    distribution_agua_renew: 'distribution_galonera_10_5l',
  },
};

/** productId del dominio comercial, o null si falta modalidad/producto o no existe la combinación. */
export function productIdFor({ product, modality }) {
  return CATALOG[product]?.[modality] ?? null;
}
