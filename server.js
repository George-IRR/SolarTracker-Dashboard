import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { SerialPort } from 'serialport';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

let port = null;
let lastData = null;
let deviceConnected = false;

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
  let buffer = '';
  
  port.on('open', () => {
    deviceConnected = true;
    console.log('Connected to ' + portPath);
    broadcastStatus();
  });
  
  port.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      const match = line.match(/[0-9A-Fa-f]{14,}/);
      if (match) {
        const hex = match[0].substring(0, 14);
        const data = parseData(hex);
        broadcastData(data);
      }
    }
    
    buffer = lines[lines.length - 1];
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
