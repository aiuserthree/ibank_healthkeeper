/* 곰돌이 새총 원정대(slingfort) — 1단계: 물리 · 새총 · 무너짐
 *  · 장면: three.js r128(로우폴리, 시안 mock3d 그대로), 물리: cannon-es 0.20.0(MIT, 본체에 넣음)
 *  · 물리는 고정 걸음 1/60초, 같은 입력 → 같은 결과(물리 · 판정에는 무작위를 쓰지 않는다 — 효과만 Math.random)
 *  · 블록은 처음에 잠든 채로 놓이고(쌓은 더미가 떨지 않게), 맞거나 받치던 것이 사라지면 깨어난다
 *  · 맞은 세기 = 한 걸음 동안 바뀐 속도(중력 몫 뺌). 재료마다 견디는 값을 넘은 만큼 체력이 깎이고 0 이면 부서진다
 *  · ?test=1 이면 window.SF 시험 걸이(load · shoot · run · state · snapshot · bench)
 */
'use strict';
const $=id=>document.getElementById(id);
const Q=new URLSearchParams(location.search);
const TEST=Q.get('test')==='1';
const MOBILE=(window.matchMedia&&matchMedia('(pointer:coarse)').matches)||/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const DEG=Math.PI/180;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
const V3=THREE.Vector3;

/* ───────── 1. 단계 자료 ─────────
 * 좌표: 요새 기준점(FX,FZ)에서의 거리(m). x 는 요새 폭(화면에서는 +x 가 왼쪽), z 는 깊이(+z 가 멀리), y 는 블록 밑면 높이.
 * blocks: [재료, 폭, 높이, 깊이, x, 밑면y, z]   enemies: [x, 밑면y, z, 돌림(도)]
 * bears: 쏘는 순서(basic 만 1단계. bomb · shield · giant 는 2단계에서) */
const FX=-6,FZ=26;
const BEARS={
  basic:{icon:'🐻',tag:'',tagc:'',col:0xa86a34},
  bomb:{icon:'🍯',tag:'꿀폭탄',tagc:'#d8452e',col:0x8a5226},
  shield:{icon:'🛡️',tag:'방패',tagc:'#2f7fd8',col:0xb07a44},
  giant:{icon:'💪',tag:'큰곰',tagc:'#e0862a',col:0x7a4520},
};
const LEVELS=[
  {id:1,name:'숲속 연습장',sub:'곰을 뒤로 당겼다 놓아 요새를 무너뜨려요!',tutorial:true,
   bears:['basic','basic','basic'],
   blocks:[
     ['wood',.5,2.4,.5,-1.6,0,0],['wood',.5,2.4,.5,1.6,0,0],['wood',4.2,.35,1.0,0,2.4,0],
     ['wood',1.2,1.2,1.2,-3.6,0,0],['wood',1.2,1.2,1.2,-3.6,1.2,0],
     ['wood',1.0,1.0,1.0,3.3,0,-.1],['wood',1.0,1.0,1.0,4.35,0,-.1],['wood',1.0,1.0,1.0,3.8,1.0,-.1],
   ],
   enemies:[[0,2.75,0,0],[-3.6,2.4,0,15],[0,0,1.3,-10]],
   fence:[[-6,3.2,3.2,3.2]],banners:[[-4.5,2.8],[.5,3.0],[4.5,2.6]]},
  {id:2,name:'돌담 마을',sub:'돌은 무겁고 단단해요 · 받치는 아래를 노려 보세요!',
   bears:['basic','basic','basic','basic'],
   blocks:[
     ['stone',2.8,1.2,1.2,-3,0,0],['wood',.4,1.8,.4,-4.15,1.2,0],['wood',.4,1.8,.4,-1.85,1.2,0],['wood',3.2,.3,1.0,-3,3.0,0],
     ['stone',1.2,1.2,1.2,.2,0,0],['stone',1.2,1.2,1.2,.2,1.2,0],
     ['wood',.4,2.0,.4,2.0,0,0],['wood',.4,2.0,.4,4.4,0,0],['wood',3.0,.3,1.0,3.2,2.0,0],['wood',1.0,1.0,1.0,3.2,2.3,0],
     ['stone',1.0,1.0,1.0,5.9,0,.2],['wood',1.0,1.0,1.0,5.9,1.0,.2],
     ['wood',1.0,1.0,1.0,-5.4,0,-.2],
   ],
   enemies:[[-3,3.3,0,0],[-3,1.2,0,10],[.2,2.4,0,-15],[3.2,0,0,5]],
   fence:[[-7,3.2,7,3.2],[7.4,-1.8,7.4,3.0]],banners:[[-5.5,2.8],[0,3.0],[5.5,2.6]]},
];
// 시험용 큰 요새(블록 100) — 무너질 때 프레임 시간 재기(?test=1&level=stress 또는 SF.load('stress'))
const STRESS=(()=>{const b=[];const mats=['wood','stone','wood','ice','wood'];
  for(let r=0;r<5;r++)for(let i=0;i<10;i++)for(let k=0;k<2;k++)b.push([mats[r],.92,.9,.92,-4.7+i*.95+(r%2?.2:0),r*.9,k*.95-.47]);
  return {id:'stress',name:'시험 · 큰 벽',sub:'블록 100개',bears:['basic','basic','basic'],blocks:b,
    enemies:[[-3,4.5,0,0],[-.6,4.5,0,0],[1.8,4.5,0,0],[4,4.5,0,0]],fence:[],banners:[]}})();
const levelById=id=>id==='stress'?STRESS:LEVELS.find(l=>l.id==id)||LEVELS[0];

/* 재료: 밀도(kg/m³ 대신 쉬운 값) · 체력 · 견디는 속도 변화(m/s) · 부서질 때 금화 */
const MATS={
  wood:{dens:1.6,hp:12,thr:2.4,gold:3},
  stone:{dens:5.0,hp:26,thr:3.4,gold:5},
  ice:{dens:1.3,hp:4.5,thr:1.4,gold:2},
};
const ENEMY={w:.7,h:1.4,mass:1.5,dvKill:3.8,crushJ:2.4,gold:15};
const BEAR_R=.6,BEAR_M=6;
const G=-12;
const DT=1/60;
const P0=new V3(-1.6,4.35,-.25);           // 새총 주머니(쏘는 자리)
const PITCH=32*DEG;
const BASE_YAW=Math.atan2(FX-P0.x,FZ-P0.z); // 새총 → 요새 가운데
const YAW_RANGE=24*DEG;
const powerToSpeed=p=>9+14*p;

/* ───────── 2. 장면 ───────── */
const stage=$('stage');
const R=new THREE.WebGLRenderer({antialias:!MOBILE,powerPreference:'high-performance',preserveDrawingBuffer:TEST});
R.setPixelRatio(Math.min(window.devicePixelRatio||1,MOBILE?1.5:2));
R.shadowMap.enabled=true;R.shadowMap.type=MOBILE?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;
stage.prepend(R.domElement);
const S=new THREE.Scene();S.background=new THREE.Color(0x8fd0f5);S.fog=new THREE.Fog(0xbfe4f7,60,170);
const cam=new THREE.PerspectiveCamera(42,16/9,.1,400);
S.add(new THREE.HemisphereLight(0xdff2ff,0x4a7a2a,.62));
const sun=new THREE.DirectionalLight(0xfff1d6,1.05);sun.position.set(-30,50,-20);sun.castShadow=true;
sun.shadow.mapSize.set(MOBILE?1024:2048,MOBILE?1024:2048);Object.assign(sun.shadow.camera,{left:-34,right:34,top:34,bottom:-34,far:150});
sun.shadow.bias=-.0006;sun.shadow.camera.updateProjectionMatrix();S.add(sun);sun.target.position.set(-3,0,16);S.add(sun.target);
let vseed=7;const vr=()=>{vseed=(vseed*16807)%2147483647;return vseed/2147483647}; // 꾸밈 배치(늘 같은 모양)
const M=(c,o={})=>new THREE.MeshLambertMaterial(Object.assign({color:c},o));

// 꾸밈은 색마다 한 덩어리로 합쳐 그리기 수를 줄인다
function DecoBatch(){this.b=new Map()}
DecoBatch.prototype.add=function(geo,color,x,y,z,o={}){
  const key=color+'|'+(o.basic?1:0)+'|'+(o.shadow===false?0:1)+'|'+(o.op||1);
  const m=new THREE.Matrix4().compose(new V3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx||0,o.ry||0,o.rz||0)),new V3(o.sx||1,o.sy||1,o.sz||1));
  const g=(geo.index?geo.toNonIndexed():geo.clone());g.applyMatrix4(m);
  if(!this.b.has(key))this.b.set(key,{color,o,arr:[]});this.b.get(key).arr.push(g.attributes.position.array);
};
DecoBatch.prototype.flush=function(parent){
  for(const {color,o,arr} of this.b.values()){
    let n=0;arr.forEach(a=>n+=a.length);const pos=new Float32Array(n);let k=0;arr.forEach(a=>{pos.set(a,k);k+=a.length});
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.computeVertexNormals();
    const mat=o.basic?new THREE.MeshBasicMaterial({color,transparent:!!o.op,opacity:o.op||1}):new THREE.MeshLambertMaterial({color,transparent:!!o.op,opacity:o.op||1});
    const me=new THREE.Mesh(g,mat);me.castShadow=o.shadow!==false;me.receiveShadow=true;parent.add(me);
  }
  this.b.clear();
};
function tex(draw,w=128,h=128){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');draw(x,w,h);return new THREE.CanvasTexture(c)}
let tseed=7;const tr=()=>{tseed=(tseed*16807)%2147483647;return tseed/2147483647};
const drawWood=(x,w,h)=>{x.fillStyle='#c98a45';x.fillRect(0,0,w,h);for(let i=0;i<4;i++){x.fillStyle=i%2?'#bd7d3a':'#d39552';x.fillRect(0,i*32,w,30);x.fillStyle='#7a4a1e';x.fillRect(0,i*32+30,w,2)}x.strokeStyle='#5a3412';x.lineWidth=6;x.strokeRect(3,3,w-6,h-6);x.fillStyle='#4a2a10';[[12,12],[w-12,12],[12,h-12],[w-12,h-12]].forEach(([a,b])=>{x.beginPath();x.arc(a,b,4,0,7);x.fill()})};
const drawStone=(x,w,h)=>{x.fillStyle='#a3a7ab';x.fillRect(0,0,w,h);for(let i=0;i<260;i++){x.fillStyle=`rgba(${tr()>.5?255:40},${tr()>.5?255:40},${tr()>.5?255:40},.06)`;x.fillRect(tr()*w,tr()*h,6,6)}x.strokeStyle='#6d7378';x.lineWidth=3;x.strokeRect(2,2,w-4,h-4);x.beginPath();x.moveTo(0,h/2);x.lineTo(w,h/2);x.moveTo(w/2,0);x.lineTo(w/2,h/2);x.moveTo(w/4,h/2);x.lineTo(w/4,h);x.stroke()};
const drawIce=(x,w,h)=>{const g=x.createLinearGradient(0,0,w,h);g.addColorStop(0,'#e8fbff');g.addColorStop(1,'#a6e0f5');x.fillStyle=g;x.fillRect(0,0,w,h);x.strokeStyle='rgba(255,255,255,.9)';x.lineWidth=4;x.beginPath();x.moveTo(20,10);x.lineTo(50,60);x.lineTo(40,110);x.moveTo(90,20);x.lineTo(110,70);x.stroke();x.strokeStyle='#7cc4df';x.lineWidth=4;x.strokeRect(2,2,w-4,h-4)};
// 금: 0 · 1 · 2 단계
const drawCrack=(x,w,h,lv,col)=>{x.strokeStyle=col;x.lineCap='round';x.lineJoin='round';
  const paths=lv===1?[[[64,6],[58,34],[70,52],[60,78]],[[58,34],[36,46]]]:[[[64,6],[58,34],[70,52],[60,78],[72,104],[66,122]],[[58,34],[30,44],[16,62]],[[70,52],[98,60],[118,48]],[[60,78],[34,92]],[[72,104],[100,110]],[[6,20],[26,30]]];
  x.lineWidth=lv===1?4:5;paths.forEach(p=>{x.beginPath();x.moveTo(p[0][0],p[0][1]);p.slice(1).forEach(q=>x.lineTo(q[0],q[1]));x.stroke()})};
const BLOCKMAT={};
{
  const base={wood:drawWood,stone:drawStone,ice:drawIce},crack={wood:'#3a1e08',stone:'#3e4246',ice:'#ffffff'};
  for(const k of ['wood','stone','ice']){
    BLOCKMAT[k]=[0,1,2].map(lv=>{tseed=7;const t=tex((x,w,h)=>{base[k](x,w,h);if(lv)drawCrack(x,w,h,lv,crack[k])});
      return k==='ice'?new THREE.MeshLambertMaterial({map:t,transparent:true,opacity:.86}):new THREE.MeshLambertMaterial({map:t})});
  }
}
// 땅: 노는 자리(새총 ~ 요새)는 평평(물리 바닥 y=0 과 맞춤)
function groundH(x,z){let y=Math.sin(x*.05)*.6+Math.cos(z*.07)*.5;if(z<-5||z>40)y+=Math.max(0,(Math.abs(x)-60)*.05);y-=.6;if(z>44)y-=1.2;
  const f=clamp(1-Math.max(0,Math.abs(x+4)-16)/10,0,1)*clamp(1-Math.max(0,z-38)/5,0,1)*clamp(1-Math.max(0,-12-z)/8,0,1);return lerp(y,-.02,f)}
{
  const gg=new THREE.PlaneGeometry(400,400,100,100);gg.rotateX(-Math.PI/2);
  const p=gg.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,groundH(p.getX(i),p.getZ(i)));gg.computeVertexNormals();
  const gm=new THREE.Mesh(gg,M(0x5fb043));gm.receiveShadow=true;S.add(gm);
  const river=new THREE.Mesh(new THREE.PlaneGeometry(400,18),new THREE.MeshLambertMaterial({color:0x3aa7e0,transparent:true,opacity:.95}));river.rotation.x=-Math.PI/2;river.rotation.z=-.18;river.position.set(0,-.55,52);S.add(river);
}
const deco=new DecoBatch();
for(let i=0;i<40;i++)deco.add(new THREE.CircleGeometry(.5+vr()*.6,6),0xffffff,-80+vr()*160,-.5,46+vr()*12,{basic:1,op:.5,shadow:false,rx:-Math.PI/2,sy:.25});
deco.add(new THREE.PlaneGeometry(400,30),0xa8d07a,0,-.4,70,{rx:-Math.PI/2,shadow:false});
for(let i=0;i<9;i++){const h=18+vr()*22;deco.add(new THREE.ConeGeometry(14+vr()*12,h,5),i%2?0x7fa6b8:0x92b6c4,-110+i*28,h/2-2,120+vr()*20,{shadow:false})}
{ // 꽃(인스턴스)
  const n=300,fm=new THREE.InstancedMesh(new THREE.SphereGeometry(.09,5,4),new THREE.MeshBasicMaterial({color:0xffffff}),n);
  const mm=new THREE.Matrix4(),cols=[0xffffff,0xfff07a,0xffb3d1,0xc9b3ff].map(c=>new THREE.Color(c));
  for(let i=0;i<n;i++){const x=-30+vr()*60,z=-6+vr()*42;mm.makeTranslation(x,groundH(x,z)+.06,z);fm.setMatrixAt(i,mm);fm.setColorAt(i,cols[i%4])}
  S.add(fm);
}
function pine(B,x,z,s=1){const y0=groundH(x,z);B.add(new THREE.CylinderGeometry(.25*s,.35*s,1.6*s,6),0x7a4a26,x,y0+.6*s,z);for(let k=0;k<3;k++)B.add(new THREE.ConeGeometry((1.9-k*.45)*s,(2.1-k*.3)*s,7),k%2?0x2f9a3e:0x37ab48,x,y0+(1.9+k*1.15)*s,z)}
function round(B,x,z,s=1){const y0=groundH(x,z);B.add(new THREE.CylinderGeometry(.18*s,.24*s,2.4*s,6),0xefe8da,x,y0+1.1*s,z);B.add(new THREE.IcosahedronGeometry(1.4*s,0),0x9ad24a,x,y0+2.9*s,z)}
function maple(B,x,z,s=1){const y0=groundH(x,z);B.add(new THREE.CylinderGeometry(.22*s,.3*s,2*s,6),0x6a3c1e,x,y0+.9*s,z);B.add(new THREE.DodecahedronGeometry(1.5*s,0),0xe8762c,x,y0+2.8*s,z);B.add(new THREE.DodecahedronGeometry(1.0*s,0),0xf0a23a,x+.8*s,y0+3.4*s,z-.3)}
[[-9,10],[-6,18],[-12,26],[-4,34],[12,36],[18,30],[24,40],[-16,40],[6,44],[30,34],[-22,30],[16,46],[8,20],[-24,18],[-20,40]].filter(([x,z])=>!(x>-19&&x<6&&z>4&&z<38)).forEach(([x,z],i)=>(i%3==0?maple:i%3==1?pine:round)(deco,x,z,1+vr()*.5));
for(let i=0;i<14;i++)pine(deco,-40+i*7+vr()*3,62+vr()*6,1.3+vr()*.5);
for(let i=0;i<10;i++)maple(deco,-38+i*8,58+vr()*3,1.2);
for(let i=0;i<8;i++){const x=-14+vr()*28,z=4+vr()*30;deco.add(new THREE.DodecahedronGeometry(.4+vr()*.5,0),0x9b9a92,x,-.2,z,{sy:.6})}
deco.flush(S);

// 새총(시안 그대로)
const SL=new THREE.Group();S.add(SL);SL.position.set(-1.6,0,0);
{
  const bark=M(0x8a5428),rope=M(0xd9b27a),knob=M(0xf0c04a);
  const part=(g,m,x,y,z,rz=0)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.rotation.z=rz;o.castShadow=true;SL.add(o);return o};
  part(new THREE.CylinderGeometry(.42,.55,3.4,7),bark,0,1.5,0);
  for(let k=0;k<6;k++)part(new THREE.TorusGeometry(.47,.07,4,10),rope,0,.6+k*.35,0).rotation.x=Math.PI/2;
  part(new THREE.CylinderGeometry(.25,.36,2,6),bark,-.6,3.9,0,.45);part(new THREE.CylinderGeometry(.25,.36,2,6),bark,.6,3.9,0,-.45);
  part(new THREE.SphereGeometry(.38,7,6),knob,-1.05,4.85,0);part(new THREE.SphereGeometry(.38,7,6),knob,1.05,4.85,0);
}
const TIPS=[new V3(-1.6-1.05,4.85,0),new V3(-1.6+1.05,4.85,0)];
const bandMat=new THREE.MeshLambertMaterial({color:0x4a2a12});
const bands=TIPS.map(()=>{const o=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,1,5),bandMat);o.castShadow=true;S.add(o);return o});
const pouch=new THREE.Mesh(new THREE.BoxGeometry(.5,.08,.22),M(0x5a3418));pouch.castShadow=true;S.add(pouch);
const _up=new V3(0,1,0);
function setBand(o,a,b){const d=new V3().subVectors(b,a);const L=d.length();o.position.copy(a).addScaledVector(d,.5);o.scale.set(1,Math.max(L,.01),1);o.quaternion.setFromUnitVectors(_up,d.normalize())}

// 곰 · 너구리 모델(시안 그대로). 곰은 몸 가운데가 원점(물리 공과 맞춤)
function bearModel(s=1,col=0xa86a34,extra){const outer=new THREE.Group();const g=new THREE.Group();g.position.y=-1.05*s;g.scale.setScalar(s);outer.add(g);
  const add=(geo,m,a,b,c)=>{const o=new THREE.Mesh(geo,m);o.position.set(a,b,c);o.castShadow=true;g.add(o);return o};
  const fur=M(col),light=M(0xe8c48e),dark=M(0x2a1a0e);
  add(new THREE.SphereGeometry(.75,10,8),fur,0,.75,0).scale.set(1,.95,.9);
  add(new THREE.SphereGeometry(.5,8,6),light,0,.65,-.4).scale.set(1,1,.5);
  add(new THREE.SphereGeometry(.55,10,8),fur,0,1.75,0);
  add(new THREE.SphereGeometry(.2,6,5),fur,-.4,2.2,0);add(new THREE.SphereGeometry(.2,6,5),fur,.4,2.2,0);
  add(new THREE.SphereGeometry(.24,7,6),light,0,1.62,-.45).scale.z=.7;
  add(new THREE.SphereGeometry(.08,5,4),dark,0,1.7,-.62);add(new THREE.SphereGeometry(.06,5,4),dark,-.2,1.88,-.48);add(new THREE.SphereGeometry(.06,5,4),dark,.2,1.88,-.48);
  add(new THREE.TorusGeometry(.48,.11,5,12),M(0xd83a2e),0,1.3,0).rotation.x=Math.PI/2;
  add(new THREE.SphereGeometry(.22,6,5),fur,-.75,.9,-.1);add(new THREE.SphereGeometry(.22,6,5),fur,.75,.9,-.1);
  add(new THREE.SphereGeometry(.26,6,5),fur,-.35,.05,-.1);add(new THREE.SphereGeometry(.26,6,5),fur,.35,.05,-.1);
  if(extra)extra(add);return outer}
const COON_GEO=(()=>{const o={};o.body=new THREE.SphereGeometry(.42,8,6);o.head=new THREE.SphereGeometry(.38,9,7);o.ear=new THREE.ConeGeometry(.13,.28,4);o.muz=new THREE.SphereGeometry(.2,6,5);o.mask=new THREE.BoxGeometry(.72,.14,.2);o.eye=new THREE.SphereGeometry(.05,4,4);o.nose=new THREE.SphereGeometry(.06,4,4);o.hat=new THREE.ConeGeometry(.42,.12,10);o.tail=[0,1,2,3].map(k=>new THREE.SphereGeometry(.16-k*.01,6,5));return o})();
const COON_MAT={fur:M(0x8d8a86),wh:M(0xf2efe8),dk:M(0x2e2a28),eye:M(0xffffff),hat:M(0x3a5a2a)};
// 너구리 몸 상자 가운데가 원점(키 1.4 → 발은 -0.7)
function coonModel(){const outer=new THREE.Group();const g=new THREE.Group();g.position.y=-.7;outer.add(g);const G_=COON_GEO,Mt=COON_MAT;
  const add=(geo,m,a,b,c)=>{const o=new THREE.Mesh(geo,m);o.position.set(a,b,c);o.castShadow=true;g.add(o);return o};
  add(G_.body,Mt.fur,0,.45,0);add(G_.head,Mt.fur,0,1.05,0);add(G_.ear,Mt.dk,-.25,1.42,0);add(G_.ear,Mt.dk,.25,1.42,0);
  add(G_.muz,Mt.wh,0,.98,-.3).scale.z=.7;add(G_.mask,Mt.dk,0,1.1,-.28);add(G_.eye,Mt.eye,-.14,1.11,-.39);add(G_.eye,Mt.eye,.14,1.11,-.39);
  add(G_.nose,Mt.dk,0,.95,-.46);add(G_.hat,Mt.hat,0,1.38,0);for(let k=0;k<4;k++)add(G_.tail[k],k%2?Mt.dk:Mt.fur,0,.35+k*.12,.45+k*.12);
  return outer}

// 궤적 점선
const DOTS=30;
const dots=new THREE.InstancedMesh(new THREE.SphereGeometry(.13,6,5),new THREE.MeshBasicMaterial({color:0xffffff}),DOTS);dots.count=0;dots.frustumCulled=false;S.add(dots);

/* ───────── 3. 물리 ───────── */
let world,groundBody,PM;
function resetIds(){try{CANNON.Body.idCounter=0;CANNON.Shape.idCounter=0;CANNON.Material.idCounter=0;if(CANNON.Equation)CANNON.Equation.idCounter=0;if(CANNON.ContactMaterial)CANNON.ContactMaterial.idCounter=0}catch(e){}}
function makeWorld(){
  resetIds();
  world=new CANNON.World({gravity:new CANNON.Vec3(0,G,0)});
  world.allowSleep=true;
  world.broadphase=new CANNON.SAPBroadphase(world);world.broadphase.axisIndex=0;
  world.solver.iterations=14;world.solver.tolerance=1e-6;
  PM={ground:new CANNON.Material('ground'),wood:new CANNON.Material('wood'),stone:new CANNON.Material('stone'),ice:new CANNON.Material('ice'),bear:new CANNON.Material('bear'),enemy:new CANNON.Material('enemy')};
  world.defaultContactMaterial.friction=.55;world.defaultContactMaterial.restitution=.04;
  world.defaultContactMaterial.contactEquationStiffness=5e7;world.defaultContactMaterial.contactEquationRelaxation=3;
  const cm=(a,b,f,r)=>world.addContactMaterial(new CANNON.ContactMaterial(PM[a],PM[b],{friction:f,restitution:r,contactEquationStiffness:5e7,contactEquationRelaxation:3}));
  for(const k of ['ground','wood','stone','enemy','bear'])cm('ice',k,.1,.04);cm('ice','ice',.06,.04);
  for(const k of ['ground','wood','stone','enemy'])cm('bear',k,.5,.18);
  cm('stone','stone',.65,.02);cm('stone','ground',.7,.02);cm('wood','ground',.6,.03);
  // 바닥: 노는 자리만(그 밖은 강 · 낭떠러지 — 떨어지면 물에 빠짐)
  groundBody=new CANNON.Body({mass:0,material:PM.ground});
  groundBody.addShape(new CANNON.Box(new CANNON.Vec3(36,1,29)),new CANNON.Vec3(0,-1,0));
  groundBody.position.set(-4,0,14);world.addBody(groundBody);
}

/* ───────── 4. 판 상태 ───────── */
const game={level:null,phase:'intro',blocks:[],enemies:[],bear:null,queue:[],shotIdx:0,steps:0,shotStep:0,quiet:0,
  enemiesLeft:0,broken:0,gold:0,shotBroken:0,shotCrumble:false,result:null,introT:0,aimReadyT:0};
const fortG=new THREE.Group();S.add(fortG);
let loadedBear=null; // 새총에 얹힌 곰 그림(쏘면 날아가는 곰이 된다)

function clearLevel(){
  while(fortG.children.length){const c=fortG.children.pop();c.traverse(o=>{if(o.geometry&&o.userData.own)o.geometry.dispose()})}
  game.blocks=[];game.enemies=[];game.bear=null;
  fx.clear();
}
const boxGeoCache=new Map();
const boxGeo=(w,h,d)=>{const k=w+','+h+','+d;if(!boxGeoCache.has(k))boxGeoCache.set(k,new THREE.BoxGeometry(w,h,d));return boxGeoCache.get(k)};
function addBlock(spec,awake){
  const [mat,w,h,d,x,yb,z]=spec;const m=MATS[mat];
  const b=new CANNON.Body({mass:m.dens*w*h*d,material:PM[mat],allowSleep:true,sleepSpeedLimit:.2,sleepTimeLimit:.5,angularDamping:.08,linearDamping:.01});
  b.addShape(new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2)));b.position.set(FX+x,yb+h/2,FZ+z);
  world.addBody(b);if(!awake)b.sleep();
  const mesh=new THREE.Mesh(boxGeo(w,h,d),BLOCKMAT[mat][0]);mesh.castShadow=true;mesh.receiveShadow=true;fortG.add(mesh);
  const blk={kind:'block',mat,w,h,d,body:b,mesh,hp:m.hp,maxhp:m.hp,crack:0,alive:true,start:b.position.clone()};
  b.userData=blk;game.blocks.push(blk);syncMesh(blk);return blk;
}
function addEnemy(spec,awake){
  const [x,yb,z,rot]=spec;
  const b=new CANNON.Body({mass:ENEMY.mass,material:PM.enemy,allowSleep:true,sleepSpeedLimit:.2,sleepTimeLimit:.5,angularDamping:.1});
  b.addShape(new CANNON.Box(new CANNON.Vec3(ENEMY.w/2,ENEMY.h/2,ENEMY.w/2)));b.position.set(FX+x,yb+ENEMY.h/2,FZ+z);
  b.quaternion.setFromEuler(0,(rot||0)*DEG,0);world.addBody(b);if(!awake)b.sleep();
  const mesh=coonModel();fortG.add(mesh);
  const en={kind:'enemy',body:b,mesh,alive:true,start:b.position.clone(),dieT:0};b.userData=en;game.enemies.push(en);syncMesh(en);return en;
}
function addFence(B,x1,z1,x2,z2){
  const L=Math.hypot(x2-x1,z2-z1),n=Math.max(2,Math.round(L/.48));
  for(let i=0;i<=n;i++){const t=i/n,x=FX+lerp(x1,x2,t),z=FZ+lerp(z1,z2,t),h=2+(i%3)*.25;
    B.add(new THREE.CylinderGeometry(.22,.24,h,6),0xc07a3c,x,h/2-.3,z);B.add(new THREE.ConeGeometry(.22,.5,6),0xc88a4a,x,h-.05,z)}
  // 울타리는 움직이지 않는 벽(얇은 상자)
  const wb=new CANNON.Body({mass:0,material:PM.wood});wb.addShape(new CANNON.Box(new CANNON.Vec3(L/2,1.1,.22)));
  wb.position.set(FX+(x1+x2)/2,1.1,FZ+(z1+z2)/2);wb.quaternion.setFromEuler(0,-Math.atan2(z2-z1,x2-x1),0);world.addBody(wb);
}
function addBanner(B,x,z){x+=FX;z+=FZ;B.add(new THREE.CylinderGeometry(.06,.06,6,5),0x4a3020,x,2.7,z);B.add(new THREE.SphereGeometry(.14,6,5),0xf0c04a,x,5.75,z);
  B.add(new THREE.PlaneGeometry(1.1,1.9),0xe0682a,x+.6,4.6,z);B.add(new THREE.CircleGeometry(.3,10),0xfff2cf,x+.6,4.75,z-.02,{basic:1,shadow:false})}

function loadLevel(id,opts={}){
  clearLevel();makeWorld();
  const L=levelById(id);game.level=L;
  const B=new DecoBatch();(L.fence||[]).forEach(f=>addFence(B,...f));(L.banners||[]).forEach(b=>addBanner(B,...b));
  const dg=new THREE.Group();B.flush(dg);dg.children.forEach(c=>{c.userData.own=1;if(c.material.side!==undefined)c.material.side=THREE.DoubleSide});fortG.add(dg);
  L.blocks.forEach(s=>addBlock(s,opts.awake));L.enemies.forEach(s=>addEnemy(s,opts.awake));
  game.queue=L.bears.slice();game.shotIdx=0;game.steps=0;game.shotStep=0;game.quiet=0;
  game.enemiesLeft=game.enemies.length;game.broken=0;game.gold=0;game.result=null;game.shotBroken=0;game.shotCrumble=false;
  game.phase=opts.skipIntro?'aim':'intro';game.introT=0;game.aimReadyT=opts.skipIntro?1:0;
  ui.level(L);ui.enemies(game.enemiesLeft,false);ui.gold(0);ui.slots();ui.overlay(null);
  loadBearIntoSling();
  if(opts.skipIntro){camSnap(AIM_POS,AIM_LOOK);ui.banner(false)}else{ui.banner(true,L)}
  ui.hint(false);
}
function loadBearIntoSling(){
  if(loadedBear){S.remove(loadedBear);loadedBear=null}
  const t=game.queue[game.shotIdx];if(!t)return;
  loadedBear=bearModel(.62,BEARS[t].col);loadedBear.position.copy(P0);loadedBear.scale.setScalar(.01);loadedBear.userData.pop=0;S.add(loadedBear);
}
function syncMesh(o){const p=o.body.position,q=o.body.quaternion;o.mesh.position.set(p.x,p.y,p.z);o.mesh.quaternion.set(q.x,q.y,q.z,q.w)}

/* 쏘기(물리 쪽 — 시험 걸이도 이것을 부른다). yawOff: 기준 방향에서 돌린 각(라디안, +는 화면 왼쪽), power 0~1 */
function launchDir(yawOff){const y=BASE_YAW+yawOff;return new V3(Math.sin(y)*Math.cos(PITCH),Math.sin(PITCH),Math.cos(y)*Math.cos(PITCH))}
function shoot(yawOff,power){
  if(game.phase!=='aim'||!game.queue[game.shotIdx])return false;
  yawOff=clamp(yawOff,-YAW_RANGE,YAW_RANGE);power=clamp(power,0,1);
  const v=launchDir(yawOff).multiplyScalar(powerToSpeed(power));
  const b=new CANNON.Body({mass:BEAR_M,material:PM.bear,allowSleep:false,linearDamping:0,angularDamping:.5});
  b.addShape(new CANNON.Sphere(BEAR_R));b.position.set(P0.x,P0.y,P0.z);b.velocity.set(v.x,v.y,v.z);b.angularVelocity.set(-4,0,0);
  world.addBody(b);
  const mesh=loadedBear||bearModel(.62);mesh.scale.setScalar(1);loadedBear=null;
  game.bear={kind:'bear',type:game.queue[game.shotIdx],body:b,mesh,slow:0,gone:false};b.userData=game.bear;
  game.shotIdx++;game.phase='flight';game.shotStep=0;game.quiet=0;game.shotBroken=0;game.shotCrumble=false;
  ui.slots();ui.hint(false);fx.twang();
  return true;
}

// 몸이 사라진 자리 둘레의 잠든 것을 깨운다(받치던 것이 없어지면 떨어지도록)
function wakeAround(body,pad=.35){
  body.updateAABB();const a=body.aabb;
  for(const o of world.bodies){if(o.type!==CANNON.Body.DYNAMIC||o===body||o.sleepState!==CANNON.Body.SLEEPING)continue;
    o.updateAABB();const c=o.aabb;
    if(c.lowerBound.x<=a.upperBound.x+pad&&c.upperBound.x>=a.lowerBound.x-pad&&c.lowerBound.y<=a.upperBound.y+pad&&c.upperBound.y>=a.lowerBound.y-pad&&c.lowerBound.z<=a.upperBound.z+pad&&c.upperBound.z>=a.lowerBound.z-pad)o.wakeUp()}
}

/* 한 걸음(1/60초). 판정 · 금화 · 차례 넘김이 모두 여기서 — 화면 빠르기와 무관 */
const _pre=[];
function gameStep(){
  const bodies=world.bodies;
  for(let i=0;i<bodies.length;i++){const b=bodies[i];const v=b.velocity;_pre[i*3]=v.x;_pre[i*3+1]=v.y;_pre[i*3+2]=v.z}
  const nPre=bodies.length,preRef=bodies.slice();
  world.step(DT);
  game.steps++;
  const toBreak=[],toKill=[];
  // 1) 속도 변화로 맞은 세기 재기
  for(let i=0;i<nPre;i++){const b=preRef[i];const u=b.userData;if(!u||b.sleepState===CANNON.Body.SLEEPING)continue;
    const v=b.velocity;const dx=v.x-_pre[i*3],dy=v.y-_pre[i*3+1]-G*DT,dz=v.z-_pre[i*3+2];const dv=Math.sqrt(dx*dx+dy*dy+dz*dz);
    if(u.kind==='block'&&u.alive){const m=MATS[u.mat];if(dv>m.thr){u.hp-=(dv-m.thr);if(u.hp<=0)toBreak.push(u)}}
    else if(u.kind==='enemy'&&u.alive){if(dv>ENEMY.dvKill)toKill.push([u,'hit'])}
  }
  // 2) 너구리를 누르는 힘(깔림)
  const cs=world.contacts;
  for(let i=0;i<cs.length;i++){const c=cs[i];const a=c.bi.userData,b=c.bj.userData;
    const en=a&&a.kind==='enemy'?a:b&&b.kind==='enemy'?b:null;if(!en||!en.alive)continue;
    const other=en===a?c.bj:c.bi;if(other.type!==CANNON.Body.DYNAMIC)continue;
    if(c.multiplier*DT>ENEMY.crushJ&&!toKill.some(k=>k[0]===en))toKill.push([en,'crush'])}
  // 3) 떨어짐 · 물에 빠짐
  for(const en of game.enemies){if(!en.alive)continue;const p=en.body.position;
    if(p.y<-1.5||p.z>43||p.z<-14||p.x<-40||p.x>32){if(!toKill.some(k=>k[0]===en))toKill.push([en,'out'])}}
  for(const blk of game.blocks){if(blk.alive&&blk.body.position.y<-3)toBreak.push(blk)}
  // 4) 부서짐
  for(const blk of toBreak){if(!blk.alive)continue;blk.alive=false;world.removeBody(blk.body);wakeAround(blk.body);
    game.broken++;game.shotBroken++;const g=MATS[blk.mat].gold;game.gold+=g;fx.breakBlock(blk,g)}
  for(const [en,why] of toKill){if(!en.alive)continue;en.alive=false;world.removeBody(en.body);wakeAround(en.body);
    game.enemiesLeft--;game.gold+=ENEMY.gold;fx.enemyDown(en,why)}
  // 금 단계 갱신
  for(const blk of game.blocks){if(!blk.alive)continue;const r=blk.hp/blk.maxhp;const c=r<.34?2:r<.7?1:0;if(c!==blk.crack){blk.crack=c;blk.mesh.material=BLOCKMAT[blk.mat][c]}}
  // 5) 곰 · 차례
  if(game.phase==='flight'||game.phase==='settle'){
    game.shotStep++;
    const br=game.bear;
    if(br&&!br.gone){const b=br.body;const sp=b.velocity.length();br.slow=sp<1.2?br.slow+1:0;
      if(br.slow>30||game.shotStep>5*60||b.position.y<-3||b.position.z>48){br.gone=true;world.removeBody(b);wakeAround(b,.2);fx.poof(b.position,1.2)}
      else if(game.phase==='flight'&&(b.position.z>FZ-6||game.shotStep>150))game.phase='settle'}
    // 크게 무너짐
    if(!game.shotCrumble){let fast=0;for(const blk of game.blocks)if(blk.alive&&blk.body.sleepState!==CANNON.Body.SLEEPING&&blk.body.velocity.lengthSquared()>6.25)fast++;
      if(fast>=4||game.shotBroken>=3){game.shotCrumble=true;fx.crumble()}}
    let moving=false;
    for(const o of game.blocks)if(o.alive&&o.body.sleepState!==CANNON.Body.SLEEPING&&o.body.velocity.lengthSquared()+.25*o.body.angularVelocity.lengthSquared()>.25){moving=true;break}
    if(!moving)for(const o of game.enemies)if(o.alive&&o.body.sleepState!==CANNON.Body.SLEEPING&&o.body.velocity.lengthSquared()>.25){moving=true;break}
    game.quiet=moving?0:game.quiet+1;
    if((!br||br.gone)&&(game.quiet>=30||game.shotStep>8*60))endShot();
  }
}
function endShot(){
  game.bear=null;
  if(game.enemiesLeft<=0){game.phase='win';game.result={win:true,gold:game.gold,left:game.queue.length-game.shotIdx};ui.slots();ui.result()}
  else if(game.shotIdx>=game.queue.length){game.phase='lose';game.result={win:false,gold:game.gold,enemies:game.enemiesLeft};ui.slots();ui.result()}
  else{game.phase='aim';game.aimReadyT=0;loadBearIntoSling();ui.slots()}
}

/* ───────── 5. 효과(보기만 — 물리와 무관) ───────── */
const fx=(()=>{
  const debris=[],dust=[],coins=[],texts=[];
  const dustGeo=new THREE.IcosahedronGeometry(.6,0),coinGeo=new THREE.CylinderGeometry(.22,.22,.06,12),coinMat=M(0xf5c022,{emissive:0x553300});
  const debMat={wood:M(0xc98a45),stone:M(0xa3a7ab),ice:new THREE.MeshLambertMaterial({color:0xcfeffa,transparent:true,opacity:.85})};
  const debGeo=new THREE.BoxGeometry(1,1,1);
  const fxL=$('fx');
  function spawnDebris(p,mat,n,size){for(let i=0;i<n;i++){if(debris.length>90){const o=debris.shift();S.remove(o.m)}
    const m=new THREE.Mesh(debGeo,debMat[mat]);const s=size*(.25+Math.random()*.35);m.scale.set(s,s*(.6+Math.random()*.8),s);m.position.set(p.x+(Math.random()-.5)*size,p.y+(Math.random()-.5)*size,p.z+(Math.random()-.5)*size);
    m.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);m.castShadow=!MOBILE;S.add(m);
    debris.push({m,v:new V3((Math.random()-.5)*7,2+Math.random()*5,(Math.random()-.5)*7),w:new V3(Math.random()*8,Math.random()*8,Math.random()*8),t:0,life:1.6+Math.random()*.6})}}
  function spawnDust(p,n,sz=1){for(let i=0;i<n;i++){if(dust.length>40){const o=dust.shift();S.remove(o.m)}
    const m=new THREE.Mesh(dustGeo,new THREE.MeshLambertMaterial({color:0xe9e2d2,transparent:true,opacity:.6,depthWrite:false}));
    m.position.set(p.x+(Math.random()-.5)*1.4*sz,p.y+(Math.random()-.3)*sz,p.z+(Math.random()-.5)*1.4*sz);m.scale.setScalar(.4*sz);S.add(m);
    dust.push({m,v:new V3((Math.random()-.5)*1.2,.6+Math.random()*.8,(Math.random()-.5)*1.2),t:0,life:.9+Math.random()*.5,s0:(.5+Math.random()*.7)*sz})}}
  function spawnCoins(p,n){for(let i=0;i<n;i++){if(coins.length>50){const o=coins.shift();S.remove(o.m)}
    const m=new THREE.Mesh(coinGeo,coinMat);m.position.set(p.x,p.y+.3,p.z);m.rotation.set(Math.PI/2*Math.random(),0,Math.random()*3);S.add(m);
    coins.push({m,v:new V3((Math.random()-.5)*4,5+Math.random()*3,(Math.random()-.5)*4),t:0,life:1.1+Math.random()*.3})}}
  function text(str,p,cls,dur=1.1,size){const el=document.createElement('div');el.className='fl'+(cls?' '+cls:'');el.textContent=str;if(size)el.style.fontSize=size+'px';fxL.appendChild(el);
    texts.push({el,p:p.clone(),t:0,life:dur})}
  return{
    breakBlock(blk,g){const p=blk.body.position;const sz=Math.cbrt(blk.w*blk.h*blk.d);spawnDebris(p,blk.mat,MOBILE?5:8,sz);spawnDust(p,blk.mat==='ice'?2:3,sz);
      if(g){spawnCoins(p,1);text('+'+g,new V3(p.x,p.y+.6,p.z),'',.9,26)}ui.gold(game.gold);snd('break',blk.mat)},
    enemyDown(en,why){const p=en.body.position;spawnDust(p,4,1);spawnCoins(p,5);text('+'+ENEMY.gold,new V3(p.x,p.y+1,p.z),'',1.2);
      en.dieT=.001;en.dieV=new V3((Math.random()-.5)*3,6,2+Math.random()*2);ui.enemies(game.enemiesLeft,true);ui.gold(game.gold);snd('enemy')},
    poof(p,sz){spawnDust(p,4,sz)},
    crumble(){ui.crumble();snd('crumble')},
    twang(){snd('twang')},
    clear(){debris.forEach(o=>S.remove(o.m));dust.forEach(o=>S.remove(o.m));coins.forEach(o=>S.remove(o.m));texts.forEach(o=>o.el.remove());debris.length=dust.length=coins.length=texts.length=0},
    update(dt){
      for(let i=debris.length-1;i>=0;i--){const o=debris[i];o.t+=dt;o.v.y+=G*dt;o.m.position.addScaledVector(o.v,dt);o.m.rotation.x+=o.w.x*dt;o.m.rotation.y+=o.w.y*dt;
        const hh=o.m.scale.y*.5;if(o.m.position.y<hh){o.m.position.y=hh;o.v.y*=-.3;o.v.x*=.7;o.v.z*=.7;o.w.multiplyScalar(.7)}
        if(o.t>o.life){const k=1-(o.t-o.life)/.35;if(k<=0){S.remove(o.m);debris.splice(i,1)}else o.m.scale.multiplyScalar(.9)}}
      for(let i=dust.length-1;i>=0;i--){const o=dust[i];o.t+=dt;const k=o.t/o.life;o.m.position.addScaledVector(o.v,dt);o.m.scale.setScalar(o.s0*(.6+k*1.2));o.m.material.opacity=.6*(1-k);
        if(k>=1){S.remove(o.m);o.m.material.dispose();dust.splice(i,1)}}
      for(let i=coins.length-1;i>=0;i--){const o=coins[i];o.t+=dt;o.v.y+=G*dt;o.m.position.addScaledVector(o.v,dt);o.m.rotation.y+=12*dt;o.m.rotation.x+=5*dt;
        if(o.m.position.y<.1){o.m.position.y=.1;o.v.y*=-.4;o.v.x*=.6;o.v.z*=.6}if(o.t>o.life){S.remove(o.m);coins.splice(i,1)}}
      for(let i=texts.length-1;i>=0;i--){const o=texts[i];o.t+=dt;const k=o.t/o.life;const v=o.p.clone();v.y+=k*1.2;v.project(cam);
        o.el.style.left=((v.x+1)/2*view.w)+'px';o.el.style.top=((1-v.y)/2*view.h)+'px';o.el.style.opacity=k<.7?1:(1-k)/.3;if(k>=1||v.z>1){o.el.remove();texts.splice(i,1)}}
    }
  };
})();
// 소리 자리(3단계에서 채움)
function snd(){}

/* ───────── 6. 화면 표시 ───────── */
const ui={
  level(L){$('lvl').textContent='🏕️ '+(typeof L.id==='number'?'단계 '+L.id:L.name)},
  enemies(n,pop){$('enemyN').textContent=n;$('enemy').classList.toggle('zero',n<=0);if(pop){const m=$('minus');m.style.opacity=1;clearTimeout(ui._mt);ui._mt=setTimeout(()=>m.style.opacity=0,900)}},
  gold(g){$('gold').textContent=g},
  slots(){const el=$('slots');const q=game.queue;let x=0,h='';
    q.forEach((t,i)=>{const B=BEARS[t];const on=i===game.shotIdx&&game.phase!=='win'&&game.phase!=='lose',used=i<game.shotIdx||(i===game.shotIdx-1);
      h+=`<div class="slot ${on?'on':''} ${i<game.shotIdx?'used':''}" style="left:${x}px">${B.icon}${B.tag?`<span class="tag" style="background:${B.tagc}">${B.tag}</span>`:''}</div>`;x+=on?108:84});
    el.innerHTML=h},
  banner(show,L){const b=$('banner');if(show){$('bn1').textContent=(typeof L.id==='number'?L.id+'단계 · ':'')+L.name;$('bn2').textContent=L.sub;b.style.opacity=1;b.hidden=false}else{b.style.opacity=0;setTimeout(()=>{if(b.style.opacity==='0')b.hidden=true},450)}},
  crumble(){const c=$('crumble');c.classList.add('show');clearTimeout(ui._ct);ui._ct=setTimeout(()=>c.classList.remove('show'),1300)},
  hint(on){$('hint').hidden=!on;$('hand').hidden=!on},
  overlay(html){$('ov').innerHTML=html||''},
  result(){
    const r=game.result,L=game.level;const next=typeof L.id==='number'&&LEVELS.find(l=>l.id===L.id+1);
    // 결과 카드는 2단계에서 레퍼런스 꼴로(별 · 약탈 · 남은 곰 × 100 · 첫 깸). 지금은 자리만
    ui.overlay(r.win?`<div class="dim"><div class="card"><div class="ttl" style="background:#3aa64a;text-shadow:0 3px 0 #1d5a20">요새 함락!</div><div class="body">
      <div>너구리 ${game.enemies.length}/${game.enemies.length} · 금화 +${r.gold} · 남은 곰 ${r.left}</div>
      <div class="btns"><button class="btn b" data-a="retry">↻ 다시</button>${next?`<button class="btn g" data-a="next">다음 ▶</button>`:''}</div></div></div></div>`
    :`<div class="dim"><div class="card"><div class="ttl">너구리들이 버텨요!</div><div class="body">
      <div>너구리 ${r.enemies}마리 남음 · 얻은 금화 +${r.gold}</div>
      <div class="btns"><button class="btn g" data-a="retry">↻ 다시</button></div></div></div></div>`)},
  pause(){ui.overlay(`<div class="dim"><div class="card"><div class="ttl" style="background:#2c96b0;text-shadow:0 3px 0 #0e4a5a">잠깐 멈춤</div><div class="body">
    <div class="btns"><button class="btn g" data-a="resume">▶ 이어 하기</button><button class="btn b" data-a="retry">↻ 다시</button></div></div></div></div>`)},
};
let paused=false;
$('ov').addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(!a)return;const k=a.dataset.a;
  if(k==='resume'){paused=false;ui.overlay(null)}
  else if(k==='retry'){paused=false;loadLevel(game.level.id)}
  else if(k==='next'){paused=false;loadLevel(game.level.id+1)}});
$('pauseBtn').addEventListener('click',e=>{e.stopPropagation();if(game.phase==='win'||game.phase==='lose')return;paused=!paused;paused?ui.pause():ui.overlay(null)});
$('pauseBtn').addEventListener('pointerdown',e=>e.stopPropagation());

/* ───────── 7. 화면 크기(16:9 기준) ───────── */
const view={w:1280,h:720};
const BASE_VFOV=42,BASE_HT=Math.tan(BASE_VFOV/2*DEG)*16/9;
function resize(){
  const W=window.innerWidth,H=window.innerHeight;let w=W,h=H;
  const portrait=W/H<1.2;
  if(portrait){h=Math.round(W*9/16)} // 세로 화면: 16:9 로 줄여 가운데
  stage.style.width=w+'px';stage.style.height=h+'px';stage.style.top=Math.round((H-h)/2)+'px';
  view.w=w;view.h=h;R.setSize(w,h,false);
  const a=w/h;cam.aspect=a;cam.fov=a<16/9?2*Math.atan(BASE_HT/a)/DEG:Math.max(34,2*Math.atan(BASE_HT/a)/DEG); // 넓은 화면은 가로 폭을 16:9 와 같게(위아래를 조금 자름)
  cam.updateProjectionMatrix();
  document.documentElement.style.setProperty('--u',Math.min(w/1280,h/720).toFixed(4));
  $('rot').hidden=!portrait;
}
window.addEventListener('resize',resize);resize();

/* ───────── 8. 카메라 ───────── */
const AIM_POS=new V3(-6.5,5.2,-8.5),AIM_LOOK=new V3(-3.2,2.8,16);
const FORT_POS=new V3(FX-2.5,4.8,FZ-11.5),FORT_LOOK=new V3(FX+.6,1.8,FZ);
const camP=AIM_POS.clone(),camL=AIM_LOOK.clone();
function camSnap(p,l){camP.copy(p);camL.copy(l);cam.position.copy(camP);cam.lookAt(camL)}
const INTRO_SWEEP=2.6,INTRO_BACK=1.4;
function updateCamera(dt){
  let tp,tl,k=3;
  if(game.phase==='intro'){
    game.introT+=dt;const t=game.introT;
    const a=lerp(.95,.1,smooth(t/INTRO_SWEEP)),Rr=14;
    const sp=new V3(FX+Math.sin(a)*Rr,5.5-1.2*smooth(t/INTRO_SWEEP),FZ-Math.cos(a)*Rr),sl=new V3(FX,1.8,FZ);
    if(t<INTRO_SWEEP){camSnap(sp,sl);return}
    const u=smooth((t-INTRO_SWEEP)/INTRO_BACK);camSnap(sp.lerp(AIM_POS,u),sl.lerp(AIM_LOOK,u));
    if(t>=INTRO_SWEEP+INTRO_BACK){game.phase='aim';game.aimReadyT=1;setTimeout(()=>{if(game.phase!=='intro')ui.banner(false)},1400);if(game.level.tutorial&&game.shotIdx===0)ui.hint(true)}
    return;
  }
  if(game.phase==='flight'&&game.bear){const p=game.bear.body.position;const pr=clamp((p.z-P0.z)/(FZ-P0.z),0,1);
    tl=new V3(p.x,p.y,p.z).lerp(FORT_LOOK,.25+.4*pr);tp=tl.clone().add(new V3(-1.6,3.4-1*pr,-11+1.5*pr));k=4}
  else if(game.phase==='settle'){tp=FORT_POS;tl=FORT_LOOK;k=2.5}
  else if(game.phase==='win'||game.phase==='lose'){tp=FORT_POS;tl=FORT_LOOK;k=2}
  else{tp=AIM_POS;tl=AIM_LOOK;k=3.2;game.aimReadyT=Math.min(1,game.aimReadyT+dt*1.6)}
  const f=1-Math.exp(-dt*k);camP.lerp(tp,f);camL.lerp(tl,f);cam.position.copy(camP);cam.lookAt(camL);
}

/* ───────── 9. 조준 입력 ───────── */
const aim={on:false,id:null,x0:0,y0:0,yaw:0,pow:0,pull:0};
const PULL_UNIT=()=>Math.min(view.w,view.h)*.36;
function aimFromDrag(dx,dy){const u=PULL_UNIT();const L=Math.hypot(dx,dy);
  aim.pull=clamp(L/u,0,1);aim.pow=aim.pull;if(dy<-.5*L)aim.pow=aim.pull=0; // 위로 밀면 안 쏨
  aim.yaw=clamp(dx/u,-1,1)*YAW_RANGE}
const canAim=()=>game.phase==='aim'&&game.aimReadyT>.55&&!paused&&loadedBear;
R.domElement.addEventListener('pointerdown',e=>{
  if(game.phase==='intro'&&game.introT<INTRO_SWEEP){game.introT=INTRO_SWEEP;return} // 훑기 건너뛰기
  if(!canAim()||aim.on)return;aim.on=true;aim.id=e.pointerId;aim.x0=e.clientX;aim.y0=e.clientY;aim.pull=0;aim.pow=0;aim.yaw=0;
  try{R.domElement.setPointerCapture(e.pointerId)}catch(_){} ui.hint(false)});
R.domElement.addEventListener('pointermove',e=>{if(!aim.on||e.pointerId!==aim.id)return;aimFromDrag(e.clientX-aim.x0,e.clientY-aim.y0)});
function release(e){if(!aim.on||e.pointerId!==aim.id)return;aim.on=false;
  if(aim.pull>=.15&&canAim())shoot(aim.yaw,aim.pow);aim.pull=0}
R.domElement.addEventListener('pointerup',release);R.domElement.addEventListener('pointercancel',e=>{if(e.pointerId===aim.id){aim.on=false;aim.pull=0}});

function updateSling(dt){
  // 얹힌 곰 · 고무줄 · 궤적
  let bp=P0.clone();
  if(loadedBear){
    loadedBear.userData.pop=Math.min(1,(loadedBear.userData.pop||0)+dt*3);const s=.01+.99*smooth(loadedBear.userData.pop);
    if(aim.on&&aim.pull>0){const d=launchDir(aim.yaw);bp.addScaledVector(d,-aim.pull*1.7);loadedBear.rotation.set(.3*aim.pull,BASE_YAW+aim.yaw,0)}
    else loadedBear.rotation.set(0,BASE_YAW,0);
    loadedBear.position.copy(bp);loadedBear.scale.setScalar(s);
  }
  const back=bp.clone().addScaledVector(launchDir(aim.on?aim.yaw:0),-.45);
  setBand(bands[0],TIPS[0],back);setBand(bands[1],TIPS[1],back);pouch.position.copy(back);pouch.lookAt(TIPS[0].clone().add(TIPS[1]).multiplyScalar(.5));
  // 점선
  if(aim.on&&aim.pull>=.15){const v=launchDir(aim.yaw).multiplyScalar(powerToSpeed(aim.pow));const mm=new THREE.Matrix4();let n=0;
    for(let i=1;i<=DOTS;i++){const t=i*.075;const y=P0.y+v.y*t+.5*G*t*t;if(y<0)break;const s=1-i*.018;
      mm.makeScale(s,s,s).setPosition(P0.x+v.x*t,y,P0.z+v.z*t);dots.setMatrixAt(n++,mm)}
    dots.count=n;dots.instanceMatrix.needsUpdate=true}else dots.count=0;
}
function placeHand(){ // 연습 단계 손가락: 새총 곰 위치에서 아래로 끌기
  if($('hand').hidden)return;const v=P0.clone();v.y-=.3;v.project(cam);const el=$('hand');
  el.style.left=((v.x+1)/2*view.w)+'px';el.style.top=((1-v.y)/2*view.h)+'px'}

/* ───────── 10. 고리 ───────── */
let acc=0,last=performance.now(),hold=false;
const perf={frames:[],steps:[]};
function syncAll(dt){
  for(const b of game.blocks)if(b.alive)syncMesh(b);else if(b.mesh.parent)b.mesh.parent.remove(b.mesh);
  for(const en of game.enemies){if(en.alive){syncMesh(en);continue}
    if(en.dieT>0){en.dieT+=dt;en.dieV.y+=G*dt;en.mesh.position.addScaledVector(en.dieV,dt);en.mesh.rotation.x+=9*dt;en.mesh.rotation.z+=6*dt;
      en.mesh.scale.setScalar(Math.max(.01,1-en.dieT/.9));if(en.dieT>.9){en.dieT=0;if(en.mesh.parent)en.mesh.parent.remove(en.mesh)}}}
  if(game.bear){if(!game.bear.gone)syncMesh(game.bear);else if(game.bear.mesh.parent)S.remove(game.bear.mesh)}
}
function frame(now){
  const dtR=Math.min(.1,(now-last)/1000);last=now;
  if(!paused&&!hold){acc+=dtR;let n=0;while(acc>=DT&&n<4){const t0=performance.now();gameStep();if(TEST)perf.steps.push(performance.now()-t0);acc-=DT;n++}if(n===4)acc=0}
  if(!paused){updateCamera(dtR);updateSling(dtR);syncAll(dtR);fx.update(dtR)}
  placeHand();
  R.render(S,cam);
  if(TEST)perf.frames.push(dtR*1000);
  requestAnimationFrame(frame);
}
loadLevel(Q.get('level')==='stress'?'stress':+(Q.get('level')||1),{skipIntro:TEST});
requestAnimationFrame(t=>{last=t;frame(t)});

/* ───────── 11. 시험 걸이(?test=1) ───────── */
if(TEST){
  const snapshot=()=>[...game.blocks,...game.enemies].map(o=>{const p=o.body.position,q=o.body.quaternion;return [o.alive?1:0,p.x,p.y,p.z,q.x,q.y,q.z,q.w]});
  const hashOf=arr=>{let h=2166136261>>>0;const s=JSON.stringify(arr.map(r=>r.map(v=>Math.round(v*1e6))));for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0}return h.toString(16)};
  const state=()=>({phase:game.phase,level:game.level.id,steps:game.steps,enemies:game.enemies.length,enemiesLeft:game.enemiesLeft,enemiesDown:game.enemies.length-game.enemiesLeft,
    blocks:game.blocks.length,broken:game.broken,gold:game.gold,shotIdx:game.shotIdx,bearsLeft:game.queue.length-game.shotIdx,hash:hashOf(snapshot())});
  window.SF={
    load(id,opts={}){hold=!!opts.hold;loadLevel(id,Object.assign({skipIntro:true},opts));return state()},
    hold(v){hold=!!v},
    step(n){for(let i=0;i<n;i++)gameStep();syncAll(0);return state()},
    // 쏘지 않고 sec 초 — 시작 자리에서 가장 많이 · 평균 움직인 거리(m)
    still(sec){const n=Math.round(sec/DT);for(let i=0;i<n;i++)gameStep();syncAll(0);
      const d=[...game.blocks,...game.enemies].map(o=>o.body.position.distanceTo(o.start));
      const rot=[...game.blocks].map(o=>{const q=o.body.quaternion;return 2*Math.acos(Math.min(1,Math.abs(q.w)))/DEG});
      const asleep=world.bodies.filter(b=>b.type===CANNON.Body.DYNAMIC&&b.sleepState===CANNON.Body.SLEEPING).length;
      return {maxMove:Math.max(0,...d),meanMove:d.reduce((a,b)=>a+b,0)/Math.max(1,d.length),maxTiltDeg:Math.max(0,...rot),broken:game.broken,enemiesDown:game.enemies.length-game.enemiesLeft,asleep,dyn:world.bodies.filter(b=>b.type===CANNON.Body.DYNAMIC).length}},
    shoot(yawDeg,power){return shoot(yawDeg*DEG,power)},
    // 이번 곰이 끝날 때까지(최대 sec 초) 걸음
    runShot(sec=14){const t0=performance.now();let n=0,mx=0;const lim=Math.round(sec/DT);
      while((game.phase==='flight'||game.phase==='settle')&&n<lim){const a=performance.now();gameStep();const b=performance.now()-a;if(b>mx)mx=b;n++}
      syncAll(0);return Object.assign(state(),{stepsRun:n,msTotal:performance.now()-t0,msMaxStep:mx})},
    state,snapshot,
    wakeAll(){world.bodies.forEach(b=>b.type===CANNON.Body.DYNAMIC&&b.wakeUp())},
    perf(){return perf},resetPerf(){perf.frames.length=0;perf.steps.length=0},
    aimPreview(yawDeg,pull){aim.on=true;aim.id=-1;aim.yaw=yawDeg*DEG;aim.pull=aim.pow=pull},
    camTo(phase){game.phase=phase},
    moving(){return [...game.blocks.map((o,i)=>['b'+i,o]),...game.enemies.map((o,i)=>['e'+i,o])].filter(([k,o])=>o.alive&&o.body.sleepState!==CANNON.Body.SLEEPING).map(([k,o])=>[k,o.body.sleepState,+o.body.velocity.length().toFixed(3),+o.body.angularVelocity.length().toFixed(3),+o.body.position.y.toFixed(2)])},
  };
}
