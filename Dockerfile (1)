const mongoose = require('mongoose');

// Mismo esquema que los demas microservicios -- comparten la coleccion
// "accounts" en la base "banking". Este servicio es de SOLO LECTURA.
const accountSchema = new mongoose.Schema({
    accountNumber: { type: String, required: true, unique: true },
    owner: { type: String, required: true },
    balance: { type: Number, required: true, default: 0 },
});

module.exports = mongoose.model('Account', accountSchema);
