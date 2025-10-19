<template>
  <div>
    <button @click="$emit('back')">← Back</button>
    <h1>DHT20 Sensor</h1>

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
</template><script setup>
import { ref, onMounted, onUnmounted, defineEmits } from 'vue'

const emit = defineEmits(['back'])
const temperature = ref('--')
const humidity = ref('--')
const status = ref('--')
const timestamp = ref('--')
let ws = null

const connectWebSocket = () => {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//localhost:3000`)

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)

    if (data.humidity !== null) {
      temperature.value = data.temperature
      humidity.value = data.humidity
      status.value = data.status
      timestamp.value = new Date(data.timestamp).toLocaleTimeString()
    }
  }

  ws.onopen = () => {
    // WebSocket opened
  }

  ws.onerror = () => {
    // Error
  }

  ws.onclose = () => {
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
})
</script>