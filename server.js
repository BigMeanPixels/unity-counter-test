import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
app.use(express.static("public"));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/**
 * Single-session "one-off" show state (simple on purpose)
 */
let roundActive = false;
let endTimeMs = 0;
let choiceId = "";      // "FLANNEL" | "BREAKFAST" | "RIDE"
let labelA = "A";
let labelB = "B";
let a = 0;
let b = 0;

// one vote per device per round
let votedThisRound = new Set(); // voterId strings

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(msg);
  }
}

function sendState(ws) {
  ws.send(JSON.stringify({
    type: "state",
    roundActive,
    endTimeMs,
    choiceId,
    labelA,
    labelB,
    a,
    b
  }));
}

function endRound() {
  if (!roundActive) return;
  roundActive = false;

  const winner = (a === b) ? "TIE" : (a > b ? "A" : "B");

  broadcast({
    type: "roundEnded",
    choiceId,
    a,
    b,
    winner
  });
}

wss.on("connection", (ws) => {
  sendState(ws);

  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    // Unity starts a round and provides button labels
    if (msg.type === "startRound") {
      const durationMs = Math.max(1000, Math.min(60000, msg.durationMs ?? 10000));
      choiceId = String(msg.choiceId ?? "").toUpperCase();
      labelA = String(msg.labelA ?? "A");
      labelB = String(msg.labelB ?? "B");

      a = 0; b = 0;
      votedThisRound = new Set();

      roundActive = true;
      endTimeMs = Date.now() + durationMs;

      broadcast({
        type: "roundStarted",
        choiceId,
        labelA,
        labelB,
        endTimeMs,
        a,
        b
      });

      setTimeout(() => {
        // if a newer round started, don't end this one
        if (!roundActive) return;
        if (Date.now() + 50 < endTimeMs) return;
        endRound();
      }, durationMs + 120);

      return;
    }

    // Audience votes
    if (msg.type === "vote") {
      if (!roundActive) return;
      if (Date.now() > endTimeMs) return;

      const voterId = String(msg.voterId ?? "");
      if (!voterId) return;

      // one vote per device per round
      if (votedThisRound.has(voterId)) return;
      votedThisRound.add(voterId);

      const choice = String(msg.choice ?? "").toUpperCase();
      if (choice === "A") a++;
      else if (choice === "B") b++;
      else return;

      broadcast({
        type: "voteUpdate",
        choiceId,
        a,
        b,
        endTimeMs
      });

      return;
    }

    // Optional reset (handy for testing)
    if (msg.type === "reset") {
      roundActive = false;
      endTimeMs = 0;
      choiceId = "";
      labelA = "A";
      labelB = "B";
      a = 0;
      b = 0;
      votedThisRound = new Set();
      broadcast({ type: "state", roundActive, endTimeMs, choiceId, labelA, labelB, a, b });
    }
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Listening on :${PORT}`));
