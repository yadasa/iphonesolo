const vertex = `#version 300 es
in vec2 position; in vec2 uv; out vec2 tex;
uniform float amount;
void main(){
 float d=(position.y+1.)*.5;
 float r=pow(smoothstep(0.,1.,d),1.03);
 gl_Position=vec4(position.x*(1.+.55*amount*r),-1.+(position.y+1.)/(1.+2.57*amount*d),0.,1.);
 tex=uv;
}`;
const fragment = `#version 300 es
precision highp float;
in vec2 tex; out vec4 color; uniform sampler2D photo;
uniform float amount; uniform vec2 crop; uniform vec2 pixel;
void main(){
 vec2 p=(tex-.5)*crop+.5;
 float distance=1.-tex.y;
 float blur=amount*pow(distance,.43)*8.;
 vec4 c=texture(photo,p)*.28;
 for(int i=1;i<=4;i++){
   float weight=i==1?.18:i==2?.11:i==3?.05:.02;
   vec2 offset=vec2(0.,pixel.y*blur*float(i));
   c+=(texture(photo,p+offset)+texture(photo,p-offset))*weight;
 }
 float shade=min(.83,smoothstep(.2,.9,amount)*pow(distance,.72)*2.21);
 color=vec4(c.rgb*(1.-shade),1.);
}`;
export class LaptopRenderer {
 constructor(canvas) {
  this.canvas=canvas; const gl=this.gl=canvas.getContext('webgl2',{alpha:false,antialias:true});
  if(!gl) throw new Error('WebGL 2 is unavailable. Try a browser with hardware acceleration enabled.');
  const compile=(type,source)=>{ const s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const shaders=[compile(gl.VERTEX_SHADER,vertex),compile(gl.FRAGMENT_SHADER,fragment)];
  this.program=gl.createProgram(); shaders.forEach(s=>gl.attachShader(this.program,s)); gl.linkProgram(this.program);
  shaders.forEach(s=>gl.deleteShader(s));
  if(!gl.getProgramParameter(this.program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
  gl.useProgram(this.program);
  const data=[];
  for(let i=0;i<128;i++) {const a=i/128,b=(i+1)/128; data.push(-1,2*a-1,0,1-a,1,2*a-1,1,1-a,-1,2*b-1,0,1-b,-1,2*b-1,0,1-b,1,2*a-1,1,1-a,1,2*b-1,1,1-b);}
  this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
  for(const [name,offset] of [['position',0],['uv',8]]){const loc=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,16,offset);}
  this.locations=Object.fromEntries(['amount','crop','pixel'].map(n=>[n,gl.getUniformLocation(this.program,n)]));
 }
 setImage(image){
  const gl=this.gl; const w=image.naturalWidth,h=image.naturalHeight;
  if(Math.max(w,h)>gl.getParameter(gl.MAX_TEXTURE_SIZE)) throw new Error('That image is too large for this GPU. Choose a smaller copy.');
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
  if(this.texture)gl.deleteTexture(this.texture);this.texture=texture;this.width=w;this.height=h;
 }
 draw(amount){
  if(!this.texture || this.gl.isContextLost()) return;
  const gl=this.gl,c=this.canvas,dpr=Math.min(devicePixelRatio||1,1.5);
  const w=Math.max(1,Math.round(c.clientWidth*dpr)),h=Math.max(1,Math.round(c.clientHeight*dpr));
  if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  gl.viewport(0,0,w,h);gl.clearColor(.015,.018,.025,1);gl.clear(gl.COLOR_BUFFER_BIT);
  const ratio=(w/h)/(this.width/this.height);
  gl.uniform2f(this.locations.crop,Math.min(1,ratio),Math.min(1,1/ratio));gl.uniform2f(this.locations.pixel,1/this.width,1/this.height);
  gl.uniform1f(this.locations.amount,amount);gl.drawArrays(gl.TRIANGLES,0,768);
 }
}
