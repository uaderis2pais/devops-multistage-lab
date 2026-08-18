import { sql } from "../config/db.js";
import { createMpPreference, client } from "../utils/mercadopago.js";
import { Payment } from "mercadopago";

const registerPaymentByFactura = async (idFactura) => {
  const exists = await sql`
    SELECT 1
    FROM pago
    WHERE idFacturaFK = ${idFactura}
  `;

  if (exists.length > 0) {
    return { alreadyRegistered: true };
  }

  const result = await sql`
    WITH nuevo_pago AS (
      INSERT INTO pago (
        idFacturaFK,
        fechaPago,
        monto,
        estado,
        comprobante
      )
      VALUES (
        ${idFactura},
        NOW(),
        (SELECT total FROM factura WHERE idFactura = ${idFactura}),
        'finalizado',
        'TEMP'
      )
      RETURNING idPago
    )
    SELECT 
      p.idPago,
      fn_generar_comprobante(p.idPago) AS comprobante
    FROM nuevo_pago p
  `;

  // Limpiar el carrito del usuario ahora que el pago fue confirmado
  const facturaInfo = await sql`
    SELECT idUsuarioFK FROM factura WHERE idFactura = ${idFactura}
  `;
  if (facturaInfo.length > 0) {
    const userId = facturaInfo[0].idusuariofk;
    const carrito = await sql`
      SELECT idCarrito FROM carrito 
      WHERE idUsuarioFK = ${userId} AND estado = 'confirmado'
      LIMIT 1
    `;
    if (carrito.length > 0) {
      const idCarrito = carrito[0].idcarrito;
      await sql`DELETE FROM productocarrito WHERE idCarritoFK = ${idCarrito}`;
      await sql`DELETE FROM carrito WHERE idCarrito = ${idCarrito}`;
      console.log(`Carrito ${idCarrito} eliminado tras pago confirmado para factura ${idFactura}`);
    }
  }

  return {
    alreadyRegistered: false,
    idPago: result[0].idpago,
    comprobante: result[0].comprobante
  };
};


// Crear preferencia MP
export const createPaymentPreference = async (req, res) => {
  const userId = req.user.userId;
  const { idFactura } = req.body;

  try {
    const factura = await sql`
      SELECT 
      f.idFactura,
      (SELECT SUM(subtotalProducto) FROM lineafactura WHERE idFacturaFK = f.idFactura) AS total,
      u.mail
      FROM factura f
      JOIN usuario u ON f.idUsuarioFK = u.idUsuario
      WHERE f.idFactura = ${idFactura}
        AND f.idUsuarioFK = ${userId}
    `;

    if (factura.length === 0) {
      return res.status(404).json({ error: "Factura no encontrada" });
    }
  
    
    const preference = await createMpPreference({
      idFactura: factura[0].idfactura,
      total: factura[0].total,
      email: factura[0].mail
    });
    res.json({
      preferenceId: preference.id,
      initPoint: preference.initPoint,
      sandboxInitPoint: preference.sandboxInitPoint
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error creando pago" });
  }
};



export const handleWebhook = async (req, res) => {
  const { query } = req;
  const topic = query.topic || query.type;

  try {
    if (topic === "payment") {
      const paymentId = query.id || query["data.id"];
      const payment = new Payment(client);
      const data = await payment.get({ id: paymentId });

      if (data.status === "approved") {
        const idFactura = data.external_reference;
        if (idFactura) {
          await registerPaymentByFactura(Number(idFactura));
          console.log(`Pago aprobado para factura ${idFactura} via Webhook`);
        }
      } else if (data.status === "rejected" || data.status === "cancelled") {
        const idFactura = data.external_reference;
        if (idFactura) {
          const facturaInfo = await sql`
            SELECT idUsuarioFK FROM factura WHERE idFactura = ${idFactura}
          `;
          if (facturaInfo.length > 0) {
            const userId = facturaInfo[0].idusuariofk;
            
            //Volver el carrito a estado activo
            await sql`
              UPDATE carrito 
              SET estado = 'activo' 
              WHERE idUsuarioFK = ${userId} AND estado = 'confirmado'
            `;

            //Eliminar la factura y sus líneas para liberar el stock inmediatamente
            await sql`DELETE FROM lineafactura WHERE idFacturaFK = ${idFactura}`;
            await sql`DELETE FROM factura WHERE idFactura = ${idFactura}`;

            console.log(`Pago ${data.status} para factura ${idFactura}. Carrito reactivado y factura eliminada vía Webhook.`);
          }
        }
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error("Error handleWebhook:", error);
    res.sendStatus(500);
  }
};
