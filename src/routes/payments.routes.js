// src/routes/payment.routes.js
import { Router } from "express";
import { authMiddleware } from "../middlewares/auth-middleware.js";
import {
  createPaymentPreference,
  handleWebhook,
} from "../controllers/PaymentController.js";

const paymentRoutes = Router();

paymentRoutes.post("/create", authMiddleware, createPaymentPreference);
paymentRoutes.post("/webhook", handleWebhook);

export default paymentRoutes;
