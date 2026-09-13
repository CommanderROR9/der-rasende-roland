// Original night pixel art for the motorcycle journey. Local matrices only.
import { hash2 } from './render.js';
import { journeySection } from './cabrio-drive.js';

export const MOTORRAD_PALETTE = {
  '.':'#101623', d:'#243040', g:'#3d4c5e', G:'#8b9bab', w:'#e8e2cd',
  r:'#7e2f36', R:'#c8504f', c:'#ff9d6e', y:'#ffd675', a:'#5e7482',
  b:'#2e4a56', B:'#6fa3a8', s:'#c9a173', h:'#c7d1cf', H:'#edf1df',
  e:'#0f1f22', E:'#1d3a34', f:'#2c5a48', F:'#4d8a68', m:'#4a3f35',
  M:'#7a6350', t:'#9fd8d2', o:'#5c4a3c', O:'#8a6f52', p:'#7a5a7e',
};
function pixel(w,h,paint) {
  const rows = Array.from({length:h}, () => Array(w).fill(' '));
  const rect = (x,y,width,height,c) => {
    for (let j=Math.max(0,y);j<Math.min(h,y+height);j++)
      for (let i=Math.max(0,x);i<Math.min(w,x+width);i++) rows[j][i]=c;
  };
  paint(rect);
  return rows.map(row=>row.join(''));
}
function bike(braking=false) {
  return pixel(30,26,q=>{
    // Heckansicht eines Motorrads: EIN Hinterrad in der Mitte, schmaler Aufbau,
    // Fahrer von hinten mit Helm, Schultern, Spiegeln und Rücklicht.
    // Das Vorderrad ist verdeckt — zwei Räder nebeneinander wären ein Auto.
    q(12,18,6,8,'d');                   // Hinterrad (mittig, eine Spur)
    q(13,19,4,6,'.');                   // Profil
    q(14,21,2,2,'G');                   // Nabe
    q(11,15,8,3,'m');                   // Sitzbank/Heck
    q(11,15,8,1,'M');
    q(12,12,6,3,braking?'y':'R');       // Rücklicht
    q(13,13,4,1,braking?'w':'c');
    q(9,13,2,2,'y'); q(19,13,2,2,'y');  // Blinker
    q(12,7,6,6,'m');                    // Rücken des Fahrers
    q(13,7,4,2,'M');
    q(14,9,2,4,'d');
    q(10,7,10,2,'m');                   // Schultern
    q(7,8,4,4,'m'); q(19,8,4,4,'m');    // Arme zu den Griffen
    q(6,11,3,2,'d'); q(21,11,3,2,'d');  // Griffe
    q(5,6,3,2,'a'); q(22,6,3,2,'a');    // Spiegel
    q(6,8,1,3,'g'); q(23,8,1,3,'g');    // Spiegelstiele
    q(12,1,6,6,'h');                    // Helm
    q(13,2,4,2,'H');
    q(12,1,6,1,'r');                    // Helmstreifen
    q(13,6,4,2,'d');                    // Nacken
    q(18,16,3,2,'G');                   // Auspuff
  });
}
function nightTraffic(front=false) {
  return pixel(30,23,q=>{
    q(5,2,20,2,'a'); q(3,4,24,10,'d'); q(5,4,20,6,'b');
    q(7,4,16,1,'B'); q(14,4,1,6,'a');
    q(2,13,26,6,front?'G':'b'); q(3,13,24,2,front?'a':'B');
    q(3,19,24,2,'d'); q(1,17,5,6,'.'); q(24,17,5,6,'.');
    q(3,17,6,2,front?'y':'R'); q(21,17,6,2,front?'y':'R');
    // Headlights cut the dark; taillights glow ahead.
    if (front) { q(8,10,5,2,'y'); q(17,10,5,2,'y'); }
    else { q(4,14,3,2,'R'); q(23,14,3,2,'R'); }
    q(10,17,10,2,'d'); q(12,19,6,1,'w');
  });
}
export const MOTORRAD_SPRITES = {
  motorrad:bike(), motorrad_brake:bike(true), auto:nightTraffic(), oncoming:nightTraffic(true),
  lkw:pixel(34,42,q=>{q(3,1,28,34,'d');q(5,3,24,31,'g');q(16,3,2,31,'b');q(6,30,22,2,'a');q(1,34,7,8,'.');q(26,34,7,8,'.');q(3,35,28,3,'g');q(4,36,5,2,'R');q(25,36,5,2,'R');q(8,10,6,4,'y');}),
  house_night:pixel(48,55,q=>{q(5,18,38,37,'o');for(let i=0;i<10;i++)q(4+i,16-i,40-i*2,2,'d');q(10,5,4,9,'m');q(7,19,34,2,'O');q(7,21,34,29,'O');for(let y=25;y<46;y+=12)for(let x=11;x<36;x+=12){q(x,y,7,8,'d');q(x+1,y+1,5,5,'y');}q(20,44,8,11,'m');q(2,51,44,4,'m');}),
  pine:pixel(26,62,q=>{q(12,34,3,28,'m');q(8,20,11,26,'e');q(6,26,15,20,'E');q(10,8,7,28,'f');q(7,16,13,20,'E');q(11,2,5,22,'F');q(8,30,11,8,'e');}),
  reed:pixel(30,34,q=>{for(let i=0;i<7;i++){const x=2+i*4,h=14+Math.round(hash2(i,3)*16);q(x,34-h,2,h,i%2?'F':'f');q(x,34-h,2,2,'y');}q(0,32,30,2,'e');}),
  lamp:pixel(8,40,q=>{q(3,0,2,40,'g');q(1,0,6,4,'d');q(2,4,4,3,'y');q(2,7,4,8,'y');}),
  home:pixel(60,58,q=>{q(8,20,44,38,'o');for(let i=0;i<12;i++)q(6+i,18-i,48-i*2,2,'r');q(26,4,5,12,'m');q(8,22,44,2,'O');q(8,24,44,30,'O');for(let x=13;x<48;x+=12){q(x,28,8,10,'d');q(x+1,29,6,8,'y');}q(26,46,9,12,'m');q(27,47,7,10,'y');q(2,54,56,4,'m');}),
  post:pixel(5,16,q=>{q(1,1,3,15,'w');q(1,4,3,5,'.');q(2,5,1,2,'y');}),
  arrow:pixel(24,25,q=>{q(3,14,2,11,'g');q(19,14,2,11,'g');q(0,0,24,15,'w');q(1,1,22,13,'r');for(let y=2;y<13;y++){const x=5+Math.min(y-2,12-y);q(x,y,5,1,'w');}}),
  schlagloch:pixel(24,10,q=>{q(4,0,14,2,'G');q(1,2,22,6,'g');q(4,3,15,5,'.');q(7,8,12,2,'d');}),
};

export const NIGHT_SCENES = {
  plaza:{ sky:['#0a0e22','#1a2040','#3a3050','#6b4a5a'], fog:'#2a2438', far:'#232038', near:'#171726', grass:['#1c2a24','#1a271f'],road:['#2c2f3a','#2a2d36'] },
  river:{ sky:['#060a1c','#141c38','#2c3a5e','#4a5a7a'], fog:'#232c44', far:'#1c2640', near:'#121a2c', grass:['#16241e','#142019'],road:['#282c38','#262a34'] },
  tunnel:{ sky:['#050507','#0a0a0e','#141418','#1e1e26'], fog:'#101014', far:'#0c0c12', near:'#08080c', grass:['#101418','#0e1216'],road:['#23262e','#20232a'] },
  forest:{ sky:['#070c1a','#121a30','#24344c','#3c4c5e'], fog:'#1c2636', far:'#182234', near:'#101828', grass:['#14231c','#122018'],road:['#252b36','#232933'] },
  village:{ sky:['#0a0e20','#1c2444','#40365a','#7a5a60'], fog:'#2c263e', far:'#262040', near:'#1a1828', grass:['#1e2c26','#1c2921'],road:['#2e313c','#2b2e38'] },
};
export function nightSceneFor(r) { return NIGHT_SCENES[journeySection(r).theme]; }
function poly(ctx, points, color) {
  ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();
}
/** Deckenlampen im Tunnel: so nah wie möglich am Fluchtpunkt, nie seitlich wandernd. */
const LAMPEN_ABSTAND = 6;      // jedes sechste sichtbare Segment bekommt eine Leuchte
const LAMPEN_K = 0.5;          // Höhe der Decke über dem Horizont je Fahrbahntiefe
const LAMPEN_TIEFE = 74;       // bis hierher reicht die Decke im Bild
const LAMPEN_HOEHE = (rel) => Math.round(rel * LAMPEN_K);
export function drawNightSky(r,ctx,visible) {
  const {vw:w,vh:h}=r, horizon=Math.ceil(h/2);
  if (r.imTunnel()) {
    ctx.fillStyle='#060609';ctx.fillRect(0,0,w,horizon+2);
    // Tunneldecke: eine Fläche, die auf den Fluchtpunkt zuläuft. Die Lampen
    // sitzen auf der Strecke und kommen mit der Fahrt näher — vorher lagen sie
    // als gelbes Band auf einer Höhe und liefen seitlich vorbei (sah wie ein Zug aus).
    const segs=Array.isArray(visible)?visible:[];
    const decke=Math.round(LAMPEN_TIEFE*LAMPEN_K);
    const vp=segs.length?segs[segs.length-1].p1.screen.x:Math.round(w/2);
    poly(ctx,[[0,0],[w,0],[w,horizon-decke],[vp,horizon],[0,horizon-decke]],'#0d0c11');
    ctx.fillStyle='#221f18';ctx.fillRect(0,horizon-4,w,4);
    const imTunnel=(i)=>(r.tunnel||[]).some((t)=>i>=t.from&&i<t.to);
    for(const seg of segs){
      if(seg.index%LAMPEN_ABSTAND)continue;
      if(!imTunnel(seg.index))continue;
      const rel=seg.p1.screen.fy-horizon;          // Tiefe: nah = groß
      if(rel<=8||rel>LAMPEN_TIEFE)continue;
      const ly=horizon-LAMPEN_HOEHE(rel);
      const bw=Math.max(2,Math.round(rel*0.30));   // mit der Entfernung schmaler
      const bh=Math.max(1,Math.round(rel*0.035));
      ctx.fillStyle='rgba(255,226,168,0.08)';
      ctx.fillRect(Math.round(seg.p1.screen.x)-bw,ly-bh,bw*2,bh*3);
      ctx.fillStyle='#ffe2a8';
      ctx.fillRect(Math.round(seg.p1.screen.x-bw/2),ly,bw,bh);
    }
    ctx.fillStyle='#0c0c12';ctx.fillRect(0,horizon,w,2);
    return;
  }
  const s=nightSceneFor(r);
  for(let i=0;i<4;i++){ctx.fillStyle=s.sky[i];ctx.fillRect(0,Math.floor(i*horizon/4),w,Math.ceil(horizon/4)+1);}
  ctx.fillStyle='rgba(226,232,255,0.8)';
  for(let i=0;i<30;i++){
    const sx=Math.round((hash2(i,7,3)*w+r.time*1.2)%w), sy=Math.round(hash2(i,11,5)*(horizon-14));
    ctx.fillRect(sx,sy,1,1);
  }
  ctx.fillStyle='rgba(223,232,255,0.25)';ctx.fillRect(Math.round(w*.2)-11,14,22,22);
  ctx.fillStyle='#dfe8ff';ctx.fillRect(Math.round(w*.2)-7,18,14,14);
  if(journeySection(r).theme==='river'){
    ctx.fillStyle='#31435f';ctx.fillRect(0,horizon-8,w,8);
    ctx.fillStyle='rgba(223,232,255,0.35)';ctx.fillRect(Math.round(w*.2)-4,horizon-7,8,2);
    for(let i=0;i<8;i++){const x=Math.round((hash2(i,5)*w+r.time*4)%w);ctx.fillStyle='rgba(190,210,230,0.25)';ctx.fillRect(x,horizon-6,10,1);}
  }
  for(let layer=0;layer<2;layer++){
    const points=[[0,horizon+3]], shift=r.playerX*(layer?9:4);
    for(let x=-24;x<=w+24;x+=12){
      const y=horizon-5-layer*2-Math.round((Math.sin((x+shift)*.024+layer)*.5+.5)*(layer?10:20));points.push([x,y]);
    }
    points.push([w+24,horizon+3]);poly(ctx,points,layer?s.near:s.far);
  }
  ctx.fillStyle=s.grass[0];ctx.fillRect(0,horizon,w,h-horizon);
}
export function drawNightSegment(r,ctx,seg) {
  const s=nightSceneFor(r), dark=Math.floor(seg.index/3)%2===0;
  const a=seg.p1.screen,b=seg.p2.screen;
  ctx.fillStyle=s.grass[dark?0:1];ctx.fillRect(0,b.y,r.vw,a.y-b.y);
  const band=(lo,hi,color)=>poly(ctx,[[a.x+a.w*lo,a.y],[a.x+a.w*hi,a.y],[b.x+b.w*hi,b.y],[b.x+b.w*lo,b.y]],color);
  band(-1.07,1.07,'#6e6a58');
  band(-1,1,s.road[dark?0:1]);
  band(-.975,-.96,'#c9cfae');band(.96,.975,'#c9cfae');
  if(dark)band(-.012,.012,'#d8cf8e');
  if(r.rain&&dark){ctx.globalAlpha=.14;band(.12,.26,'#9fc0cc');ctx.globalAlpha=1;}
  ctx.globalAlpha=(1-seg.fog)*.85;ctx.fillStyle=s.fog;ctx.fillRect(0,b.y,r.vw,a.y-b.y);ctx.globalAlpha=1;
}
/** Scheinwerferkegel auf der Straße: von der Lampe bis knapp unter den Horizont,
 *  sich zum Fluchtpunkt hin verbreiternd, mit hellem Lichtsee am Vorderrad.
 *  Alles liegt UNTER dem Horizont — über dem Horizont ist Nacht. */
export function headlightCone(r) {
  const oben=Math.ceil(r.vh/2)+4;        // knapp unter dem Horizont
  const unten=Math.round(r.vh-26);       // Lampenhöhe am Fahrzeug
  const bands=[], N=30;
  for(let i=0;i<N;i++){
    const t=i/(N-1);                     // 0 = am Fahrzeug, 1 = Fluchtpunkt
    bands.push({
      y:Math.round(unten-t*(unten-oben)),
      breite:Math.round(18+t*r.vw*0.6),  // zum Fluchtpunkt hin breiter
      alpha:Number((0.10+0.14*(1-t)*(1-t)).toFixed(3)),   // nah heller
    });
  }
  return bands;
}
/** Heller Lichtsee direkt vor dem Vorderrad — ebenfalls auf der Straße. */
export function headlightPool(r) {
  const horizon=Math.ceil(r.vh/2);
  const hoehe=Math.max(6,Math.round(r.vh*0.06));
  const y=Math.max(horizon+2,Math.round(r.vh-26));
  return { y, hoehe, breite:Math.round(r.vw*0.44), alpha:0.22 };
}
export function drawNightBike(r,ctx) {
  const spr=r.sprite(r.input.action()?'motorrad_brake':'motorrad');
  const w=Math.round(r.vw*.20), h=Math.round(w*spr.h/spr.w);
  const x=Math.round(r.vw/2-w/2), y=r.vh-8-h;
  const turn=Math.round((r.lenkung||0)*3);
  // Der Kegel gehört auf die Straße, nicht an den Himmel.
  const pool=headlightPool(r);
  ctx.fillStyle=`rgba(255,236,200,${pool.alpha})`;
  ctx.fillRect(Math.round(r.vw/2+turn-pool.breite/2),pool.y,pool.breite,pool.hoehe);
  for(const band of headlightCone(r)){
    ctx.fillStyle=`rgba(255,232,180,${band.alpha})`;
    ctx.fillRect(Math.round(r.vw/2+turn-band.breite/2),band.y,band.breite,3);
  }
  ctx.fillStyle='rgba(14,24,30,.4)';ctx.fillRect(x+3,r.vh-11,w-6,5);
  ctx.drawImage(spr.canvas,0,0,spr.w,spr.h,x+turn,y,w,h);
  // KURZE PAUSE liegt hochaufgeloest im DOM (#roPause); Canvas malt hier nichts.
}
export function drawNightHud(r,ctx) {
  // Same journey HUD contract as the Cabrio; shared layout, night tint.
  // Phase A: liegt hochaufgeloest im DOM (#racerOverlay). Canvas malt nichts doppelt.
  void r; void ctx;
}
