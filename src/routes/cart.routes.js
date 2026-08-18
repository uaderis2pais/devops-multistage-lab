import { Router } from "express";
import { authMiddleware } from "../middlewares/auth-middleware.js";
import {
  getActiveCart,
  addProductToCart,
  updateProductQuantity,
  removeProductFromCart,
  confirmCart,
  reactivateCart
} from "../controllers/CartController.js";

const cartRoutes = Router();

//Obtener el carrito activo del usuario
cartRoutes.get("/", authMiddleware, getActiveCart);

// Agregar producto al carrito
cartRoutes.post("/add", authMiddleware, addProductToCart);

// Modificar cantidad de producto en el carrito
cartRoutes.put("/update", authMiddleware, updateProductQuantity);

// Eliminar producto del carrito    
cartRoutes.delete("/remove", authMiddleware, removeProductFromCart);

// Cambiar estado a "confirmado"
cartRoutes.put("/confirm/:idCarrito", authMiddleware, confirmCart);

// Reactivar carrito (Volver de un intento de pago fallido o cancelado)
cartRoutes.post("/reactivate", authMiddleware, reactivateCart);

export default cartRoutes;