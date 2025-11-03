<template>
  <div>
    <button @click="$emit('back')">← Back</button>
    <h1>Servo Control</h1>
  <p>Use arrow keys to control the servo, spacebar to stop</p>
    <div>Last command: {{ lastCommand }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const emit = defineEmits(['back'])
const lastCommand = ref('None')
let packetCounter = 1

const sendCommand = async (command, subCommand = 0, param1 = 0, param2 = 0) => {
  // Build 8-byte payload: [command, subCommand, param1, param2, 0, 0, 0, 0]
  const payload = new Uint8Array([command, subCommand, param1, param2, 0, 0, 0, 0])
  const payloadHex = Array.from(payload, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()

  // Use the higher-level framed packet type used by your ATmega firmware
  const CMD_SERVO = 0x11
  const packetType = CMD_SERVO
  const packetId = packetCounter++ & 0xFF

  try {
    console.log('Sending packet to /api/send-packet', { packetType, packetId, payloadHex })
    const resp = await fetch('/api/send-packet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: packetType, id: packetId, payloadHex })
    })
    const j = await resp.json().catch(() => null)
    console.log('send-packet response', resp.status, j)
    if (j && typeof j.sentType !== 'undefined' && j.sentType !== packetType) {
      console.warn('Server reported sentType differs from requested packetType', { requested: packetType, sent: j.sentType })
    }
    lastCommand.value = getCommandDescription(command, subCommand)
  } catch (err) {
    console.error('Send command error:', err)
  }
}

const getCommandDescription = (command, subCommand) => {
  if (command === 0x01) { // Servo commands
    switch (subCommand) {
      case 0x01: return 'Servo: Move Up'
      case 0x02: return 'Servo: Move Down'
      case 0x03: return 'Servo: Move Left'
      case 0x04: return 'Servo: Move Right'
      case 0x05: return 'Servo: Stop'
    }
  } else if (command === 0x02) { // Request commands
    switch (subCommand) {
      case 0x01: return 'Request: Sensor Data'
    }
  }
  return `Command: 0x${command.toString(16)} Sub: 0x${subCommand.toString(16)}`
}

// Note: manual DHT requests moved to the DHT Sensor view

const handleKeyDown = (event) => {
  switch (event.key) {
    case 'ArrowUp':
      sendCommand(0x01, 0x01) // Servo up
      break
    case 'ArrowDown':
      sendCommand(0x01, 0x02) // Servo down
      break
    case 'ArrowLeft':
      sendCommand(0x01, 0x03) // Servo left
      break
    case 'ArrowRight':
      sendCommand(0x01, 0x04) // Servo right
      break
    case ' ': // Spacebar for stop
      sendCommand(0x01, 0x05) // Servo stop
      event.preventDefault()
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