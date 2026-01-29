const express = require('express');
const router = express.Router();
const Empleado = require('../models/Empleado');
const Asistencia = require('../models/Asistencia');

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

function startOfDayLocal(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function descansoPorPago(diaPago) {
  const idx = DIAS.indexOf(diaPago);
  if (idx === -1) return 'Domingo';
  return DIAS[(idx + 1) % 7];
}

// ===== Helpers para semanas individuales por empleado =====
function toInputDateString(date) {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day   = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatoDiaYFecha(date) {
  const opts = { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' };
  return date.toLocaleDateString('es-ES', opts);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dayIndexByName(diaNombre) {
  return DIAS.indexOf(diaNombre);
}

// Día de pago vigente para una fecha (usa historial schedules si existe).
function diaPagoVigente(emp, fechaLocal) {
  const schedules = Array.isArray(emp.schedules) ? emp.schedules : [];
  if (schedules.length === 0) return emp.diaPago;

  const target = startOfDayLocal(fechaLocal);
  let elegido = null;
  for (const s of schedules) {
    if (!s || !s.effectiveFrom || !s.diaPago) continue;
    const eff = startOfDayLocal(new Date(s.effectiveFrom));
    if (eff <= target) elegido = s;
  }
  return (elegido && elegido.diaPago) ? elegido.diaPago : emp.diaPago;
}

function nextPayDateFrom(refDateLocal, diaPago) {
  const idxPago = DIAS.indexOf(diaPago);
  if (idxPago === -1) return startOfDayLocal(refDateLocal);

  const base = startOfDayLocal(refDateLocal);
  const todayIdx = base.getDay();
  let delta = idxPago - todayIdx;
  if (delta < 0) delta += 7;
  // Si hoy es día de pago, delta=0 → el periodo pagado termina ayer, como tú lo manejas.
  const pay = new Date(base);
  pay.setDate(base.getDate() + delta);
  return startOfDayLocal(pay);
}

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

// VER SEMANA INDIVIDUAL DEL EMPLEADO
// La semana (corte) se define por el DÍA DE PAGO:
//   - payDate: día en que se paga
//   - periodo pagado: payDate-7 ... payDate-1
// El día de pago NO se paga (se acumula al siguiente corte), como lo manejas.
router.get('/semana/:id', requireLogin, async (req, res) => {
  try {
    const empleado = await Empleado.findById(req.params.id).lean();
    if (!empleado) return res.redirect('/empleados');

    // payDate (YYYY-MM-DD) opcional. Si no viene, usamos el próximo día de pago desde hoy.
    let payDate;
    if (req.query.payDate) {
      const d = new Date(req.query.payDate + 'T00:00:00');
      payDate = isNaN(d) ? null : startOfDayLocal(d);
    }

    const hoy = startOfDayLocal(new Date());
    const diaPagoHoy = diaPagoVigente(empleado, payDate || hoy);
    if (!payDate) payDate = nextPayDateFrom(hoy, diaPagoHoy);

    // Rango del corte
    const fin = addDays(payDate, -1);
    let inicio = addDays(payDate, -7);

    const fechaIngreso = empleado.fechaIngreso ? startOfDayLocal(new Date(empleado.fechaIngreso)) : null;
    if (fechaIngreso && inicio < fechaIngreso) inicio = fechaIngreso;

    // Día de descanso dentro de ESTE corte: es el día después del inicio del corte
    // (porque el inicio del corte coincide con el día de pago de la semana anterior).
    const descansoDate = addDays(addDays(payDate, -7), 1);

    // Traer asistencias del rango (solo las que existen)
    const asistencias = await Asistencia.find({
      empleado: empleado._id,
      fecha: {
        $gte: new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), 0, 0, 0),
        $lte: new Date(fin.getFullYear(), fin.getMonth(), fin.getDate(), 23, 59, 59, 999)
      }
    }).lean();

    const map = new Map();
    for (const a of asistencias) {
      const key = toInputDateString(startOfDayLocal(new Date(a.fecha)));
      map.set(key, a);
    }

    // Construir 7 días del corte original (payDate-7..payDate-1) aunque el empleado haya entrado después,
    // para que visualmente siempre sea "una semana".
    const corteInicioVisual = addDays(payDate, -7);
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(corteInicioVisual, i);
      const key = toInputDateString(d);
      const a = map.get(key) || null;
      const antesDeIngreso = fechaIngreso ? d < fechaIngreso : false;
      dias.push({
        fecha: d,
        fechaKey: key,
        etiqueta: formatoDiaYFecha(d),
        asistencia: a,
        esDescanso: toInputDateString(d) === toInputDateString(descansoDate),
        antesDeIngreso
      });
    }

    // Totales
    let totalHoras = 0;
    let totalExtras = 0;
    let totalAdelantos = 0;
    let totalFaltas = 0;
    let diasTrabajados = 0;

    for (const item of dias) {
      const a = item.asistencia;
      if (!a) continue;
      totalHoras += a.horas || 0;
      totalExtras += a.extras || 0;
      totalAdelantos += a.adelanto || 0;
      if (a.falta) totalFaltas++;
      if (!a.falta && (a.horas || 0) > 0) diasTrabajados++;
    }

    // ================== NUEVO: CÁLCULO DE CUÁNTO COBRA EN ESTE CORTE ==================
    // Basado en tu forma:
    // - Salario semanal se reparte en 7 días (incluye descanso)
    // - Semana estándar de trabajo: 6 días * 8 horas = 48 horas normales
    // - Extras: tarifa por hora * multiplicador
    // - Faltas: descuentan 1 día
    // - Adelantos: se descuentan directo
    const diasPorSemana = 7;                  // incluye descanso
    const horasPorDia = 8;
    const horasSemanaEstandar = 6 * horasPorDia; // 48 horas normales
    const MULTIPLICADOR_EXTRA = 1.2;          // ajusta a 1.5 si así lo manejas

    const salarioSemanal = Number(empleado.salarioSemanal || 0);
    const salarioDiario  = salarioSemanal / diasPorSemana;
    const salarioHora    = horasSemanaEstandar > 0 ? (salarioSemanal / horasSemanaEstandar) : 0;
    const tarifaExtra    = salarioHora * MULTIPLICADOR_EXTRA;

    const pagoHoras = totalHoras * salarioHora;
    const pagoExtras = totalExtras * tarifaExtra;

    const descuentoFaltas = totalFaltas * salarioDiario;
    const descuentoAdelantos = totalAdelantos;

    const totalPagar = pagoHoras + pagoExtras - descuentoFaltas - descuentoAdelantos;

    const pago = {
      salarioSemanal: Number(salarioSemanal.toFixed(2)),
      salarioDiario: Number(salarioDiario.toFixed(2)),
      salarioHora: Number(salarioHora.toFixed(2)),
      tarifaExtra: Number(tarifaExtra.toFixed(2)),
      pagoHoras: Number(pagoHoras.toFixed(2)),
      pagoExtras: Number(pagoExtras.toFixed(2)),
      descuentoFaltas: Number(descuentoFaltas.toFixed(2)),
      descuentoAdelantos: Number(descuentoAdelantos.toFixed(2)),
      totalPagar: Number(totalPagar.toFixed(2))
    };
    // ================== FIN NUEVO ==================

    res.render('empleado-semana', {
      empleado,
      payDate,
      diaPago: diaPagoHoy,
      diaDescanso: descansoPorPago(diaPagoHoy),
      rango: {
        inicio: corteInicioVisual,
        fin,
        etiqueta: `Del ${toInputDateString(corteInicioVisual)} al ${toInputDateString(fin)} (se paga ${toInputDateString(payDate)})`
      },
      nav: {
        prevPayDate: toInputDateString(addDays(payDate, -7)),
        nextPayDate: toInputDateString(addDays(payDate, 7))
      },
      dias,
      totales: {
        horas: totalHoras,
        extras: totalExtras,
        adelantos: totalAdelantos,
        faltas: totalFaltas,
        diasTrabajados
      },
      pago // <<< NUEVO: enviamos el desglose a la vista
    });
  } catch (err) {
    console.error('Error ver semana empleado:', err);
    res.redirect('/empleados');
  }
});

// Agregar nuevo empleado
router.post('/', requireLogin, async (req, res) => {
  try {
    const { nombre, diaPago, salarioSemanal, celular, fechaIngreso } = req.body;

    // fechaIngreso viene como "YYYY-MM-DD". Normalizamos a inicio de día local.
    let fechaIngresoDate = null;
    if (fechaIngreso) {
      const d = new Date(fechaIngreso + 'T00:00:00');
      if (!isNaN(d)) fechaIngresoDate = startOfDayLocal(d);
    }

    if (!fechaIngresoDate) fechaIngresoDate = startOfDayLocal(new Date());

    const diaDescanso = descansoPorPago(diaPago);

    const nuevo = new Empleado({
      nombre: nombre.trim(),
      diaPago,
      diaDescanso,
      fechaIngreso: fechaIngresoDate,
      schedules: [{ effectiveFrom: fechaIngresoDate, diaPago }],
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
    const updates = {
      nombre: req.body.nombre,
      diaPago: req.body.diaPago,
      diaDescanso: descansoPorPago(req.body.diaPago),
      salarioSemanal: Number(req.body.salarioSemanal),
      celular: req.body.celular || ''
    };

    // fechaIngreso opcional (normalmente NO se cambia)
    if (req.body.fechaIngreso) {
      const d = new Date(req.body.fechaIngreso + 'T00:00:00');
      if (!isNaN(d)) updates.fechaIngreso = startOfDayLocal(d);
    }

    // Si cambian diaPago y quieren que aplique "desde hoy", lo registramos en historial.
    // Para no romper periodos viejos, agregamos un schedule nuevo con effectiveFrom.
    // Si el usuario no manda effectiveFromSchedule, usamos hoy.
    if (req.body.effectiveFromSchedule && req.body.diaPago) {
      const d = new Date(req.body.effectiveFromSchedule + 'T00:00:00');
      if (!isNaN(d)) {
        const emp = await Empleado.findById(req.params.id);
        if (emp) {
          const eff = startOfDayLocal(d);
          emp.schedules = Array.isArray(emp.schedules) ? emp.schedules : [];
          const diaPagoNuevo = req.body.diaPago;
          const diaPagoActual = emp.diaPago;
          // Solo agrega historial si realmente cambió el día de pago,
          // o si no existe historial aún.
          if (diaPagoNuevo !== diaPagoActual || emp.schedules.length === 0) {
            emp.schedules.push({ effectiveFrom: eff, diaPago: diaPagoNuevo });
          }
          // Ordenar por fecha
          emp.schedules.sort((a, b) => new Date(a.effectiveFrom) - new Date(b.effectiveFrom));
          // También mantener campos rápidos
          emp.nombre = updates.nombre;
          emp.diaPago = updates.diaPago;
          emp.diaDescanso = updates.diaDescanso;
          if (updates.fechaIngreso) emp.fechaIngreso = updates.fechaIngreso;
          emp.salarioSemanal = updates.salarioSemanal;
          emp.celular = updates.celular;
          await emp.save();
          return res.redirect('/empleados');
        }
      }
    }

    await Empleado.findByIdAndUpdate(req.params.id, updates);
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
