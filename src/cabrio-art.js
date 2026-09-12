// Original pixel art: small, deliberately layered matrices, no remote assets.
import { hash2 } from './render.js';
import { journeySection, drivingCue } from './cabrio-drive.js';

export const CABRIO_PALETTE = {
  '.':'#141e2a', d:'#293a47', g:'#526b79', G:'#9bafb6', w:'#eee8d0',
  r:'#9d353f', R:'#e85e54', c:'#ff9970', y:'#ffd675', a:'#9ab5b6',
  b:'#519da6', B:'#9cd4ce', s:'#dda779', h:'#c7d1cf', H:'#edf1df',
  e:'#243e38', E:'#38604b', f:'#60865d', F:'#8fa36a', m:'#705749',
  M:'#b68257', t:'#a7c1c1', o:'#b56c49', O:'#e4a16b', p:'#bd7289',
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
function cabrio(braking=false) {
  return pixel(44,27, q=>{
    q(3,19,6,8,'.'); q(35,19,6,8,'.');
    q(8,2,28,2,'a'); q(7,4,30,8,'.'); q(9,4,26,3,'b'); q(11,4,21,1,'B');
    q(8,8,28,8,'m'); q(10,8,9,7,'d'); q(25,8,9,7,'d');
    // Roland from behind: silver hair and shirt, not an anonymous black cockpit.
    q(12,6,6,6,'h'); q(13,6,5,2,'H'); q(13,11,4,2,'s'); q(11,13,9,3,'w');
    // Closed music folder on the passenger seat, gold clip and paper edge.
    q(27,9,7,7,'M'); q(28,10,5,1,'w'); q(28,12,3,2,'y');
    q(5,14,34,7,'r'); q(5,14,34,2,'R'); q(3,17,38,5,'R'); q(6,17,32,1,'c');
    q(4,21,36,3,'r'); q(4,22,36,1,'a'); q(7,24,30,1,'.');
    q(5,19,7,2,braking?'y':'r'); q(32,19,7,2,braking?'y':'r');
    q(6,19,5,1,braking?'w':'R'); q(33,19,5,1,braking?'w':'R');
    q(18,21,8,2,'w'); q(20,21,4,1,'g'); q(28,24,4,1,'G');
    q(1,12,5,2,'R'); q(38,12,5,2,'R');
  });
}
function traffic(front=false) {
  return pixel(30,23,q=>{
    q(5,2,20,2,'a'); q(3,4,24,10,'g'); q(5,4,20,6,'b');
    q(7,4,16,1,'B'); q(14,4,1,6,'a');
    q(2,13,26,6,front?'G':'b'); q(3,13,24,2,front?'a':'B');
    q(3,19,24,2,'d'); q(1,17,5,6,'.'); q(24,17,5,6,'.');
    q(3,17,6,2,front?'y':'R'); q(21,17,6,2,front?'y':'R');
    q(10,17,10,2,'d'); q(12,19,6,1,'w');
  });
}
export const CABRIO_SPRITES = {
  mx5:cabrio(), mx5_brake:cabrio(true), auto:traffic(), oncoming:traffic(true),
  lkw:pixel(34,42,q=>{q(3,1,28,34,'G');q(5,3,24,31,'w');q(16,3,2,31,'g');q(6,30,22,2,'b');q(8,10,6,10,'b');q(20,10,6,10,'b');q(1,34,7,8,'.');q(26,34,7,8,'.');q(3,35,28,3,'g');q(4,36,5,2,'R');q(25,36,5,2,'R');}),
  oak:pixel(42,58,q=>{q(19,27,6,31,'m');q(18,31,3,19,'M');q(9,14,25,25,'e');q(2,16,36,16,'E');q(6,7,30,21,'E');q(12,1,18,16,'f');q(5,16,13,9,'f');q(16,8,18,9,'f');q(16,4,9,5,'F');q(6,22,8,4,'F');q(28,18,10,12,'e');}),
  poplar:pixel(22,64,q=>{q(10,32,3,32,'m');q(7,9,9,39,'e');q(5,15,13,28,'E');q(9,1,5,46,'f');q(6,19,6,21,'f');q(10,4,3,24,'F');}),
  house:pixel(48,55,q=>{q(5,18,38,37,'o');for(let i=0;i<10;i++)q(4+i,16-i,40-i*2,2,'r');q(10,5,4,9,'m');q(7,19,34,2,'O');q(7,21,34,29,'O');for(let y=25;y<46;y+=12)for(let x=11;x<36;x+=12){q(x,y,7,8,'d');q(x+1,y+1,5,5,'y');q(x+3,y,1,8,'o');}q(20,44,8,11,'m');q(2,51,44,4,'m');}),
  stage:pixel(110,64,q=>{q(3,4,7,60,'g');q(100,4,7,60,'g');q(3,3,104,6,'G');q(12,12,86,8,'b');q(17,14,76,2,'y');q(19,24,72,8,'r');q(12,50,86,14,'d');q(16,49,78,3,'M');q(24,34,8,15,'.');q(78,34,8,15,'.');for(let x=18;x<100;x+=18){q(x,8,5,5,'y');q(x,21,2,8,'p');}q(48,30,14,15,'w');q(49,43,2,9,'g');q(59,43,2,9,'g');}),
  pennant:pixel(20,46,q=>{q(2,0,2,46,'g');q(4,2,16,2,'y');for(let y=4;y<23;y++)q(4,y,Math.max(1,16-Math.floor(y/2)) ,y<12?'R':'y');}),
  post:pixel(5,16,q=>{q(1,1,3,15,'w');q(1,4,3,5,'.');q(2,5,1,2,'y');}),
  arrow:pixel(24,25,q=>{q(3,14,2,11,'g');q(19,14,2,11,'g');q(0,0,24,15,'w');q(1,1,22,13,'r');for(let y=2;y<13;y++){const x=5+Math.min(y-2,12-y);q(x,y,5,1,'w');}}),
  schlagloch:pixel(24,10,q=>{q(4,0,14,2,'G');q(1,2,22,6,'g');q(4,3,15,5,'.');q(7,8,12,2,'d');}),
};

export const SCENES = {
  town:{ sky:['#536986','#9b8295','#d69a91','#efbd96'], fog:'#bf9b9b', far:'#9a7b86', near:'#665e77', grass:['#7e8658','#778051'],road:['#4a5360','#47505c'] },
  fields:{ sky:['#487e9a','#88a9b1','#d4beb0','#f2cf9e'], fog:'#b3b6a0', far:'#869987', near:'#547f70', grass:['#778f53','#6e874d'],road:['#46545e','#434f59'] },
  rain:{ sky:['#374d68','#566f84','#849ba7','#b3babe'], fog:'#98aab0', far:'#748c96', near:'#4b6e75', grass:['#486c60','#446659'],road:['#455f70','#405969'] },
  festival:{ sky:['#537899','#9da8b4','#e9baa7','#ffdaa0'], fog:'#bbafa1', far:'#a59b8a', near:'#658270', grass:['#829469','#798d60'],road:['#4c5861','#46535c'] },
};
export function sceneFor(r) { return SCENES[journeySection(r).theme]; }
function poly(ctx, points, color) {
  ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();
}
export function drawJourneySky(r,ctx) {
  const {vw:w,vh:h}=r, horizon=Math.ceil(h/2), s=sceneFor(r);
  // Stepped sky bands remain pixel-art, not a blurry gradient photograph.
  for(let i=0;i<4;i++){ctx.fillStyle=s.sky[i];ctx.fillRect(0,Math.floor(i*horizon/4),w,Math.ceil(horizon/4)+1);}
  if(!r.rain){ctx.fillStyle='#ffe3a2';ctx.fillRect(Math.round(w*.73),horizon-42,25,23);ctx.fillStyle=s.sky[3];ctx.fillRect(Math.round(w*.73)-1,horizon-30,27,2);}
  for(let i=0;i<5;i++){
    const x=Math.round((hash2(i,4)*w + r.time*(r.rain?2:.7))%(w+65))-30;
    const y=23+Math.round(hash2(i,9)*28);
    ctx.fillStyle=r.rain?'#687f91':'#dbc5b9';ctx.fillRect(x,y,34,4);ctx.fillRect(x+8,y-4,20,4);
  }
  for(let layer=0;layer<2;layer++){
    const points=[[0,horizon+3]], shift=r.playerX*(layer?9:4);
    for(let x=-24;x<=w+24;x+=12){
      const y=horizon-6-layer*2-Math.round((Math.sin((x+shift)*.024+layer)*.5+.5)*(layer?11:23));points.push([x,y]);
    }
    points.push([w+24,horizon+3]);poly(ctx,points,layer?s.near:s.far);
  }
  if(journeySection(r).theme==='town'){
    for(let i=0;i<12;i++){
      const x=Math.round(i*w/11-r.playerX*7), height=10+Math.round(hash2(i,7)*17);
      ctx.fillStyle=i%2?s.near:s.far;ctx.fillRect(x,horizon-height,22,height);
      ctx.fillRect(x+3,horizon-height-3,15,3);
      ctx.fillStyle='#d1b291';for(let y=horizon-height+5;y<horizon-3;y+=7)ctx.fillRect(x+6,y,3,3);
    }
  }
  ctx.fillStyle=s.grass[0];ctx.fillRect(0,horizon,w,h-horizon);
}
export function drawJourneySegment(r,ctx,seg) {
  const s=sceneFor(r), dark=Math.floor(seg.index/3)%2===0;
  const a=seg.p1.screen,b=seg.p2.screen;
  ctx.fillStyle=s.grass[dark?0:1];ctx.fillRect(0,b.y,r.vw,a.y-b.y);
  const band=(lo,hi,color)=>poly(ctx,[[a.x+a.w*lo,a.y],[a.x+a.w*hi,a.y],[b.x+b.w*hi,b.y],[b.x+b.w*lo,b.y]],color);
  band(-1.07,1.07,r.rain?'#899591':'#b5af92');
  band(-1,1,s.road[dark?0:1]);
  band(-.975,-.96,'#d4d9c9');band(.96,.975,'#d4d9c9');
  if(dark)band(-.012,.012,'#efe2ab');
  // A wet sheen stays low-contrast; it must not disguise potholes or traffic.
  if(r.rain&&dark){ctx.globalAlpha=.12;band(.12,.26,'#b9d0d6');ctx.globalAlpha=1;}
  ctx.globalAlpha=(1-seg.fog)*.82;ctx.fillStyle=s.fog;ctx.fillRect(0,b.y,r.vw,a.y-b.y);ctx.globalAlpha=1;
}
export function drawJourneyCar(r,ctx) {
  const spr=r.sprite(r.input.action()?'mx5_brake':'mx5');
  // Matches projected road width at the collision plane. Its half width plus
  // the traffic half width agrees with the collision envelope in the simulation.
  const w=Math.round(r.vw*.26), h=Math.round(w*spr.h/spr.w);
  const x=Math.round(r.vw/2-w/2), y=r.vh-8-h;
  ctx.fillStyle='rgba(14,24,30,.35)';ctx.fillRect(x+3,r.vh-11,w-6,5);
  const turn=Math.round((r.lenkung||0)*2);
  ctx.drawImage(spr.canvas,0,0,spr.w,14,x+turn,y,w,Math.round(h*14/spr.h));
  ctx.drawImage(spr.canvas,0,14,spr.w,spr.h-14,x,y+Math.round(h*14/spr.h),w,h-Math.round(h*14/spr.h));
  // A loose paper edge, not a new collectible or a loss of the actual mappe.
  const sway=r.journeyState.sway;
  if(Math.abs(sway)>.25){ctx.fillStyle='#fff0ba';ctx.fillRect(Math.round(x+w*.64+sway*4),y+Math.round(h*.3),5,2);}
  if(r.panneTimer>0){ctx.fillStyle='#ffd675';ctx.font='bold 7px monospace';ctx.textAlign='center';ctx.fillText('KURZE PAUSE',r.vw/2,y-4);ctx.textAlign='left';}
}
export function drawJourneyHud(r,ctx) {
  const d=drivingCue(r), sections=r.level.journey.sections, j=r.journeyState;
  const index=sections.findIndex(s=>s.id===d.sectionId), compact=r.vw<320;
  const box=compact?121:151, right=compact?91:118;
  ctx.fillStyle='rgba(16,31,44,.88)';ctx.fillRect(5,5,box,29);ctx.fillRect(r.vw-right-5,5,right,29);
  ctx.fillStyle='#f9e9c2';ctx.font=`bold ${compact?7:8}px monospace`;ctx.textAlign='left';
  ctx.fillText(`${index+1} / 4  ${d.section}`,10,15);
  for(let i=0;i<sections.length;i++){
    const x=10+i*(box-10)/4;
    ctx.fillStyle=i<j.results.length?(j.results[i].clean?'#85d6c6':'#dfac81'):i===index?'#ffdc8b':'#465b68';
    ctx.fillRect(Math.round(x),22,Math.floor((box-18)/4),3);
  }
  const rx=r.vw-right;
  ctx.fillStyle=d.braking?'#ffad83':'#9cdbd3';ctx.font=`bold ${compact?7:8}px monospace`;
  ctx.fillText(d.braking?'BREMSE':d.direction==='straight'?'GERADEAUS':d.direction==='right'?'RECHTS >':'< LINKS',rx,15);
  ctx.fillStyle='#f5dfae';ctx.font='6px monospace';
  ctx.fillText(`RICHTTEMPO ${d.advisedSpeed}`,rx,26);
  // Persistent input help in the calm sky band, away from the road's vanishing point.
  ctx.fillStyle='rgba(16,31,44,.8)';ctx.fillRect(5,37,compact?170:215,12);
  ctx.fillStyle='#e4e1ce';ctx.font=compact?'6px monospace':'7px monospace';
  ctx.fillText(d.cue,9,45);
}
