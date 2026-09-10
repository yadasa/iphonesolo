const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
uniform float u_tilt;
uniform float u_aspect;
out vec2 v_uv;

void main() {
  // The edge the device tilts toward is fixed. Transformation strength grows
  // continuously with distance from that anchor and is mirrored by direction.
  float amount = abs(u_tilt);
  float anchorX = u_tilt < 0.0 ? -1.0 : 1.0;
  float distanceFromAnchor = u_tilt < 0.0
    ? (a_position.x + 1.0) * 0.5
    : (1.0 - a_position.x) * 0.5;
  float ramp = smoothstep(0.0, 1.0, distanceFromAnchor);

  float horizontalStretch = 1.0 + amount * 0.42 * ramp;
  float x = anchorX + (a_position.x - anchorX) * horizontalStretch;
  float verticalStretch = 1.0 + amount * 0.46 * ramp;
  float directionalSkew = -u_tilt * 0.13 * ramp;
  float y = a_position.y * verticalStretch + directionalSkew;
  vec2 projected = vec2(x, y);
  gl_Position = vec4(projected, 0.0, 1.0);
  v_uv = a_uv;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform bool u_hasTexture;
uniform float u_tilt;
uniform vec2 u_uvScale;
uniform vec2 u_uvOffset;
uniform vec2 u_texelSize;
in vec2 v_uv;
out vec4 outColor;

void main() {
  if (!u_hasTexture) {
    outColor = vec4(0.012, 0.014, 0.02, 1.0);
    return;
  }
  vec2 uv = v_uv * u_uvScale + u_uvOffset;
  float amount = abs(u_tilt);
  float distanceFromAnchor = u_tilt < 0.0 ? v_uv.x : 1.0 - v_uv.x;
  float blurGradient = pow(clamp(distanceFromAnchor, 0.0, 1.0), 1.35);
  float blurRadius = smoothstep(0.04, 1.0, amount) * blurGradient * 18.0;
  vec2 blurStep = u_texelSize * blurRadius * normalize(vec2(1.0, u_tilt * 0.18));

  vec4 color = texture(u_texture, uv) * 0.20;
  color += texture(u_texture, uv - blurStep * 0.75) * 0.16;
  color += texture(u_texture, uv + blurStep * 0.75) * 0.16;
  color += texture(u_texture, uv - blurStep * 1.5) * 0.13;
  color += texture(u_texture, uv + blurStep * 1.5) * 0.13;
  color += texture(u_texture, uv - blurStep * 2.4) * 0.08;
  color += texture(u_texture, uv + blurStep * 2.4) * 0.08;
  color += texture(u_texture, uv - blurStep * 3.3) * 0.03;
  color += texture(u_texture, uv + blurStep * 3.3) * 0.03;

  float depthShade = amount * blurGradient * 0.78;
  color.rgb *= max(0.18, 1.0 - depthShade);
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
    this.locations = this.cacheLocations();
    this.texture = this.gl.createTexture();
    this.hasTexture = false;
    this.video = null;
    this.videoFrameReady = false;
    this.videoFrameHandle = null;
    this.lastVideoTime = -1;
    this.mediaWidth = 1;
    this.mediaHeight = 1;
    this.side = 1;
    this.lastFold = Number.NaN;
    this.lastSide = Number.NaN;
    this.dirty = true;
    this.setupGeometry();
    this.resize();
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      this.dirty = true;
    });
    this.resizeObserver.observe(canvas);
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

  cacheLocations() {
    const gl = this.gl;
    const uniform = name => gl.getUniformLocation(this.program, name);
    return {
      position: gl.getAttribLocation(this.program, "a_position"),
      uv: gl.getAttribLocation(this.program, "a_uv"),
      tilt: uniform("u_tilt"),
      aspect: uniform("u_aspect"),
      hasTexture: uniform("u_hasTexture"),
      uvScale: uniform("u_uvScale"),
      uvOffset: uniform("u_uvOffset"),
      texelSize: uniform("u_texelSize")
    };
  }

  setupGeometry() {
    const gl = this.gl;
    const segments = 64;
    const data = [];
    for (let index = 0; index < segments; index += 1) {
      const x0 = -1 + (index / segments) * 2;
      const x1 = -1 + ((index + 1) / segments) * 2;
      const u0 = index / segments;
      const u1 = (index + 1) / segments;
      data.push(
        x0, -1, u0, 1,  x1, -1, u1, 1,  x0, 1, u0, 0,
        x0,  1, u0, 0,  x1, -1, u1, 1,  x1, 1, u1, 0
      );
    }
    const vertices = new Float32Array(data);
    this.vertexCount = segments * 6;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.useProgram(this.program);
    const { position, uv } = this.locations;
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
      this.dirty = true;
    }
    this.gl.viewport(0, 0, width, height);
  }

  stopVideoFrameTracking() {
    if (this.video && this.videoFrameHandle != null && "cancelVideoFrameCallback" in this.video) {
      this.video.cancelVideoFrameCallback(this.videoFrameHandle);
    }
    this.videoFrameHandle = null;
  }

  trackVideoFrames(video) {
    if (!("requestVideoFrameCallback" in video)) return;
    const markFrame = () => {
      this.videoFrameReady = true;
      this.videoFrameHandle = video.requestVideoFrameCallback(markFrame);
    };
    this.videoFrameHandle = video.requestVideoFrameCallback(markFrame);
  }

  setImage(image) {
    const gl = this.gl;
    this.stopVideoFrameTracking();
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
    this.dirty = true;
  }

  setVideo(video) {
    const gl = this.gl;
    this.stopVideoFrameTracking();
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
    this.videoFrameReady = true;
    this.lastVideoTime = -1;
    this.trackVideoFrames(video);
    this.dirty = true;
  }

  render(fold, side = this.side) {
    const gl = this.gl;
    this.side = side || 1;
    const signedTilt = this.side * Math.min(1, Math.max(0, fold / 82));
    const supportsFrameCallback = this.video && "requestVideoFrameCallback" in this.video;
    const fallbackVideoFrame = this.video && !supportsFrameCallback && this.video.currentTime !== this.lastVideoTime;
    const hasFreshVideoFrame = Boolean(this.video && (this.videoFrameReady || fallbackVideoFrame));
    const transformChanged = Math.abs(signedTilt - this.lastFold) > 0.0003;
    if (!this.dirty && !transformChanged && !hasFreshVideoFrame) return false;

    gl.clearColor(0.012, 0.014, 0.02, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform1f(this.locations.tilt, signedTilt);
    gl.uniform1f(this.locations.aspect, this.canvas.width / this.canvas.height);
    gl.uniform1i(this.locations.hasTexture, this.hasTexture);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (hasFreshVideoFrame && this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
      this.videoFrameReady = false;
      this.lastVideoTime = this.video.currentTime;
    }
    const viewportAspect = this.canvas.width / this.canvas.height;
    const mediaAspect = this.mediaWidth / this.mediaHeight;
    let scaleX = 1;
    let scaleY = 1;
    if (mediaAspect > viewportAspect) scaleX = viewportAspect / mediaAspect;
    else scaleY = mediaAspect / viewportAspect;
    gl.uniform2f(this.locations.uvScale, scaleX, scaleY);
    gl.uniform2f(this.locations.uvOffset, (1 - scaleX) / 2, (1 - scaleY) / 2);
    gl.uniform2f(this.locations.texelSize, 1 / this.mediaWidth, 1 / this.mediaHeight);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    this.lastFold = signedTilt;
    this.lastSide = this.side;
    this.dirty = false;
    return true;
  }
}
