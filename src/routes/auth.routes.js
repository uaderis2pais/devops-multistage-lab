import { Router } from "express";
import { 
    googleLogin, 
    register, 
    login, 
    logout,
    verifyToken,
    forgotPassword,
    resetPassword
} from "../controllers/UserController.js";

const authRoutes = Router();

// Definimos las rutas bajo el prefijo /api/auth
authRoutes.post("/register", register); // Queda en: /api/auth/register
authRoutes.post("/login", login);       // Queda en: /api/auth/login
authRoutes.post("/logout", logout);     // Queda en: /api/auth/logout
authRoutes.post("/google", googleLogin);// Queda en: /api/auth/google
authRoutes.get("/verify", verifyToken); // Queda en: /api/auth/verify
authRoutes.post("/forgot-password", forgotPassword); // Queda en: /api/auth/forgot-password
authRoutes.post("/reset-password/:token", resetPassword); // Queda en: /api/auth/reset-password/:token

export default authRoutes;
