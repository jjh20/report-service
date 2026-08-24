// consumer.js -- Consumidor de reportes. Escucha DEV.QUEUE.4, una cola
// DEDICADA para este microservicio -- distinta a las de banking-git,
// multimoneda, y consulta-cuenta, para no competir por los mismos
// mensajes.
//
// Mantiene el retraso artificial configurable del original (RETRASO_
// ARTIFICIAL_MS) -- util para simular un consumidor lento y provocar a
// proposito que la cola se acumule con una rafaga de transacciones,
// igual que se hacia con RabbitMQ.

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const IBM_MQ_REST_URL = process.env.IBM_MQ_REST_URL || 'https://ibm-mq-qa:9443';
const IBM_MQ_QMGR = process.env.IBM_MQ_QMGR || 'QM1';
const IBM_MQ_QUEUE_ESCUCHA = process.env.IBM_MQ_QUEUE_REPORTES || 'DEV.QUEUE.4';
const IBM_MQ_USUARIO = process.env.IBM_MQ_USUARIO || 'app';
const IBM_MQ_PASSWORD = process.env.IBM_MQ_PASSWORD || 'passw0rd123';
const WAIT_MS = 5000;

// Mismo mecanismo que en el original: en 0 (por defecto), procesa casi
// instantaneo. Subelo temporalmente (ej. 2000) para simular un
// consumidor lento a proposito.
const RETRASO_ARTIFICIAL_MS = parseInt(process.env.CONSUMER_DELAY_MS || '0', 10);

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function _authHeader() {
  const auth = Buffer.from(`${IBM_MQ_USUARIO}:${IBM_MQ_PASSWORD}`).toString('base64');
  return `Basic ${auth}`;
}

async function consumirUnMensaje() {
  const url = `${IBM_MQ_REST_URL}/ibmmq/rest/v2/messaging/qmgr/${IBM_MQ_QMGR}/queue/${IBM_MQ_QUEUE_ESCUCHA}/message?wait=${WAIT_MS}`;

  const respuesta = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: _authHeader(),
      Accept: 'text/plain',
      'ibm-mq-rest-csrf-token': 'app-microservicio',
    },
  });

  if (respuesta.status === 200) {
    const texto = await respuesta.text();
    const contenido = JSON.parse(texto);

    if (typeof contenido.routingKey === 'string' && contenido.routingKey.startsWith('transaction.')) {
      console.log(
        `[Consumer-reportes] Evento recibido [${contenido.routingKey}] -- ` +
        `posible regeneracion de reporte para cuenta relacionada:`,
        contenido
      );

      if (RETRASO_ARTIFICIAL_MS > 0) {
        await esperar(RETRASO_ARTIFICIAL_MS);
      }
    } else {
      console.log(`[Consumer-reportes] Evento ignorado (no es de tipo transaction.*): [${contenido.routingKey}]`);
    }
    return true;
  }
  if (respuesta.status === 404 || respuesta.status === 204) {
    return false; // cola vacia dentro del tiempo de espera, normal
  }
  console.error('[Consumer-reportes] Respuesta inesperada de IBM MQ:', respuesta.status);
  return false;
}

async function connectRabbitMQConsumer() {
  console.log(
    `[Consumer-reportes] Escuchando cola "${IBM_MQ_QUEUE_ESCUCHA}" via IBM MQ REST ` +
    `(modo polling, wait=${WAIT_MS}ms, retraso artificial: ${RETRASO_ARTIFICIAL_MS}ms)`
  );
  startPolling();
}

async function startPolling() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await consumirUnMensaje();
    } catch (err) {
      console.error('[Consumer-reportes] Failed to poll:', err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

module.exports = { connectRabbitMQConsumer };