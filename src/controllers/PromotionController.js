import { sql } from "../config/db.js";
import jwt from "jsonwebtoken";
import { transporter } from "../utils/mailer.js";

/* --------------------------------------------------
   GET /api/promotions
   Obtener promociones activas con sus productos
-------------------------------------------------- */
export const getAllPromotions = async (req, res) => {
  try {
    let isAdmin = false;
    const authHeader = req.headers.authorization;

    // Verificamos de forma pasiva si la solicitud viene de un Administrador
    if (authHeader) {
      const token = authHeader.split(" ")[1];
      if (token && token !== "undefined") {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          if (decoded && decoded.rol === "admin") {
            isAdmin = true;
          }
        } catch (error) {
          // Token inválido/expirado, será tratado por defecto como visitante
        }
      }
    }

    let rows;

    if (isAdmin && req.query.adminView === 'true') {
      // ROL ADMIN: Consulta libre de filtros con LEFT JOIN (incluye inactivas y vacías)
      rows = await sql`
        SELECT 
          pr.idpromocion,
          pr.nombre,
          pr.descripcion,
          pr.valor,
          TO_CHAR(pr.fechainicio, 'YYYY-MM-DD') AS fechainicio,
          TO_CHAR(pr.fechafin, 'YYYY-MM-DD') AS fechafin,
          pr.estado,
          p.idproducto,
          p.nombre AS nombreproducto,
          p.precio
        FROM promocion pr
        LEFT JOIN promocionproducto pp 
          ON pp.idpromocionfk = pr.idpromocion
        LEFT JOIN producto p 
          ON p.idproducto = pp.idproductofk
        WHERE pr.fechafin >= CURRENT_DATE
        ORDER BY pr.fechainicio ASC;
      `;
    } else {
      // ROL USUARIO: Consulta estricta filtrada (solo vigentes y válidas)
      rows = await sql`
        SELECT 
          pr.idpromocion,
          pr.nombre,
          pr.descripcion,
          pr.valor,
          TO_CHAR(pr.fechainicio, 'YYYY-MM-DD') AS fechainicio,
          TO_CHAR(pr.fechafin, 'YYYY-MM-DD') AS fechafin,
          pr.estado,
          p.idproducto,
          p.nombre AS nombreproducto,
          p.precio
        FROM promocion pr
        JOIN promocionproducto pp 
          ON pp.idpromocionfk = pr.idpromocion
        JOIN producto p 
          ON p.idproducto = pp.idproductofk
        WHERE pr.estado = 'activo' 
          AND CURRENT_DATE AT TIME ZONE 'America/Argentina/Buenos_Aires' BETWEEN pr.fechainicio AND pr.fechafin
        ORDER BY pr.fechainicio ASC;
      `;
    }

    const promotionsMap = {};

    rows.forEach(row => {
      if (!promotionsMap[row.idpromocion]) {
        promotionsMap[row.idpromocion] = {
          idpromocion: row.idpromocion,
          nombre: row.nombre,
          descripcion: row.descripcion,
          valor: row.valor,
          fechainicio: row.fechainicio,
          fechafin: row.fechafin,
          estado: row.estado,
          productos: []
        };
      }

      if (row.idproducto) {
        promotionsMap[row.idpromocion].productos.push({
          idproducto: row.idproducto,
          nombre: row.nombreproducto,
          precio: row.precio
        });
      }
    });

    const promotions = Object.values(promotionsMap);

    return res.status(200).json(promotions);

  } catch (error) {
    console.error("Error getAllPromotions:", error);
    return res.status(500).json({ error: "Error al obtener promociones" });
  }
};

/* --------------------------------------------------
   GET /api/promotions/:id
-------------------------------------------------- */
export const getPromotionById = async (req, res) => {
  const { id } = req.params;

  try {
    const promotion = await sql`
      SELECT 
          idpromocion,
          nombre,
          descripcion,
          valor,
          TO_CHAR(fechainicio, 'YYYY-MM-DD') AS fechainicio,
          TO_CHAR(fechafin, 'YYYY-MM-DD') AS fechafin,
          estado
      FROM promocion
      WHERE idpromocion = ${id};
    `;

    if (promotion.length === 0) {
      return res.status(404).json({ error: "Promoción no encontrada" });
    }

    const products = await sql`
      SELECT p.*
      FROM promocionproducto pp
      JOIN producto p ON p.idproducto = pp.idproductofk
      WHERE pp.idpromocionfk = ${id};
    `;

    return res.status(200).json({
      promocion: promotion[0],
      productos: products
    });
  } catch (error) {
    console.error("Error getPromotionById:", error);
    return res.status(500).json({ error: "Error al obtener promoción" });
  }
};

/* --------------------------------------------------
  POST /api/promotions 
  Crea promoción, asocia MULTIPLES productos y sobreescribe si es necesario
-------------------------------------------------- */
export const createPromotion = async (req, res) => {
  const { nombre, descripcion, valor, fechaInicio, fechaFin, productosIds, overwrite } = req.body;

  if (!nombre || !descripcion || !valor || !fechaInicio || !fechaFin || !productosIds || productosIds.length === 0) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }

  try {
    // Si NO forzamos sobreescritura, revisamos si hay choques
    if (!overwrite) {
      const productosConPromo = await sql`
        SELECT p.nombre
        FROM producto p
        JOIN promocionproducto pp ON p.idProducto = pp.idProductoFK
        JOIN promocion pr ON pr.idPromocion = pp.idPromocionFK
        WHERE p.idProducto = ANY(${productosIds}) AND pr.estado = 'activo'
      `;

      if (productosConPromo.length > 0) {
        return res.status(409).json({
          error: "Hay productos que ya tienen una promoción activa.",
          productosAfectados: productosConPromo.map(p => p.nombre)
        });
      }
    }

    // Si forzamos sobreescritura, arrasamos con cualquier promo vieja de esos chocolates
    if (overwrite) {
      await sql`
        DELETE FROM promocionproducto
        WHERE idProductoFK = ANY(${productosIds})
      `;
    }

    // Creamos la promo nueva
    const result = await sql`
      INSERT INTO promocion (nombre, descripcion, valor, fechainicio, fechafin, estado)
      VALUES (${nombre}, ${descripcion}, ${valor}, ${fechaInicio}, ${fechaFin}, 'activo')
      RETURNING idpromocion;
    `;

    const idPromocion = result[0].idpromocion;


    for (const idProd of productosIds) {
      await sql`
        INSERT INTO promocionproducto (idpromocionfk, idproductofk)
        VALUES (${idPromocion}, ${idProd});
      `;
    }

    // Enviar correos a todos los usuarios avisando de la promo de forma asíncrona
    (async () => {
      try {
        const usuarios = await sql`SELECT nombre, mail FROM usuario WHERE rol = 'cliente'`;
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

        for (const user of usuarios) {
          const mailOptions = {
            to: user.mail,
            subject: `¡Nueva Promoción: ${nombre}! - Amargo y Dulce`,
            html: `
              <div style="font-family: Arial, sans-serif; text-align: center; color: #333; background-color: #f7f2ec; padding: 40px 20px;">
                <div style="max-width: 400px; margin: 0 auto; background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); position: relative; border: 1px solid #e5e7eb;">
                  
                  <div style="position: absolute; top: 12px; left: 12px; background-color: #ef4444; color: white; font-size: 14px; font-weight: bold; padding: 4px 8px; border-radius: 4px;">
                    ${valor}%
                  </div>

                  <h2 style="color: #6B4C3A; margin-top: 10px;">¡Hola ${user.nombre}!</h2>
                  <p style="color: #555;">Tenemos una nueva promoción especial para vos:</p>
                  
                  <h3 style="color: #6B4C3A; font-size: 22px; margin: 20px 0 10px 0;">${nombre}</h3>
                  <p style="color: #444; font-size: 15px; margin-bottom: 24px;">${descripcion}</p>
                  
                  <a href="${frontendUrl}/shop?promocion=${idPromocion}" style="padding: 12px 24px; background-color: #6B4C3A; color: white; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; transition: background-color 0.3s;">
                    Ver productos
                  </a>
                </div>
              </div>
            `
          };

          if (process.env.RENDER) {
            const proxyUrl = `${frontendUrl}/api/send-mail`;
            await fetch(proxyUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.VERCEL_API_SECRET}`
              },
              body: JSON.stringify(mailOptions)
            });
          } else {
            await transporter.sendMail({
              from: '"Amargo y Dulce" <facubpais@gmail.com>',
              ...mailOptions
            });
          }
        }
      } catch (err) {
        console.error("Error al enviar correos de preventa:", err);
      }
    })();

    return res.status(201).json({ message: "Promoción creada correctamente" });
  } catch (error) {
    console.error("Error al crear promoción:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

/* --------------------------------------------------
   PATCH /api/promotions/:id/hide (ADMIN)
-------------------------------------------------- */
export const hidePromotion = async (req, res) => {
  const { id } = req.params;

  try {
    const updated = await sql`
      UPDATE promocion
      SET estado = 'inactivo'
      WHERE idpromocion = ${id}
      RETURNING *;
    `;

    if (updated.length === 0) {
      return res.status(404).json({ error: "Promoción no encontrada" });
    }

    return res.status(200).json({ message: "Promoción ocultada" });
  } catch (error) {
    console.error("Error hidePromotion:", error);
    return res.status(500).json({ error: "Error al ocultar promoción" });
  }
};

/* --------------------------------------------------
   PATCH /api/promotions/:id/show (ADMIN)
-------------------------------------------------- */
export const showPromotion = async (req, res) => {
  const { id } = req.params;

  try {
    const updated = await sql`
      UPDATE promocion
      SET estado = 'activo'
      WHERE idpromocion = ${id}
      RETURNING *;
    `;

    if (updated.length === 0) {
      return res.status(404).json({ error: "Promoción no encontrada" });
    }

    return res.status(200).json({ message: "Promoción publicada" });
  } catch (error) {
    console.error("Error showPromotion:", error);
    return res.status(500).json({ error: "Error al publicar promoción" });
  }
};
