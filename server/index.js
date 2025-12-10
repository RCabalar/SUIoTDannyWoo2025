const express = require("express");
const path = require("path");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const { login, verifyToken } = require("./auth");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

const DATA_FILE = path.join(__dirname, "data", "camera_data.json");

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "");

// Helper function: Read all JSON lines
function readJsonLines() {
	const text = fs.readFileSync(DATA_FILE, "utf8").trim();
	if (!text) return[];
	return text
		.split("\n")
		.map((line) => {
			try { return JSON.parse(line);}
			catch { return null; }
		})
		.filter(boolean);
}

// LOGIN ENDPOINT using JWT
app.post("/auth/login", (req, res) => {
  const { username, password } = req.body;
  const token = login(username, password);

  if (!token) return res.status(401).send("Invalid credentials");

  res.json({ token });
});

// PROTECTED INITIAL DATA ENDPOINT (pull week's worth of data) MODIFY TO ACCESS NEW DATABASE and send initial set of data
app.get("/api/sense", verifyToken, (req, res) => {
  try {
    const all = readJsonLines();

    // Filter data from last 7 days
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const recent = all.filter((item) => {
      const t = new Date(item.timestamp).getTime();
      return t >= cutoff;
    });

    // Group by camera
    const cameras = {};
    for (const item of recent) {
      if (!cameras[item.camera_id]) cameras[item.camera_id] = [];
      cameras[item.camera_id].push({
        timestamp: item.timestamp,
        detection: item.detection,
        confidence: item.confidence,
      });
    }

    res.json({ cameras });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to read JSON file" });
  }
});


// SERVE VUE BUILD (dist folder)
app.use(express.static(path.join(__dirname, "..", "client", "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "dist", "index.html"));
});

const server = http.createServer(app);

const wss = new WebSocket.Server({ noServer: true });

// Authenticate WebSocket connection requests
server.on("upgrade", (req, socket, head) => {
	//websocket accesspoint where websocket request from client includes token hopefully stored previously from login
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");

	//ensure token exists
  if (!token) {
    console.log("WS rejected: No token");
    socket.destroy();
    return;
  }

	//ensure token matches what is stored in .env
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

//when connection, log the connection
wss.on("connection", (ws, req) => {
  console.log("WebSocket client connected:", req.user.username);
});

	


// --- Broadcast helper --- aka broadcasts newly inputted data to client to update dashboard real-time
function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

//watch for new file appends and send the recent append if websocket is open
let lastSize = fs.statSync(DATA_FILE).size;

fs.watch(DATA_FILE, () => {
  const newSize = fs.statSync(DATA_FILE).size;

  if (newSize > lastSize) {
    // Read only newly appended text
    const stream = fs.createReadStream(DATA_FILE, {
      start: lastSize,
      end: newSize,
    });

    let appended = "";

    stream.on("data", (chunk) => (appended += chunk));
    stream.on("end", () => {
      lastSize = newSize;

      // Split into JSON lines
      const lines = appended.trim().split("\n");

      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          console.log("New JSON append:", json);

          // Send to WebSocket clients
          broadcast(json);
        } catch (err) {
          console.log("Invalid JSON append, ignored");
        }
      }
    });
  }
});


// may need modification to properly listen for clients trying to access the server
app.listen(process.env.PORT, "0.0.0.0", () =>
  console.log(`Server listening on port ${process.env.PORT}`)
);
