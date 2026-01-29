// scripts/migrate_empleado_reglas.js
// Migración para pasar de `semanaInicio` a `fechaIngreso` + `schedules`.
// - fechaIngreso: se toma de semanaInicio (si existe) o fechaCreacion.
// - schedules: se inicializa con { effectiveFrom: fechaIngreso, diaPago }
// - diaDescanso: se recalcula como el día posterior al día de pago.
// Uso:
//   node scripts/migrate_empleado_reglas.js

require('dotenv').config();
const mongoose = require('mongoose');
const Empleado = require('../models/Empleado');

const DIAS = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];

function startOfDayLocal(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function descansoPorPago(diaPago) {
  const idx = DIAS.indexOf(diaPago);
  if (idx === -1) return 'Domingo';
  return DIAS[(idx + 1) % 7];
}

(async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
      console.error('❌ Falta MONGO_URI (o MONGODB_URI) en .env');
      process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('✅ Conectado a MongoDB');

    const empleados = await Empleado.find();
    console.log(`Encontrados ${empleados.length} empleados.`);

    let updated = 0;
    for (const emp of empleados) {
      // fechaIngreso
      let base = null;
      if (emp.semanaInicio) base = startOfDayLocal(new Date(emp.semanaInicio));
      else if (emp.fechaIngreso) base = startOfDayLocal(new Date(emp.fechaIngreso));
      else if (emp.fechaCreacion) base = startOfDayLocal(new Date(emp.fechaCreacion));
      else base = startOfDayLocal(new Date());

      emp.fechaIngreso = base;

      // schedules
      emp.schedules = Array.isArray(emp.schedules) ? emp.schedules : [];
      if (emp.schedules.length === 0) {
        emp.schedules.push({ effectiveFrom: base, diaPago: emp.diaPago });
      }
      emp.schedules.sort((a, b) => new Date(a.effectiveFrom) - new Date(b.effectiveFrom));

      // descanso
      emp.diaDescanso = descansoPorPago(emp.diaPago);

      // Limpieza opcional: si existía semanaInicio como campo viejo, lo dejamos (no rompe),
      // pero si quieres eliminarlo del documento, descomenta:
      // emp.semanaInicio = undefined;

      await emp.save();
      updated++;
    }

    console.log(`✅ Migración lista. Actualizados: ${updated}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error('❌ Error en migración:', e);
    process.exit(1);
  }
})();
