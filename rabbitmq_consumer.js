const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE_NAME = 'banking.events';
const QUEUE_NAME = 'reportes.eventos.queue';
// Escucha CUALQUIER evento de transaccion (multimoneda, cuenta, retiro) --
// simula que el servicio de reportes se entera cuando algo cambia, para
// saber que un estado de cuenta podria necesitar regenerarse.
const ROUTING_PATTERN = 'transaction.*';

// Retraso artificial (en milisegundos) ANTES de confirmar cada mensaje.
// En 0 (por defecto), el consumidor procesa casi instantaneo. Subelo
// temporalmente (ej. 2000) para simular un consumidor lento y provocar
// a proposito que la cola se sature con una rafaga de transacciones --
// es el mismo mecanismo que ya usamos en el sandbox original de Docker
// Compose (PROBABILIDAD_ATASCO), ahora contra el RabbitMQ real.
const RETRASO_ARTIFICIAL_MS = parseInt(process.env.CONSUMER_DELAY_MS || '0', 10);

function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectRabbitMQConsumer() {
    const conexion = await amqp.connect(RABBITMQ_URL);
    const canal = await conexion.createChannel();

    await canal.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    await canal.assertQueue(QUEUE_NAME, { durable: true });
    await canal.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_PATTERN);
    canal.prefetch(1);

    console.log(`[RabbitMQ] Connected and exchange asserted: ${EXCHANGE_NAME}`);
    console.log(
        `[Consumer-reportes] Escuchando cola "${QUEUE_NAME}" para el patron "${ROUTING_PATTERN}" ` +
        `(retraso artificial: ${RETRASO_ARTIFICIAL_MS}ms)`
    );

    conexion.on('close', () => {
        console.error('[RabbitMQ] Conexion cerrada inesperadamente');
    });

    canal.consume(QUEUE_NAME, async (msg) => {
        if (msg === null) return;
        try {
            const contenido = JSON.parse(msg.content.toString());
            console.log(
                `[Consumer-reportes] Evento recibido [${msg.fields.routingKey}] -- ` +
                `posible regeneracion de reporte para cuenta relacionada:`,
                contenido
            );

            if (RETRASO_ARTIFICIAL_MS > 0) {
                await esperar(RETRASO_ARTIFICIAL_MS);
            }

            canal.ack(msg);
        } catch (err) {
            console.error('[Consumer-reportes] Error procesando mensaje:', err.message);
            // No se reintenta indefinidamente: se descarta el mensaje malformado
            // en vez de dejarlo atascado en la cola para siempre.
            canal.nack(msg, false, false);
        }
    });
}

module.exports = { connectRabbitMQConsumer };

