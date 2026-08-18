import "dotenv/config";
import express from "express";
import cors from "cors";
import productRoutes from "./src/routes/products.routes.js";
import cartRoutes from "./src/routes/cart.routes.js";
import favoriteRoutes from "./src/routes/favorites.routes.js";
import reviewRoutes from "./src/routes/reviews.routes.js";
import promotionRoutes from "./src/routes/promotions.routes.js";
import paymentRoutes from "./src/routes/payments.routes.js";
import authRoutes from "./src/routes/auth.routes.js";
import orderRoutes from "./src/routes/order.routes.js";
import shippingRoutes from "./src/routes/shipping.routes.js";
import "./src/utils/mailer.js";
import { initCronJobs } from "./src/services/cronStock.js";

const app = express();

const PORT = process.env.PORT || 3000;
// Normalizar la URL del frontend para evitar errores de CORS con la barra final (/)
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");

app.use(cors({
  origin: FRONTEND_URL, 
  credentials: true
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Ruta de estado inicial
app.get("/", (req, res) => {
  res.send("Servidor de Amargo y Dulce en ejecución");
});

// Rutas
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes); 
app.use("/api/favorites", favoriteRoutes);
app.use("/api/reviews", reviewRoutes); 
app.use("/api/promotions", promotionRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/shipping", shippingRoutes);


initCronJobs();

app.listen(PORT, () => {
  console.log("Servidor corriendo en http://localhost:3000");
});
