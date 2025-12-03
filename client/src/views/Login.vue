<template>
  <div class="login">
    <h2>Login</h2>
    <input v-model="username" placeholder="Username" />
    <input v-model="password" type="password" placeholder="Password" />
    <button @click="doLogin">Login</button>
  </div>
</template>

<script>
import api from "../api";

export default {
  data() {
    return {
      username: "",
      password: "",
    };
  },
  methods: {
    async doLogin() {
      try {
        const res = await api.post("/auth/login", {
          username: this.username,
          password: this.password,
        });

        localStorage.setItem("token", res.data.token);
        this.$router.push("/dashboard");
      } catch {
        alert("Login failed");
      }
    },
  },
};
</script>