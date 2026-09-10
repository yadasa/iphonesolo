const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
uniform float u_fold;
uniform float u_side;
uniform float u_aspect;
out vec2 v_uv;
out float v_light;

void main() {
  float sideMask = u_side > 0.0 ? step(0.0, a_position.x) : 1.0 - step(0.0, a_position.x);
  float hinge = 0.0;
  float localX = a_position.x - hinge;
  float signedAngle = radians(u_fold) * u_side * sideMask;
  float c = cos(signedAngle);
  float s = sin(signedAngle);
  float x = localX * c + hinge;
  float z = -localX * s;
  float perspective = 1.0 / max(0.48, 1.0 - z * 0.46);
  vec2 projected = vec2(x * perspective, a_position.y * perspective);
  projected.x /= mix(1.0, u_aspect, 0.08);
  gl_Position = vec4(projected, 0.0, 1.0);
  v_uv = a_uv;
  v_light = mix(1.0, 0.66 + 0.34 * abs(c), sideMask);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform bool u_hasTexture;
uniform vec2 u_uvScale;
uniform vec2 u_uvOffset;
in vec2 v_uv;
in float v_light;
out vec4 outColor;

void main() {
  if (!u_hasTexture) {
    outColor = vec4(0.012, 0.014, 0.02, 1.0);
    return;
  }
  vec4 color = texture(u_texture, v_uv * u_uvScale + u_uvOffset);
  float edge = 1.0 - smoothstep(0.0, 0.018, abs(v_uv.x - 0.5));
  color.rgb *= v_light * (1.0 - edge * 0.16);
  outColor = color;
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed.");
  }
  return shader;
}

export class FoldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2", { alpha: false, antialias: true, powerPreference: "high-performance" });
    if (!this.gl) throw new Error("This experience needs WebGL 2.");
    this.program = this.createProgram();
    this.texture = this.gl.createTexture();
    this.hasTexture = false;
    this.video = null;
    this.mediaWidth = 1;
    this.mediaHeight = 1;
    this.side = 1;
    this.setupGeometry();
    this.resize();
  }

  createProgram() {
    const gl = this.gl;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Shader linking failed.");
    return program;
  }

  setupGeometry() {
    const gl = this.gl;
    const vertices = new Float32Array([
      -1,-1, 0,1,   0,-1, .5,1,   -1,1, 0,0,
      -1,1, 0,0,    0,-1, .5,1,    0,1, .5,0,
       0,-1, .5,1,  1,-1, 1,1,     0,1, .5,0,
       0,1, .5,0,   1,-1, 1,1,     1,1, 1,0
    ]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.useProgram(this.program);
    const position = gl.getAttribLocation(this.program, "a_position");
    const uv = gl.getAttribLocation(this.program, "a_uv");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
  }

  setImage(image) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    this.video = null;
    this.mediaWidth = image.naturalWidth;
    this.mediaHeight = image.naturalHeight;
    this.hasTexture = true;
  }

  setVideo(video) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    this.video = video;
    this.mediaWidth = video.videoWidth;
    this.mediaHeight = video.videoHeight;
    this.hasTexture = true;
  }

  render(fold, side = this.side) {
    const gl = this.gl;
    this.resize();
    this.side = side || 1;
    gl.clearColor(0.012, 0.014, 0.02, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_fold"), fold);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_side"), this.side);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_aspect"), this.canvas.width / this.canvas.height);
    gl.uniform1i(gl.getUniformLocation(this.program, "u_hasTexture"), this.hasTexture);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (this.video && this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
    }
    const viewportAspect = this.canvas.width / this.canvas.height;
    const mediaAspect = this.mediaWidth / this.mediaHeight;
    let scaleX = 1;
    let scaleY = 1;
    if (mediaAspect > viewportAspect) scaleX = viewportAspect / mediaAspect;
    else scaleY = mediaAspect / viewportAspect;
    gl.uniform2f(gl.getUniformLocation(this.program, "u_uvScale"), scaleX, scaleY);
    gl.uniform2f(gl.getUniformLocation(this.program, "u_uvOffset"), (1 - scaleX) / 2, (1 - scaleY) / 2);
    gl.drawArrays(gl.TRIANGLES, 0, 12);
  }
}
