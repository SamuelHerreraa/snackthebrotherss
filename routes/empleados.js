const express = require('express');
const router = express.Router();
const Empleado = require('../models/Empleado');

// Middleware: solo usuarios logueados
const requireLogin = (req, res, next) => {
  if (!req.session.user) return res.redirect('/auth/login');
  next();
};

// Mostrar todos los empleados
router.get('/', requireLogin, async (req, res) => {
  const empleados = await Empleado.find().sort({ fechaCreacion: -1 });
  res.render('empleados', { empleados });
});

// Agregar nuevo empleado
router.post('/', requireLogin, async (req, res) => {
  try {
    const { nombre, diaPago, diaDescanso, salarioSemanal, celular } = req.body;
    const nuevo = new Empleado({
      nombre: nombre.trim(),
      diaPago,
      diaDescanso,
      salarioSemanal: Number(salarioSemanal),
      celular: celular?.trim() || '',
      creadoPor: req.session.user.id
    });
    await nuevo.save();
    res.redirect('/empleados');
  } catch (err) {
    console.log(err);
    res.redirect('/empleados?error=1');
  }
});

// EDITAR EMPLEADO - MOSTRAR FORMULARIO
router.get('/editar/:id', requireLogin, async (req, res) => {
  try {
    const empleado = await Empleado.findById(req.params.id);
    if (!empleado) return res.redirect('/empleados');
    res.render('editar-empleado', { empleado });
  } catch (err) {
    res.redirect('/empleados');
  }
});

// EDITAR EMPLEADO - GUARDAR CAMBIOS
router.post('/editar/:id', requireLogin, async (req, res) => {
  try {
    await Empleado.findByIdAndUpdate(req.params.id, {
      nombre: req.body.nombre,
      diaPago: req.body.diaPago,
      diaDescanso: req.body.diaDescanso,
      salarioSemanal: Number(req.body.salarioSemanal),
      celular: req.body.celular || ''
    });
    res.redirect('/empleados');
  } catch (err) {
    res.redirect('/empleados');
  }
});

// ELIMINAR EMPLEADO
router.get('/eliminar/:id', requireLogin, async (req, res) => {
  try {
    await Empleado.findByIdAndDelete(req.params.id);
    res.redirect('/empleados');
  } catch (err) {
    res.redirect('/empleados');
  }
});

module.exports = router;