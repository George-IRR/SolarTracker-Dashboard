<template>
  <div v-if="!showSensor">
    <h1>Solar Tracker Dashboard</h1>
    <button @click="showSensor = true">DHT20 Sensor</button>
  </div>
  <SensorView v-else @back="showSensor = false" />
</template>

<script setup>
import { ref } from 'vue'
import SensorView from './components/SensorView.vue'

const showSensor = ref(false)
</script>