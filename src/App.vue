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

    <div class="controls">
      <button @click="openSensorView" :disabled="!connected">DHT20 Sensor</button>
      <button @click="openServoView" :disabled="!connected">Servo Control</button>
      <div v-if="!connected" style="color:#a00; margin-top:6px">Connect a device first to enable controls</div>
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
    console.log('refreshPorts ->', ports.value)
  } catch (err) {
    console.error('Error loading ports:', err)
  }
}

const connectDevice = async () => {
  if (!selectedPort.value) {
    alert('Please select a device')
    return
  }

  console.log('connectDevice ->', selectedPort.value)
  try {
    await fetch('/api/connect?port=' + encodeURIComponent(selectedPort.value), { method: 'POST' })
    console.log('connect request sent')
  } catch (err) {
    console.error('Connection error:', err)
  }
}

const disconnectDevice = async () => {
  console.log('disconnectDevice ->')
  try {
    await fetch('/api/disconnect', { method: 'POST' })
    console.log('disconnect request sent')
  } catch (err) {
    console.error('Disconnect error:', err)
  }
}

const connectWebSocket = () => {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${protocol}//localhost:3000`)
  ws.onopen = () => {
    console.log('WebSocket open')
    refreshPorts()
    portInterval = setInterval(refreshPorts, 5000)
  }

  ws.onmessage = (event) => {
    console.log('WebSocket message:', event.data)
    const data = JSON.parse(event.data)
    if (data.type === 'status') {
      connected.value = data.connected
      console.log('connected state updated ->', data.connected)
    }
  }

  ws.onerror = (err) => {
    console.error('WebSocket error', err)
  }

  ws.onclose = () => {
    console.log('WebSocket closed')
    connected.value = false
    clearInterval(portInterval)
    setTimeout(connectWebSocket, 1000)
  }
}

onMounted(() => {
  connectWebSocket()
  console.log('App mounted')
})

const openSensorView = () => {
  console.log('openSensorView clicked, connected=', connected.value)
  currentView.value = 'sensor'
}

const openServoView = () => {
  console.log('openServoView clicked, connected=', connected.value)
  currentView.value = 'servo'
}
</script>