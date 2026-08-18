import { Router } from "express";
import { authMiddleware } from "../middlewares/auth-middleware.js";
import {
    getFavorites,
    addFavorite,
    removeFavorite,
    toggleFavorite
} from "../controllers/FavoriteController.js";

const favoriteRoutes = Router();
// para coseguir favoritos de un usuario
favoriteRoutes.get("/", authMiddleware, getFavorites);
// para agregar un favorito
favoriteRoutes.post("/add", authMiddleware, addFavorite);
// para eliminar un favorito
favoriteRoutes.delete("/remove/:productId", authMiddleware, removeFavorite);
// para alternar un favorito
favoriteRoutes.post("/toggle", authMiddleware, toggleFavorite);

export default favoriteRoutes;