<template>
  <div class="servo-control">
    <button @click="$emit('back')">← Back</button>

    <h1>Servo Control</h1>

    <div style="margin:8px 0;">
      <button @click="toggleManual">{{ manualActive ? 'Disable Manual' : 'Enable Manual' }}</button>
      <span style="margin-left:12px">Manual state: <strong>{{ manualActive ? 'ON' : 'OFF' }}</strong></span>
    </div>

    <p>Use arrow keys to move servos (Left/Right = horizontal, Up/Down = vertical). Space = stop.</p>

    <div style="display:flex; gap:20px; margin-top:12px;">
      <div>
        <h3>Vertical (ID {{ servoV }})</h3>
        <input type="range" :min="minAngle" :max="maxAngle" v-model.number="angles[servoV]" @change="sendAngle(servoV)" />
        <div>Angle: {{ angles[servoV] }}</div>
      </div>

      <div>
        <h3>Horizontal (ID {{ servoH }})</h3>
        <input type="range" :min="minAngle" :max="maxAngle" v-model.number="angles[servoH]" @change="sendAngle(servoH)" />
        <div>Angle: {{ angles[servoH] }}</div>
      </div>
    </div>

    <div style="margin-top:16px;">
      <div>Last command: {{ lastCommand }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'

const emit = defineEmits(['back'])

// Constants from usart_packet.h
const CMD_SERVO = 0x11
const CMD_OVERRIDE = 0x12
const DATA_OVERRIDE_CTRL = 0x43
const OV_CTRL_SET_ON = 0x01
const OV_CTRL_SET_OFF = 0x02

const packetCounter = ref(1)
const lastCommand = ref('None')

const servoV = 1   // vertical servo (PH4 / PWM4_B)
const servoH = 0   // horizontal servo (PH5 / PWM4_C)
const minAngle = 0
const maxAngle = 180
const step = 5

const angles = reactive({
  [servoV]: 150,  // match firmware starting angles
  [servoH]: 0
})

const manualActive = ref(false)

async function sendPacketToBridge(type, id, payloadBytes) {
  const payloadHex = Array.from(payloadBytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  const resp = await fetch('/api/send-packet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, id, payloadHex })
  })
  let j = null
  try { j = await resp.json() } catch(e) { /* ignore */ }
  return { resp, json: j }
}

async function sendOverride(on) {
  const ctrl = on ? OV_CTRL_SET_ON : OV_CTRL_SET_OFF
  const payload = new Uint8Array([DATA_OVERRIDE_CTRL, ctrl, 0, 0, 0, 0, 0, 0])
  const id = packetCounter.value++ & 0xFF
  try {
    const r = await sendPacketToBridge(CMD_OVERRIDE, id, payload)
    manualActive.value = on
    lastCommand.value = on ? 'Override: ON' : 'Override: OFF'
    return r
  } catch (err) {
    console.error('Override send error', err)
    return null
  }
}

async function sendServoAngle(servoId, angle) {
  if (!manualActive.value) {
    lastCommand.value = 'Manual not active — enable override first'
    return
  }
  const a = Math.max(minAngle, Math.min(maxAngle, Math.round(angle)))
  const hi = (a >> 8) & 0xFF
  const lo = a & 0xFF
  const payload = new Uint8Array([servoId & 0xFF, hi, lo, 0, 0, 0, 0, 0])
  const id = packetCounter.value++ & 0xFF
  try {
    await sendPacketToBridge(CMD_SERVO, id, payload)
    lastCommand.value = `Servo ${servoId} -> ${a}°`
  } catch (err) {
    console.error('Servo send error', err)
  }
}

function sendAngle(servoId) {
  sendServoAngle(servoId, angles[servoId])
}

function toggleManual() {
  sendOverride(!manualActive.value)
}

function handleKeyDown(e) {
  if (!manualActive.value) return

  switch (e.key) {
    case 'ArrowUp':
      angles[servoV] = Math.max(minAngle, angles[servoV] - step)
      sendServoAngle(servoV, angles[servoV])
      break
    case 'ArrowDown':
      angles[servoV] = Math.min(maxAngle, angles[servoV] + step)
      sendServoAngle(servoV, angles[servoV])
      break
    case 'ArrowLeft':
      angles[servoH] = Math.max(minAngle, angles[servoH] - step)
      sendServoAngle(servoH, angles[servoH])
      break
    case 'ArrowRight':
      angles[servoH] = Math.min(maxAngle, angles[servoH] + step)
      sendServoAngle(servoH, angles[servoH])
      break
    case ' ':
      sendServoAngle(servoV, angles[servoV])
      sendServoAngle(servoH, angles[servoH])
      e.preventDefault()
      lastCommand.value = 'Stop (hold position)'
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.servo-control { padding: 12px; max-width: 720px; }
</style>