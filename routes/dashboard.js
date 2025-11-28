// routes/dashboard.js
const express = require('express');
const router = express.Router();
const Empleado = require('../models/Empleado');
const Asistencia = require('../models/Asistencia');

const requireLogin = (req, res, next) => {
  if (!req.session.user) return res.redirect('/auth/login');
  next();
};

router.get('/', requireLogin, async (req, res) => {
  try {
    // ====== FEEDBACK DE GUARDADO / ERROR ======
    const { guardado, error } = req.query;

    const mensajeExito = guardado === '1'
      ? '✅ Asistencia guardada correctamente.'
      : null;

    const mensajeError = error === '1'
      ? '❌ Hubo un problema al guardar la asistencia. Inténtalo de nuevo.'
      : null;

    // ====== FECHA SELECCIONADA O HOY ======
    let fechaSeleccionada = req.query.fecha;
    if (!fechaSeleccionada) {
      const hoy = new Date();
      hoy.setHours(hoy.getHours() - 5); // pequeño ajuste horario
      fechaSeleccionada = hoy.toISOString().split('T')[0];
    }

    const fecha = new Date(fechaSeleccionada + 'T12:00:00');
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    const diaSemana = dias[fecha.getDay()];
    const diaActual = dias[fecha.getDay()];

    const fechaFormateada = fecha.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).replace(/ de /g, ' ').replace(/^\w/, c => c.toUpperCase());

    // ====== EMPLEADOS / COBRA / DESCANSA ======
    const empleados = await Empleado.find();

    const cobraHoy = empleados.filter(e => e.diaPago === diaActual);
    const descansaHoy = empleados.filter(e => e.diaDescanso === diaActual);

    const turnos = [
      { value: '08:00-16:00', text: '8:00am - 4:00pm' },
      { value: '11:30-19:30', text: '11:30am - 7:30pm' },
      { value: '13:00-21:00', text: '1:00pm - 9:00pm' },
      { value: 'personalizado', text: 'Personalizado' }
    ];

    // ====== LEER ASISTENCIA GUARDADA PARA ESA FECHA ======
    const fechaInicio = new Date(fechaSeleccionada + 'T00:00:00');
    const fechaFin    = new Date(fechaSeleccionada + 'T23:59:59');

    const asistencias = await Asistencia.find({
      fecha: { $gte: fechaInicio, $lte: fechaFin }
    }).lean();

    // Mapa: { empleadoId: asistenciaDeEseDia }
    const asistenciaPorEmpleado = {};
    asistencias.forEach(a => {
      asistenciaPorEmpleado[a.empleado.toString()] = a;
    });

res.render('dashboard', {
  user: req.session.user,
  fechaSeleccionada,
  diaSemana,
  fechaFormateada,
  cobraHoy,
  descansaHoy,
  empleados,
  diaActual,
  turnos,
  mensajeExito,
  mensajeError,
  asistenciaPorEmpleado,
  activePage: 'dashboard'
});


  } catch (err) {
    console.error('Error en dashboard:', err);
    res.redirect('/empleados');
  }
});

module.exports = router;
