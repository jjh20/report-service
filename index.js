require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const Account = require('./Account');
const Transferencia = require('./Transferencia');

const app = express();
app.use(express.json());

const PUERTO = process.env.PORT || 3000;
// Limite de seguridad para no permitir que alguien pida un reporte con
// millones de movimientos y tumbe el servicio sin querer.
const MAX_MOVIMIENTOS_PERMITIDOS = parseInt(process.env.MAX_MOVIMIENTOS_PERMITIDOS || '5000', 10);

console.log('URI:', process.env.MONGO_URI);
mongoose.connect(process.env.MONGO_URI || 'mongodb://mongodb:27017/bankdb?retryWrites=false')
    .then(() => {
        console.log('MongoDB conectado exitosamente');
        app.listen(PUERTO, () => console.log(`Servicio de reportes corriendo en puerto ${PUERTO}`));
    })
    .catch(err => console.error('Error de conexión:', err));

mongoose.connection.on('disconnected', () => {
    console.error('[Mongo] Desconectado - el servicio esta operando sin base de datos');
});

mongoose.connection.on('reconnected', () => {
    console.log('[Mongo] Reconectado exitosamente - servicio recuperado');
});

// Ruta de prueba
app.get('/test', (req, res) => res.json({ status: 'OK', message: 'Servicio de reportes operativo' }));

/**
 * Genera movimientos sinteticos adicionales para completar el reporte
 * hasta la cantidad solicitada -- esto es lo que permite provocar carga
 * de CPU real y controlable: mientras mas movimientos se pidan, mas
 * tarda en generarse el PDF (mas paginas, mas texto a dibujar).
 */
function generarMovimientoSintetico(indice) {
    const monedas = ['DOP', 'USD'];
    return {
        fecha: new Date(Date.now() - indice * 3600_000),
        descripcion: `Movimiento sintetico #${indice} - conciliacion interna`,
        monto: Math.round((Math.random() * 5000 + 10) * 100) / 100,
        moneda: monedas[indice % 2],
    };
}

// 1. Reporte completo en PDF (endpoint pesado, uso real de CPU)
app.get('/reporte/:accountNumber', async (req, res) => {
    try {
        const { accountNumber } = req.params;
        const cantidadMovimientos = Math.min(
            parseInt(req.query.movimientos, 10) || 20,
            MAX_MOVIMIENTOS_PERMITIDOS
        );

        const cuenta = await Account.findOne({ accountNumber });
        if (!cuenta) {
            return res.status(404).json({ error: 'Cuenta no existe' });
        }

        const movimientosReales = await Transferencia.find({
            $or: [{ cuentaOrigen: accountNumber }, { cuentaDestino: accountNumber }],
        }).sort({ fecha: -1 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="estado_cuenta_${accountNumber}.pdf"`);

        const doc = new PDFDocument({ margin: 40 });
        doc.pipe(res);

        doc.fontSize(18).text('Estado de Cuenta', { align: 'center' });
        doc.moveDown();
        doc.fontSize(11);
        doc.text(`Cuenta: ${cuenta.accountNumber}`);
        doc.text(`Titular: ${cuenta.owner}`);
        doc.text(`Balance actual: ${cuenta.balance}`);
        doc.text(`Fecha de generacion: ${new Date().toISOString()}`);
        doc.moveDown();
        doc.fontSize(13).text('Movimientos', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(9);

        // Movimientos reales primero
        for (const mov of movimientosReales) {
            doc.text(
                `${mov.fecha.toISOString()} | ${mov.cuentaOrigen} -> ${mov.cuentaDestino} | ` +
                `${mov.montoOrigen} ${mov.monedaOrigen} -> ${mov.montoDestino} ${mov.monedaDestino} | ${mov.estado}`
            );
        }

        // Movimientos sinteticos para completar la cantidad solicitada --
        // esto es lo que genera carga de CPU real y controlable.
        const faltantes = Math.max(0, cantidadMovimientos - movimientosReales.length);
        for (let i = 0; i < faltantes; i++) {
            const mov = generarMovimientoSintetico(i);
            doc.text(
                `${mov.fecha.toISOString()} | ${mov.descripcion} | ${mov.monto} ${mov.moneda}`
            );
        }

        doc.end();
    } catch (err) {
        console.error('[GET /reporte/:accountNumber] Error:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

// 2. Resumen liviano (JSON, sin generar PDF) -- para chequeos rapidos
app.get('/reporte/:accountNumber/resumen', async (req, res) => {
    try {
        const { accountNumber } = req.params;
        const cuenta = await Account.findOne({ accountNumber });
        if (!cuenta) {
            return res.status(404).json({ error: 'Cuenta no existe' });
        }
        const totalMovimientos = await Transferencia.countDocuments({
            $or: [{ cuentaOrigen: accountNumber }, { cuentaDestino: accountNumber }],
        });
        res.json({
            accountNumber: cuenta.accountNumber,
            owner: cuenta.owner,
            balance: cuenta.balance,
            totalMovimientos,
        });
    } catch (err) {
        console.error('[GET /reporte/:accountNumber/resumen] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
