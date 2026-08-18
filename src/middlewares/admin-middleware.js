export const adminMiddleware = (req, res, next) => {
  if (req.user.rol !== "admin") {
    return res.status(403).json({
      error: "Access denied. Admin only"
    });
  }
  next();
};
