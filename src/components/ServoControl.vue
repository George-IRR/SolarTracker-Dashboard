<template>
  <div>
    <button @click="$emit('back')">← Back</button>
    <h1>Servo Control</h1>
    <p>Use arrow keys to control the servo, spacebar to stop</p>
    <button @click="requestSensorData">Request Sensor Data</button>
    <div>Last command: {{ lastCommand }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const emit = defineEmits(['back'])
const lastCommand = ref('None')

const sendCommand = async (command, subCommand = 0, param1 = 0, param2 = 0) => {
  // 8-byte protocol: [command, subCommand, param1, param2, 0, 0, 0, 0]
  const buffer = new Uint8Array([command, subCommand, param1, param2, 0, 0, 0, 0])
  const hex = Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
  
  try {
    await fetch(`/api/send-hex?hex=${hex}`)
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

const requestSensorData = () => {
  sendCommand(0x02, 0x01) // Request sensor data
}

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