import { Router } from "express";
import { authMiddleware } from "../middlewares/auth-middleware.js";
import { adminMiddleware } from "../middlewares/admin-middleware.js";
import {
    getReviewsByProduct,
    createReview,
    deleteReview,
    deleteReviewAsAdmin,
    checkPurchase
} from "../controllers/ReviewController.js";

const reviewRoutes = Router();

reviewRoutes.get("/product/:productId", getReviewsByProduct);
reviewRoutes.get("/check-purchase/:productId", authMiddleware, checkPurchase);
reviewRoutes.post("/create", authMiddleware, createReview);
reviewRoutes.delete("/delete/:productId", authMiddleware, deleteReview);
reviewRoutes.delete("/delete-admin/:userId/:productId", authMiddleware, adminMiddleware, deleteReviewAsAdmin);

export default reviewRoutes;
