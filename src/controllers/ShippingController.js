import { sql } from "../config/db.js";

export const getActiveShipments = async (req, res) => {
  try {
    const rows = await sql`
      SELECT *
      FROM vw_envios_activos
      ORDER BY fechaSalida DESC
    `;

    // Filtro por ID de envio para eliminar registros duplicados que pueda devolver la vista (por joins anidados)
    const enviosMap = new Map();
    rows.forEach(row => {
      // Usamos el ID del envio como clave unica
      const idEnvio = row.idenvio || row.idEnvio || row.idenvio; 
      if (idEnvio && !enviosMap.has(idEnvio)) {
        enviosMap.set(idEnvio, row);
      }
    });
    
    const shipments = Array.from(enviosMap.values());
    res.json(shipments);
  } catch (error) {
    console.error("Error fetching shipments:", error);
    res.status(500).json({ error: "Failed to fetch shipments" });
  }
};

export const advanceShipmentStatus = async (req, res) => {
  const { idEnvio } = req.params;

  try {
    const shipment = await sql`
      SELECT estado
      FROM envio
      WHERE idEnvio = ${idEnvio}
    `;

    if (shipment.length === 0) {
      return res.status(404).json({ error: "Shipment not found" });
    }

    let nextStatus;

    switch (shipment[0].estado) {
      case "preparado":
        nextStatus = "en proceso";
        break;
      case "en proceso":
        nextStatus = "recibido";
        break;
      default:
        return res.status(400).json({
          error: "Shipment already completed"
        });
    }

    await sql`
      UPDATE envio
      SET estado = ${nextStatus}
      WHERE idEnvio = ${idEnvio}
    `;

    res.json({
      message: "Shipment status updated",
      newStatus: nextStatus
    });

  } catch (error) {
    console.error("Error updating shipment:", error);
    res.status(500).json({ error: "Failed to update shipment" });
  }
};

export const cancelShipment = async (req, res) => {
  const { idEnvio } = req.params;

  try {
    const shipment = await sql`
      SELECT estado
      FROM envio
      WHERE idEnvio = ${idEnvio}
    `;

    if (shipment.length === 0) {
      return res.status(404).json({ error: "Shipment not found" });
    }

    if (shipment[0].estado === "recibido" || shipment[0].estado === "cancelado") {
      return res.status(400).json({
        error: "Shipment cannot be cancelled from its current state"
      });
    }

    await sql`
      UPDATE envio
      SET estado = 'cancelado'
      WHERE idEnvio = ${idEnvio}
    `;

    res.json({
      message: "Shipment cancelled successfully",
      newStatus: "cancelado"
    });

  } catch (error) {
    console.error("Error cancelling shipment:", error);
    res.status(500).json({ error: "Failed to cancel shipment" });
  }
};
