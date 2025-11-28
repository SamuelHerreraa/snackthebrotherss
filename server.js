require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');

const app = express();

// Rutas
const asistenciaRoutes = require('./routes/asistencia');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const empleadosRoutes = require('./routes/empleados');
const nominaRoutes = require('./routes/nomina'); // 👈 NUEVO

// =============== CONEXIÓN A MONGODB ===============
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB conectado'))
  .catch(err => console.log(err));

// =============== MIDDLEWARES GENERALES ===============
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// =============== SESIONES ===============
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 día
}));

// Middleware para pasar el usuario a todas las vistas
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// =============== RUTAS ===============
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/empleados', empleadosRoutes);
app.use('/asistencia', asistenciaRoutes);
app.use('/nomina', nominaRoutes); // 👈 NUEVO

// Ruta principal - redirige al login o dashboard
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/auth/login');
  }
});

// =============== INICIAR SERVIDOR ===============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
