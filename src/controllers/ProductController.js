import { sql } from "../config/db.js";


// Obtener todos los productos

export const getAllProducts = async (req, res) => {
  try {
    const products = await sql`
      SELECT * 
      FROM producto
      ORDER BY idproducto ASC;
    `;

    return res.status(200).json(products);
  } catch (error) {
    console.error("Error getAllProducts:", error);
    return res.status(500).json({ error: "Error al obtener productos" });
  }
};


// Obtener producto por ID

export const getProductById = async (req, res) => {
  const { id } = req.params;

  try {
    const product = await sql`
      SELECT * 
      FROM producto
      WHERE idproducto = ${id};
    `;

    if (product.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    return res.status(200).json(product[0]);
  } catch (error) {
    console.error("Error getProductById:", error);
    return res.status(500).json({ error: "Error al obtener el producto" });
  }
};


// Buscar productos por nombre

export const searchProducts = async (req, res) => {
  const { nombre } = req.query;

  try {
    const results = await sql`
      SELECT * 
      FROM producto
      WHERE LOWER(nombre) LIKE LOWER('%' || ${nombre} || '%')
      AND estado != 'inactivo';
    `;

    return res.status(200).json(results);
  } catch (error) {
    console.error("Error searchProducts:", error);
    return res.status(500).json({ error: "Error al buscar productos" });
  }
};


// Filtrar productos por tamaño y sabor

export const filterProducts = async (req, res) => {
  const { tamaño, sabor } = req.query;

  try {
    let query = sql`SELECT * FROM producto WHERE 1=1`;

    if (tamaño) query = sql`${query} AND "tamaño" = ${tamaño}`;
    if (sabor) query = sql`${query} AND sabor = ${sabor}`;

    const filtered = await sql`${query} ORDER BY idproducto ASC`;

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error filterProducts:", error);
    return res.status(500).json({ error: "Error al filtrar productos" });
  }
};

// Crear nuevo producto (ADMIN)

export const createProduct = async (req, res) => {
  const { nombre, descripcion, estado, stock, tamaño, sabor, precio, imagen } = req.body;

  if (!nombre || !descripcion || !estado || !tamaño || !sabor || !precio || !imagen) {
    return res.status(400).json({ error: "Campos obligatorios faltantes" });
  }

  try {
    const created = await sql`
      INSERT INTO producto (idProducto, nombre, descripcion, estado, precio, imagen, stock, "tamaño", sabor)
      VALUES ((SELECT COALESCE(MAX(idProducto),0) + 1 FROM producto), ${nombre}, ${descripcion}, ${estado},${precio},${imagen}, ${stock}, ${tamaño}, ${sabor})
      RETURNING *;
    `;

    return res.status(201).json(created[0]);
  } catch (error) {
    console.error("Error createProduct:", error);
    return res.status(500).json({ error: "Error al crear producto" });
  }
};


// Actualizar producto (ADMIN)

export const updateProduct = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, precio, imagen, tamaño, sabor, estado } = req.body;

  try {
    const updated = await sql`
      UPDATE producto
      SET 
        nombre = COALESCE(${nombre}, nombre),
        descripcion = COALESCE(${descripcion}, descripcion),
        precio = COALESCE(${precio}, precio),
        imagen = COALESCE(${imagen}, imagen),
        "tamaño" = COALESCE(${tamaño}, "tamaño"),
        sabor = COALESCE(${sabor}, sabor),
        estado = COALESCE(${estado}, estado)
      WHERE idproducto = ${id}
      RETURNING *;
    `;

    if (updated.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    // Limpieza asíncrona: Si el producto quedo inactivo, lo sacamos de los carritos vigentes
    if (updated[0].estado === 'inactivo') {
      sql`DELETE FROM productocarrito WHERE idProductoFK = ${id}`.catch(err => 
        console.error(`Error asíncrono limpiando carrito para el producto inactivo ${id}:`, err)
      );
    }

    return res.status(200).json(updated[0]);
  } catch (error) {
    console.error("Error updateProduct:", error);
    return res.status(500).json({ error: "Error al actualizar producto" });
  }
};


// Ocultar producto (ADMIN)

export const hideProduct = async (req, res) => {
  const { id } = req.params;

  try {
    const hidden = await sql`
      UPDATE producto
      SET estado = 'inactivo'
      WHERE idproducto = ${id}
      RETURNING *;
    `;

    if (hidden.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    // Limpieza asíncrona: Eliminar este producto de todos los carritos
    sql`DELETE FROM productocarrito WHERE idProductoFK = ${id}`.catch(err => 
      console.error(`Error asíncrono limpiando carrito para producto oculto ${id}:`, err)
    );

    return res.status(200).json({ message: "Producto ocultado", product: hidden[0] });
  } catch (error) {
    console.error("Error hideProduct:", error);
    return res.status(500).json({ error: "Error al ocultar producto" });
  }
};


// Publicar producto (ADMIN)

export const showProduct = async (req, res) => {
  const { id } = req.params;

  try {
    const shown = await sql`
      UPDATE producto
      SET estado = 'activo'
      WHERE idproducto = ${id}
      RETURNING *;
    `;

    if (shown.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    return res.status(200).json({ message: "Producto publicado", product: shown[0] });
  } catch (error) {
    console.error("Error showProduct:", error);
    return res.status(500).json({ error: "Error al publicar producto" });
  }
};

export const updateStock = async (req, res) => {
  const { id } = req.params;
  const { stock } = req.body;
  const stockValue = Number(stock);

  if (!Number.isFinite(stockValue) || stockValue < 0) {
    return res.status(400).json({ error: "Stock invalido" });
  }

  try {
    const income = await sql`
      INSERT INTO ingreso (idIngreso, idProductoFK, cantidad, fechaActualizacion)
      VALUES ((SELECT COALESCE(MAX(idIngreso),0) + 1 FROM ingreso), ${id}, ${stockValue}, NOW())
      RETURNING idIngreso;
    `;

    if (income.length === 0) {
      return res.status(400).json({ error: "Error al registrar el ingreso" });
    }

    const updated = await sql`
      UPDATE producto
      SET stock = stock + ${stockValue}
      WHERE idproducto = ${id}
      RETURNING *;
    `;

    
    if (updated.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    return res.status(200).json(updated[0]);
  } catch (error) {
    console.error("Error updateStock:", error);
    return res.status(500).json({ error: "Error al actualizar stock del producto" });
  }
}

// Productos populares
// Obtener los 3 productos más vendidos (Best Sellers)
export const getTopProducts = async (req, res) => {
  try {
    // 1. Intentamos traer el Top 3 de los más vendidos
    let topProducts = await sql`
      SELECT 
        p.idProducto, 
        p.nombre, 
        p.descripcion, 
        p.precio, 
        p.imagen, 
        p."tamaño", 
        p.sabor,
        COALESCE(SUM(lf.cantidad), 0) as total_vendido
      FROM producto p
      INNER JOIN lineafactura lf ON p.idProducto = lf.idProductoFK
      INNER JOIN factura f ON lf.idFacturaFK = f.idFactura
      WHERE f.fechaCreacion >= NOW() - INTERVAL '30 days'
      AND p.estado = 'activo'
      GROUP BY p.idProducto
      ORDER BY total_vendido DESC
      LIMIT 3;
    `;

    if (topProducts.length < 3) {
      const faltantes = 3 - topProducts.length;
      
      // Sacamos los IDs de los chocolates que YA están en el top
      const idsExistentes = topProducts.map(p => p.idproducto || p.idProducto);

      // Traemos varios productos aleatorios de la DB de forma simple
      const randomProducts = await sql`
        SELECT 
          p.idProducto, p.nombre, p.descripcion, p.precio, p.imagen, p."tamaño", p.sabor, 
          0 as total_vendido
        FROM producto p 
        WHERE p.estado = 'activo' 
        ORDER BY RANDOM()
        LIMIT 10;
      `;
      // Filtramos esos aleatorios para quedarnos solo con los que NO ESTÁN en el top original
      const filtrados = randomProducts.filter(
        p => !idsExistentes.includes(p.idproducto || p.idProducto)
      );

      // Recortamos solo la cantidad exacta que nos falta
      const paraRellenar = filtrados.slice(0, faltantes);

      // Completamos la lista original con esos aleatorios
      topProducts = [...topProducts, ...paraRellenar];
    }

    return res.status(200).json(topProducts);
  } catch (error) {
    // Si vuelve a fallar, el error exacto saldrá en la terminal donde corre tu backend
    console.error("Error getTopProducts:", error);
    return res.status(500).json({ error: "Error al obtener productos populares" });
  }
};
