import { Router } from "express";
import { 
    getAllProducts,
    getTopProducts,
    searchProducts,
    filterProducts,
    getProductById,
    createProduct,
    updateProduct,
    hideProduct,
    showProduct,
    updateStock
} from "../controllers/ProductController.js";

import {
    adminMiddleware
} from "../middlewares/admin-middleware.js";
import {
    authMiddleware
} from "../middlewares/auth-middleware.js";

const productRoutes = Router();

// ---- RUTAS PÚBLICAS ----
productRoutes.get("/", getAllProducts);
productRoutes.get("/search", searchProducts);
productRoutes.get("/filter", filterProducts);
productRoutes.get("/top-sales", getTopProducts);
productRoutes.get("/:id", getProductById);

// ---- RUTAS SOLO ADMIN ----
productRoutes.post("/", authMiddleware, adminMiddleware, createProduct);
productRoutes.put("/:id", authMiddleware, adminMiddleware, updateProduct);
productRoutes.patch("/:id/hide", authMiddleware, adminMiddleware, hideProduct);
productRoutes.patch("/:id/show", authMiddleware, adminMiddleware, showProduct);
productRoutes.put("/stock/:id", authMiddleware, adminMiddleware, updateStock);


export default productRoutes;
