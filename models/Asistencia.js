// models/Asistencia.js
const mongoose = require('mongoose');

const asistenciaSchema = new mongoose.Schema({
  empleado: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Empleado',
    required: true,
  },
  fecha: {
    type: Date,
    required: true,
  },
  turno: {
    type: String,
    default: '',
  },
  llegada: {
    type: String, // "HH:MM"
    default: '',
  },
  salida: {
    type: String, // "HH:MM"
    default: '',
  },
  adelanto: {
    type: Number,
    default: 0,
  },
  horas: {
    type: Number,
    default: 0,
  },
  extras: {
    type: Number,
    default: 0,
  },
  falta: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Un registro por empleado+fecha
asistenciaSchema.index({ empleado: 1, fecha: 1 }, { unique: true });

module.exports = mongoose.model('Asistencia', asistenciaSchema);
