
import { buildCabrio } from "./src/world.js";
import { Racer } from "./src/racer.js";
import { createInput } from "./src/input.js";
import { VIEW_DESKTOP } from "./src/config.js";
const input = createInput(null);
const events = [];
const r = new Racer({ level: buildCabrio(), input, audio: { play(){}, engine(){}, engineOff(){} }, events: (e)=>events.push(e), view: VIEW_DESKTOP });
for (let i = 0; i < 60*180 && r.state === "play"; i++) {
  input.setKey("left", r.playerX > 0.06);
  input.setKey("right", r.playerX < -0.06);
  r.update(1/60);
}
console.log("Zustand:", r.state, "| Fahrzeit", r.time.toFixed(1)+"s", "| max", r.hud.speed, "km/h | Kontakte", r.hits);
console.log("Abschluss-Zeilen:", JSON.stringify((events[0]||{}).rows || null));
