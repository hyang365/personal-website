import * as T from './vendor/three.module.min.js';

const TAU = Math.PI * 2;
let seed = 4027;
function random() {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 4294967296;
}
function texture(w, h, paint, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  paint(canvas.getContext('2d'), w, h);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.magFilter = T.NearestFilter;
  map.minFilter = T.NearestMipmapLinearFilter;
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.repeat.set(repeatX, repeatY);
  return map;
}
function shade(color, scale) {
  return 'rgb(' + color.map(ch => Math.max(0, Math.min(255, Math.floor(ch * scale)))).join(',') + ')';
}
function timber(color, rows, rx = 1, ry = 1) {
  return texture(256, 128, (c,w,h) => {
    const row = h/rows;
    for (let j=0;j<rows;j++) {
      const base = .82 + random()*.29;
      c.fillStyle = shade(color,base); c.fillRect(0,j*row,w,row+1);
      for(let i=0;i<230;i++){
        const x = random()*w, y=j*row+random()*row;
        c.fillStyle = shade(color,base + (random()-.5)*.30);
        c.fillRect(x,y,4+random()**2*105,random()>.86?2:1);
      }
      c.fillStyle = shade(color,.49); c.fillRect(0,j*row,w,1);
      c.fillStyle = shade(color,1.17); c.fillRect(0,j*row+1,w,1);
      if(rows>3){c.fillStyle=shade(color,.55);c.fillRect(j*39%w,j*row,1,row);}
    }
  },rx,ry);
}
function grit(color) {
  return texture(96,96,(c,w,h)=>{
    c.fillStyle=shade(color,1);c.fillRect(0,0,w,h);
    for(let n=0;n<2400;n++){
      c.fillStyle=shade(color,.76+random()*.48);
      c.fillRect(random()*w,random()*h,1+random()*2,1);
    }
  },3,3);
}
export function mat(color, map = null, options = {}) {
  return new T.MeshStandardMaterial({color,map,roughness:.86,flatShading:true,...options});
}
const basic = (color, map=null) => new T.MeshBasicMaterial({color,map});
const wood = mat(0xffffff,timber([116,67,38],4));
const deskWood = mat(0xffffff,timber([144,87,51],8));
const darkWood = mat(0xffffff,timber([84,45,29],4));
const wallWood = mat(0xffffff,timber([119,81,49],12,1,1));
const wallPost = mat(0x63452b);
const plaster = mat(0xffffff,grit([133,115,84]));
const iron = mat(0x2c2b23);
const cream = mat(0xbca474);
const gold = mat(0xd89943,null,{roughness:.32,metalness:.30,emissive:0x56391a,emissiveIntensity:.27});
const goldLight = mat(0xefbe66,null,{roughness:.39,metalness:.16,emissive:0x8d571a,emissiveIntensity:.38});
const soil = mat(0x3c2920);
const clay = [mat(0x8b4c37),mat(0xb87d52),mat(0x68634c),mat(0x786750)];
const leaves = [0x354924,0x4f6231,0x617747,0x7f8a45,0x2c4229,0x728149].map(color=>mat(color,null,{side:T.DoubleSide}));
const leafVein = mat(0x5e653c);

function group(parent,x=0,y=0,z=0) {
  const g=new T.Group();g.position.set(x,y,z);parent.add(g);return g;
}
function mesh(parent, geo, material, x=0,y=0,z=0, casts=true) {
  const m=new T.Mesh(geo,material);m.position.set(x,y,z);
  m.castShadow=casts;m.receiveShadow=true;parent.add(m);return m;
}
export function box(parent,w,h,d,x,y,z,m,casts=true) {
  const doorway=parent.isScene&&d<.35&&w>2&&((z< -4.3&&z> -4.9)||(z< -15.5&&z> -16.2));
  if(doorway&&y-h/2<2.7){
    const center=z< -10?5.87:3.05, left=center-.72,right=center+.72;
    const start=x-w/2,end=x+w/2;
    const group=new T.Group();parent.add(group);
    if(left>start)mesh(group,new T.BoxGeometry(left-start,h,d),m,(start+left)/2,y,z,casts);
    if(end>right)mesh(group,new T.BoxGeometry(end-right,h,d),m,(end+right)/2,y,z,casts);
    const top=y+h/2;
    if(top>2.7)mesh(group,new T.BoxGeometry(1.44,top-2.7,d),m,center,(top+2.7)/2,z,casts);
    return group;
  }
  return mesh(parent,new T.BoxGeometry(w,h,d),m,x,y,z,casts);
}
function cyl(parent,top,bottom,h,x,y,z,m,sides=8) {
  return mesh(parent,new T.CylinderGeometry(top,bottom,h,sides),m,x,y,z);
}
function sphere(parent,r,x,y,z,m,columns=12,rows=8) {
  return mesh(parent,new T.SphereGeometry(r,columns,rows),m,x,y,z);
}
function bar(parent,a,b,r,m,sides=5) {
  const start=new T.Vector3(...a), end=new T.Vector3(...b);
  const d=end.clone().sub(start), mid=start.addScaledVector(d,.5);
  const rod=cyl(parent,r,r,d.length(),mid.x,mid.y,mid.z,m,sides);
  rod.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());
  return rod;
}
function plaque(parent,textRows,w,h,x,y,z,options={}) {
  const {bg='#d1b384', ink='#422b21', size=25, border='#866044'}=options;
  const tex=texture(1024,512,(c)=>{
    c.scale(4,4);
    c.fillStyle=bg;c.fillRect(0,0,256,128);
    c.strokeStyle=border;c.lineWidth=3;c.strokeRect(6,6,244,116);
    c.fillStyle=ink;c.textAlign='center';c.textBaseline='middle';
    c.font='bold '+size+'px monospace';
    textRows.forEach((line,i)=>c.fillText(line,128,64+(i-(textRows.length-1)/2)*size*1.29,228));
  });
  tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;
  return mesh(parent,new T.PlaneGeometry(w,h),basic(0xffffff,tex),x,y,z,false);
}
function contact(parent,x,z,rx,rz,y=.007,opacity=.43) {
  const tex=texture(32,32,(c)=>{
    const gradient=c.createRadialGradient(16,16,1,16,16,16);
    gradient.addColorStop(0,'#170c05');gradient.addColorStop(.5,'#170c05aa');gradient.addColorStop(1,'#170c0500');
    c.fillStyle=gradient;c.fillRect(0,0,32,32);
  });
  const plane=mesh(parent,new T.PlaneGeometry(rx*2,rz*2),new T.MeshBasicMaterial({map:tex,transparent:true,opacity,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),x,y,z,false);
  plane.rotation.x=-Math.PI/2;return plane;
}
function poly(parent,xyz,indices,m) {
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(xyz.flat(),3));
  g.setIndex(indices);g.computeVertexNormals();
  return mesh(parent,g,m);
}
function leaf(parent,a,b,width,m) {
  const start=new T.Vector3(...a), tip=new T.Vector3(...b), axis=tip.clone().sub(start);
  const side=new T.Vector3(-axis.z,.12,axis.x).normalize().multiplyScalar(width);
  const mid=start.clone().addScaledVector(axis,.5);
  const ridge=mid.clone().add(new T.Vector3(0,width*.43,0));
  poly(parent,[start,mid.clone().add(side),ridge,mid.clone().sub(side),tip].map(v=>v.toArray()),[0,1,2,0,2,3,1,4,2,2,4,3],m);
}
function plant(parent,x,y,z,scale,style=0) {
  const g=group(parent,x,y,z);
  g.scale.setScalar(scale);
  cyl(g,.27,.185,.32,0,.16,0,clay[style%clay.length]);
  cyl(g,.285,.285,.062,0,.315,0,clay[style%clay.length]);
  cyl(g,.248,.248,.018,0,.349,0,soil);
  for(let i=0;i<(style===2?15:11);i++){
    const angle=i*2.4+random()*.4, h=.27+random()*.77, r=(.18+random()*.45)*(style===2?1.23:1);
    const dx=Math.cos(angle)*r,dz=Math.sin(angle)*r;
    const joint=[dx*.48,.36+h*.64,dz*.48];
    bar(g,[0,.34,0],joint,.012,leafVein);
    leaf(g,joint,[dx,.37+h,dz],.085+random()*.115,leaves[i%leaves.length]);
    if(i%2===0)leaf(g,[dx*.3,.4+h*.37,dz*.3],[dx*.84,.43+h*.36,dz*.8],.10,leaves[(i+2)%leaves.length]);
  }
  if(y===0)contact(parent,x,z,.48*scale,.43*scale);
  return g;
}
function bookcase(parent,x,z) {
  const p=group(parent,x,0,z);
  box(p,2.02,2.39,.075,0,1.24,-.235,darkWood);
  for(const side of [-1,1])box(p,.095,2.43,.51,side*.97,1.22,0,wood);
  const bookColors=[0x6c382d,0x998052,0x373d33,0x80624b,0x4a5340,0x43545b,0xab8b5e,0x80504a].map(color=>mat(color));
  for(let row=0;row<4;row++){
    const y=.18+row*.56;
    box(p,1.93,.074,.55,0,y,.025,wood);
    let x0=-.854;
    for(let i=0;i<10;i++){
      if(row===2&&i>5)break;
      const w=.093+random()*.103, h=.22+random()*.24;
      if(x0+w>.89)break;
      const b=group(p,x0+w/2,y+.038,.10-random()*.035);
      b.rotation.z=i%6===4?-.095:0;
      box(b,w,h,.25,0,h/2,0,bookColors[(row*4+i)%bookColors.length]);
      box(b,w*.79,.021,.002,0,h*.79,.126,cream,false);
      if(i%3===0)box(b,w*.78,.018,.002,0,h*.23,.126,cream,false);
      x0+=w+.013;
    }
  }
  box(p,2.09,.105,.58,0,2.43,.025,wood);
  box(p,2.0,.116,.53,0,.072,.01,darkWood);
  plant(p,.70,2.48,.05,.72,0);
  for(let i=0;i<7;i++){
    const a=.33*i;
    leaf(p,[.78+a*.2,2.73-a*.26,.25],[.92+a*.32,2.65-a*.31,.34+a*.025],.055,leaves[i%leaves.length]);
  }
  return p;
}
function duskWindow(parent) {
  const g=group(parent,-2.63,1.91,-4.51);
  const tex=texture(320,210,(c,w,h)=>{
    const horizon=c.createLinearGradient(0,0,0,h);
    horizon.addColorStop(0,'#34465a');horizon.addColorStop(.42,'#a65f51');horizon.addColorStop(.68,'#e49c5c');horizon.addColorStop(1,'#3a413a');
    c.fillStyle=horizon;c.fillRect(0,0,w,h);
    const sun=c.createRadialGradient(179,113,8,179,113,70);
    sun.addColorStop(0,'#ffe2a1');sun.addColorStop(.37,'#ffc981ab');sun.addColorStop(1,'#e9a55b00');
    c.fillStyle=sun;c.fillRect(0,0,w,h);
    c.fillStyle='#ffe7ae';c.beginPath();c.arc(180,114,18,0,TAU);c.fill();
    for(let i=0;i<23;i++){
      c.fillStyle=i%2?'#f9bc8544':'#4b4d6133';
      c.fillRect(random()*w,31+random()*90,15+random()*100,1+random()*3);
    }
    for(let layer=0;layer<4;layer++){
      c.fillStyle=['#805e55','#68554c','#44463e','#293a33'][layer];
      c.beginPath();c.moveTo(0,h);
      for(let x=0;x<=w;x+=10){
        const hills=Math.sin(x*.028+layer*1.8)*12+Math.sin(x*.084+layer)*5;
        c.lineTo(x,130+layer*18+hills+random()*7);
      }
      c.lineTo(w,h);c.fill();
    }
    for(let i=0;i<27;i++){
      const x=random()*w,y=170+random()*37,l=3+random()*34;
      c.fillStyle=i%2?'#26362e':'#314339';
      c.beginPath();c.moveTo(x,y-l);c.lineTo(x-l*.28,y);c.lineTo(x+l*.24,y);c.fill();
    }
  });
  box(g,2.66,1.89,.16,0,0,-.045,darkWood);
  mesh(g,new T.PlaneGeometry(2.4,1.62),basic(0xffffff,tex),0,0,.043,false);
  for(const x of [-1.24,0,1.24])box(g,.08,1.72,.10,x,0,.079,darkWood);
  for(const y of [-.85,0,.85])box(g,2.56,.074,.10,0,y,.086,darkWood);
  box(g,2.74,.115,.39,0,-.91,.17,wood);
  box(g,2.60,.061,.13,0,.93,.06,wood);
  return g;
}
function rug(parent,x,z,w,d) {
  const map=texture(128,128,(c)=>{
    c.fillStyle='#614639';c.fillRect(0,0,128,128);
    for(let i=0;i<3200;i++){
      c.fillStyle=i%2?'#b58e563f':'#30272766';
      c.fillRect(random()*128,random()*128,1,2);
    }
    c.strokeStyle='#9e794f';c.lineWidth=3;c.strokeRect(5,5,118,118);
    c.strokeStyle='#403936';c.lineWidth=4;c.strokeRect(11,11,106,106);
    c.lineWidth=1;c.strokeStyle='#a98758';c.strokeRect(15,15,98,98);
    for(let j=0;j<3;j++)for(let i=0;i<5;i++){
      const x=25+i*19.5,y=31+j*32.5;
      c.beginPath();c.moveTo(x-8,y);c.lineTo(x,y-10);c.lineTo(x+8,y);c.lineTo(x,y+10);c.closePath();c.stroke();
    }
  });
  const p=mesh(parent,new T.PlaneGeometry(w,d),mat(0xffffff,map),x,.015,z,false);
  p.rotation.x=-Math.PI/2;
}
function folder(parent,x,z,color,title,angle,number) {
  const g=group(parent,x,.889,z);g.rotation.y=angle;
  const cover=mat(color), paper=mat(0xd1bc91);
  const back=box(g,1.31,.026,.83,0,.023,.045,cover);
  box(g,.44,.025,.17,-.33,.023,-.407,cover);
  box(g,1.19,.053,.73,.012,.056,.037,paper);
  const hinge=group(g,-.644,.086,0);
  box(hinge,1.29,.027,.81,.644,0,.034,cover);
  box(hinge,1.25,.010,.023,.644,.017,.415,mat(new T.Color(color).multiplyScalar(1.16)));
  const card=plaque(hinge,[title.toUpperCase()],.90,.256,.644,.019,.063,{bg:'#ddcca1',size:29,border:'#a38963'});
  card.rotation.x=-Math.PI/2;
  const index=plaque(hinge,[number],.27,.108,.262,.020,-.223,{bg:'#c8af7e',size:34});
  index.rotation.x=-Math.PI/2;
  const page=plaque(g,['PERSONAL ARCHIVE',title],1.02,.57,.01,.084,.04,{bg:'#e5d4ac',size:27});
  page.rotation.x=-Math.PI/2;page.userData.paper=true;
  return {g,hinge,anchor:[0,.107,.40],back};
}
function trophy(parent,x,z) {
  const g=group(parent,x,.889,z);
  box(g,.64,.092,.48,0,.048,0,darkWood);
  box(g,.51,.065,.39,0,.116,0,iron);
  plaque(g,['SWIMMING'],.39,.052,0,.116,.197,{bg:'#b79453',size:34});
  cyl(g,.16,.22,.07,0,.172,0,gold);
  cyl(g,.10,.07,.25,0,.30,0,goldLight);
  cyl(g,.245,.085,.26,0,.494,0,goldLight,10);
  cyl(g,.255,.253,.038,0,.629,0,goldLight,10);
  cyl(g,.214,.17,.009,0,.65,0,mat(0x774823),10);
  for(const side of [-1,1]){
    bar(g,[side*.21,.59,0],[side*.365,.63,0],.037,gold);
    bar(g,[side*.365,.63,0],[side*.36,.48,0],.037,gold);
    bar(g,[side*.36,.48,0],[side*.155,.39,0],.037,gold);
  }
  return {g,anchor:[0,.75,0]};
}
function globe(parent,x,z) {
  const g=group(parent,x,.889,z);
  cyl(g,.30,.36,.065,0,.035,0,darkWood,12);
  cyl(g,.11,.175,.17,0,.135,0,gold,9);
  const map=texture(256,128,(c,w,h)=>{
    c.fillStyle='#426c70';c.fillRect(0,0,w,h);
    for(let i=0;i<4500;i++){
      c.fillStyle=i%2?'#658b7b35':'#21394b3b';c.fillRect(random()*w,random()*h,1+random()*2,1);
    }
    const land=[[[10,30],[32,21],[44,26],[65,13],[85,21],[77,37],[60,43],[61,54],[48,62],[58,70],[43,68],[31,56],[21,54]],[[53,71],[72,69],[84,81],[77,106],[62,122],[60,107]],[[89,22],[102,9],[111,22],[104,37],[94,34]],[[111,46],[124,35],[143,38],[156,21],[191,16],[230,27],[239,39],[221,43],[214,50],[203,47],[194,69],[184,63],[187,54],[168,56],[164,68],[148,48],[136,52]],[[116,52],[145,54],[152,67],[140,96],[126,95],[119,79],[109,67]],[[188,76],[208,74],[226,83],[215,90]],[[209,96],[236,90],[247,103],[233,113],[214,111]]];
    c.fillStyle='#a6ac69';c.strokeStyle='#d0b67a';c.lineWidth=1;
    for(const pts of land){
      c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();c.stroke();
    }
    c.strokeStyle='#d6c29554';
    for(let i=0;i<w;i+=16){c.beginPath();c.moveTo(i,0);c.lineTo(i,h);c.stroke();}
    for(let i=0;i<h;i+=16){c.beginPath();c.moveTo(0,i);c.lineTo(w,i);c.stroke();}
  });
  const axis=group(g,0,.58,0);axis.rotation.z=-.31;
  const world=sphere(axis,.353,0,0,0,mat(0xffffff,map),18,12);
  const rim=mesh(axis,new T.TorusGeometry(.408,.022,5,28,Math.PI*1.16),goldLight);
  rim.rotation.z=1.40;
  for(const sign of [-1,1])cyl(axis,.026,.026,.095,0,sign*.383,0,goldLight,6);
  return {g,spin:world,anchor:[0,1.05,0]};
}
function book(parent,x,z) {
  const g=group(parent,x,.889,z);g.rotation.y=-.26;
  const green=mat(0x4d573c), pages=mat(0xc4ac78);
  box(g,.88,.023,.69,0,.027,0,green);
  box(g,.793,.101,.625,0,.085,0,pages);
  for(let i=0;i<5;i++)box(g,.77,.003,.003,0,.050+i*.015,.314,cream,false);
  box(g,.066,.131,.693,-.429,.089,0,green);
  const hinge=group(g,-.434,.145,0);
  box(hinge,.87,.026,.69,.434,0,0,green);
  const cover=plaque(hinge,['FIELD','NOTES'],.65,.47,.434,.016,0,{bg:'#777856',ink:'#e5c98c',border:'#c0a365',size:30});
  cover.rotation.x=-Math.PI/2;
  const inside=plaque(g,['READING JOURNAL'],.65,.48,0,.137,0,{bg:'#e3d2ab',size:24});
  inside.rotation.x=-Math.PI/2;
  return {g,hinge,anchor:[0,.20,-.04]};
}
function door(parent,x,z,blue=false) {
  const frame=group(parent,x,0,z);
  const paint=blue?mat(0x425b64):darkWood;

  for(const side of [-1,1])box(frame,.12,2.78,.19,side*.754,1.39,.025,paint);
  box(frame,1.65,.15,.19,0,2.74,.025,paint);
  const g=group(frame,.68,.055,.08), panel=group(g,-.68,0,0);
  box(panel,1.36,2.54,.10,0,1.27,0,paint);
  for(const y of [.61,1.73]){
    box(panel,1.15,y<1?1.00:1.09,.044,0,y,.055,blue?mat(0x5a7381):wood);
    for(const side of [-1,1])box(panel,.041,y<1?.93:1.02,.016,side*.53,y,.081,paint);
  }
  const plate=box(panel,.12,.25,.034,-.51,1.10,.084,gold);
  const knob=sphere(panel,.065,-.51,1.10,.141,goldLight);

  return {g,panel,plate,knob,anchor:[-.51,1.10,.14]};
}
function floorLamp(parent,x,z) {
  const g=group(parent,x,0,z);
  cyl(g,.28,.34,.08,0,.047,0,darkWood);
  cyl(g,.027,.036,2.0,0,1.0,0,gold,7);
  cyl(g,.21,.409,.44,0,2.03,0,mat(0xd69d57,null,{emissive:0xb87331,emissiveIntensity:.48}),9);
  cyl(g,.34,.34,.008,0,1.814,0,basic(0xffd797),9);
  const light=new T.PointLight(0xffb773,15,5,2);light.position.set(0,1.77,.08);g.add(light);
}
function lighting(scene,isCourt=false) {
  scene.add(new T.HemisphereLight(isCourt?0xb6d5ef:0xffe4b6,isCourt?0x475066:0x7e5537,isCourt?1.63:1.46));
  const sun=new T.DirectionalLight(isCourt?0xd2e6ff:0xffce93,isCourt?1.55:2.10);
  sun.position.set(isCourt?-6:-3, isCourt?9:5.2,isCourt?5:-2.9);
  sun.target.position.set(0,0,.5);
  sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.1,far:35});
  sun.shadow.mapSize.set(1024,1024);sun.shadow.bias=-.00025;sun.shadow.normalBias=.018;sun.shadow.radius=2.4;
  scene.add(sun,sun.target);
  const fill=new T.DirectionalLight(isCourt?0x88a0b2:0xffb980,isCourt?.35:.65);
  fill.position.set(4,3,6);scene.add(fill);
}
export function makeStudy(entries) {
  const s=new T.Scene();s.background=new T.Color(0x402718);lighting(s);
  const floor=mat(0xffffff,timber([129,85,55],13,2,2.1));
  box(s,9.42,.15,9.5,0,-.083,0,floor,false);
  for(const z of [-4.68,4.68]){
    box(s,9.42,3.55,.16,0,1.775,z,plaster,false);
    box(s,9.40,1.04,.13,0,.52,z+Math.sign(-z)*.09,wallWood,false);
    for(const y of [.11,1.04,3.25])box(s,9.43,.09,.175,0,y,z+Math.sign(-z)*.11,darkWood,false);
    for(const x of [-4.48,-1.10,1.65,4.47])box(s,.13,3.52,.157,x,1.77,z+Math.sign(-z)*.12,wallPost,false);
  }
  for(const x of [-4.71,4.71]){
    box(s,.15,3.55,9.4,x,1.775,0,plaster,false);
    box(s,.14,1.04,9.40,x-Math.sign(x)*.10,.52,0,wallWood,false);
    for(const y of [.10,1.04,3.25])box(s,.18,.10,9.4,x-Math.sign(x)*.12,y,0,darkWood,false);
    for(const z of [-3.4,-.35,2.7])box(s,.18,3.54,.13,x-Math.sign(x)*.12,1.77,z,wallPost,false);
  }
  box(s,9.4,.14,9.4,0,3.61,0,wallWood,false);
  for(const z of [-3.86,-1.58,1.18,3.85])box(s,9.4,.22,.18,0,3.44,z,darkWood,false);
  const window=duskWindow(s);
  plant(window,-.77,-.842,.24,.54,2);
  const sideArt=group(s,-4.59,1.94,-1.62);sideArt.rotation.y=Math.PI/2;
  box(sideArt,1.10,.80,.075,0,0,0,darkWood);
  plaque(sideArt,['AFTER','HOURS'],.98,.68,0,0,.042,{bg:'#827357',ink:'#e1c991',size:30,border:'#b5975d'});
  bookcase(s,.21,-4.20);
  floorLamp(s,1.83,-3.75);
  plant(s,-3.83,0,-3.23,1.79,2);
  plant(s,-2.34,0,-4.07,1.22,1);
  plant(s,4.02,0,-3.42,1.28,2);
  plant(s,4.28,0,-.69,1.42,0);
  plant(s,-4.10,0,.74,1.40,3);
  const rightArt=group(s,4.59,2.11,-2.09);rightArt.rotation.y=-Math.PI/2;
  box(rightArt,1.26,.93,.08,0,0,0,darkWood);
  const print=texture(128,96,(c)=>{
    c.fillStyle='#aaa079';c.fillRect(0,0,128,96);c.fillStyle='#7c825e';c.fillRect(8,7,112,82);
    c.fillStyle='#c7ad6d';c.beginPath();c.arc(84,31,16,0,TAU);c.fill();
    for(let i=0;i<3;i++){
      c.fillStyle=['#53604a','#67634a','#414b3d'][i];
      c.beginPath();c.moveTo(8,83);c.lineTo(8,55+i*6);c.lineTo(41+i*7,30+i*10);c.lineTo(92+i*6,67+i*7);c.lineTo(120,57+i*10);c.lineTo(120,89);c.lineTo(8,89);c.fill();
    }
  });
  mesh(rightArt,new T.PlaneGeometry(1.10,.77),basic(0xffffff,print),0,0,.044,false);
  const doors=door(s,3.05,-4.49);
  rug(s,0,.75,6.6,4.7);
  const desk=group(s,0,0,.76);
  contact(s,0,.76,3.04,1.7,.019,.59);
  for(const x of [-2.43,2.43])for(const z of [-.65,.68]){
    box(desk,.16,.80,.16,x,.40,z,darkWood);
    box(desk,.20,.07,.20,x,.08,z,wood);
  }
  box(desk,5.28,.13,1.57,0,.74,0,darkWood);
  box(desk,5.57,.12,1.83,0,.824,0,deskWood);
  box(desk,5.48,.036,1.79,0,.876,0,deskWood);
  const objects={
    academics:folder(s,-1.47,1.03,0xa7854d,entries.academics.title,.12,'01'),
    internships:folder(s,-.03,1.16,0x947b54,entries.internships.title,-.055,'02'),
    hobbies:folder(s,1.47,1.03,0x69704a,entries.hobbies.title,-.12,'03'),
    swimming:trophy(s,-1.76,.11),
    globe:globe(s,.0,.02),
    book:book(s,1.79,.09)
  };
  for(const o of Object.values(objects))contact(s,o.g.position.x,o.g.position.z,o.hinge?.73:.45,o.hinge?.53:.40,.898,.62);
  const chair=group(s,0,0,3.41);
  box(chair,.78,.10,.73,0,.51,0,darkWood);
  box(chair,.67,.07,.62,0,.572,0,mat(0x57533e));
  for(const x of [-.31,.31]){
    for(const z of [-.27,.28])box(chair,.093,.50,.093,x,.25,z,wood);
    box(chair,.095,.78,.099,x,.90,.33,darkWood);
  }
  box(chair,.76,.34,.108,0,1.10,.337,wood);
  // Upholstered reading corner, layered curtains, pottery and framed prints.
  const linen=mat(0xb8a181), velvet=mat(0x63705a);
  for(const x of [-4.04,-1.20]){
    for(let i=0;i<7;i++)box(s,.075,2.24,.12,x+i*.055,1.77,-4.32,linen);
  }
  box(s,1.12,.40,.94,-3.62,.34,2.63,wood);
  box(s,1.06,.22,.90,-3.62,.65,2.63,velvet);
  box(s,1.12,.74,.18,-3.62,1.04,3.04,velvet);
  for(const x of [-4.18,-3.06])box(s,.15,.48,1.03,x,.79,2.63,velvet);
  const pillow=box(s,.49,.43,.16,-3.63,1.03,2.85,mat(0xb88751));pillow.rotation.z=.14;
  cyl(s,.41,.38,.07,-3.66,.76,1.34,wood);
  cyl(s,.05,.10,.72,-3.66,.36,1.34,gold);
  plant(s,-3.66,.80,1.34,.54,1);
  for(let i=0;i<3;i++){
    const g=group(s,4.58,1.65+i*.44,1.2+i*.48);g.rotation.y=-Math.PI/2;
    box(g,.53,.62,.07,0,0,0,darkWood);
    plaque(g,['BOTANICAL',String(i+1)],.44,.53,0,0,.042,{bg:'#b0ac83',ink:'#4a593e',size:17});
  }
  box(s,1.5,.08,.34,3.55,1.63,4.46,wood);
  plant(s,3.12,1.68,4.43,.7,2);
  cyl(s,.12,.17,.31,3.85,1.84,4.43,clay[1]);
  return {scene:s,objects,door:doors,chair};
}
function line(parent,x,z,w,d,m) {
  return box(parent,w,.009,d,x,.008,z,m,false);
}
function arc(parent,x,z,r,a,b,m) {
  const p=mesh(parent,new T.RingGeometry(r-.028,r+.028,42,1,a,b),m,x,.017,z,false);
  p.rotation.x=-Math.PI/2;return p;
}
export const hoopCenters=[{x:0,y:3.05,z:-12.41},{x:0,y:3.05,z:12.41}];
function hoop(parent,end) {
  const rig=group(parent,0,0,end*13.00);
  if(end>0)rig.rotation.y=Math.PI;
  const white=mat(0xe1e2d5),blue=mat(0x435565),orange=mat(0xdb6138,null,{emissive:0x572614,emissiveIntensity:.3});
  box(rig,.31,3.62,.32,0,1.81,-.99,blue);
  box(rig,.50,1.64,.51,0,.84,-.99,mat(0x344553));
  box(rig,.12,.12,1.07,0,3.36,-.48,blue);
  box(rig,1.84,1.07,.10,0,3.52,-.02,white);
  box(rig,1.71,.94,.012,0,3.52,.035,mat(0x90aaa8,null,{roughness:.45}));
  for(const x of [-.30,.30])box(rig,.038,.44,.014,x,3.31,.046,white);
  for(const y of [3.09,3.53])box(rig,.62,.038,.014,0,y,.046,white);
  box(rig,.20,.07,.38,0,3.06,.205,orange);
  const rim=mesh(rig,new T.TorusGeometry(.228,.021,6,24),orange,0,3.05,.59);
  rim.rotation.x=-Math.PI/2;
  for(let i=0;i<12;i++){
    const angle=i*TAU/12;
    const a=[.228*Math.cos(angle),3.04,.59+.228*Math.sin(angle)];
    const b=[.155*Math.cos(angle-.27),2.83,.59+.155*Math.sin(angle-.27)];
    const c=[.132*Math.cos(angle+.18),2.65,.59+.132*Math.sin(angle+.18)];
    bar(rig,a,b,.008,white,4);bar(rig,b,c,.008,white,4);
    const next=angle+TAU/12;
    bar(rig,b,[.228*Math.cos(next),3.04,.59+.228*Math.sin(next)],.007,white,4);
  }
}
const ballMat=mat(0xffffff,texture(192,96,(c,w,h)=>{
  c.fillStyle='#b95a2b';c.fillRect(0,0,w,h);
  for(let i=0;i<8000;i++){
    c.fillStyle=i%2?'#dfa55370':'#7f361d6e';c.fillRect(random()*w,random()*h,1,1);
  }
  c.strokeStyle='#442b23';c.lineWidth=2.3;
  c.beginPath();c.moveTo(0,48);c.lineTo(w,48);c.moveTo(48,0);c.lineTo(48,h);c.moveTo(144,0);c.lineTo(144,h);c.stroke();
  for(const x of [0,96,192]){
    c.beginPath();c.moveTo(x,0);c.bezierCurveTo(x-44,23,x+45,72,x,h);c.stroke();
  }
}));
export function basketball(parent) {
  return sphere(parent,.122,0,0,0,ballMat,13,9);
}
export function makeCourt() {
  const s=new T.Scene();s.background=new T.Color(0x344854);s.fog=new T.Fog(0x536572,17,43);lighting(s,true);
  const courtFloor=mat(0xffffff,timber([172,125,79],19,4,4));
  const surround=mat(0x354654,grit([161,169,164]));
  const wall=mat(0x7a8b93,grit([190,188,176]));
  const blue=mat(0x354c5c),metal=mat(0x455963),deep=mat(0x273e50),linePaint=basic(0xe9e1c6);
  box(s,19.9,.16,32,0,-.09,0,surround,false);
  box(s,15,.10,28,0,-.053,0,courtFloor,false);
  for(const side of [-1,1]){
    box(s,.3,7.25,32,side*9.86,3.63,0,wall,false);
    box(s,.23,2.35,32,side*9.68,1.18,0,blue,false);
    box(s,.09,.10,32,side*9.53,2.42,0,mat(0x9f9c83),false);
    box(s,19.92,7.25,.28,0,3.63,side*15.92,wall,false);
    box(s,19.92,2.38,.14,0,1.19,side*15.73,blue,false);
    box(s,19.92,.10,.10,0,2.42,side*15.65,mat(0x9f9c83),false);
    for(let i=-3;i<=3;i++){
      const z=i*4.30;
      box(s,.31,7.40,.27,side*9.64,3.7,z,metal,false);
      const x=side*9.61;
      box(s,.14,1.50,3.31,x,5.18,z,deep,false);
      for(let j=-2;j<=2;j++)box(s,.08,1.25,.59,x-side*.098,5.18,z+j*.64,basic(i%2?0x8fabb8:0xa5c1c8),false);
      box(s,.14,.054,3.19,x-side*.16,5.19,z,blue,false);
    }
    for(const z of [-6.3,6.3])for(let tier=0;tier<3;tier++){
      box(s,.59,.31+tier*.27,5.39,side*(8.04+tier*.59),(.31+tier*.27)/2,z,deep);
      box(s,.63,.07,5.45,side*(8.04+tier*.59),.33+tier*.27,z,metal);
    }
  }
  box(s,19.91,.20,32,0,7.34,0,deep,false);
  for(let i=-3;i<=3;i++){
    const z=i*4.52;
    box(s,19.75,.26,.20,0,7.09,z,metal,false);
    for(const x of [-5,0,5]){
      box(s,2.39,.19,.56,x,6.93,z,deep,false);
      box(s,2.25,.022,.43,x,6.82,z,basic(0xcde2de),false);
    }
  }
  for(const x of [-7.45,7.45])line(s,x,0,.065,28,linePaint);
  for(const z of [-13.97,0,13.97])line(s,0,z,14.9,.063,linePaint);
  arc(s,0,0,1.80,0,TAU,linePaint);
  const keyPaint=mat(0x536e79);
  for(const end of [-1,1]){
    line(s,0,end*11.09,4.85,5.72,keyPaint);
    for(const x of [-2.45,2.45])line(s,x,end*11.09,.056,5.76,linePaint);
    line(s,0,end*8.23,4.89,.056,linePaint);
    arc(s,0,end*8.23,1.80,end===1?0:Math.PI,Math.PI,linePaint);
    arc(s,0,end*12.41,6.74,end===1?.18:Math.PI+.18,Math.PI-.36,linePaint);
    for(const x of [-6.62,6.62])line(s,x,end*13.83,.055,.35,linePaint);
    hoop(s,end);
  }
  const board=group(s,0,5.22,-15.56);
  box(board,4.8,1.37,.21,0,0,0,deep);
  plaque(board,['THE FIELDHOUSE'],4.48,.62,0,.12,.12,{bg:'#273c4d',ink:'#c6d4c9',border:'#839591',size:28});
  for(const x of [-4.7,4.7]){
    box(s,1.14,2.23,.10,x,4.78,-15.62,mat(0x536e81));
    plaque(s,['COURT','01'],.85,1.36,x,4.99,-15.55,{bg:'#536e81',ink:'#dee0cb',border:'#8b9b9d',size:34});
  }
  const doors=door(s,5.87,-15.57,true);
  const balls=[[-1.15,-5.92],[1.24,-6.07]].map(([x,z])=>{
    const g=group(s,x,0,z);
    const mesh=basketball(g);mesh.position.y=.124;
    const shadow=contact(s,x,z,.29,.29,.021,.47);
    return {g,mesh,shadow,start:new T.Vector3(x,.124,z),p:new T.Vector3(x,.124,z),v:new T.Vector3(),shot:false,scored:false};
  });
  return {scene:s,door:doors,balls};
}

export function makeHands() {
  const scene=new T.Scene();
  scene.add(new T.HemisphereLight(0xffe6cb,0x8c6656,2.05));
  const light=new T.DirectionalLight(0xffd6a9,2.10);light.position.set(-2,2,1);scene.add(light);
  const sleeve=mat(0x454c44,grit([135,144,131])), cuff=mat(0x3c473f);
  const skin=mat(0xad7855), fingers=mat(0xba8765), nails=mat(0xc39778);
  function hand(sign) {
    const root=group(scene);
    const forearm=bar(root,[sign*.25,-.36,.21],[0,-.039,.033],.087,sleeve,6);
    forearm.scale.z=1.15;
    bar(root,[sign*.031,-.076,.055],[0,-.027,.026],.093,cuff,7);
    const palm=mesh(root,new T.IcosahedronGeometry(.102,0),skin,0,.035,-.012);
    palm.scale.set(.86,1.04,.56);
    const joints=[];
    for(let i=0;i<4;i++){
      const x=(i-1.5)*.039, y=.082+.009*(i===1||i===2), len=[.063,.087,.090,.074][i];
      const digit=group(root,x,y,-.014);
      bar(digit,[0,0,0],[0,len*.60,-.022],.020,fingers,5);
      const tip=group(digit,0,len*.60,-.022);
      bar(tip,[0,0,0],[0,len*.45,-.022],.017,skin,5);
      box(tip,.018,.023,.005,0,len*.29,-.009,nails,false).rotation.x=-.47;
      joints.push(digit);
    }
    const thumb=group(root,-sign*.063,.024,-.004);
    bar(thumb,[0,0,0],[-sign*.038,.038,-.019],.025,skin,5);
    bar(thumb,[-sign*.037,.038,-.019],[-sign*.055,.068,-.047],.019,fingers,5);
    return {root,joints};
  }
  return {scene,left:hand(-1),right:hand(1)};
}
