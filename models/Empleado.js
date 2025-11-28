const mongoose = require('mongoose');

const empleadoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  diaPago: { type: String, required: true },        // ej: "Lunes"
  diaDescanso: { type: String, required: true },    // ej: "Domingo"
  salarioSemanal: { type: Number, required: true },
  celular: { type: String, default: '' },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  fechaCreacion: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Empleado', empleadoSchema);