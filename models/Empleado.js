const mongoose = require('mongoose');

// Historial de reglas de pago por empleado.
// Permite cambiar el día de pago en el futuro SIN afectar periodos ya pagados.
const empleadoScheduleSchema = new mongoose.Schema(
  {
    // Fecha (local) desde la cual aplica esta regla.
    // Recomendación: guardar como inicio de día (00:00 local).
    effectiveFrom: { type: Date, required: true },
    // Día de pago: "Lunes", "Martes", ...
    diaPago: { type: String, required: true },
  },
  { _id: false }
);

const empleadoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },

  // Regla actual (se mantiene por compatibilidad con UI/consultas rápidas).
  // La nómina se calcula usando schedules (si existen).
  diaPago: { type: String, required: true },

  // Tu regla de negocio: se descansa el día DESPUÉS del día de pago.
  // Este campo se guarda para mostrar y para compatibilidad, pero se puede recalcular.
  diaDescanso: { type: String, required: true },

  // Fecha de ingreso/alta del empleado (solo se usa para evitar calcular semanas antes de existir).
  fechaIngreso: { type: Date, default: Date.now },

  // Historial de reglas de pago (opcional, pero recomendado).
  schedules: { type: [empleadoScheduleSchema], default: [] },

  salarioSemanal: { type: Number, required: true },
  celular: { type: String, default: '' },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  fechaCreacion: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Empleado', empleadoSchema);
