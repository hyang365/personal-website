import * as T from './vendor/three.module.min.js';
import { entries } from './content.js?v=green-release';
import { SoftwareRenderer } from './software-renderer.js?v=green-release';
import { basketball, hoopCenters, makeCourt, makeHands, makeStudy } from './scenery.js?v=green-release';

const $ = id => document.getElementById(id);
const stage = $('stage'), world = $('world'), prompt = $('prompt'), labels = $('labels');
const entry = $('entry'), help = $('help');
const hint = text => { if (prompt.textContent !== text) prompt.textContent = text; };
const entryLinks = $('entry-links');
function showEntry(key) {
  const {title,kind,body,links}=entries[key];
  $('entry-kind').textContent=kind;
  $('entry-title').textContent=title;
  $('entry-body').textContent=body;
  entryLinks.replaceChildren();
  for(const {label,url} of links){
    let destination;
    try { destination=new URL(url,document.baseURI); } catch { continue; }
    if(!['http:','https:','mailto:'].includes(destination.protocol))continue;
    const link=document.createElement('a');
    link.textContent=label;link.href=destination.href;
    entryLinks.append(link);
  }
  entry.showModal();
}
$('close-entry').onclick=()=>entry.close();
$('return-item').onclick=()=>entry.close();
$('help-button').onclick=()=>help.showModal();
$('close-help').onclick=()=>help.close();

function enableArchiveFallback() {
  $('unavailable').hidden=false;
  $('seat-button').disabled=true;
  $('reset-button').disabled=true;
  hint('Personal archive');
  for(const [key,item] of Object.entries(entries)){
    const b=document.createElement('button');
    b.className='hud-button';b.textContent=item.title;b.onclick=()=>showEntry(key);
    $('fallback-items').append(b);
  }
}

function createGame() {
  let renderer;
  try {
    const canvas=document.createElement('canvas');
    const options={antialias:false,alpha:false,powerPreference:'high-performance'};
    const context=canvas.getContext('webgl2',options);
    if(context)renderer=new T.WebGLRenderer({canvas,context,...options});
  } catch {
    // Some browsers expose WebGL but cannot initialize a renderer.
  }
  if(!renderer){
    try { renderer=new SoftwareRenderer(); }
    catch { enableArchiveFallback(); return; }
  }

  renderer.autoClear=false;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=T.PCFShadowMap;
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.23;
  const screen=renderer.domElement;
  screen.tabIndex=0;screen.setAttribute('aria-label','Interactive room');
  world.append(screen);
  const study=makeStudy(entries), court=makeCourt(), hands=makeHands();
  const worldScene=study.scene;
  const courtGroup=new T.Group();
  for(const child of [...court.scene.children])courtGroup.add(child);
  courtGroup.rotation.y=Math.PI;
  courtGroup.position.set(8.92,0,-20.8);
  worldScene.add(courtGroup);
  court.door.g.parent.visible=false;
  const threshold=new T.Mesh(new T.BoxGeometry(1.40,.10,.34),
    new T.MeshStandardMaterial({color:0x755840}));
  threshold.position.set(3.05,-.054,-4.80);
  worldScene.add(threshold);
  const courtCamera=new T.PerspectiveCamera();
  const camera=new T.PerspectiveCamera(54,1,.055,70);
  camera.rotation.order='YXZ';
  const handCamera=new T.PerspectiveCamera(54,1,.045,6);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mouse=new T.Vector2(0,-.85), centerAim=new T.Vector2(), ray=new T.Raycaster();
  const position=new T.Vector3(0,1.60,3.20);
  const keys=new Set(), scratch=new T.Vector3(), facing=new T.Vector3();
  const neutralPitch=-.232;
  let doorOpen=false;
  const lookButton=$('look-button');
  const alerts={time:0,text:''};
  let yaw=0,pitch=neutralPitch,seated=true,room=study,hover=null,labelHover=null;
  let transition=null,inspection=null,heldBall=null,chargeStart=null,attempts=0,made=0;
  let drag=null, moved=0, bob=0, jump=0, jumpVelocity=0, step=0, simRemainder=0;
  let locked=false, width=0,height=0, sceneChanged=true, invited=false;
  const holdBall=basketball(hands.scene);holdBall.visible=false;
  const interactables=[], meshTargets=new WeakMap();
  function makeTarget(key,room,object,title,geometries=null) {
    const button=document.createElement('button');
    button.type='button';button.className='object-label';button.hidden=true;button.textContent=title;button.setAttribute('aria-label',title);
    labels.append(button);
    const target={key,room,object,title,button,meshes:[],source:object.g};
    if(geometries)target.meshes=geometries;
    else object.g.traverse(child=>{if(child.isMesh)target.meshes.push(child);});
    target.meshes.forEach(m=>meshTargets.set(m,target));
    button.onpointerenter=()=>{labelHover=target;};
    button.onpointerleave=()=>{if(labelHover===target)labelHover=null;};
    button.onfocus=()=>{labelHover=target;};
    button.onblur=()=>{if(labelHover===target)labelHover=null;};
    button.onclick=()=>{activate(target);};
    interactables.push(target);
    return target;
  }
  for(const [key,item] of Object.entries(study.objects))makeTarget(key,study,item,entries[key].title);
  for(const [zone,title] of [[study,'Gymnasium'],[court,'The Study']]){
    const {door}=zone;
    const doorTarget=makeTarget('door',zone,{...door,g:door.panel},title,[door.plate,door.knob]);
    zone.exit=doorTarget;
  }
  court.balls.forEach((ball,index)=>{
    ball.target=makeTarget('ball',court,{g:ball.g,anchor:[0,.58,0],ball},'Ball '+(index+1),[ball.mesh]);
  });
  const outlineMaterials=new Map();
  function highlight(next) {
    if(hover===next)return;
    sceneChanged=true;
    if(hover){
      hover.button.classList.remove('active');
      for(const m of hover.meshes){
        const original=outlineMaterials.get(m);
        if(original){m.material.dispose();m.material=original;outlineMaterials.delete(m);}
      }
      if(hover.edges){hover.edges.removeFromParent();hover.edges.geometry.dispose();hover.edges.material.dispose();hover.edges=null;}
    }
    hover=next;
    if(!hover)return;
    hover.button.classList.add('active');
    for(const m of hover.meshes){
      const original=m.material;
      const lit=original.clone();
      if(lit.emissive){lit.emissive.set(0xc18c3c);lit.emissiveIntensity=.37;}
      else if(lit.color)lit.color.lerp(new T.Color(0xffde9c),.31);
      outlineMaterials.set(m,original);m.material=lit;
    }
    const hitBox=new T.Box3().setFromObject(hover.key==='door'?hover.object.knob:hover.source);
    const size=hitBox.getSize(new T.Vector3());
    if(size.lengthSq()>.001){
      const bounds=new T.BoxGeometry(size.x+.026,size.y+.024,size.z+.026);
      const edgeGeometry=new T.EdgesGeometry(bounds);
      bounds.dispose();
      hover.edges=new T.LineSegments(edgeGeometry,new T.LineBasicMaterial({color:0xffda79,transparent:true,opacity:.52}));
      hitBox.getCenter(hover.edges.position);
      worldScene.add(hover.edges);
    }
  }

  const anchor = target => target.source.localToWorld(new T.Vector3(...target.object.anchor));
  const distance = target => {
    const p=anchor(target);
    if(room===court)courtGroup.worldToLocal(p);
    return Math.hypot(p.x-position.x,p.z-position.z);
  };
  function canUse(target) {
    if(!target||target.room!==room)return false;
    if(target.key==='door')return !seated&&distance(target)<2.60;
    if(target.key==='ball')return !target.object.ball.held && distance(target)<3.04 && target.object.ball.p.y<2.15;
    return seated||distance(target)<2.45;
  }
  function updateCourtCamera() {
    courtCamera.copy(camera);
    courtCamera.position.set(8.92-position.x,position.y+jump+bob,-20.8-position.z);
    courtCamera.rotation.y=yaw+Math.PI;
    courtCamera.updateMatrixWorld();
  }
  function currentTarget() {
    if(inspection||transition||heldBall||help.open)return null;
    if(labelHover&&!labelHover.button.hidden)return labelHover;
    ray.setFromCamera(locked?centerAim:mouse,room===court?courtCamera:camera);
    const meshes=interactables.filter(t=>t.room===room&&!t.object.ball?.held).flatMap(t=>t.meshes);
    const hit=ray.intersectObjects(meshes,false)[0];
    return hit ? meshTargets.get(hit.object) : null;
  }
  function say(text,seconds=2) {
    alerts.text=text;alerts.time=performance.now()+seconds*1000;
  }
  function activate(target) {
    if(!target||transition||inspection||help.open)return;
    if(!canUse(target)){
      if(target.key==='door'){
        say(seated?'Press Space to stand, then walk to the door':'Walk closer to the doorknob');
      }else{
        say('Move closer to pick it up');
      }
      return;
    }
    if(target.key==='door'){ useDoor();return; }
    if(target.key==='ball'){
      if(heldBall)return;
      sceneChanged=true;
      const b=target.object.ball;
      heldBall=b;b.held=true;b.g.visible=false;b.shadow.visible=false;b.v.set(0,0,0);
      b.shot=false;
      highlight(null);
      return;
    }
    if(locked)document.exitPointerLock();
    highlight(null);
    target.source.updateWorldMatrix(true,true);
    camera.updateMatrixWorld();
    const clone=target.source.clone(true);
    let hinge=null,spin=null;
    for(const name of ['hinge','spin']){
      const original=target.object[name];
      if(!original)continue;
      const path=[];
      let part=original;
      while(part!==target.source){path.unshift(part.parent.children.indexOf(part));part=part.parent;}
      const copy=path.reduce((node,i)=>node.children[i],clone);
      if(name==='hinge')hinge=copy;else spin=copy;
    }
    const original=target.source.getWorldPosition(new T.Vector3());
    const start=camera.worldToLocal(original);
    const startRotation=camera.quaternion.clone().invert().multiply(target.source.getWorldQuaternion(new T.Quaternion()));
    const type=entries[target.key].kind;
    const isBook=type==='Book', isPage=type==='Folder'||isBook;
    const goal=new T.Vector3(0,-.52,-1.14);
    const rotation=new T.Quaternion().setFromEuler(new T.Euler(isPage?Math.PI/2:-.055,isPage?0:-.08,0));
    clone.position.copy(start);clone.quaternion.copy(startRotation);
    clone.traverse(m=>{if(m.isMesh){m.castShadow=false;m.receiveShadow=false;if(m.userData.paper)m.visible=false;}});
    target.source.visible=false;hands.scene.add(clone);sceneChanged=true;
    inspection={target,clone,hinge,spin,start,startRotation,goal,rotation,isPage,isBook,t:0,closing:false,shown:false};
  }
  function paperTexture(page,index,total,isBook,isIndex=false){
    const canvas=document.createElement('canvas');
    canvas.width=2048;canvas.height=1344;
    const c=canvas.getContext('2d');
    c.fillStyle='#f4ecd9';c.fillRect(0,0,2048,1344);
    if(isBook){
      const gutter=c.createLinearGradient(index%2?0:2048,0,index%2?115:1933,0);
      gutter.addColorStop(0,'#a48b6259');gutter.addColorStop(1,'#a48b6200');
      c.fillStyle=gutter;c.fillRect(0,0,2048,1344);
    }
    c.fillStyle='#383128';c.font='100px Georgia';c.fillText(page.title,140,180,1760);
    c.strokeStyle='#c7b897';c.lineWidth=2;c.beginPath();c.moveTo(140,230);c.lineTo(1900,230);c.stroke();
    c.font='68px Georgia';
    let y=325;
    for(const paragraph of page.body.split('\n')){
      let line='';
      for(const word of paragraph.split(' ')){
        if(c.measureText(line+word).width>1760){
          c.fillText(line,140,y);y+=88;line='';
        }
        line+=word+' ';
      }
      c.fillText(line,140,y);y+=104;
    }
    c.font='40px monospace';c.fillStyle='#82745c';
    c.fillText(isBook?String(index+1):isIndex?'← Previous sheet':(index+1)+' / '+total+'     Next sheet →',140,1245);
    c.textAlign='right';c.fillText('ESC · Put back',1900,1245);
    const texture=new T.CanvasTexture(canvas);
    texture.colorSpace=T.SRGBColorSpace;
    texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;
    return texture;
  }
  function openPaper(key){
    const i=inspection,item=entries[key];
    i.pages=item.pages??[{title:item.title,body:item.body}];
    const measure=document.createElement('canvas').getContext('2d');
    measure.font='68px Georgia';
    i.pages=i.pages.flatMap(page=>{
      const lines=[];
      for(const paragraph of page.body.split('\n')){
        let line='';
        for(const word of paragraph.split(' ')){
          if(measure.measureText(line+word).width>1760){lines.push(line.trim());line='';}
          line+=word+' ';
        }
        lines.push(line.trim());
      }
      const sheets=[];
      for(let at=0;at<Math.max(1,lines.length);at+=8)
        sheets.push({title:page.title,body:lines.slice(at,at+8).join('\n')});
      return sheets;
    });
    if(i.isBook&&i.pages.length%2)i.pages.push({title:'',body:''});
    i.pageIndex=0;
    i.pageMaps=i.pages.map((page,index)=>paperTexture(page,index,i.pages.length,i.isBook));
    const pivot=new T.Group();
    pivot.position.set(i.isBook?-.434:-.644,i.isBook?.166:.109,i.isBook?0:.037);
    const pageWidth=i.isBook?.78:1.16;
    const geometry=new T.PlaneGeometry(pageWidth,i.isBook?.615:.74);
    const sheet=new T.Mesh(geometry,new T.MeshBasicMaterial({map:i.pageMaps[i.isBook?1:0]}));
    sheet.rotation.x=-Math.PI/2;
    sheet.position.x=pageWidth/2+(i.isBook?.016:.064);
    pivot.add(sheet);i.clone.add(pivot);
    if(i.isBook){
      const left=sheet.clone();
      left.material=new T.MeshBasicMaterial({map:i.pageMaps[0]});
      left.position.x=-sheet.position.x;
      pivot.add(left);i.leftPage=left;
    }else{
      const indexMap=paperTexture({
        title:item.title,body:'Select the right side to turn forward or the left side to go back. You can also use the arrow keys.'
      },0,i.pages.length,false,true);
      const indexSheet=sheet.clone();
      indexSheet.material=new T.MeshBasicMaterial({map:indexMap});
      indexSheet.position.x=-.644;
      pivot.add(indexSheet);i.folderIndex=indexSheet;
    }
    i.paperPivot=pivot;i.paperMesh=sheet;i.flip=null;
    stage.classList.add('reading');resize();
  }
  function turnPage(direction){
    const i=inspection;
    if(!i?.paperMesh||i.flip||i.closing)return;
    const next=i.pageIndex+direction*(i.isBook?2:1);
    if(next<0||next>=i.pages.length)return;

    const pivot=new T.Group();pivot.position.copy(i.paperPivot.position);
    pivot.position.y+=.008;
    const front=i.paperMesh.clone();
    front.material=new T.MeshBasicMaterial({map:i.pageMaps[i.isBook?(direction>0?i.pageIndex+1:next+1):(direction>0?i.pageIndex:next)]});
    pivot.add(front);i.clone.add(pivot);
    let back;
    if(i.isBook){
      back=front.clone();
      back.rotateY(Math.PI);
      back.material=new T.MeshBasicMaterial({map:i.pageMaps[direction>0?next:i.pageIndex]});
      pivot.add(back);
      if(direction>0)i.paperMesh.material.map=i.pageMaps[next+1];
      else i.leftPage.material.map=i.pageMaps[next];
    }else if(direction>0)i.paperMesh.material.map=i.pageMaps[next];
    pivot.rotation.z=direction>0?0:Math.PI;
    i.flip={pivot,front,back,t:0,next,direction};
  }
  function removePageTurn(i){
    i.flip.pivot.removeFromParent();
    i.flip.front.material.dispose();
    i.flip.back?.material.dispose();
    i.flip=null;
  }
  function closePaper(){
    if(inspection?.isPage){inspection.closing=true;inspection.t=1;}
    canvasFocus();
  }
  window.addEventListener('keydown',event=>{
    if(!inspection?.isPage||help.open)return;
    if(event.key==='Escape')closePaper();
    if(event.key==='ArrowRight'){event.preventDefault();turnPage(1);}
    if(event.key==='ArrowLeft'){event.preventDefault();turnPage(-1);}
  });
  entry.addEventListener('close',()=>{
    if(inspection){inspection.closing=true;inspection.t=1;}
    canvasFocus();
  });
  help.addEventListener('close',canvasFocus);
  function canvasFocus(){screen.focus({preventScroll:true});}
  function home(){
    if(inspection||transition)return;
    if(room===court){ resetCourt();return; }
    seated=true;jump=jumpVelocity=0;position.set(0,1.60,3.20);yaw=0;pitch=neutralPitch;
    mouse.set(0,-.85);alerts.time=0;invited=false;
    if(locked)document.exitPointerLock();
    updateHud();canvasFocus();
  }
  function toggleSeat(){
    if(transition||inspection||help.open)return;
    const nearChair=room===study&&Math.hypot(position.x,position.z-3.20)<1.21;
    if(!seated&&(!nearChair||jump>0)){
      if(jump===0&&jumpVelocity===0)jumpVelocity=3.65;
      return;
    }
    if(seated){
      seated=false;invited=true;mouse.set(0,0);
      say('Walk around the desk to reach the door',2.7);
    }else{
      seated=true;position.x=0;position.z=3.20;yaw=0;pitch=neutralPitch;
      if(locked)document.exitPointerLock();
    }
    updateHud();canvasFocus();
  }
  $('seat-button').onclick=toggleSeat;
  $('reset-button').onclick=home;
  function updateHud(){
    $('location').textContent=room===study?'The Study':'The Fieldhouse';
    $('pose').textContent=room===court?'On Court':seated?'Seated':'Standing';
    $('seat-guide').textContent=seated?'Stand':'Sit';
    $('seat-button').disabled=room===court;
    $('interaction-guide').textContent=room===court?'Pick up / shoot':'Inspect';
    $('reset-guide').textContent=room===court?'Reset balls':'Reset view';
    $('score').hidden=room!==court;
    if(room!==court)scoreMessage.hidden=true;
    lookButton.hidden=locked;
    $('reticle').hidden=!(locked||heldBall);
    screen.classList.toggle('looking',!seated&&!locked);
  }
  const scoreMessage=$('score-message');
  let scoreAnimation;
  function celebrateBasket(greenRelease){
    scoreMessage.hidden=false;
    scoreMessage.textContent=greenRelease?'Green release! +1':'Basket! +1';
    scoreAnimation?.cancel();
    scoreAnimation=scoreMessage.animate(
      reduced?[{opacity:1},{opacity:1,offset:.8},{opacity:0}]:[{opacity:0,transform:'translate(-50%, 10px) scale(.85)'},
       {opacity:1,transform:'translate(-50%, 0) scale(1)',offset:.17},
       {opacity:1,transform:'translate(-50%, 0) scale(1)',offset:.72},
       {opacity:0,transform:'translate(-50%, -16px) scale(1.03)'}],
      {duration:reduced?1050:1250,easing:'ease-out'}
    );
    scoreAnimation.onfinish=()=>{scoreMessage.hidden=true;};
  }
  function updateScore(){
    $('score').querySelector('strong').textContent=made;
    $('score').querySelector('small').textContent=attempts;
  }
  function resetCourt(){
    sceneChanged=true;
    heldBall=null;chargeStart=null;made=0;attempts=0;
    for(const b of court.balls){
      b.p.copy(b.start);b.v.set(0,0,0);b.held=false;b.shot=false;b.scored=false;
      b.g.visible=true;b.shadow.visible=true;
    }
    scoreAnimation?.cancel();scoreMessage.hidden=true;
    updateScore();say('Basketballs reset');canvasFocus();
  }
  function useDoor(){
    // Keep the moving panel clear of a player standing in the threshold.
    if(doorOpen&&position.z<(room===study?-4.15:-15.17))return;
    doorOpen=!doorOpen;
    highlight(null);sceneChanged=true;
  }

  const limit=(n,a,b)=>Math.max(a,Math.min(n,b));
  const smooth=x=>x*x*(3-2*x);
  function solid(x,z){
    if(jump<.35&&doorOpen&&study.door.g.rotation.y< -1.30&&((room===study&&Math.abs(x-3.05)<.43&&z< -3.9&&z> -5.3)||(room===court&&Math.abs(x-5.87)<.43&&z< -14.9&&z> -16.5)))return false;
    if(room===court)return Math.abs(x)>9.18||Math.abs(z)>15.23
      ||(Math.abs(x)>7.58&&(Math.abs(z-6.3)<3||Math.abs(z+6.3)<3))
      ||(Math.abs(x)<.51&&Math.abs(z)>13.45&&Math.abs(z)<14.36);
    if(Math.abs(x)>4.38||Math.abs(z)>4.34)return true;
    if(Math.abs(x)<2.96&&z>-.31&&z<1.87)return true;
    if(x>-1.06&&x<1.47&&z<-3.65)return true;
    const pots=[[-3.83,-3.23,.59],[-2.34,-4.07,.47],[4.02,-3.42,.48],[4.28,-.69,.53],[-4.10,.74,.55],[1.83,-3.75,.36]];
    return pots.some(([px,pz,r])=>Math.hypot(x-px,z-pz)<r);
  }
  function movement(dt){
    let walking=false;
    const sprinting=keys.has('shift');
    if(!seated&&!inspection&&!transition&&!help.open){
      const horizontal=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
      const depth=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'));
      if(horizontal||depth){
        const substeps=Math.max(1,Math.ceil(dt/.016));
        const speed=(room===study?2.6:4.25)*(sprinting?1.58:1)*dt/(substeps*Math.hypot(horizontal,depth));
        const x=(horizontal*Math.cos(yaw)-depth*Math.sin(yaw))*speed;
        const z=(-horizontal*Math.sin(yaw)-depth*Math.cos(yaw))*speed;
        for(let i=0;i<substeps;i++){
          if(x&&!solid(position.x+x,position.z)){position.x+=x;walking=true;}
          if(z&&!solid(position.x,position.z+z)){position.z+=z;walking=true;}
        }
      }
    }
    step+=dt*(walking?(sprinting?15:10):3);
    const y=seated?1.45:2.20;
    bob=T.MathUtils.damp(bob,walking&&!reduced?Math.sin(step)*(sprinting?.038:.027):0,14,dt);
    if(jump>0||jumpVelocity>0){
      jump+=jumpVelocity*dt-6.3*dt*dt;
      jumpVelocity-=12.6*dt;
      const doorwayX=room===study?3.05:5.87;
      const byLintel=Math.abs(position.x-doorwayX)<.65&&position.z<(room===study?-4.2:-15.13);
      if(byLintel&&jump>.34){jump=.34;jumpVelocity=Math.min(jumpVelocity,0);}
      if(jump<=0){jump=0;jumpVelocity=0;}
    }
    position.y=Math.abs(position.y-y)<.001?y:T.MathUtils.damp(position.y,y,10,dt);
    camera.position.set(position.x,position.y+jump+bob,position.z);
    camera.rotation.set(pitch,yaw,0);
    camera.updateMatrixWorld();
  }
  function doorAnimation(dt) {
    const angle=doorOpen?-1.55:0;
    const old=study.door.g.rotation.y;
    study.door.g.rotation.y=T.MathUtils.damp(old,angle,8,dt);
    if(Math.abs(old-angle)>.001)sceneChanged=true;
    if(!seated&&doorOpen){
      if(room===study&&position.z < -4.75){
        position.set(8.92-position.x,position.y,-20.8-position.z);
        yaw+=Math.PI;room=court;updateHud();
      }else if(room===court&&position.z < -16.15){
        position.set(8.92-position.x,position.y,-20.8-position.z);
        yaw-=Math.PI;room=study;updateHud();
      }
    }
  }

  function readAnimation(dt) {
    if(!inspection)return;
    const i=inspection;
    i.t=limit(i.t+dt*(i.closing?-2.45:1.55)*(reduced?3:1),0,1);
    const t=smooth(i.t);
    const scale=i.isPage?Math.min(1,handCamera.aspect/1.35):.72;
    if(i.isPage){
      const halfWidth=i.isBook?.87:1.32;
      const halfHeight=i.isBook?.37:.47;
      const vertical=Math.tan(T.MathUtils.degToRad(handCamera.fov/2));
      const fit=Math.max(halfWidth/(.86*vertical*handCamera.aspect),halfHeight/(.66*vertical));
      const clearance=i.flip?.t?Math.sin(Math.PI*i.flip.t)*.52*scale:0;
      i.goal.set((i.isBook?.434:.644)*scale,-.02,-Math.max(i.isBook?1.30:1.66,fit*scale)-clearance);
    }
    i.clone.position.lerpVectors(i.start,i.goal,t);
    i.clone.quaternion.copy(i.startRotation).slerp(i.rotation,t);
    i.clone.scale.setScalar(T.MathUtils.lerp(1,scale,t));
    if(i.hinge)i.hinge.rotation.z=smooth(limit((i.t-.32)/.64,0,1))*Math.PI;
    if(i.flip){
      const flip=i.flip;flip.t=Math.min(1,flip.t+dt/(reduced?.05:.65));
      flip.pivot.rotation.z=Math.PI*(flip.direction>0?smooth(flip.t):1-smooth(flip.t));
      if(flip.t===1){
        i.pageIndex=flip.next;
        i.paperMesh.material.map=i.pageMaps[i.pageIndex+(i.isBook?1:0)];
        if(i.leftPage)i.leftPage.material.map=i.pageMaps[i.pageIndex];
        removePageTurn(i);
      }
    }
    if(i.spin)i.spin.rotation.y+=dt*1.18;
    if(i.t===1&&!i.shown){i.shown=true;if(i.isPage)openPaper(i.target.key);else showEntry(i.target.key);}
    if(i.t===0&&i.closing){
      i.target.source.visible=true;
      i.clone.removeFromParent();
      if(i.flip)removePageTurn(i);
      if(i.folderIndex){
        i.folderIndex.material.map.dispose();
        i.folderIndex.material.dispose();
      }
      i.leftPage?.material.dispose();
      i.pageMaps?.forEach(map=>map.dispose());
      i.paperMesh?.geometry.dispose();i.paperMesh?.material.dispose();
      inspection=null;sceneChanged=true;stage.classList.remove('reading');resize();
    }
  }
  function handAnimation(dt) {
    const t=inspection?smooth(inspection.t):0;
    const ready=heldBall?1:0;
    const z=-.84;
    const limitX=limit(handCamera.aspect*.43,.26,.94);
    const rx=.29;
    const ry=-.39;
    const gripY=inspection?.isPage?-.365:-.33;
    const rightX=ready?.16:T.MathUtils.lerp(rx,inspection?.isPage?.48:.23,t);
    const leftX=ready?-.18:T.MathUtils.lerp(-Math.min(.59,limitX),inspection?.isPage?-.40:-.23,t);
    const rightY=ready?-.255:T.MathUtils.lerp(ry,gripY,t);
    const leftY=ready?-.275:T.MathUtils.lerp(-.401,gripY-.032,t);
    const angle=ready?.58:T.MathUtils.lerp(.35,.79,t);
    const handsToPose=[
      [hands.left,leftX,leftY,.53,-.24,1],
      [hands.right,rightX,rightY,angle,.05,-1]
    ];
    for(const [hand,x,y,rx,rz,side] of handsToPose){
      hand.root.position.x=T.MathUtils.damp(hand.root.position.x,x,19,dt);
      hand.root.position.y=T.MathUtils.damp(hand.root.position.y,y+jump*.45,19,dt);
      hand.root.position.z=z;
      hand.root.scale.setScalar(.90);
      hand.root.rotation.set(rx,side*(.26+t*.17),rz);
      hand.joints.forEach((joint,index)=>{joint.rotation.x=-t*.66-ready*.38+(index>0&&!ready&&!t?-.23:0);});
    }
    holdBall.visible=Boolean(heldBall);
    if(heldBall){
      holdBall.position.set(.01,-.21,-.99);
      holdBall.scale.setScalar(1.08+(chargeStart!==null?.07*Math.sin(performance.now()/48):0));
    }
  }
  function putBallDown(){
    if(!heldBall)return;
    sceneChanged=true;
    const b=heldBall;heldBall=null;chargeStart=null;b.held=false;b.shot=false;b.scored=false;
    camera.getWorldDirection(facing);
    b.p.set(limit(position.x+facing.x*.72,-9.25,9.25),.126,limit(position.z+facing.z*.72,-15.4,15.4));
    b.v.set(0,0,0);b.g.visible=true;b.shadow.visible=true;
  }
  const shotMeter=$('shot-meter'), shotFill=$('shot-fill'), shotZone=$('shot-zone'), shotHint=$('shot-hint');
  const chargeTime=1250, greenHalfWidth=.078, physicsStep=1/120;
  const launchPoint=new T.Vector3(), aimDirection=new T.Vector3();
  function shotTarget(){
    camera.getWorldDirection(facing);
    launchPoint.copy(camera.position).addScaledVector(facing,.58);
    launchPoint.y-=.16;
    let target=null, bestAim=.87;
    for(const rim of hoopCenters){
      aimDirection.set(rim.x-launchPoint.x,rim.y-launchPoint.y,rim.z-launchPoint.z);
      const aim=aimDirection.normalize().dot(facing);
      if(aim>bestAim){bestAim=aim;target=rim;}
    }
    return target;
  }
  function idealCharge(target){
    const distance=Math.hypot(target.x-launchPoint.x,target.z-launchPoint.z);
    return limit(.22+distance*.031,.24,.89);
  }
  function updateShotMeter(now){
    shotMeter.hidden=room!==court||!heldBall||help.open;
    if(shotMeter.hidden)return;
    const target=shotTarget();
    const power=chargeStart===null?0:limit((now-chargeStart)/chargeTime,0,1);
    shotZone.hidden=!target;
    shotFill.style.transform='scaleX('+power+')';
    if(target)shotZone.style.left=(idealCharge(target)-greenHalfWidth)*100+'%';
    shotMeter.classList.toggle('green',Boolean(target)&&Math.abs(power-idealCharge(target))<=greenHalfWidth);
    shotHint.textContent=!target?'Aim toward a hoop':chargeStart===null?'Hold click or F to shoot':'Release in the green';
  }
  function beginShot(){
    if(room===court&&heldBall&&chargeStart===null&&!help.open&&!transition)chargeStart=performance.now();
  }
  function releaseShot(){
    if(!heldBall||chargeStart===null)return;
    const power=limit((performance.now()-chargeStart)/chargeTime,0,1);
    const target=shotTarget();
    const b=heldBall;heldBall=null;chargeStart=null;b.held=false;b.shot=true;b.scored=false;
    b.greenRelease=false;
    b.p.copy(launchPoint);
    if(target){
      const dx=target.x-b.p.x, dz=target.z-b.p.z, span=Math.hypot(dx,dz);
      const error=power-idealCharge(target);
      b.greenRelease=Math.abs(error)<=greenHalfWidth;
      const miss=b.greenRelease?0:Math.sign(error)*(.33+(Math.abs(error)-greenHalfWidth)*3.4);
      const landingOffset=span>0?miss/span:0;
      const flight=.74+span*.053;
      b.v.set(dx*(1+landingOffset)/flight,
        (target.y-b.p.y)/flight+4.9*(flight+physicsStep),
        dz*(1+landingOffset)/flight);
    }else{
      b.v.copy(facing).multiplyScalar(7.3+power*7.6);
      b.v.y=Math.max(2.75,b.v.y+3.45+power*2);
    }
    b.g.visible=true;b.shadow.visible=true;
    attempts++;updateScore();
  }
  function physics(dt) {
    if(room!==court||help.open)return;
    simRemainder+=dt;
    const sub=physicsStep;
    while(simRemainder>=sub){
      simRemainder-=sub;
      for(const b of court.balls){
        if(b.held||b.v.lengthSq()<.00001&&b.p.y<=.125)continue;
        const priorY=b.p.y;
        const priorZ=b.p.z;
        const priorX=b.p.x;
        b.v.y-=9.8*sub;
        b.p.addScaledVector(b.v,sub);
        if(b.p.y<=.122){
          b.p.y=.122;b.v.y*=-.64;
          if(b.v.y<.39)b.v.y=0;
          b.v.x*=.984;b.v.z*=.984;
          if(Math.hypot(b.v.x,b.v.z)<.055)b.v.set(0,0,0);
        }
        const nearBleachers=Math.abs(Math.abs(b.p.z)-6.3)<2.85&&b.p.y<1.03;
        const sideLimit=nearBleachers?7.60:9.39;
        if(Math.abs(b.p.x)>sideLimit){
          b.p.x=Math.sign(b.p.x)*sideLimit;
          if(b.p.x*b.v.x>0)b.v.x*=-.68;
        }
        if(Math.abs(b.p.z)>15.49){b.p.z=Math.sign(b.p.z)*15.49;b.v.z*=-.68;}
        if(b.p.y>6.94){b.p.y=6.94;b.v.y*=-.61;}
        for(const rim of hoopCenters){
          const end=Math.sign(rim.z);
          const board=end*12.90;
          if(Math.abs(b.p.x)<1.01 && b.p.y>2.91 && b.p.y<4.16 && end*priorZ<end*board && end*b.p.z>=end*board){
            b.p.z=board-end*.012;b.v.z*=-.71;
          }
          if(priorY<rim.y||b.p.y>=rim.y||b.v.y>=0)continue;
          const f=(priorY-rim.y)/(priorY-b.p.y);
          const radius=Math.hypot(T.MathUtils.lerp(priorX,b.p.x,f)-rim.x,T.MathUtils.lerp(priorZ,b.p.z,f)-rim.z);
          if(radius<.166&&b.shot&&!b.scored){b.scored=true;made++;updateScore();celebrateBasket(b.greenRelease);}
          else if(radius<.348&&radius>=.166){b.p.y=rim.y+.02;b.v.y*=-.38;b.v.z*=.70;b.v.x+=b.p.x>0?.58:-.58;}
        }
      }
    }
    for(const b of court.balls){
      if(b.held)continue;
      b.g.position.set(b.p.x,0,b.p.z);b.mesh.position.y=b.p.y;
      b.mesh.rotation.x+=b.v.z*dt*7;b.mesh.rotation.z-=b.v.x*dt*7;
      b.shadow.position.set(b.p.x,.021,b.p.z);
      b.shadow.material.opacity=.52/(1+b.p.y*.83);
    }
  }
  function updateLabels() {
    for(const t of interactables){
      const enable = t.room===room&&!transition&&!inspection&&!heldBall&&!locked&&
        (t.key==='door'||canUse(t));
      if(!enable){t.button.hidden=true;continue;}
      const p=anchor(t);
      scratch.copy(p).sub(camera.position);
      camera.getWorldDirection(facing);
      if(scratch.dot(facing)<.17){t.button.hidden=true;continue;}
      p.project(camera);
      let x=(p.x+1)*width/2;
      let y=(1-p.y)*height/2;
      if(t.key==='door'){x+=25;y-=15;}
      if(t.object.ball)y-=8;
      const outside=x<46||x>width-46||y<55||y>height-56;
      t.button.hidden=outside;
      if(!outside){t.button.style.left=x+'px';t.button.style.top=y+'px';}
    }
  }
  function updatePrompt() {
    if(transition){hint('Opening door');return;}
    if(inspection){hint('Inspecting '+inspection.target.title);return;}
    if(heldBall){
      if(chargeStart!==null){
        const value=limit((performance.now()-chargeStart)/1150,0,1);
        hint('Shot power  '+ '■'.repeat(Math.ceil(value*8))+'□'.repeat(8-Math.ceil(value*8)));
      }else hint('Aim at a hoop · Hold click or F to shoot');
      return;
    }
    if(alerts.time>performance.now()){hint(alerts.text);return;}
    if(hover){
      if(hover.key==='door'){
        hint(canUse(hover)?'Click or E · Open door':seated?'Space · Stand to reach the door':'Walk closer to the doorknob');
      }else hint((hover.key==='ball'?'Click or E · Pick up ':'Click or E · Inspect ')+hover.title);
      return;
    }
    if(room===court){hint('Click a basketball or press E near it');return;}
    hint(seated?'Point at an object to inspect it':'WASD or arrows · Walk around');
  }
  function interactionTarget(){
    const t=currentTarget();
    if(t)return t;
    if(canUse(room.exit)&&!doorOpen)return room.exit;
    if(room===court)return court.balls.map(b=>b.target).filter(canUse).sort((a,b)=>distance(a)-distance(b))[0];
    return null;
  }
  function pointerCoordinates(e){
    if(locked)return;
    const bounds=screen.getBoundingClientRect();
    mouse.set(limit((e.clientX-bounds.left)/bounds.width*2-1,-1,1),limit(1-(e.clientY-bounds.top)/bounds.height*2,-1,1));
  }
  function turn(dx,dy) {
    if(transition||inspection||help.open)return;
    const sensitivity=Number($('sensitivity').value)*.001;
    yaw-=dx*sensitivity; pitch=limit(pitch-dy*sensitivity,-1.29,1.24);
  }
  screen.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    if(inspection?.isPage){
      pointerCoordinates(e);
      turnPage(mouse.x<0?-1:1);return;
    }
    if(!locked)lookButton.click();
    pointerCoordinates(e);
    moved=0;
    drag={x:e.clientX,y:e.clientY,id:e.pointerId};
    screen.setPointerCapture(e.pointerId);
    canvasFocus();
  });
  window.addEventListener('pointermove',e=>{
    pointerCoordinates(e);
    if(locked){turn(e.movementX,e.movementY);return;}
    if(drag&&e.target===screen){moved+=Math.abs(e.movementX)+Math.abs(e.movementY);turn(e.movementX,e.movementY);}
  });
  screen.addEventListener('pointerdown',()=>beginShot());
  screen.addEventListener('pointerup',e=>{
    if(!drag||e.pointerId!==drag.id)return;
    drag=null;screen.classList.remove('dragging');
    if(heldBall){releaseShot();return;}
    if(moved<9||locked)activate(currentTarget());
  });
  screen.addEventListener('pointercancel',()=>{
    drag=null;chargeStart=null;screen.classList.remove('dragging');
  });
  $('resume-look').onclick=()=>{help.close();lookButton.click();};
  $('fullscreen').onclick=()=>{
    if(document.fullscreenElement)document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(()=>{});
  };
  try{$('sensitivity').value=localStorage.getItem('look-sensitivity')??'1.6';}catch{}
  $('sensitivity').oninput=()=>{try{localStorage.setItem('look-sensitivity',$('sensitivity').value);}catch{}};
  lookButton.onclick=()=>{
    if(!screen.requestPointerLock){say('Drag the scene to look around');return;}
    try{
      const action=screen.requestPointerLock();
      action?.catch(()=>say('Drag the scene to look around'));
    }catch { say('Drag the scene to look around'); }
  };
  document.addEventListener('pointerlockchange',()=>{
    locked=document.pointerLockElement===screen;
    if(locked){canvasFocus();mouse.set(0,0);labelHover=null;}
    if(!locked){drag=null;chargeStart=null;}
    updateHud();
  });
  document.addEventListener('pointerlockerror',()=>say('Drag the scene to look around'));
  window.addEventListener('blur',()=>{keys.clear();chargeStart=null;drag=null;});
  for(const dialog of [help,entry])dialog.addEventListener('close',()=>keys.clear());
  $('help-button').addEventListener('click',()=>{
    keys.clear();chargeStart=null;
    if(locked)document.exitPointerLock();
  });
  const movementKeys=['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright','shift'];
  window.addEventListener('keydown',e=>{
    if(entry.open||help.open||e.metaKey||e.ctrlKey||e.altKey)return;
    const key=e.key.toLowerCase();
    if(key==='p'){help.showModal();if(locked)document.exitPointerLock();return;}
    if(inspection?.isPage)return;
    if(e.target instanceof HTMLButtonElement && (key===' '||key==='enter'))return;
    if(movementKeys.includes(key)){e.preventDefault();keys.add(key);}
    if(key===' '){e.preventDefault();if(!e.repeat)toggleSeat();}
    if(e.repeat)return;
    if(key==='e'){if(heldBall)putBallDown();else activate(interactionTarget());}
    if(key==='f')beginShot();
    if(key==='r')home();
  });
  window.addEventListener('keyup',e=>{
    const key=e.key.toLowerCase();
    keys.delete(key);if(key==='f')releaseShot();
  });

  function resize(){
    width=stage.clientWidth;height=stage.clientHeight;
    if(!width||!height)return;
    const renderScale=inspection?.isPage?Math.min(1.5,1200/height):renderer.isSoftware?Math.min(1,360/height):Math.min(1,800/height);
    renderer.setSize(Math.round(width*renderScale),Math.round(height*renderScale),false);
    camera.aspect=handCamera.aspect=width/height;
    camera.fov=T.MathUtils.radToDeg(2*Math.atan(Math.max(Math.tan(T.MathUtils.degToRad(room===court?30:27)),.85/camera.aspect)));
    handCamera.fov=camera.fov;
    camera.updateProjectionMatrix();handCamera.updateProjectionMatrix();sceneChanged=true;
  }
  new ResizeObserver(resize).observe(stage);
  resize();updateHud();
  let last=performance.now();
  function frame(now){
    const dt=limit((now-last)/1000,0,.12);last=now;
    doorAnimation(dt);movement(dt);physics(dt);readAnimation(dt);handAnimation(dt);
    if(room===court)updateCourtCamera();
    updateShotMeter(now);
    labels.hidden=true;
    const target=currentTarget();
    highlight(target);
    prompt.hidden=true;
    screen.classList.toggle('targeted',Boolean(hover));
    $('reticle').hidden=!(locked||heldBall)||Boolean(inspection);
    renderer.shadowMap.autoUpdate=false;
    renderer.invalidate=sceneChanged;
    if(sceneChanged){renderer.shadowMap.needsUpdate=true;sceneChanged=false;}
    renderer.setClearColor(room===study?0x3b2518:0x344854);
    renderer.clear();
    renderer.render(worldScene,room===court?courtCamera:camera);
    renderer.clearDepth();
    renderer.render(hands.scene,handCamera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
createGame();
