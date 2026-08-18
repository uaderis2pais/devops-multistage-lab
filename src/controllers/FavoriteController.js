import { sql } from "../config/db.js";

// Obtener favoritos de un usuario
export const getFavorites = async (req, res) => {
    const userId = req.user.userId;

    try {
        const favoritos = await sql`
            SELECT f.idProductoFK AS id, f.fechaAgregado, p.nombre AS name, p.precio AS price, p.tamaño AS size, p.imagen, p.estado, p.stock
            FROM favorito f
            JOIN producto p ON p.idProducto = f.idProductoFK
            WHERE f.idUsuarioFK = ${userId};
        `;

        res.json(favoritos);
    } catch (error) {
        console.error("Error obteniendo favoritos:", error);
        res.status(500).json({ error: "Error obteniendo favoritos" });
    }
};

// Agregar a favoritos
export const addFavorite = async (req, res) => {
    const userId = req.user.userId;

    try {
        const { productId } = req.body;

        const prod = await sql`SELECT estado FROM producto WHERE idProducto = ${productId}`;
        if (prod.length === 0) {
            return res.status(404).json({ error: "Producto inexistente" });
        }
        if (prod[0].estado === 'inactivo') {
            return res.status(400).json({ error: "El producto no se encuentra disponible actualmente." });
        }

        const exists = await sql`
            SELECT 1 FROM favorito
            WHERE idUsuarioFK = ${userId}
              AND idProductoFK = ${productId};
        `;

        if (exists.length > 0) {
            return res.status(400).json({ message: "El producto ya está en favoritos" });
        }

        await sql`
            INSERT INTO favorito (idUsuarioFK, idProductoFK, fechaAgregado)
            VALUES (${userId}, ${productId}, NOW()::date);
        `;

        res.json({ message: "Producto agregado a favoritos" });
    } catch (error) {
        console.error("Error agregando favorito:", error);
        res.status(500).json({ error: "Error agregando favorito" });
    }
};

// Eliminar favorito
export const removeFavorite = async (req, res) => {
    const userId = req.user.userId;
    const { productId } = req.params;

    try {
        await sql`
            DELETE FROM favorito
            WHERE idUsuarioFK = ${userId}
              AND idProductoFK = ${productId};
        `;

        res.json({ message: "Producto eliminado de favoritos" });
    } catch (error) {
        console.error("Error eliminando favorito:", error);
        res.status(500).json({ error: "Error eliminando favorito" });
    }
};

export const toggleFavorite = async (req, res) => {
    const userId = req.user.userId;

    try {
        const { productId } = req.body;

        const exists = await sql`
            SELECT 1 FROM favorito
            WHERE idUsuarioFK = ${userId}
              AND idProductoFK = ${productId};
        `;

        if (exists.length > 0) {
            await sql`
                DELETE FROM favorito
                WHERE idUsuarioFK = ${userId}
                  AND idProductoFK = ${productId};
            `;
            return res.json({ message: "Producto removido de favoritos" });
        }

        const prod = await sql`SELECT estado FROM producto WHERE idProducto = ${productId}`;
        if (prod.length === 0) {
            return res.status(404).json({ error: "Producto inexistente" });
        }
        if (prod[0].estado === 'inactivo') {
            return res.status(400).json({ error: "El producto no se encuentra disponible actualmente." });
        }

        await sql`
            INSERT INTO favorito (idUsuarioFK, idProductoFK, fechaAgregado)
            VALUES (${userId}, ${productId}, NOW()::date);
        `;

        res.json({ message: "Producto agregado a favoritos" });
    } catch (error) {
        console.error("Error alternando favorito:", error);
        res.status(500).json({ error: "Error alternando favorito" });
    }
};
