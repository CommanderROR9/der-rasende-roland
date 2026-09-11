
import { buildCabrio } from "./src/world.js";
import { Racer } from "./src/racer.js";
import { createInput } from "./src/input.js";
import { VIEW_DESKTOP } from "./src/config.js";
const r = new Racer({ level: buildCabrio(), input: createInput(null), audio: { play(){}, engine(){}, engineOff(){} }, events: ()=>{}, view: VIEW_DESKTOP });
console.log("Verkehr:", r.traffic.length, "| Straßenrand:", r.roadside.length, "| Schlaglöcher:", r.potholes.length,
  "| Arten:", JSON.stringify([...new Set(r.roadside.map(o=>o.kind))]));

const zaehl = [], autos = [];
for (let i = 0; i < 60*40 && r.state === "play"; i++) {
  r.playerX *= 0.85; r.update(1/60);
  const f = r.buildFrame();
  zaehl.push(f.drawList.length);
  autos.push(f.drawList.filter(o => o.kind === "auto" || o.kind === "lkw").length);
}
const avg = a => (a.reduce((x,y)=>x+y,0)/a.length);
console.log("Objekte im Bild: Schnitt", avg(zaehl).toFixed(1), "| max", Math.max(...zaehl), "| leere Frames", zaehl.filter(z=>z===0).length);
console.log("Fahrzeuge im Bild: Schnitt", avg(autos).toFixed(2), "| max", Math.max(...autos), "| Frames ohne Fahrzeug", autos.filter(z=>z===0).length);

// Schlagloch und Radarfalle gezielt anfahren
r.reset();
for (let i=0;i<60*2;i++){ r.playerX = 0; r.update(1/60); }
const h = r.potholes[0];
h.z = r.position + r.playerZ + 200; h.lane = 0; h.done = false;
for (let i=0;i<40;i++){ r.playerX = 0; r.update(1/60); }
console.log("Schlagloch: Treffer", r.bumps, "| Meldung:", r.hud.hint);
const b = r.roadside.find(o => o.kind === "blitzer");
b.z = r.position + r.playerZ + 200; b.done = false;
for (let i=0;i<40;i++){ r.playerX = 0; r.update(1/60); }
console.log("Radarfalle: Blitz", r.blitze > 0 ? "ja" : "nein", "| Meldung:", r.hud.hint);
