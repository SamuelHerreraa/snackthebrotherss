// routes/asistencia.js
const express = require('express');
const router = express.Router();
const Asistencia = require('../models/Asistencia');

// Middleware simple de login (igualito al de dashboard)
const requireLogin = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
};

// POST /asistencia/guardar
router.post('/guardar', requireLogin, async (req, res) => {
  try {
    const { fecha } = req.body; // "2025-11-28"

    if (!fecha) {
      // Si no viene fecha, regresamos con error
      return res.redirect('/dashboard?error=1');
    }

    // Normalizamos la fecha (medio día para evitar pedos de timezone)
    const fechaDia = new Date(fecha + 'T12:00:00');

    // Detectamos los índices: empleado_id_0, empleado_id_1, etc.
    const indices = Object.keys(req.body)
      .filter(key => key.startsWith('empleado_id_'))
      .map(key => key.replace('empleado_id_', ''));

    const operaciones = indices.map(async (i) => {
      const empleadoId = req.body[`empleado_id_${i}`];
      if (!empleadoId) return;

      const turno   = req.body[`turno_${i}`]   || '';
      const llegada = req.body[`llegada_${i}`] || '';
      const salida  = req.body[`salida_${i}`]  || '';

      const adelanto = Number(req.body[`adelanto_${i}`] || 0);
      const horas    = Number(req.body[`horas_${i}`]    || 0);
      const extras   = Number(req.body[`extras_${i}`]   || 0);

      // checkbox: si está marcado viene "on", si no, no viene nada
      const falta = !!req.body[`falta_${i}`];

      const data = {
        empleado: empleadoId,
        fecha: fechaDia,
        turno,
        llegada,
        salida,
        adelanto: falta ? 0 : adelanto,
        horas: falta ? 0 : horas,
        extras: falta ? 0 : extras,
        falta,
      };

      await Asistencia.findOneAndUpdate(
        { empleado: empleadoId, fecha: fechaDia },
        { $set: data },
        { upsert: true, new: true }
      );
    });

    await Promise.all(operaciones);

    // OK → volvemos al dashboard con mensaje de éxito
    return res.redirect(`/dashboard?fecha=${fecha}&guardado=1`);

  } catch (error) {
    console.error('Error guardando asistencia:', error);
    const fecha = req.body.fecha || '';
    // Error → volvemos con flag de error
    return res.redirect(`/dashboard?fecha=${fecha}&error=1`);
  }
});

module.exports = router;
