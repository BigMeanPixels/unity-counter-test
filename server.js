import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
app.use(express.static("public"));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Single global counter for the simplest demo
let count = 0;

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(msg);
  }
}

wss.on("connection", (ws) => {
  // Send initial state to the newly connected client
  ws.send(JSON.stringify({ type: "state", count }));

  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === "increment") {
      count += 1;
      broadcast({ type: "state", count });
    }

    if (msg.type === "reset") {
      count = 0;
      broadcast({ type: "state", count });
    }
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Listening on :${PORT}`));
