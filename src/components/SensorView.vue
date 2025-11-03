<template>
  <div>
    <button @click="$emit('back')">← Back</button>
    <h1>DHT20 Sensor</h1>

    <div style="margin:10px 0;">
      <label>
        Poll every
        <input type="number" v-model="pollIntervalSec" min="1" style="width:60px; margin:0 6px;" />
        seconds
      </label>
  <button @click="togglePolling">{{ pollEnabled ? 'Stop polling' : 'Start polling' }}</button>
  <button style="margin-left:8px" @click="doPollOnce">Request Sensor Data</button>
  <span style="margin-left:12px">Last poll: {{ lastPollDisplay }}</span>
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
</template><script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'

const emit = defineEmits(['back'])
const temperature = ref('--')
const humidity = ref('--')
const status = ref('--')
const timestamp = ref('--')
let ws = null
let pollTimer = null
const pollEnabled = ref(false)
const pollIntervalSec = ref(5)
const lastPoll = ref(null)

const lastPollDisplay = computed(() => lastPoll.value ? new Date(lastPoll.value).toLocaleTimeString() : '--')

const doPollOnce = async () => {
  try {
    await fetch('/api/request-dht', { method: 'POST' })
    lastPoll.value = Date.now()
  } catch (e) {
    console.error('Poll error', e)
  }
}

const startPolling = () => {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(() => doPollOnce(), Math.max(1, Number(pollIntervalSec.value)) * 1000)
  pollEnabled.value = true
  // do an immediate poll
  doPollOnce()
}

const stopPolling = () => {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  pollEnabled.value = false
}

const togglePolling = () => {
  if (pollEnabled.value) stopPolling(); else startPolling()
}

const connectWebSocket = () => {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//localhost:3000`)

  // parse helper (hoisted) so ws.onmessage can call it safely
  function parseDHT20FromPayloadHex(hex) {
    try {
      if (!hex || hex.length < 12) return null
      const bytes = []
      for (let i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16))
      }
      const data = bytes
      if (data.length < 6) return null
      const raw_humidity = ((data[1] << 12) | (data[2] << 4) | (data[3] >> 4)) & 0xFFFFF
      const raw_temp = (((data[3] & 0x0F) << 16) | (data[4] << 8) | data[5]) & 0xFFFFF
      const humidity_v = (raw_humidity * 100.0) / 1048576.0
      const temperature_v = ((raw_temp * 200.0) / 1048576.0) - 50.0
      return {
        humidity: humidity_v.toFixed(2),
        temperature: temperature_v.toFixed(2),
        status: '0x' + data[0].toString(16).padStart(2, '0')
      }
    } catch (e) {
      return null
    }
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)

    // If server broadcasts parsed sensor object (legacy)
    if (data.humidity !== undefined && data.humidity !== null) {
      temperature.value = data.temperature
      humidity.value = data.humidity
      status.value = data.status
      timestamp.value = new Date(data.timestamp).toLocaleTimeString()
      return
    }

    // If server broadcasts framed packet
    if (data.packet) {
      const pkt = data.packet
      // RESP_DHT20 = 0x21
      if (pkt.packetType === 0x21 && pkt.payloadHex) {
        const parsed = parseDHT20FromPayloadHex(pkt.payloadHex)
        if (parsed) {
          temperature.value = parsed.temperature
          humidity.value = parsed.humidity
          status.value = parsed.status
          timestamp.value = new Date(pkt.timestamp).toLocaleTimeString()
        }
      }
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
  // stop polling when component unmounts
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>