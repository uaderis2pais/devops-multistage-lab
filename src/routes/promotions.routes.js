import { Router } from "express";
import {adminMiddleware} from "../middlewares/admin-middleware.js";
import { authMiddleware } from "../middlewares/auth-middleware.js";

import {
  getAllPromotions,
  getPromotionById,
  createPromotion,
  hidePromotion,
  showPromotion
} from "../controllers/PromotionController.js";

const promotionRoutes = Router();

// ---- RUTAS PÚBLICAS ----

promotionRoutes.get("/", getAllPromotions);
promotionRoutes.get("/:id", getPromotionById);


// ---- RUTAS SOLO ADMIN ----


promotionRoutes.post("/", authMiddleware, adminMiddleware, createPromotion);
promotionRoutes.patch("/:id/hide", authMiddleware, adminMiddleware, hidePromotion);
promotionRoutes.patch("/:id/show", authMiddleware, adminMiddleware, showPromotion);

export default promotionRoutes;