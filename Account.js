const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
    accountNumber: { type: String, required: true, unique: true },
    owner: { type: String, required: true },
    balance: { type: Number, required: true, default: 0 },
});

module.exports = mongoose.model('Account', accountSchema);