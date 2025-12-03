import { createRouter, createWebHistory } from "vue-router";
import Login from "./views/Login.vue";
import Dashboard from "./views/Dashboard.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: Login },
    { path: "/dashboard", component: Dashboard, meta: { requiresAuth: true } },
    { path: "/:pathMatch(.*)*", redirect: "/login" },
  ],
});

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem("token");
  if (to.meta.requiresAuth && !token) next("/login");
  else next();
});

export default router;
