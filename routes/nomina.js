// routes/nomina.js
const express = require('express');
const router = express.Router();
const Empleado = require('../models/Empleado');
const Asistencia = require('../models/Asistencia');

const requireLogin = (req, res, next) => {
  if (!req.session.user) return res.redirect('/auth/login');
  next();
};

// Helpers
function toInputDateString(date) {
  // Usar fecha LOCAL, no UTC
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day   = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatoRangoFechas(inicio, fin) {
  const opts = { day: '2-digit', month: 'long', year: 'numeric' };
  const ini = inicio.toLocaleDateString('es-ES', opts);
  const fn  = fin.toLocaleDateString('es-ES', opts);
  return `Del ${ini} al ${fn}`;
}

function formatoDiaYFecha(date) {
  const opts = { weekday: 'short', day: '2-digit', month: '2-digit' };
  return date.toLocaleDateString('es-ES', opts);
}

// Normaliza un Date a inicio de día LOCAL
function startOfDayLocal(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Días en español (getDay: 0=Dom..6=Sab)
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

function descansoPorPago(diaPago) {
  const idx = DIAS.indexOf(diaPago);
  if (idx === -1) return 'Domingo';
  return DIAS[(idx + 1) % 7];
}

// Obtiene el día de pago que aplica a una fecha (por historial schedules).
// Obtiene el día de pago vigente para una fecha dada usando historial (schedules).
function diaPagoVigente(emp, fechaLocal) {
  const schedules = Array.isArray(emp.schedules) ? emp.schedules : [];
  if (schedules.length === 0) return emp.diaPago;

  const target = startOfDayLocal(fechaLocal);
  // Tomar el último effectiveFrom <= target
  let elegido = null;
  for (const s of schedules) {
    if (!s || !s.effectiveFrom || !s.diaPago) continue;
    const eff = startOfDayLocal(new Date(s.effectiveFrom));
    if (eff <= target) elegido = s;
  }
  return (elegido && elegido.diaPago) ? elegido.diaPago : emp.diaPago;
}

router.get('/', requireLogin, async (req, res) => {
  try {
    let { inicio, fin, view, empleadoId, corteFecha } = req.query;
    view = view || 'nomina';


    // ====== RANGO DE FECHAS (SEMANA PARA REPORTES) ======
    let fechaInicio, fechaFin;

    if (!inicio || !fin) {
      // Semana actual (lunes a domingo) usando hora local
      const hoy = new Date();
      const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

      const day = hoySinHora.getDay(); // 0=Dom,1=Lun,...6=Sab
      const diffToMonday = day === 0 ? -6 : 1 - day;

      fechaInicio = new Date(hoySinHora);
      fechaInicio.setDate(hoySinHora.getDate() + diffToMonday);
      fechaInicio.setHours(0, 0, 0, 0);

      fechaFin = new Date(fechaInicio);
      fechaFin.setDate(fechaInicio.getDate() + 6);
      fechaFin.setHours(23, 59, 59, 999);

      inicio = toInputDateString(fechaInicio);
      fin    = toInputDateString(fechaFin);
    } else {
      fechaInicio = new Date(inicio + 'T00:00:00');
      fechaFin    = new Date(fin    + 'T23:59:59');
    }

    const etiquetaSemana = formatoRangoFechas(fechaInicio, fechaFin);

    // ====== EMPLEADOS Y ASISTENCIA DEL PERIODO (REPORTES) ======
    const empleados = await Empleado.find().sort({ nombre: 1 });
    const asistenciasSemana = await Asistencia.find({
      fecha: { $gte: fechaInicio, $lte: fechaFin }
    }).lean();

    const asistPorEmpleadoSemana = {};
    asistenciasSemana.forEach(a => {
      const id = a.empleado.toString();
      if (!asistPorEmpleadoSemana[id]) asistPorEmpleadoSemana[id] = [];
      asistPorEmpleadoSemana[id].push(a);
    });

        // ====== PARÁMETROS GENERALES DE NÓMINA ======
        const diasPorSemana = 7;              // 7 días (incluye descanso pagado)
        const horasPorDia = 8;
        // 6 días trabajados x 8 horas = 48 horas reales de trabajo
        const horasSemanaEstandar = 6 * horasPorDia; // 48
        const MULTIPLICADOR_EXTRA = 1.2;      // horas extra al 50% más



    const diasSemanaNombres = DIAS;

    // ====== RESUMEN NÓMINA (SEMANA DE FILTRO) ======
    const resumenNomina = empleados.map(emp => {
      const lista = asistPorEmpleadoSemana[emp._id.toString()] || [];

      let totalHoras = 0;
      let totalExtras = 0;
      let totalAdelantos = 0;
      let totalFaltas = 0;
      let totalRetardos = 0;

      lista.forEach(a => {
        totalHoras     += a.horas   || 0;
        totalExtras    += a.extras  || 0;
        totalAdelantos += a.adelanto || 0;
        if (a.falta) totalFaltas++;
        if (a.retardo) totalRetardos++;
      });

      const salarioSemanal = emp.salarioSemanal || 0;
      const salarioDiario  = salarioSemanal / diasPorSemana;
      const salarioHora    = salarioSemanal / horasSemanaEstandar;
      const tarifaExtra    = salarioHora * MULTIPLICADOR_EXTRA;

      const pagoHoras   = totalHoras * salarioHora;
      const pagoExtras  = totalExtras * tarifaExtra;
      const descAdel    = totalAdelantos;
      const descFaltas  = totalFaltas * salarioDiario;
      const totalPagar  = pagoHoras + pagoExtras - descAdel - descFaltas;

      return {
        empleadoId: emp._id.toString(),
        nombre: emp.nombre,
        salarioSemanal,
        salarioDiario: Number(salarioDiario.toFixed(2)),
        salarioHora: Number(salarioHora.toFixed(2)),
        tarifaExtra: Number(tarifaExtra.toFixed(2)),
        horas: totalHoras,
        extras: totalExtras,
        adelantos: totalAdelantos,
        faltas: totalFaltas,
        retardos: totalRetardos,
        pagoHoras: Number(pagoHoras.toFixed(2)),
        pagoExtras: Number(pagoExtras.toFixed(2)),
        descuentoAdelantos: Number(descAdel.toFixed(2)),
        descuentoFaltas: Number(descFaltas.toFixed(2)),
        totalPagar: Number(totalPagar.toFixed(2)),
      };
    });

    const totalesNomina = resumenNomina.reduce((acc, r) => {
      acc.horas     += r.horas;
      acc.extras    += r.extras;
      acc.adelantos += r.adelantos;
      acc.faltas    += r.faltas;
      acc.pagoHoras += r.pagoHoras;
      acc.pagoExtras += r.pagoExtras;
      acc.descuentoAdelantos += r.descuentoAdelantos;
      acc.descuentoFaltas    += r.descuentoFaltas;
      acc.totalPagar += r.totalPagar;
      return acc;
    }, {
      horas: 0,
      extras: 0,
      adelantos: 0,
      faltas: 0,
      pagoHoras: 0,
      pagoExtras: 0,
      descuentoAdelantos: 0,
      descuentoFaltas: 0,
      totalPagar: 0
    });

    // ====== CORTE DE PAGO (SOLO EMPLEADOS QUE COBRAN EN FECHA SELECCIONADA) ======

    // 1) Determinar la fecha base de corte (seleccionada o hoy)
    let corteBaseDate;
    if (corteFecha) {
      corteBaseDate = new Date(corteFecha + 'T00:00:00');
      if (isNaN(corteBaseDate)) corteBaseDate = new Date();
    } else {
      corteBaseDate = new Date();
    }

    const corteSinHora = new Date(
      corteBaseDate.getFullYear(),
      corteBaseDate.getMonth(),
      corteBaseDate.getDate()
    );
    const nombreDiaCorte = diasSemanaNombres[corteSinHora.getDay()];

    const corteFechaTexto = corteSinHora.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const cortePagoEmpleados = [];

    for (const emp of empleados) {
      // Solo empleados cuyo día de pago VIGENTE coincide con la fecha de corte seleccionada
      const diaPagoEmp = diaPagoVigente(emp, corteSinHora);
      if (diaPagoEmp !== nombreDiaCorte) continue;

      // 2) Fin del corte = día anterior a la fecha de corte (no se paga el mismo día)
      const finCorte = new Date(corteSinHora);
      finCorte.setDate(corteSinHora.getDate() - 1);
      finCorte.setHours(23, 59, 59, 999);

      // 3) Inicio del corte (tu regla): 7 días previos al día de pago.
      //    Ej: paga Lunes 19 → se paga del Lunes 12 al Domingo 18.
      let inicioCorte = new Date(corteSinHora);
      inicioCorte.setDate(inicioCorte.getDate() - 7);
      inicioCorte = startOfDayLocal(inicioCorte);

      // Respetar fechaIngreso (no contar nada antes de que exista el empleado)
      if (emp.fechaIngreso) {
        const base = startOfDayLocal(new Date(emp.fechaIngreso));
        if (inicioCorte < base) inicioCorte = base;
      }

      const diaDescansoVigente = descansoPorPago(diaPagoEmp);

      // 4) Buscar asistencia de ese periodo
      const registros = await Asistencia.find({
        empleado: emp._id,
        fecha: { $gte: inicioCorte, $lte: finCorte }
      }).lean();

      let horasPeriodo = 0;
      let extrasPeriodo = 0;
      let adelantosPeriodo = 0;
      let faltasPeriodo = 0;
      const adelantosDetalle = [];
      const faltasDetalle = [];

      registros.forEach(a => {
        const f = new Date(a.fecha);
        const diaNombreReg = diasSemanaNombres[f.getDay()];

        let horasCalc = 0;
        let extrasCalc = 0;

        // Recalcular horas a partir de llegada/salida si están presentes
        if (a.llegada && a.salida && a.llegada.includes(':') && a.salida.includes(':')) {
          const [lh, lm] = a.llegada.split(':').map(Number);
          const [sh, sm] = a.salida.split(':').map(Number);
          let minutos = (sh * 60 + sm) - (lh * 60 + lm);

          if (!isNaN(minutos) && minutos > 0) {
            let horasTrabajadas = minutos / 60;
            horasTrabajadas = Math.round(horasTrabajadas * 100) / 100;

            if (diaDescansoVigente === diaNombreReg) {
              // Día de descanso → todo a extras
              horasCalc = 0;
              extrasCalc = horasTrabajadas;
            } else {
              // Día normal → hasta 8 horas normales, resto extra
              if (horasTrabajadas <= 8) {
                horasCalc = horasTrabajadas;
                extrasCalc = 0;
              } else {
                horasCalc = 8;
                extrasCalc = Math.round((horasTrabajadas - 8) * 100) / 100;
              }
            }
          }
        } else {
          // Sin llegada/salida: usamos los campos guardados
          horasCalc = a.horas || 0;
          extrasCalc = a.extras || 0;
        }

        horasPeriodo   += horasCalc;
        extrasPeriodo  += extrasCalc;
        adelantosPeriodo += a.adelanto || 0;

        if (a.adelanto && a.adelanto > 0) {
          adelantosDetalle.push({
            fecha: formatoDiaYFecha(f),
            monto: a.adelanto
          });
        }
        if (a.falta) {
          faltasPeriodo++;
          faltasDetalle.push({
            fecha: formatoDiaYFecha(f)
          });
        }
      });

      const salarioSemanal = emp.salarioSemanal || 0;
      const salarioDiario  = salarioSemanal / diasPorSemana;
      const salarioHora    = salarioSemanal / horasSemanaEstandar;
      const tarifaExtra    = salarioHora * MULTIPLICADOR_EXTRA;

      const pagoHorasPeriodo  = horasPeriodo  * salarioHora;
      const pagoExtrasPeriodo = extrasPeriodo * tarifaExtra;
      const descFaltasPeriodo = faltasPeriodo * salarioDiario;

      // Total a pagar SIN bonos, solo horas, extras, adelantos y faltas
      const totalPagarPeriodo =
        pagoHorasPeriodo +
        pagoExtrasPeriodo -
        adelantosPeriodo -
        descFaltasPeriodo;

      cortePagoEmpleados.push({
        nombre: emp.nombre,
        inicioTexto: toInputDateString(inicioCorte),
        finTexto:    toInputDateString(finCorte),
        horas: horasPeriodo,
        extras: extrasPeriodo,
        adelantos: adelantosPeriodo,
        adelantosDetalle,
        faltas: faltasPeriodo,
        faltasDetalle,
        pagoHoras:        Number(pagoHorasPeriodo.toFixed(2)),
        pagoExtras:       Number(pagoExtrasPeriodo.toFixed(2)),
        descuentoFaltas:  Number(descFaltasPeriodo.toFixed(2)),
        totalPagar:       Number(totalPagarPeriodo.toFixed(2))
      });

    }


    // ====== HISTORIAL POR EMPLEADO (TAB 3) ======
    let historialEmpleado = [];
    let empleadoSeleccionado = null;

    if (view === 'historial' && empleadoId) {
      empleadoSeleccionado = empleados.find(e => e._id.toString() === empleadoId) || null;

      const lista = asistPorEmpleadoSemana[empleadoId] || [];
      historialEmpleado = lista
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
        .map(a => {
          const f = new Date(a.fecha);
          const fechaTexto = f.toLocaleDateString('es-ES', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          });
          return {
            fechaTexto,
            turno: a.turno || '',
            llegada: a.llegada || '',
            salida: a.salida || '',
            horas: a.horas || 0,
            extras: a.extras || 0,
            adelanto: a.adelanto || 0,
            falta: !!a.falta
          };
        });
    }

    res.render('nomina', {
      user: req.session.user,
      view,
      fechaInicioInput: inicio,
      fechaFinInput: fin,
      etiquetaSemana,
      resumenNomina,
      totalesNomina,
      empleados,
      empleadoSeleccionadoId: empleadoId || '',
      empleadoSeleccionadoNombre: empleadoSeleccionado ? empleadoSeleccionado.nombre : '',
      historialEmpleado,
      // Corte de pago
      corteFechaTexto,
      cortePagoEmpleados,
      corteFechaInput: corteFecha || toInputDateString(corteSinHora)
    });


  } catch (err) {
    console.error('Error en /nomina:', err);
    res.redirect('/dashboard');
  }
});

module.exports = router;
