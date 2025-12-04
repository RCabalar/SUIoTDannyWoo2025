const express = require("express");
const path = require("path");
const cors = require("cors");
const http = require("http");
const { Pool, Client } = require("pg");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
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
      SELECT camera_id, timestamp, detection, confidence
	  FROM camera_data
	  WHERE timestamp => (
		SELECT MAX(timestamp) - INTERVAL '7 days'
		FROM camera_data
	  )
	  ORDER BY camera_id, timestamp
    `);

    const rows = result.rows;
	
	const cameras = {};
	
	for (const row of rows) {
		const cam = row.camera_id;
	
	if (!cameras[cam]) {
		cameras[cam] = [];
	}
	
	cameras[cam].push({
		timestamp: row.timestamp,
		detection: row.detection,
		confidence: row.confidence
	});
	
    res.json({ cameras });
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

const wss = new WebSocket.Server({ noServer: true });

// Authenticate WebSocket upgrade requests
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");

  if (!token) {
    console.log("WS rejected: No token");
    socket.destroy();
    return;
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log("WS rejected: Invalid token");
      socket.destroy();
      return;
    }

    req.user = decoded;

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });
});

wss.on("connection", (ws, req) => {
  console.log("WebSocket client connected:", req.user.username);
});

	


// --- Broadcast helper ---
function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// --- Listen for PostgreSQL NOTIFY events ---
pgClient.on("notification", async (msg) => {
  console.log("New detection notification:", msg.payload);

  try {
    // Query latest stats
    const payload = JSON.parse(msg.payload);
    // Push to all WebSocket clients
    broadcast(payload);
  } catch (err) {
    console.error("Failed to fetch data:", err);
  }
});

app.listen(3000, "0.0.0.0", () =>
  console.log(`Server listening on port ${3000}`)
);
