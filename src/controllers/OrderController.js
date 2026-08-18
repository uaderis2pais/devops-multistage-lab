import { sql } from "../config/db.js";
import { reactivateCartInternal } from "./CartController.js";

export const getPurchaseHistory = async (req, res) => {
  const userId = req.user.userId;

  try {
    const rows = await sql`
      SELECT
        f.idFactura AS idpedido,
        TO_CHAR(f.fechaCreacion, 'YYYY-MM-DD') AS fecha,
        f.total,
        COALESCE(
          (SELECT d.calle || ' ' || d.numero 
            FROM direccion d 
            WHERE d.idUsuarioFK = ${userId} 
            ORDER BY d.idDireccion DESC LIMIT 1),
          'Retiro en local'
        ) AS direccion,
        p.idProducto AS idproducto,
        p.nombre AS nombre,
        p.precio AS preciooriginal,
        lf.cantidad,
        lf.precioUnitario AS precio,
        p.imagen,
        p."tamaño" AS tamano
      FROM factura f
      JOIN lineafactura lf ON f.idFactura = lf.idFacturaFK
      JOIN producto p ON lf.idProductoFK = p.idProducto
      JOIN pago pa ON f.idFactura = pa.idFacturaFK
      WHERE f.idUsuarioFK = ${userId}
      ORDER BY f.idFactura DESC
    `;

    const pedidosMap = {};

    rows.forEach(row => {
      if (!pedidosMap[row.idpedido]) {
        pedidosMap[row.idpedido] = {
          idpedido: row.idpedido,
          fecha: row.fecha,
          total: row.total,
          direccion: row.direccion,
          productos: []
        };
      }
      pedidosMap[row.idpedido].productos.push({
        idproducto: row.idproducto,
        nombre: row.nombre,
        preciooriginal: row.preciooriginal,
        cantidad: row.cantidad,
        precio: row.precio,
        imagen: row.imagen,
        tamano: row.tamano
      });
    });

    const pedidosAgrupados = Object.values(pedidosMap);
    return res.status(200).json(pedidosAgrupados);

  } catch (error) {
    console.error("Error fetching purchase history:", error);
    res.status(500).json({ error: "Failed to fetch purchase history" });
  }
};

export const getLatestOrderDetail = async (req, res) => {
  const userId = req.user.userId;

  try {
    // Asegurar que cualquier carrito 'confirmado' abandonado sea reactivado y unificado
    await reactivateCartInternal(userId);

    const carrito = await sql`
      SELECT idCarrito 
      FROM carrito 
      WHERE idUsuarioFK = ${userId} AND estado = 'activo'
      ORDER BY idCarrito DESC
      LIMIT 1
    `;

    if (carrito.length === 0) {
      return res.status(404).json({ error: "No hay carrito activo para procesar." });
    }

    const idCarrito = carrito[0].idcarrito;

    const productos = await sql`
      SELECT
        pc.idProductoFK as idproductofk,
        p.nombre,
        p.imagen,
        p."tamaño" AS tamano,
        p.precio as preciooriginal,
        pc.cantidad,
        pc.precioUnitario as preciounitario,
        (pc.cantidad * pc.precioUnitario) AS subtotalproducto,
        0 AS valordescuento
      FROM productocarrito pc
      JOIN producto p ON p.idProducto = pc.idProductoFK
      WHERE pc.idCarritoFK = ${idCarrito}
      ORDER BY pc.idProductoFK
    `;

    const total = productos.reduce((acc, current) => acc + Number(current.subtotalproducto), 0);
    const facturaMock = {
      idFactura: null, 
      fechaCreacion: new Date().toLocaleString("es-AR", {timeZone: "America/Argentina/Buenos_Aires"}),
      total
    };

    const direccion = await sql`
      SELECT
        d.idDireccion,
        d.calle,
        d.numero,
        c.idCiudad,
        c.nombreCiudad,
        c.provincia,
        c.codigoPostal,
        c.pais
      FROM direccion d
      JOIN ciudad c ON c.idCiudad = d.idCiudadFK
      WHERE d.idUsuarioFK = ${userId}
      ORDER BY d.idDireccion DESC
      LIMIT 1
    `;

    res.json({
      factura: facturaMock,
      productos,
      direccion: direccion[0] || null
    });
  } catch (error) {
    console.error("Error fetching latest order detail:", error);
    res.status(500).json({ error: "Failed to fetch latest order detail" });
  }
};

export const saveOrderDetailData = async (req, res) => {
  const userId = req.user.userId;
  const {
    calle,
    numero,
    nombreCiudad,
    provincia,
    codigoPostal,
    pais = "Argentina"
  } = req.body;


  const numeroDetectado = Number(numero);

  if (!calle || !numeroDetectado || !nombreCiudad || !provincia || !codigoPostal) {
    return res.status(400).json({ error: "Faltan datos obligatorios de direccion." });
  }

  try {
    const ciudadExistente = await sql`
      SELECT idCiudad
      FROM ciudad
      WHERE LOWER(nombreCiudad) = LOWER(${nombreCiudad})
        AND LOWER(provincia) = LOWER(${provincia})
        AND codigoPostal = ${codigoPostal}
        AND LOWER(pais) = LOWER(${pais})
      LIMIT 1
    `;

    let idCiudad;
    if (ciudadExistente.length > 0) {
      idCiudad = ciudadExistente[0].idciudad;
    } else {
      const nuevaCiudad = await sql`
        INSERT INTO ciudad (idCiudad, nombreCiudad, provincia, codigoPostal, pais)
        VALUES (
          (SELECT COALESCE(MAX(idCiudad), 0) + 1 FROM ciudad), 
          ${nombreCiudad}, 
          ${provincia}, 
          ${codigoPostal}, 
          ${pais}
        )
        RETURNING idCiudad
      `;
      idCiudad = nuevaCiudad[0].idciudad;
    }

    const direccionExistente = await sql`
      SELECT idDireccion
      FROM direccion
      WHERE idUsuarioFK = ${userId}
      ORDER BY idDireccion DESC
      LIMIT 1
    `;

    let idDireccion;
    if (direccionExistente.length > 0) {
      idDireccion = direccionExistente[0].iddireccion;
      await sql`
        UPDATE direccion
        SET
          idCiudadFK = ${idCiudad},
          calle = ${calle},
          numero = ${numeroDetectado}
        WHERE idDireccion = ${idDireccion}
      `;
    } else {
      const nuevaDireccion = await sql`
        INSERT INTO direccion (idDireccion, idUsuarioFK, idCiudadFK, calle, numero)
        VALUES (
          (SELECT COALESCE(MAX(idDireccion), 0) + 1 FROM direccion), 
          ${userId}, 
          ${idCiudad}, 
          ${calle}, 
          ${numeroDetectado}
        )
        RETURNING idDireccion
      `;
      idDireccion = nuevaDireccion[0].iddireccion;
    }


    // CONVERTIR CARRITO ACTIVO A FACTURA

    // Aseguramos consolidación de último momento
    await reactivateCartInternal(userId);

    const carritoInfo = await sql`
      SELECT idCarrito 
      FROM carrito 
      WHERE idUsuarioFK = ${userId} AND estado = 'activo'
      ORDER BY idCarrito DESC
      LIMIT 1
    `;

    if (carritoInfo.length === 0) {
      return res.status(404).json({ error: "Carrito no encontrado" });
    }
    const idCarrito = carritoInfo[0].idcarrito;

    const productos = await sql`
      SELECT 
        idProductoFK AS idproductofk, 
        cantidad, 
        precioUnitario AS preciounitario 
      FROM productocarrito 
      WHERE idCarritoFK = ${idCarrito}
    `;

    if (productos.length === 0) {
      return res.status(400).json({ error: "El carrito está vacio" });
    }

    const total = productos.reduce((acc, p) => acc + (p.cantidad * p.preciounitario), 0);

    const nuevaFactura = await sql`
      INSERT INTO factura (idUsuarioFK, fechaCreacion, total)
      VALUES (${userId}, (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, ${total})
      RETURNING idFactura
    `;
    const finalIdFactura = nuevaFactura[0].idfactura;

    for (const prod of productos) {
      const subtotal = prod.cantidad * prod.preciounitario;
      await sql`
        INSERT INTO lineafactura (idFacturaFK, idProductoFK, cantidad, precioUnitario, subtotalProducto)
        VALUES (${finalIdFactura}, ${prod.idproductofk}, ${prod.cantidad}, ${prod.preciounitario}, ${subtotal})
      `;
    }

    // Marcar el carrito como confirmado (se eliminará cuando el pago sea aprobado por MercadoPago)
    await sql`UPDATE carrito SET estado = 'confirmado' WHERE idCarrito = ${idCarrito}`;

    res.json({
      message: "Datos de envio guardados correctamente y Factura generada",
      idFactura: finalIdFactura,
      direccion: {
        idDireccion,
        calle,
        numero: numeroDetectado,
        idCiudad,
        nombreCiudad,
        provincia,
        codigoPostal,
        pais
      }
    });
  } catch (error) {
    console.error("Error saving order detail data:", error);
    res.status(500).json({ error: "No se pudieron guardar los datos de envio y orden combinada" });
  }
};
