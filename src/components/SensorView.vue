<template>
  <div>
    <button @click="$emit('back')">← Back</button>
    <h1>DHT20 Sensor</h1>

  <div class="device-section">
    <h2>Device</h2>
    <select v-model="selectedPort">
      <option value="">-- Select Device --</option>
      <option v-for="port in ports" :key="port.path" :value="port.path">
        {{ port.path }} ({{ port.friendlyName }})
      </option>
    </select>
    <button @click="connectDevice" :disabled="!selectedPort">Connect</button>
    <button @click="disconnectDevice" :disabled="!connected">Disconnect</button>
    <button @click="refreshPorts">Refresh List</button>
    <div>{{ ports.length }} device(s) found</div>
  </div>

  <div class="status-box" :class="{ 'status-connected': connected, 'status-disconnected': !connected }">
    Status: {{ connected ? 'Connected' : 'Not Connected' }}
  </div>

  <div class="sensor-data">
    <div class="data-row">
      <span class="label">Temperature:</span>
      <span class="value">{{ temperature }}</span>°C
    </div>
    <div class="data-row">
      <span class="label">Humidity:</span>
      <span class="value">{{ humidity }}</span>%
    </div>
    <div class="data-row">
      <span class="label">Status:</span>
      <span>{{ status }}</span>
    </div>
    <div>
      Last update: {{ timestamp }}
    </div>
  </div>
</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, defineEmits } from 'vue'

const emit = defineEmits(['back'])

const ports = ref([])
const selectedPort = ref('')
const connected = ref(false)
const temperature = ref('--')
const humidity = ref('--')
const status = ref('--')
const timestamp = ref('--')
let ws = null
let portInterval = null

const refreshPorts = async () => {
  try {
    const response = await fetch('/api/ports')
    ports.value = await response.json()
  } catch (err) {
    console.error('Error loading ports:', err)
  }
}

const connectDevice = async () => {
  if (!selectedPort.value) {
    alert('Please select a device')
    return
  }

  try {
    await fetch('/api/connect?port=' + encodeURIComponent(selectedPort.value), { method: 'POST' })
  } catch (err) {
    console.error('Connection error:', err)
  }
}

const disconnectDevice = async () => {
  try {
    const response = await fetch('/api/disconnect', { method: 'POST' })
    console.log('Disconnect response:', response.status)
  } catch (err) {
    console.error('Disconnect error:', err)
  }
}

const connectWebSocket = () => {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//localhost:3000`)

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)

    if (data.type === 'status') {
      connected.value = data.connected
    } else if (data.humidity !== null) {
      temperature.value = data.temperature
      humidity.value = data.humidity
      status.value = data.status
      timestamp.value = new Date(data.timestamp).toLocaleTimeString()
    }
  }

  ws.onopen = () => {
    refreshPorts()
    portInterval = setInterval(refreshPorts, 5000)
  }

  ws.onerror = () => {
    connected.value = false
  }

  ws.onclose = () => {
    connected.value = false
    clearInterval(portInterval)
    setTimeout(connectWebSocket, 1000)
  }
}

onMounted(() => {
  connectWebSocket()
})

onUnmounted(() => {
  if (ws) {
    ws.close()
  }
  if (portInterval) {
    clearInterval(portInterval)
  }
})
</script>