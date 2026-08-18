import { Router } from "express";
import {
  getPurchaseHistory,
  getLatestOrderDetail,
  saveOrderDetailData
} from "../controllers/OrderController.js";
import { authMiddleware } from "../middlewares/auth-middleware.js";

const orderRoutes = Router();

orderRoutes.get("/my-orders", authMiddleware, getPurchaseHistory);
orderRoutes.get("/latest", authMiddleware, getLatestOrderDetail);
orderRoutes.post("/details", authMiddleware, saveOrderDetailData);

export default orderRoutes;
