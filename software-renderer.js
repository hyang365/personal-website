import * as T from './vendor/three.module.min.js';

// A depth-buffered Canvas renderer for machines where WebGL is unavailable.
// Affine texture coordinates give this path the same low-resolution look.
export class SoftwareRenderer {
  constructor() {
    this.domElement = document.createElement('canvas');
    this.context = this.domElement.getContext('2d', {alpha:false});
    if(!this.context)throw new Error('Canvas rendering is unavailable');
    this.shadowMap={};
    this.isSoftware=true;
    this.textures=new WeakMap();
    this.geometry=new WeakMap();
    this.colors=new WeakMap();
    this.views=new WeakMap();
    this.near=.06;
    this.matrix=new T.Matrix4();
    this.normalMatrix=new T.Matrix3();
  }

  setSize(w,h) {
    if(this.width===w&&this.height===h)return;
    this.width=this.domElement.width=w;
    this.height=this.domElement.height=h;
    this.image=this.context.createImageData(w,h);
    this.depth=new Float32Array(w*h);
    this.pixels=new Uint32Array(this.image.data.buffer);
    this.views=new WeakMap();
  }

  setClearColor(color) {
    this.clearColor=0xff000000|((color&0xff)<<16)|(color&0xff00)|((color>>16)&0xff);
  }

  clear() {this.pixels.fill(this.clearColor);this.clearDepth();}
  clearDepth() {this.depth.fill(Infinity);}

  readTexture(map) {
    if(!map?.image?.getContext)return null;
    let texture=this.textures.get(map);
    if(!texture){
      const {width,height}=map.image;
      texture={width,height,pixels:map.image.getContext('2d').getImageData(0,0,width,height).data};
      this.textures.set(map,texture);
    }
    return texture;
  }

  render(scene,camera) {
    const isWorld=scene.background!==null;
    const cached=this.views.get(scene);
    camera.updateMatrixWorld();
    if(isWorld&&cached?.matrix.equals(camera.matrixWorld)&&!this.invalidate){
      this.pixels.set(cached.pixels);
      return;
    }
    scene.updateMatrixWorld();
    this.near=camera.near+.001;
    this.projectionX=camera.projectionMatrix.elements[0]*this.width*.5;
    this.projectionY=camera.projectionMatrix.elements[5]*this.height*.5;
    this.cool=Boolean(scene.fog);
    const transparent=[];
    scene.traverseVisible(mesh=>{
      if(!mesh.isMesh)return;
      if(mesh.material.transparent)transparent.push(mesh);
      else this.drawMesh(mesh,camera);
    });
    for(const mesh of transparent)this.drawMesh(mesh,camera);
    if(isWorld){
      this.views.set(scene,{matrix:camera.matrixWorld.clone(),pixels:new Uint32Array(this.pixels)});
    }else{
      this.context.putImageData(this.image,0,0);
    }
  }

  meshData(geo) {
    let data=this.geometry.get(geo);
    if(data)return data;
    const p=geo.attributes.position, uv=geo.attributes.uv;
    const indices=geo.index;
    const count=indices?.count??p.count;
    const points=new Array(p.count);
    for(let i=0;i<p.count;i++)points[i]=[p.getX(i),p.getY(i),p.getZ(i),uv?.getX(i)??0,uv?.getY(i)??0];
    const faces=[];
    const vec=new T.Vector3(), edge=new T.Vector3();
    for(let i=0;i<count;i+=3){
      const a=indices?indices.getX(i):i, b=indices?indices.getX(i+1):i+1, c=indices?indices.getX(i+2):i+2;
      const A=points[a], B=points[b], C=points[c];
      vec.set(B[0]-A[0],B[1]-A[1],B[2]-A[2]);
      edge.set(C[0]-A[0],C[1]-A[1],C[2]-A[2]);
      vec.cross(edge).normalize();
      faces.push([a,b,c,...vec.toArray()]);
    }
    data={points,faces};
    this.geometry.set(geo,data);
    return data;
  }

  drawMesh(mesh,camera) {
    const {points,faces}=this.meshData(mesh.geometry);
    const material=mesh.material;
    if(!material.visible)return;
    this.matrix.multiplyMatrices(camera.matrixWorldInverse,mesh.matrixWorld);
    this.normalMatrix.getNormalMatrix(mesh.matrixWorld);
    const e=this.matrix.elements, n=this.normalMatrix.elements;
    const texture=this.readTexture(material.map);
    let color=this.colors.get(material);
    if(!color){
      const tint=material.color.clone().convertLinearToSRGB();
      color=[tint.r,tint.g,tint.b];this.colors.set(material,color);
    }
    const vertices=points.map(([x,y,z,u,v])=>[
      e[0]*x+e[4]*y+e[8]*z+e[12],e[1]*x+e[5]*y+e[9]*z+e[13],
      -e[2]*x-e[6]*y-e[10]*z-e[14],u,v
    ]);
    for(const [a,b,c,nx,ny,nz] of faces){
      const A=vertices[a], B=vertices[b], C=vertices[c];
      if(Math.max(A[2],B[2],C[2])<this.near)continue;
      const X=n[0]*nx+n[3]*ny+n[6]*nz, Y=n[1]*nx+n[4]*ny+n[7]*nz, Z=n[2]*nx+n[5]*ny+n[8]*nz;
      const inv=1/(Math.hypot(X,Y,Z)||1);
      const key=this.cool?(-.42*X+.82*Y+.24*Z):(-.45*X+.83*Y+.31*Z);
      let light=material.isMeshBasicMaterial ? 1 : .65+.17*Y*inv+.38*Math.max(0,key*inv);
      if(material.emissiveIntensity)light+=material.emissiveIntensity*.12;
      const tint=this.cool?[light*.91,light,light*1.06]:[light*1.17,light*.98,light*.81];
      if(material.isMeshBasicMaterial)tint.fill(1);
      const clipped=this.clip([A,B,C]);
      if(clipped.length<3)continue;
      const projected=clipped.map(([x,y,z,u,v])=>[
        x*this.projectionX/z+this.width*.5,this.height*.5-y*this.projectionY/z,1/z,u,v
      ]);
      for(let i=1;i+1<projected.length;i++)this.triangle(projected[0],projected[i],projected[i+1],color,tint,texture,material);
    }
  }

  clip(points) {
    if(points.every(p=>p[2]>=this.near))return points;
    const output=[];
    let a=points.at(-1);
    for(const b of points){
      if((a[2]>=this.near)!==(b[2]>=this.near)){
        const t=(this.near-a[2])/(b[2]-a[2]);
        output.push(a.map((v,i)=>i===2?this.near:v+(b[i]-v)*t));
      }
      if(b[2]>=this.near)output.push(b);
      a=b;
    }
    return output;
  }

  triangle(a,b,c,color,tint,tex,material) {
    const [ax,ay,az,au,av]=a,[bx,by,bz,bu,bv]=b,[cx,cy,cz,cu,cv]=c;
    const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
    if(Math.abs(area)<.01||area>0&&material.side!==T.DoubleSide)return;
    const xmin=Math.max(0,Math.floor(Math.min(ax,bx,cx))),xmax=Math.min(this.width-1,Math.ceil(Math.max(ax,bx,cx)));
    const ymin=Math.max(0,Math.floor(Math.min(ay,by,cy))),ymax=Math.min(this.height-1,Math.ceil(Math.max(ay,by,cy)));
    if(xmin>xmax||ymin>ymax)return;
    const inv=1/area, duX=(cy-ay)*inv, dvX=-(by-ay)*inv;
    const tw=tex?.width,th=tex?.height,map=material.map;
    const ux=map?.repeat.x??1,vy=map?.repeat.y??1;
    const r=color[0]*tint[0],g=color[1]*tint[1],bl=color[2]*tint[2];
    const alpha=material.opacity;
    const solid=0xff000000|(Math.min(255,bl*255)<<16)|(Math.min(255,g*255)<<8)|Math.min(255,r*255);
    for(let y=ymin;y<=ymax;y++){
      const py=y+.5-ay;
      let u=((xmin+.5-ax)*(cy-ay)-py*(cx-ax))*inv;
      let v=((bx-ax)*py-(by-ay)*(xmin+.5-ax))*inv;
      let offset=y*this.width+xmin;
      for(let x=xmin;x<=xmax;x++,offset++,u+=duX,v+=dvX){
        if(u<-.00003||v<-.00003||u+v>1.00003)continue;
        const w=1-u-v, z=1/(az*w+bz*u+cz*v);
        if(z>=this.depth[offset]+(material.transparent?.013:0))continue;
        if(!tex){
          this.pixels[offset]=solid;this.depth[offset]=z;continue;
        }
        const tu=(au*w+bu*u+cu*v)*ux, tv=(av*w+bv*u+cv*v)*vy;
        const tx=(((tu-Math.floor(tu))*tw)|0),ty=th-1-(((tv-Math.floor(tv))*th)|0);
        const i=(ty*tw+tx)*4, src=tex.pixels;
        let red=Math.min(255,src[i]*r),green=Math.min(255,src[i+1]*g),blue=Math.min(255,src[i+2]*bl);
        if(material.transparent){
          const amount=src[i+3]*alpha/255;
          const existing=this.pixels[offset];
          red=red*amount+(existing&255)*(1-amount);
          green=green*amount+((existing>>>8)&255)*(1-amount);
          blue=blue*amount+((existing>>>16)&255)*(1-amount);
        }
        this.pixels[offset]=0xff000000|(blue<<16)|(green<<8)|red;
        if(material.depthWrite)this.depth[offset]=z;
      }
    }
  }
}
