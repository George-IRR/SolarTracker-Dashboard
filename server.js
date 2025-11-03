import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { SerialPort } from 'serialport';

const app = express();
app.use(express.json());
const server = createServer(app);
const wss = new WebSocketServer({ server });

let port = null;
let lastData = null;
let deviceConnected = false;

// Packet parser state (compatible with your ATmega packet format)
const RX1_PAYLOAD_MAX = 128;
const PREAMBLE0 = 0xAA;
const PREAMBLE1 = 0x55;
const PROTO_VERSION = 0x01;
// MCU command / response constants (from ATmega header)
const CMD_DHT20 = 0x10;
const CMD_SERVO = 0x11;
const RESP_DHT20 = 0x21;
const RESP_SERVO = 0x22;
const RESP_STATUS = 0x23;

let pstate = 'WAIT_PREAMBLE_1';
let packet_version = 0;
let packet_type = 0;
let packet_id = 0;
let payload_pos = 0;
let checksum_acc = 0;
let packet_len = 0;
let payload_buf = Buffer.alloc(RX1_PAYLOAD_MAX);

app.get('/api/ports', async (req, res) => {
  try {
    const ports = await SerialPort.list();
    res.json(ports.map(p => ({
      path: p.path,
      friendlyName: p.friendlyName || p.path
    })));
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/connect', (req, res) => {
  const portPath = req.query.port;
  if (!portPath) {
    res.json({ error: 'No port selected' });
    return;
  }
  
  if (port && port.isOpen) {
    port.close();
  }
  
  connectToPort(portPath);
  res.json({ ok: true });
});

app.post('/api/disconnect', (req, res) => {
  if (port && port.isOpen) {
    port.close();
  }
  deviceConnected = false;
  broadcastStatus();
  res.json({ ok: true });
});

function parseData(hex) {
  if (!hex || hex.length < 14) return null;
  
  const data = Buffer.from(hex, 'hex');
  const raw_humidity = ((data[1] << 12) | (data[2] << 4) | (data[3] >> 4)) & 0xFFFFF;
  const raw_temp = (((data[3] & 0x0F) << 16) | (data[4] << 8) | data[5]) & 0xFFFFF;
  
  const humidity = (raw_humidity * 100.0) / 1048576.0;
  const temperature = ((raw_temp * 200.0) / 1048576.0) - 50.0;
  
  return {
    humidity: humidity.toFixed(2),
    temperature: temperature.toFixed(2),
    status: '0x' + data[0].toString(16).padStart(2, '0'),
    timestamp: new Date().toISOString()
  };
}

// Broadcast a parsed packet to websocket clients
function broadcastPacket(version, type, id, payloadBuffer) {
  const payloadHex = payloadBuffer ? Buffer.from(payloadBuffer).toString('hex').toUpperCase() : '';
  const obj = {
    packetVersion: version,
    packetType: type,
    packetId: id,
    payloadHex,
    timestamp: new Date().toISOString()
  };
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(JSON.stringify({ packet: obj }));
  });
}

// Send a framed packet compatible with the Atmega code
function sendPacket(type, id, payload) {
  if (!port || !port.isOpen) return false;
  const len = payload ? payload.length : 0;
  const buf = Buffer.alloc(6 + len + 1);
  buf[0] = PREAMBLE0;
  buf[1] = PREAMBLE1;
  buf[2] = PROTO_VERSION;
  buf[3] = type & 0xFF;
  buf[4] = id & 0xFF;
  buf[5] = len & 0xFF;
  let sum = PROTO_VERSION + buf[3] + buf[4] + buf[5];
  for (let i = 0; i < len; ++i) {
    buf[6 + i] = payload[i];
    sum += payload[i];
  }
  buf[6 + len] = sum & 0xFF; // checksum
  port.write(buf);
  try { console.log('Sent packet:', buf.toString('hex').toUpperCase()) } catch(e){}
  return true;
}

// API: send packet (JSON body: {type, id, payloadHex})
app.post('/api/send-packet', (req, res) => {
  const { type, id, payloadHex } = req.body || {};
  if (typeof type === 'undefined' || typeof id === 'undefined') {
    res.status(400).json({ success: false, error: 'type and id required' });
    return;
  }
  const t = Number(type);
  const i = Number(id);
  if (!Number.isInteger(t) || !Number.isInteger(i)) {
    res.status(400).json({ success: false, error: 'type and id must be integers' });
    return;
  }
  const payload = payloadHex ? Buffer.from(String(payloadHex), 'hex') : Buffer.alloc(0);
  console.log('API /api/send-packet', { type: t, id: i, payloadHex });

  // sanity check: log if someone tries to send a DHT command where a servo is expected
  if (t === CMD_DHT20) {
    console.warn('Warning: sending CMD_DHT20 (0x10) via /api/send-packet');
  }

  const ok = sendPacket(t, i, payload);
  res.json({ success: !!ok, sentType: t });
});

// Convenience endpoint: request DHT20 measurement using a fixed packet
// Frame example: AA 55 01 10 0A 02 1A 2B 62
app.post('/api/request-dht', (req, res) => {
  const type = CMD_DHT20;
  const id = 0x0A;   // example id
  const payload = Buffer.from('1A2B', 'hex');
  console.log('API /api/request-dht -> sending CMD_DHT20 frame')
  const ok = sendPacket(type, id, payload);
  res.json({ success: !!ok, sentType: type });
});

function broadcastStatus() {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: 'status', connected: deviceConnected }));
    }
  });
}

function broadcastData(data) {
  if (data) {
    lastData = data;
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify(data));
      }
    });
  }
}

wss.on('connection', (ws) => {
  if (lastData) {
    ws.send(JSON.stringify(lastData));
  }
  ws.send(JSON.stringify({ type: 'status', connected: deviceConnected }));
});

function connectToPort(portPath) {
  if (port && port.isOpen) {
    port.close();
  }
  
  port = new SerialPort({ path: portPath, baudRate: 9600 });
  // Reset parser state
  pstate = 'WAIT_PREAMBLE_1';
  packet_version = packet_type = packet_id = payload_pos = packet_len = checksum_acc = 0;
  payload_buf = Buffer.alloc(RX1_PAYLOAD_MAX);

  port.on('open', () => {
    deviceConnected = true;
    console.log('Connected to ' + portPath);
    broadcastStatus();
  });

  port.on('data', (chunk) => {
    // chunk is a Buffer - parse byte by byte using the packet state machine
    for (const byte of chunk) {
      const b = byte & 0xFF;
      switch (pstate) {
        case 'WAIT_PREAMBLE_1':
          if (b === PREAMBLE0) pstate = 'WAIT_PREAMBLE_2';
          break;
        case 'WAIT_PREAMBLE_2':
          if (b === PREAMBLE1) {
            pstate = 'READ_VERSION';
          } else {
            pstate = (b === PREAMBLE0) ? 'WAIT_PREAMBLE_2' : 'WAIT_PREAMBLE_1';
          }
          break;
        case 'READ_VERSION':
          packet_version = b;
          checksum_acc = packet_version;
          pstate = 'READ_TYPE';
          break;
        case 'READ_TYPE':
          packet_type = b;
          checksum_acc += packet_type;
          pstate = 'READ_ID';
          break;
        case 'READ_ID':
          packet_id = b;
          checksum_acc += packet_id;
          pstate = 'READ_LEN';
          break;
        case 'READ_LEN':
          packet_len = b;
          checksum_acc += packet_len;
          if (packet_len === 0) {
            pstate = 'READ_CHECKSUM';
          } else if (packet_len > RX1_PAYLOAD_MAX) {
            pstate = 'WAIT_PREAMBLE_1';
          } else {
            payload_pos = 0;
            pstate = 'READ_PAYLOAD';
          }
          break;
        case 'READ_PAYLOAD':
          payload_buf[payload_pos++] = b;
          checksum_acc += b;
          if (payload_pos >= packet_len) {
            pstate = 'READ_CHECKSUM';
          }
          break;
        case 'READ_CHECKSUM': {
          const chk = b;
          const calc = checksum_acc & 0xFF;
          if (chk === calc) {
            // packet OK - broadcast and handle
            const payloadCopy = Buffer.from(payload_buf.slice(0, packet_len));
            // Log and broadcast
            try { console.log('Received packet type=0x' + packet_type.toString(16) + ' id=0x' + packet_id.toString(16) + ' payload=' + payloadCopy.toString('hex').toUpperCase()) } catch(e){}
            broadcastPacket(packet_version, packet_type, packet_id, payloadCopy);
            // If this is a DHT20 response, decode and send legacy sensor object so frontends that expect humidity/temp update immediately
            if (packet_type === RESP_DHT20) { // RESP_DHT20
              try {
                const parsed = parseData(payloadCopy.toString('hex'));
                if (parsed) broadcastData(parsed);
              } catch(e) { console.log('DHT parse error', e) }
            }
            // Optionally process known packet types here (or in frontend)
            // handle_packet(packet_version, packet_type, packet_id, payload_buf, packet_len);
          } else {
            console.log('Bad packet checksum');
          }
          // reset state
          pstate = 'WAIT_PREAMBLE_1';
          checksum_acc = 0;
          payload_pos = 0;
          packet_len = 0;
          break;
        }
        default:
          pstate = 'WAIT_PREAMBLE_1';
          break;
      }
    }
  });
  
  port.on('error', (err) => {
    console.log('Port error: ' + err.message);
    deviceConnected = false;
    broadcastStatus();
  });
  
  port.on('close', () => {
    deviceConnected = false;
    console.log('Port closed');
    broadcastStatus();
  });
}

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});

app.get('/data', (req, res) => {
  const hex = req.query.hex;
  if (hex) {
    const parsed = parseData(hex);
    broadcastData(parsed);
    res.json({ success: true, data: parsed });
  } else {
    res.json({ success: false, error: 'No hex data provided' });
  }
});

app.get('/api/send-hex', (req, res) => {
  const hex = req.query.hex;
  if (!hex) {
    res.json({ success: false, error: 'No hex data provided' });
    return;
  }
  if (!port || !port.isOpen) {
    res.json({ success: false, error: 'Serial port not connected' });
    return;
  }
  try {
    const buffer = Buffer.from(hex, 'hex');
    port.write(buffer);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});
