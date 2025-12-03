<template>
  <div>
    <h1>Dashboard</h1>
    <p>{{ stats.message }}</p>

    <StatsCard title="Users Online" :value="stats.stats?.usersOnline" />
    <StatsCard title="System Load" :value="stats.stats?.systemLoad" />
  </div>
</template>

<script>
import api from "../api";
import StatsCard from "../components/StatsCard.vue";

export default {
  components: { StatsCard },
  data() {
    return {
      stats: {},
    };
  },
  async mounted() {
    const res = await api.get("/api/stats");
    this.stats = res.data;
  },
};
</script>