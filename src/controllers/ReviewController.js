import { sql } from "../config/db.js";

// Verificar si el usuario compró el producto (Comprador Verificado)
export const checkPurchase = async (req, res) => {
    const userId = req.user.userId;
    const productId = Number(req.params.productId);

    if (!productId) {
        return res.status(400).json({ error: "productId inválido" });
    }

    try {
        // Sin JOIN pago: verificamos solo factura + lineafactura
        // (pedidos viejos pueden no tener registro de pago)
        const result = await sql`
            SELECT lf.idProductoFK, f.idUsuarioFK
            FROM factura f
            JOIN lineafactura lf ON lf.idFacturaFK = f.idFactura
            WHERE f.idUsuarioFK = ${userId}::integer
              AND lf.idProductoFK = ${productId}::integer
            LIMIT 1;
        `;

        res.json({ hasPurchased: result.length > 0 });
    } catch (error) {
        console.error("Error verificando compra:", error);
        res.status(500).json({ error: "Error al verificar la compra" });
    }
};

// Obtener reseñas de un producto
export const getReviewsByProduct = async (req, res) => {
    try {
        const { productId } = req.params;

        const reviews = await sql`
            SELECT
                r.idUsuarioFK,
                TO_CHAR(r.fecha, 'YYYY-MM-DD') AS fecha,
                r.calificacion,
                r.comentario,
                u.nombre
            FROM reseña r
            JOIN usuario u ON u.idUsuario = r.idUsuarioFK
            WHERE r.idProductoFK = ${productId}
            ORDER BY r.fecha DESC;
        `;

        res.json(reviews);
    } catch (error) {
        console.error("Error obteniendo reseñas:", error);
        res.status(500).json({ error: "Error obteniendo reseñas" });
    }
};

// Crear reseña
export const createReview = async (req, res) => {
    const userId = req.user.userId;

    try {
        const { productId, calificacion, comentario } = req.body;

        // Evitar reseñas duplicadas
        const exists = await sql`
            SELECT 1 FROM reseña
            WHERE idUsuarioFK = ${userId} AND idProductoFK = ${productId};
        `;

        if (exists.length > 0) {
            return res.status(400).json({
                error: "El usuario ya realizó una reseña para este producto"
            });
        }

        await sql`
            INSERT INTO reseña (
                idUsuarioFK,
                idProductoFK,
                fecha,
                calificacion,
                comentario
            )
            VALUES (
                ${userId},
                ${productId},
                (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
                ${calificacion},
                ${comentario}
            );
        `;

        res.json({ message: "Reseña creada correctamente" });
    } catch (error) {
        console.error("Error creando reseña:", error);
        res.status(500).json({ error: "Error creando reseña" });
    }
};


// Eliminar reseña (USUARIO LOGUEADO)
export const deleteReview = async (req, res) => {
    const userId = req.user.userId;
    const { productId } = req.params;

    try {
        await sql`
            DELETE FROM reseña
            WHERE idUsuarioFK = ${userId}
            AND idProductoFK = ${productId};
        `;

        res.json({ message: "Reseña eliminada correctamente" });
    } catch (error) {
        console.error("Error eliminando reseña:", error);
        res.status(500).json({ error: "Error eliminando reseña" });
    }
};

// Eliminar reseña (ADMIN - Borra la de cualquier usuario)
export const deleteReviewAsAdmin = async (req, res) => {
    const { userId, productId } = req.params;

    try {
        await sql`
            DELETE FROM reseña
            WHERE idUsuarioFK = ${userId}
            AND idProductoFK = ${productId};
        `;

        res.json({ message: "Reseña eliminada por el administrador" });
    } catch (error) {
        console.error("Error eliminando reseña como admin:", error);
        res.status(500).json({ error: "Error eliminando reseña como admin" });
    }
};