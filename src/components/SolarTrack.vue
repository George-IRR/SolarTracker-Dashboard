<template>
  <div>
    <button @click="$emit('back')">← Back</button>
    <h1>Solar Track</h1>
    <p>Toggle manual override for automatic solar tracking.</p>
    <div style="margin-top:8px">
      <button @click="toggleOverride">Toggle Override</button>
      <span style="margin-left:12px">Last action: {{ lastCommand }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['back'])
const lastCommand = ref('None')
let packetCounter = 1

const sendPacket = async (packetType, payloadHex) => {
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
  } catch (err) {
    console.error('Send packet error:', err)
  }
}

const toggleOverride = () => {
  // CMD_OVERRIDE defined in firmware as 0x12
  const CMD_OVERRIDE = 0x12
  // Build a short payload: 1 byte toggle flag (value ignored by firmware)
  const payload = new Uint8Array([0x01, 0, 0, 0, 0, 0, 0, 0])
  const payloadHex = Array.from(payload, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
  sendPacket(CMD_OVERRIDE, payloadHex)
  lastCommand.value = 'Sent override toggle'
}
</script>
