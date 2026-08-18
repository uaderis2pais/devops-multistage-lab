import { MercadoPagoConfig, Preference } from "mercadopago";

// Cliente MP
export const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

// Crear preferencia de pago
export const createMpPreference = async ({
  idFactura,
  total,
  email
}) => {
  const frontendUrl = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
  const backendUrl = (process.env.BACKEND_URL || "").replace(/\/+$/, "");

  const preference = new Preference(client);

  const preferenceBody = {
    items: [
      {
        title: `Pedido #${idFactura}`,
        quantity: 1,
        unit_price: Number(total),
        currency_id: "ARS"
      }
    ],
    purpose: "wallet_purchase",
    payer: {
      email
    },
    external_reference: String(idFactura),
    notification_url: backendUrl ? `${backendUrl}/api/payments/webhook` : undefined,
    expires: true,
    expiration_date_to: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    back_urls: {
      success: `${frontendUrl}/payment/success`,
      failure: `${frontendUrl}/payment/failure`,
      pending: `${frontendUrl}/payment/pending`
    }
  };

  const response = await preference.create({ body: preferenceBody });

  return {
    id: response.id,
    initPoint: response.init_point,
    sandboxInitPoint: response.sandbox_init_point
  };
};
