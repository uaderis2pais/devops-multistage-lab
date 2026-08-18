import cron from "node-cron";
import { sql } from "../config/db.js";

export const deleteExpiredInvoices = async () => {
  try {
    console.log("Buscando y eliminando facturas sin pago de hace +20 minutos...");

    //Eliminamos las lineas de factura para que se reponga el stock
    const eliminatedLines = await sql`
      DELETE FROM lineafactura
      WHERE idFacturaFK IN (
        SELECT f.idFactura
        FROM factura f
        LEFT JOIN pago p ON f.idFactura = p.idFacturaFK
        WHERE p.idPago IS NULL
          AND f.fechaCreacion < NOW() - INTERVAL '20 minutes'
      )
      RETURNING idFacturaFK;
    `;

    if (eliminatedLines.length === 0) {
      console.log("No hay facturas vencidas para procesar.");
      return;
    }

    
    // Antes de borrar, revertimos el estado de los carritos de 'confirmado' a 'activo'
    await sql`
      UPDATE carrito 
      SET estado = 'activo'
      WHERE idUsuarioFK IN (
        SELECT idUsuarioFK 
        FROM factura 
        WHERE idFactura IN (
          SELECT f.idFactura
          FROM factura f
          LEFT JOIN pago p ON f.idFactura = p.idFacturaFK
          WHERE p.idPago IS NULL
            AND f.fechaCreacion < NOW() - INTERVAL '20 minutes'
        )
      ) 
      AND estado = 'confirmado';
    `;

    await sql`
      DELETE FROM factura
      WHERE idFactura NOT IN (SELECT idFacturaFK FROM lineafactura)
        AND idFactura NOT IN (SELECT idFacturaFK FROM pago);
    `;

    console.log(`[CRON] Limpieza completada. Stock repuesto automáticamente por la base de datos.`);

  } catch (error) {
    console.error("[CRON] Error al eliminar facturas vencidas:", error);
  }
};

export const initCronJobs = () => {
  console.log("Se ejecuta el cron para reponer stock cada 10 minutos");
  cron.schedule("*/10 * * * *", () => {
    deleteExpiredInvoices();
  });
};
