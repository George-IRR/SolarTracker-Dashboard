<template>
  <div>
    <h1>Solar Tracker Dashboard</h1>

    <div class="connection-section">
      <h2>Bluetooth Connection</h2>
      <select v-model="selectedPort">
        <option value="">-- Select Device --</option>
        <option v-for="port in ports" :key="port.path" :value="port.path">
          {{ port.path }} ({{ port.friendlyName }})
        </option>
      </select>
      <button @click="connectDevice" :disabled="!selectedPort || connected">Connect</button>
      <button @click="disconnectDevice" :disabled="!connected">Disconnect</button>
      <button @click="refreshPorts">Refresh List</button>
      <div>{{ ports.length }} device(s) found</div>
      <div class="status">Status: {{ connected ? 'Connected' : 'Not Connected' }}</div>
    </div>

    <div v-if="connected" class="controls">
      <button @click="currentView = 'sensor'">DHT20 Sensor</button>
      <button @click="currentView = 'servo'">Servo Control</button>
    </div>

    <SensorView v-if="currentView === 'sensor'" @back="currentView = ''" />
    <ServoControl v-if="currentView === 'servo'" @back="currentView = ''" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import SensorView from './components/SensorView.vue'
import ServoControl from './components/ServoControl.vue'

const ports = ref([])
const selectedPort = ref('')
const connected = ref(false)
const currentView = ref('')
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
    await fetch('/api/disconnect', { method: 'POST' })
  } catch (err) {
    console.error('Disconnect error:', err)
  }
}

const connectWebSocket = () => {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${protocol}//localhost:3000`)

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    if (data.type === 'status') {
      connected.value = data.connected
    }
  }

  ws.onopen = () => {
    refreshPorts()
    portInterval = setInterval(refreshPorts, 5000)
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
</script>