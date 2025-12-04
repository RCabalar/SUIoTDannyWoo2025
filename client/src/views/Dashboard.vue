<template>
  <div class="dashboard">
	<div
		v-for="cam in Object.keys(cameras)"
		:key="cam"
		class="camera-row"
	>
		<h3>{{ cam }}</h3>
		
		<div class="charts">
			<SensorChart
				:name="cam"
				:data="cameras[cam]"
				metric="detection"
			/>
			
			<SensorChart
				:name="cam"
				:data="cameras[cam]"
				metric="confidence"
			/>
		</div>
	</div>
</div>
</template>

<script>
import api from "../api";
import SensorChart from "../components/SensorChart.vue";

export default {
  components: { SensorChart },
  
  data() {
    return {
      cameras: {},       // <- store your dynamic camera data
      ws: null,          // <- websocket reference
    };
  },
 
  async mounted() {
	try {
      const res = await api.get("/api/sense");
      const json = await res.json();
	  
	  this.cameras = json.cameras;
	  
    } catch (err) {
      console.error("Failed to load initial stats", err);
    }

    this.openWebSocket();
  },

  beforeUnmount() {
    if (this.ws) {
      this.ws.close();
    }
  },

  methods: {
    // OPEN AUTHENTICATED WEBSOCKET
    openWebSocket() {
      const token = localStorage.getItem("token");
      if (!token) {
        console.error("No auth token found");
        return;
      }

      // WS URL MUST MATCH YOUR SERVER PORT
      this.ws = new WebSocket(`ws://192.168.45.1:3000?token=${token}`);

      this.ws.onopen = () => {
        console.log("WebSocket connected");
      };

      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        console.log("WebSocket message:", msg);

        // Handle data pushed from server
        if (!this.cameras[msg.camera_id]) {
		this.$set(this.cameras, msg.camera_id, []);
		}
		
		this.cameras[msg.camera_id].push({
			timestamp: msg.timestamp,
			detection: msg.detection,
			confidence: msg.confidence
		});
      };

      this.ws.onclose = () => {
        console.log("WebSocket closed");
      };

      this.ws.onerror = (err) => {
        console.error("WebSocket error:", err);
      };
    },
  },
};
</script>

<style scoped>
.camera-row {
	margin-bottom: 2rem;
}

.charts {
	display: flex;
	gap: 1rem;
}

.charts > * {
	flex: 1;
}
</style>