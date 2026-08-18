import { sql } from "../config/db.js";

// Helper interno para reactivar un carrito (borrar factura impaga y pasar a 'activo')
export const reactivateCartInternal = async (userId) => {
  try {
    // Buscar facturas pendientes para este usuario (sin pago aún)
    const facturasPendientes = await sql`
      SELECT f.idFactura 
      FROM factura f
      LEFT JOIN pago p ON f.idFactura = p.idFacturaFK
      WHERE f.idUsuarioFK = ${userId} AND p.idPago IS NULL
    `;

    if (facturasPendientes.length > 0) {
      const ids = facturasPendientes.map(f => f.idfactura);
      // Borrar las facturas y sus líneas para liberar el stock
      await sql`DELETE FROM lineafactura WHERE idFacturaFK = ANY(${ids})`;
      await sql`DELETE FROM factura WHERE idFactura = ANY(${ids})`;
    }

    // Consolidar TODOS los carritos 'confirmado' a 'activo'
    // Si ya existía un carrito 'activo', esto podría crear duplicados temporales,
    // que luego resolveremos en getActiveCart o addProductToCart unificándolos.
    await sql`
      UPDATE carrito 
      SET estado = 'activo' 
      WHERE idUsuarioFK = ${userId} AND estado = 'confirmado'
    `;
    return true;
  } catch (error) {
    console.error("Error en reactivateCartInternal:", error);
    return false;
  }
};

// Obtener carrito activo
export const getActiveCart = async (req, res) => {
  const userId = req.user.userId;

  try {
    // Siempre intentamos reactivar cualquier carrito 'confirmado' abandonado primero
    await reactivateCartInternal(userId);

    // Buscar carritos activos
    let carritos = await sql`
      SELECT idCarrito 
      FROM carrito
      WHERE idUsuarioFK = ${userId} AND estado = 'activo'
      ORDER BY idCarrito DESC
    `;

    if (carritos.length === 0) {
      return res.json({ message: "El usuario no tiene carrito activo.", productos: [] });
    }

    // Unificación (Singularidad): Si hay más de un carrito activo por error, consolidamos en el más reciente
    let idCarrito = carritos[0].idcarrito;
    if (carritos.length > 1) {
      console.log(`[Consolidación] Usuario ${userId} tenía ${carritos.length} carritos activos. Unificando en ${idCarrito}...`);
      const otrosCarts = carritos.slice(1).map(c => c.idcarrito);
      
      // Mover productos de carritos viejos al nuevo (o actualizar cantidad si ya existen)
      for (const oldId of otrosCarts) {
        await sql`
          INSERT INTO productocarrito (idCarritoFK, idProductoFK, cantidad, precioUnitario)
          SELECT ${idCarrito}, idProductoFK, cantidad, precioUnitario 
          FROM productocarrito WHERE idCarritoFK = ${oldId}
          ON CONFLICT ON CONSTRAINT productocarrito_pkey 
          DO UPDATE SET 
            cantidad = productocarrito.cantidad + EXCLUDED.cantidad,
            precioUnitario = EXCLUDED.precioUnitario
        `;
        await sql`DELETE FROM productocarrito WHERE idCarritoFK = ${oldId}`;
        await sql`DELETE FROM carrito WHERE idCarrito = ${oldId}`;
      }
    }


    // Obtener productos del carrito, incluyendo la imagen y sumando el subtotal
    const productos = await sql`
      SELECT 
        pc.idProductoFK, 
        p.nombre, 
        p.precio, 
        p.imagen,
        p."tamaño" AS tamaño,
        p.stock,
        pc.cantidad, 
        pc.precioUnitario,
        (pc.cantidad * pc.precioUnitario) as subtotal
      FROM productocarrito pc
      JOIN producto p ON p.idProducto = pc.idProductoFK
      WHERE pc.idCarritoFK = ${idCarrito}
    `;

    // Obtener el carrito final ya unificado
    const carritoFinal = await sql`SELECT * FROM carrito WHERE idCarrito = ${idCarrito}`;

    res.json({
      carrito: carritoFinal[0],
      productos,
    });
  } catch (error) {
    console.error("Error obteniendo carrito:", error);
    res.status(500).json({ error: "Error obteniendo carrito" });
  }
};

// Agregar producto al carrito
export const addProductToCart = async (req, res) => {
  const userId = req.user.userId;
  const { idProducto, cantidad } = req.body;

  try {
    // Asegurar que no haya carritos 'confirmado' antes de agregar
    await reactivateCartInternal(userId);

    const prod = await sql`SELECT precio, stock, estado FROM producto WHERE idProducto = ${idProducto}`;
    
    if (prod.length === 0) {
      return res.status(404).json({ error: "Producto inexistente" });
    }

    if (prod[0].estado === 'inactivo') {
      return res.status(400).json({ error: "El producto no se encuentra disponible actualmente." });
    }

    //  Lógica de Promociones 
    const promo = await sql`
      SELECT pr.valor
      FROM promocion pr
      JOIN promocionproducto pp ON pr.idPromocion = pp.idPromocionFK
      WHERE pp.idProductoFK = ${idProducto}
        AND pr.estado = 'activo'
        AND CURRENT_DATE AT TIME ZONE 'America/Argentina/Buenos_Aires' BETWEEN pr.fechainicio AND pr.fechafin
      LIMIT 1
    `;

    let precioUnitario = Number(prod[0].precio);
    if (promo.length > 0) {
      const descuento = Number(promo[0].valor);
      precioUnitario = precioUnitario * (1 - descuento / 100);
    }
    // ------------------------------------

    const stockDisponible = prod[0].stock;

    // Buscar si ya hay un carrito activo (después de reactivar)
    let carritos = await sql`
      SELECT idCarrito FROM carrito
      WHERE idUsuarioFK = ${userId} AND estado = 'activo'
      ORDER BY idCarrito DESC
    `;

    let idCarrito;

    // Si no hay carrito, crearlo
    if (carritos.length === 0) {
      const nuevo = await sql`
        INSERT INTO carrito (idUsuarioFK, estado, fechaCreacion, total)
        VALUES (${userId}, 'activo', NOW()::date, 0)
        RETURNING idCarrito
      `;
      idCarrito = nuevo[0].idcarrito;
    } else {
      idCarrito = carritos[0].idcarrito;
    }

    // Control de stock: Ver cuántos ya tengo en el carrito y cuánto quiero agregar
    const productoEnCarrito = await sql`
      SELECT cantidad FROM productocarrito
      WHERE idCarritoFK = ${idCarrito} AND idProductoFK = ${idProducto}
    `;

    const cantidadActual = productoEnCarrito.length > 0 ? productoEnCarrito[0].cantidad : 0;
    if (cantidadActual + cantidad > stockDisponible) {
      return res.status(400).json({
        error: `No hay suficiente stock. Ya tienes ${cantidadActual} en el carrito y solo quedan ${stockDisponible} disponibles.`
      });
    }


    // Insertar o actualizar (actualizamos también el precioUnitario por si cambió la promo)
    await sql`
      INSERT INTO productocarrito (idCarritoFK, idProductoFK, cantidad, precioUnitario)
      VALUES (${idCarrito}, ${idProducto}, ${cantidad}, ${precioUnitario})
      ON CONFLICT ON CONSTRAINT productocarrito_pkey 
      DO UPDATE SET 
        cantidad = productocarrito.cantidad + EXCLUDED.cantidad,
        precioUnitario = EXCLUDED.precioUnitario
    `;

    res.json({ message: "Producto agregado al carrito", idCarrito });
  } catch (error) {
    console.error("Error agregando producto:", error);
    res.status(500).json({ error: "Error agregando producto" });
  }
};

// Modificar cantidad de un producto
export const updateProductQuantity = async (req, res) => {
  const userId = req.user.userId;
  const { idCarrito, idProducto, cantidad } = req.body;

  try {
    // Asegurar consistencia
    await reactivateCartInternal(userId);

    // Verificar stock disponible del producto
    const prod = await sql`SELECT stock FROM producto WHERE idProducto = ${idProducto}`;
    
    if (prod.length === 0) {
      return res.status(404).json({ error: "Producto inexistente" });
    }

    const stockDisponible = prod[0].stock;

    if (cantidad > stockDisponible) {
      return res.status(400).json({ 
        error: `No hay suficiente stock. Solo quedan ${stockDisponible} unidades disponibles.` 
      });
    }

    // Recalcular precio por si cambió la promo ---
    const promo = await sql`
      SELECT pr.valor
      FROM promocion pr
      JOIN promocionproducto pp ON pr.idPromocion = pp.idPromocionFK
      WHERE pp.idProductoFK = ${idProducto}
        AND pr.estado = 'activo'
        AND CURRENT_DATE AT TIME ZONE 'America/Argentina/Buenos_Aires' BETWEEN pr.fechainicio AND pr.fechafin
      LIMIT 1
    `;
    const prodPrice = await sql`SELECT precio FROM producto WHERE idProducto = ${idProducto}`;
    
    let precioUnitario = Number(prodPrice[0].precio);
    if (promo.length > 0) {
      precioUnitario = precioUnitario * (1 - Number(promo[0].valor) / 100);
    }
    // -------------------------------------------------------

    // 1. Actualizamos la cantidad y el precio
    await sql`
      UPDATE productocarrito
      SET cantidad = ${cantidad},
          precioUnitario = ${precioUnitario}
      WHERE idCarritoFK = ${idCarrito} AND idProductoFK = ${idProducto}
    `;

    res.json({ message: "Cantidad actualizada correctamente" });
  } catch (error) {
    console.error("Error actualizando cantidad:", error);
    res.status(500).json({ error: "Error actualizando cantidad" });
  }
};

// Eliminar un producto
export const removeProductFromCart = async (req, res) => {
  const userId = req.user.userId;
  const { idCarrito, idProducto } = req.body;

  try {
    // Asegurar que estamos trabajando sobre el carrito correcto
    await reactivateCartInternal(userId);

    await sql`
      DELETE FROM productocarrito
      WHERE idCarritoFK = ${idCarrito} AND idProductoFK = ${idProducto}
    `;

    res.json({ message: "Producto eliminado del carrito" });
  } catch (error) {
    console.error("Error eliminando producto:", error);
    res.status(500).json({ error: "Error eliminando producto" });
  }
};

// Confirmar carrito (Pasar a Checkout)
export const confirmCart = async (req, res) => {
  const { idCarrito } = req.params;

  try {
    //Limpieza final asegurando que no se incorporen productos sin stock
    await sql`
      DELETE FROM productocarrito 
      WHERE idCarritoFK = ${idCarrito} 
      AND idProductoFK IN (SELECT idProducto FROM producto WHERE stock <= 0)
    `;

    // El carrito no se cambia a 'confirmado' aquí. Se hará en OrderController.
    res.json({ message: "Carrito verificado correctamente" });
  } catch (error) {
    console.error("Error confirmando carrito:", error);
    res.status(500).json({ error: "Error confirmando carrito" });
  }
};

// Reactivar carrito (Volver de un intento de pago fallido o cancelado)
export const reactivateCart = async (req, res) => {
  const userId = req.user.userId;

  try {
    const success = await reactivateCartInternal(userId);
    
    res.json({ 
      message: success ? "Carrito reactivado correctamente." : "No se pudo reactivar el carrito.",
      found: success
    });
  } catch (error) {
    console.error("Error reactivando carrito:", error);
    res.status(500).json({ error: "Error reactivando carrito" });
  }
};
