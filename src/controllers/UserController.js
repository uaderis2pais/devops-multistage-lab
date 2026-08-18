import { sql } from "../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { transporter } from "../utils/mailer.js";
// Registrar nuevo usuario

export const register = async (req, res) => {
  const {
    nombre,
    apellido,
    mail,
    contraseña,
    telefono,
    rol = "cliente",
  } = req.body;

  if (!nombre || !apellido || !mail || !contraseña || !telefono) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }

  try {
    const exists = await sql`
      SELECT idusuario
      FROM usuario
      WHERE mail = ${mail}`
    ;

    if (exists.length > 0) {
      return res.status(400).json({ error: "El mail ya está registrado" });
    }

    const hashedPassword = await bcrypt.hash(contraseña, 10);

    const nuevoUsuario = await sql`
      INSERT INTO usuario (
        idUsuario,
        nombre,
        apellido,
        mail,
        contraseña,
        telefono,
        fechaRegistro,
        rol
      )
      VALUES (
        (SELECT COALESCE(MAX(idUsuario),0) + 1 FROM usuario),
        ${nombre},
        ${apellido},
        ${mail},
        ${hashedPassword},
        ${telefono},
        CURRENT_DATE,
        ${rol}
      )
      RETURNING idUsuario, nombre, apellido, mail, rol;`
    ;

    const token = jwt.sign(
      {
        userId: nuevoUsuario[0].idusuario,
        rol: nuevoUsuario[0].rol,
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h" },
    );

    res.status(201).json({
      token,
      user: {
        idUsuario: nuevoUsuario[0].idusuario,
        nombre: nuevoUsuario[0].nombre,
        apellido: nuevoUsuario[0].apellido,
        rol: nuevoUsuario[0].rol,
      },
    });
  } catch (error) {
    console.error("Error register:", error);
    res.status(500).json({ error: "Error registrando usuario" });
  }
};

// Iniciar sesión con usuario existente

export const login = async (req, res) => {
  const { mail, contraseña } = req.body;

  if (!mail || !contraseña) {
    return res.status(400).json({ error: "Mail y contraseña requeridos" });
  }

  try {
    const user = await sql`
      SELECT idusuario, nombre, apellido, contraseña, rol
      FROM usuario
      WHERE mail = ${mail}
    `;
    if (user.length === 0) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const passwordOk = await bcrypt.compare(contraseña, user[0].contraseña);

    if (!passwordOk) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const token = jwt.sign(
      {
        userId: user[0].idusuario,
        rol: user[0].rol,
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h" },
    );

    res.json({
      token,
      user: {
        idUsuario: user[0].idusuario,
        nombre: user[0].nombre,
        apellido: user[0].apellido,
        rol: user[0].rol,
      },
    });
  } catch (error) {
    console.error("Error login:", error);
    res.status(500).json({ error: "Error en login" });
  }
};

// Cerrar sesión de usuario

export const logout = async (req, res) => {
  res.json({ message: "Logout exitoso" });
};

// Verificar token para rearmar sesión

export const verifyToken = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autorizado" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await sql`
      SELECT idusuario, nombre, apellido, mail, rol 
      FROM usuario 
      WHERE idusuario = ${decoded.userId}
    `;

    if (user.length === 0)
      return res.status(401).json({ error: "Usuario no encontrado" });

    return res.json({
      idUsuario: user[0].idusuario,
      nombre: user[0].nombre,
      apellido: user[0].apellido,
      mail: user[0].mail,
      rol: user[0].rol,
    });
  } catch (error) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
};

// Función para pedir la recuperación
export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await sql`SELECT idusuario, nombre, mail FROM usuario WHERE mail = ${email}`;
    
    if (user.length === 0) {
      return res.status(404).json({ error: "No existe una cuenta con ese correo electrónico" });
    }

    // Generamos un token temporal (válido por 15 minutos)
    // Usamos el idusuario para saber a quién le estamos cambiando la clave después
    const token = jwt.sign(
      { id: user[0].idusuario }, 
      process.env.JWT_SECRET, 
      { expiresIn: "15m" }
    );

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const recoveryLink = `${frontendUrl}/reset-password/${token}`;

    const mailOptions = {
      to: user[0].mail,
      subject: "Recupera tu contraseña de Amargo y Dulce",
      html: `
        <div style="font-family: Arial, sans-serif; text-align: center; color: #333;">
          <h2 style="color: #6B4C3A;">¡Hola ${user[0].nombre}!</h2>
          <p>Recibimos una solicitud para restablecer tu contraseña.</p>
          <p>Haz clic en el botón de abajo para crear una nueva (este enlace caduca en 15 minutos):</p>
          <a href="${recoveryLink}" style="padding: 12px 24px; background-color: #6B4C3A; color: white; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; margin-top: 15px;">
            Restablecer Contraseña
          </a>
          <p style="margin-top: 30px; font-size: 12px; color: #999;">
            Si no pediste cambiar tu contraseña, podés ignorar este correo tranquilamente.
          </p>
        </div>
      `
    };

    if (process.env.RENDER) {
      // Estamos en Render (Producción): Los puertos SMTP están bloqueados, delegamos a Vercel
      console.log("Detectado Render: Delegando envío a Vercel Proxy...");
      const proxyUrl = `${frontendUrl}/api/send-mail`;
      
      const proxyResponse = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.VERCEL_API_SECRET}`
        },
        body: JSON.stringify(mailOptions)
      });

      if (!proxyResponse.ok) {
        const errorText = await proxyResponse.text();
        console.error("Error del Proxy de Vercel:", errorText);
        throw new Error("El intermediario de Vercel falló al enviar el correo.");
      }
    } else {
      // Estamos localmente: Render bloqueado no aplica, mandamos directo por Nodemailer
      await transporter.sendMail({
        from: '"Amargo y Dulce" <facubpais@gmail.com>',
        ...mailOptions
      });
    }

    return res.json({ message: "Te enviamos un correo con las instrucciones" });

  } catch (error) {
    console.error("Error al enviar el correo:", error);
    return res.status(500).json({ error: "Hubo un error al intentar enviar el correo" });
  }
};

// Función para resetear la contraseña
export const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    //Verificamos que el token sea válido y no haya expirado
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const passwordHash = await bcrypt.hash(password, 10);
    await sql`
      UPDATE usuario 
      SET contraseña = ${passwordHash} 
      WHERE idusuario = ${decoded.id}
    `;
    return res.json({ message: "¡Contraseña actualizada con éxito!" });

  } catch (error) {
    console.error(error);
    return res.status(400).json({ error: "El enlace es inválido o ha expirado. Volvé a solicitar uno nuevo." });
  }
};


// Login / Register con Google

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const googleLogin = async (req, res) => {
  const { credential: token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token de Google requerido" });
  }

  try {
    // Verificar token con Google
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const mail = payload.email;
    const nombre = payload.given_name || "GoogleUser";
    const apellido = payload.family_name || "User";

    // Buscar usuario
    let user = await sql`
      SELECT idusuario, nombre, apellido, rol
      FROM usuario
      WHERE mail = ${mail}
    `;

    // Si no existe, registrarlo
    if (user.length === 0) {
      const nuevoUsuario = await sql`
        INSERT INTO usuario (
          idUsuario,
          nombre,
          apellido,
          mail,
          contraseña,
          telefono,
          fechaRegistro,
          rol
        )
        VALUES (
          (SELECT COALESCE(MAX(idUsuario),0) + 1 FROM usuario),
          ${nombre},
          ${apellido},
          ${mail},
          'google-auth',
          '0000000000',
          CURRENT_DATE,
          'cliente'
        )
        RETURNING idusuario, nombre, apellido, rol;
      `;

      user = nuevoUsuario;
    }

    // Generar JWT
    const jwtToken = jwt.sign(
      {
        userId: user[0].idusuario,
        rol: user[0].rol,
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h" },
    );

    res.json({
      token: jwtToken,
      user: {
        idUsuario: user[0].idusuario,
        nombre: user[0].nombre,
        apellido: user[0].apellido,
        rol: user[0].rol,
      },
    });
  } catch (error) {
    console.error("Google login error:", error);
    res.status(401).json({ error: "Token de Google inválido" });
  }
};
