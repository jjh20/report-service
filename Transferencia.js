const mongoose = require('mongoose');

// Mismo esquema que microservicio-multimoneda -- este servicio solo LEE
// esta coleccion, nunca crea ni modifica transferencias.
const transferenciaSchema = new mongoose.Schema({
    cuentaOrigen: { type: String, required: true },
    cuentaDestino: { type: String, required: true },
    montoOrigen: { type: Number, required: true },
    montoDestino: { type: Number, required: true },
    monedaOrigen: { type: String, required: true },
    monedaDestino: { type: String, required: true },
    tasaCambioAplicada: { type: Number, required: true },
    estado: { type: String, required: true },
    motivoRechazo: { type: String },
    fecha: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Transferencia', transferenciaSchema);