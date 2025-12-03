const express = require("express");
const path = require("path");
const cors = require("cors");
const http = require("http");
const { Pool, Client } = require("pg");
const WebSocket = require("ws");
const { login, verifyToken } = require("./auth");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

// --- PostgreSQL pool for queries ---
const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

// --- PostgreSQL client for LISTEN/NOTIFY ---
const pgClient = new Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
pgClient.connect();
pgClient.query("LISTEN new_detection");

// LOGIN ENDPOINT
app.post("/auth/login", (req, res) => {
  const { username, password } = req.body;
  const token = login(username, password);

  if (!token) return res.status(401).send("Invalid credentials");

  res.json({ token });
});


// PROTECTED STATS ENDPOINT (pull latest data) MODIFY TO FIT DATA
app.get("/api/sense", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) AS detections_last_30min
      FROM detections
      WHERE created_at >= NOW() - INTERVAL '30 minutes'
    `);

    const detectionsLast30Min = parseInt(result.rows[0].detections_last_30min);

    res.json({
      message: "Hello, " + req.user.username,
      stats: { detectionsLast30Min },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database query failed" });
  }
});

// SERVE VUE BUILD (dist folder)
app.use(express.static(path.join(__dirname, "..", "client", "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "dist", "index.html"));
});

const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("WebSocket client connected");

  // Optional: send initial message
  ws.send(JSON.stringify({ message: "Connected to WebSocket" }));
});


// --- Broadcast helper ---
function broadcast(stats) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(stats));
    }
  });
}

// --- Listen for PostgreSQL NOTIFY events ---
pgClient.on("notification", async (msg) => {
  console.log("New detection notification:", msg.payload);

  try {
    // Query latest stats
    const result = await pool.query(`
      SELECT COUNT(*) AS detections_last_30min
      FROM detections
      WHERE created_at >= NOW() - INTERVAL '30 minutes'
    `);

    const stats = { detectionsLast30Min: parseInt(result.rows[0].detections_last_30min) };

    // Push to all WebSocket clients
    broadcast(stats);
  } catch (err) {
    console.error("Failed to fetch stats:", err);
  }
});

app.listen(process.env.PORT, () =>
  console.log(`Server running at http://localhost:${process.env.PORT}`)
);
