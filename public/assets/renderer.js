const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
uniform float u_tilt;
uniform float u_aspect;
uniform float u_planeHeight;
uniform float u_horizontalStretch;
uniform float u_verticalCompression;
uniform float u_perspectiveSkew;
uniform float u_verticalDisplacement;
uniform float u_transformFalloff;
uniform float u_nonlinearFalloff;
out vec2 v_uv;

void main() {
  // The edge the device tilts toward is fixed. Transformation strength grows
  // continuously with distance from that anchor and is mirrored by direction.
  float amount = abs(u_tilt);
  float anchorX = u_tilt < 0.0 ? -1.0 : 1.0;
  float distanceFromAnchor = u_tilt < 0.0
    ? (a_position.x + 1.0) * 0.5
    : (1.0 - a_position.x) * 0.5;
  float ramp = pow(smoothstep(0.0, 1.0, distanceFromAnchor), u_transformFalloff);
  if (u_nonlinearFalloff > 0.5) ramp = smoothstep(0.0, 1.0, ramp);

  float horizontalStretch = 1.0 + amount * u_horizontalStretch * ramp;
  float x = anchorX + (a_position.x - anchorX) * horizontalStretch;
  float verticalScale = max(0.05, 1.0 - amount * u_verticalCompression * ramp);
  // Vertical movement is direction-independent: left and right tilts mirror
  // only the horizontal anchor, not the sign of the Y-axis displacement.
  float directionalSkew = -amount * u_perspectiveSkew * ramp;
  float baseY = a_position.y * u_planeHeight;
  // Displacement is expressed as a fraction of the viewport height. NDC spans
  // two units vertically, so multiply by two while preserving the anchor edge.
  float y = baseY * verticalScale + directionalSkew + amount * u_verticalDisplacement * 2.0 * ramp;
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
uniform float u_darknessGradient;
uniform float u_blurStrength;
uniform float u_blurSize;
uniform float u_blurFalloff;
uniform float u_darknessFalloff;
uniform float u_nonlinearFalloff;
uniform int u_blurPairs;
uniform float u_blurWeights[33];
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
  float blurGradient = pow(clamp(distanceFromAnchor, 0.0, 1.0), u_blurFalloff);
  if (u_nonlinearFalloff > 0.5) blurGradient = smoothstep(0.0, 1.0, blurGradient);
  float blurRadius = smoothstep(0.04, 1.0, amount) * blurGradient * u_blurSize * max(1.0, u_blurStrength);
  vec2 blurStep = u_texelSize * blurRadius * normalize(vec2(1.0, u_tilt * 0.18));

  vec4 sharp = texture(u_texture, uv);
  vec4 blurred = sharp * u_blurWeights[0];
  for (int index = 1; index <= 32; index++) {
    if (index > u_blurPairs) break;
    float offset = float(index) / float(max(u_blurPairs, 1));
    vec2 sampleOffset = blurStep * offset;
    float weight = u_blurWeights[index];
    blurred += texture(u_texture, uv - sampleOffset) * weight;
    blurred += texture(u_texture, uv + sampleOffset) * weight;
  }
  vec4 color = mix(sharp, blurred, min(u_blurStrength, 1.0));

  float shadowGradient = pow(clamp(distanceFromAnchor, 0.0, 1.0), u_darknessFalloff);
  if (u_nonlinearFalloff > 0.5) shadowGradient = smoothstep(0.0, 1.0, shadowGradient);
  // Let the fold establish itself before the lighting starts to deepen, then
  // bring the shade in more gradually through the late part of the rotation.
  float tiltShadow = smoothstep(0.20, 0.90, amount);
  float depthShade = min(0.83, tiltShadow * shadowGradient * u_darknessGradient);
  color.rgb *= 1.0 - depthShade;
  outColor = color;
}`;

export const DEFAULT_RENDER_SETTINGS = Object.freeze({
  horizontalStretch: 1.09,
  perspectiveSkew: 0.7,
  verticalCompression: 1.35,
  verticalDisplacement: 0.28,
  rotationInfluence: 1,
  transformFalloff: 1.03,
  darknessGradient: 2.21,
  darknessFalloff: 0.72,
  gaussianBlurStrength: 3.1,
  gaussianBlurSize: 100,
  gaussianBlurSamples: 33,
  gaussianBlurFalloff: 0.43,
  nonlinearFalloff: true
});

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Shader compilation failed.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

export class FoldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.contextOptions = { alpha: false, antialias: true, powerPreference: "high-performance" };
    this.gl = canvas.getContext("webgl2", this.contextOptions);
    if (!this.gl) throw new Error("This experience needs WebGL 2.");

    this.program = null;
    this.locations = null;
    this.texture = null;
    this.geometryBuffer = null;
    this.hasTexture = false;
    this.video = null;
    this.videoFrameSource = null;
    this.videoFrameUpdater = null;
    this.videoFrameReady = false;
    this.videoFrameHandle = null;
    this.lastVideoTime = -1;
    this.mediaWidth = 1;
    this.mediaHeight = 1;
    this.side = 1;
    this.lastFold = Number.NaN;
    this.lastSide = Number.NaN;
    this.settings = { ...DEFAULT_RENDER_SETTINGS };
    this.blurPairs = 0;
    this.blurWeights = new Float32Array(33);
    this.contextLost = false;

    this.handleContextLost = event => {
      event.preventDefault();
      this.contextLost = true;
      this.stopVideoFrameTracking();
      this.canvas.dispatchEvent(new CustomEvent("foldrenderercontextlost"));
    };
    this.handleContextRestored = () => {
      try {
        this.contextLost = false;
        this.initializeResources();
        this.resize();
        this.canvas.dispatchEvent(new CustomEvent("foldrenderercontextrestored"));
      } catch (error) {
        this.contextLost = true;
        this.canvas.dispatchEvent(new CustomEvent("foldrenderercontextrestorefailed", { detail: error }));
      }
    };
    canvas.addEventListener("webglcontextlost", this.handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored, false);

    this.updateBlurKernel(this.settings.gaussianBlurSamples);
    this.initializeResources();
    this.resize();
    this.resizeObserver = new ResizeObserver(() => {
      if (this.contextLost) return;
      this.resize();
      this.dirty = true;
    });
    this.resizeObserver.observe(canvas);
  }

  initializeResources() {
    this.stopVideoFrameTracking();
    this.program = this.createProgram();
    this.locations = this.cacheLocations();
    this.texture = null;
    this.hasTexture = false;
    this.video = null;
    this.videoFrameSource = null;
    this.videoFrameUpdater = null;
    this.videoFrameReady = false;
    this.lastVideoTime = -1;
    this.lastFold = Number.NaN;
    this.lastSide = Number.NaN;
    this.setupGeometry();
    this.dirty = true;
  }

  createProgram() {
    const gl = this.gl;
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || "Shader linking failed.";
      gl.deleteProgram(program);
      throw new Error(message);
    }
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
      planeHeight: uniform("u_planeHeight"),
      horizontalStretch: uniform("u_horizontalStretch"),
      verticalCompression: uniform("u_verticalCompression"),
      perspectiveSkew: uniform("u_perspectiveSkew"),
      verticalDisplacement: uniform("u_verticalDisplacement"),
      transformFalloff: uniform("u_transformFalloff"),
      nonlinearFalloff: uniform("u_nonlinearFalloff"),
      hasTexture: uniform("u_hasTexture"),
      uvScale: uniform("u_uvScale"),
      uvOffset: uniform("u_uvOffset"),
      texelSize: uniform("u_texelSize"),
      darknessGradient: uniform("u_darknessGradient"),
      blurStrength: uniform("u_blurStrength"),
      blurSize: uniform("u_blurSize"),
      blurFalloff: uniform("u_blurFalloff"),
      darknessFalloff: uniform("u_darknessFalloff"),
      blurPairs: uniform("u_blurPairs"),
      blurWeights: uniform("u_blurWeights[0]")
    };
  }

  isContextLost() {
    return this.contextLost || this.gl.isContextLost();
  }

  getMaxTextureSize() {
    if (this.isContextLost()) return 0;
    return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) || 0;
  }

  clearGlErrors() {
    const gl = this.gl;
    while (gl.getError() !== gl.NO_ERROR) {
      // Drain stale errors so a staging upload can be validated independently.
    }
  }

  createStagedTexture(source, width, height) {
    const gl = this.gl;
    if (this.isContextLost()) throw new Error("The graphics context is unavailable.");
    if (!source || width <= 0 || height <= 0) throw new Error("Media does not contain a renderable frame.");

    const maxTextureSize = this.getMaxTextureSize();
    if (maxTextureSize && (width > maxTextureSize || height > maxTextureSize)) {
      throw new Error(`Media frame ${width}×${height} exceeds this device's ${maxTextureSize}px GPU texture limit.`);
    }

    const texture = gl.createTexture();
    if (!texture) throw new Error("Could not allocate a GPU texture.");

    this.clearGlErrors();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch (error) {
      gl.deleteTexture(texture);
      throw error;
    }

    if (this.isContextLost()) {
      throw new Error("The graphics context was lost while uploading media.");
    }
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      gl.deleteTexture(texture);
      throw new Error(`GPU texture upload failed (WebGL error 0x${error.toString(16)}).`);
    }
    return texture;
  }

  commitTexture(texture, width, height) {
    const gl = this.gl;
    const previousTexture = this.texture;
    this.texture = texture;
    this.mediaWidth = width;
    this.mediaHeight = height;
    this.hasTexture = true;
    this.dirty = true;
    if (previousTexture && previousTexture !== texture && !this.isContextLost()) gl.deleteTexture(previousTexture);
  }

  setSettings(settings) {
    const sampleCountChanged = settings.gaussianBlurSamples != null && settings.gaussianBlurSamples !== this.settings.gaussianBlurSamples;
    this.settings = { ...this.settings, ...settings };
    if (sampleCountChanged) this.updateBlurKernel(this.settings.gaussianBlurSamples);
    this.dirty = true;
  }

  updateBlurKernel(sampleCount) {
    const clamped = Math.max(3, Math.min(65, Math.round(sampleCount)));
    const oddSamples = clamped % 2 === 0 ? clamped - 1 : clamped;
    const pairs = Math.floor(oddSamples / 2);
    const sigma = Math.max(0.75, pairs * 0.42);
    const weights = new Float32Array(33);
    let total = 0;
    for (let index = 0; index <= pairs; index += 1) {
      const weight = Math.exp(-0.5 * (index / sigma) ** 2);
      weights[index] = weight;
      total += index === 0 ? weight : weight * 2;
    }
    for (let index = 0; index <= pairs; index += 1) weights[index] /= total;
    this.blurPairs = pairs;
    this.blurWeights = weights;
  }

  setupGeometry() {
    const gl = this.gl;
    const segments = 256;
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
    this.geometryBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.geometryBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.useProgram(this.program);
    const { position, uv } = this.locations;
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
  }

  resize() {
    if (this.isContextLost()) return;
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
      if (video !== this.video || this.contextLost) return;
      this.videoFrameReady = true;
      this.videoFrameHandle = video.requestVideoFrameCallback(markFrame);
    };
    this.videoFrameHandle = video.requestVideoFrameCallback(markFrame);
  }

  clearVideoBinding() {
    this.stopVideoFrameTracking();
    this.video = null;
    this.videoFrameSource = null;
    this.videoFrameUpdater = null;
    this.videoFrameReady = false;
    this.lastVideoTime = -1;
  }

  setImage(image) {
    const texture = this.createStagedTexture(image, image.naturalWidth, image.naturalHeight);
    this.clearVideoBinding();
    this.commitTexture(texture, image.naturalWidth, image.naturalHeight);
  }

  setVideo(video, { frameSource = video, width = video.videoWidth, height = video.videoHeight, updateFrame = null } = {}) {
    if (video.paused) throw new Error("Video must be playing before it can be uploaded to WebGL.");
    if (typeof updateFrame === "function") updateFrame();
    const texture = this.createStagedTexture(frameSource, width, height);

    this.clearVideoBinding();
    this.commitTexture(texture, width, height);
    this.video = video;
    this.videoFrameSource = frameSource;
    this.videoFrameUpdater = updateFrame;
    this.videoFrameReady = true;
    this.lastVideoTime = video.currentTime;
    this.trackVideoFrames(video);
  }

  updateVideoTexture() {
    const gl = this.gl;
    if (!this.video || !this.texture || this.isContextLost()) return false;
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;

    try {
      if (typeof this.videoFrameUpdater === "function") this.videoFrameUpdater();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      this.clearGlErrors();
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.videoFrameSource || this.video);
      if (this.isContextLost()) return false;
      const error = gl.getError();
      if (error !== gl.NO_ERROR) throw new Error(`Video frame upload failed (WebGL error 0x${error.toString(16)}).`);
      this.videoFrameReady = false;
      this.lastVideoTime = this.video.currentTime;
      return true;
    } catch (error) {
      this.videoFrameReady = false;
      this.stopVideoFrameTracking();
      this.canvas.dispatchEvent(new CustomEvent("foldrenderermediaerror", { detail: error }));
      return false;
    }
  }

  render(fold, side = this.side) {
    const gl = this.gl;
    if (this.isContextLost() || !this.program || !this.locations) return false;

    this.side = side || 1;
    const signedTilt = this.side * Math.min(1, Math.max(0, fold / 82)) * this.settings.rotationInfluence;
    const supportsFrameCallback = this.video && "requestVideoFrameCallback" in this.video;
    const fallbackVideoFrame = this.video && !supportsFrameCallback && !this.video.paused && this.video.currentTime !== this.lastVideoTime;
    const hasFreshVideoFrame = Boolean(this.video && (this.videoFrameReady || fallbackVideoFrame));
    const transformChanged = Math.abs(signedTilt - this.lastFold) > 0.0003;
    if (!this.dirty && !transformChanged && !hasFreshVideoFrame) return false;

    gl.clearColor(0.012, 0.014, 0.02, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform1f(this.locations.tilt, signedTilt);
    gl.uniform1f(this.locations.aspect, this.canvas.width / this.canvas.height);
    gl.uniform1f(this.locations.horizontalStretch, this.settings.horizontalStretch);
    gl.uniform1f(this.locations.verticalCompression, this.settings.verticalCompression);
    gl.uniform1f(this.locations.perspectiveSkew, this.settings.perspectiveSkew);
    gl.uniform1f(this.locations.verticalDisplacement, this.settings.verticalDisplacement);
    gl.uniform1f(this.locations.transformFalloff, this.settings.transformFalloff);
    gl.uniform1f(this.locations.nonlinearFalloff, this.settings.nonlinearFalloff ? 1 : 0);
    gl.uniform1f(this.locations.darknessGradient, this.settings.darknessGradient);
    gl.uniform1f(this.locations.darknessFalloff, this.settings.darknessFalloff);
    gl.uniform1f(this.locations.blurStrength, this.settings.gaussianBlurStrength);
    gl.uniform1f(this.locations.blurSize, this.settings.gaussianBlurSize);
    gl.uniform1f(this.locations.blurFalloff, this.settings.gaussianBlurFalloff);
    gl.uniform1i(this.locations.blurPairs, this.blurPairs);
    gl.uniform1fv(this.locations.blurWeights, this.blurWeights);
    gl.uniform1i(this.locations.hasTexture, this.hasTexture);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    if (hasFreshVideoFrame) this.updateVideoTexture();

    const viewportAspect = this.canvas.width / this.canvas.height;
    const mediaAspect = this.mediaWidth / this.mediaHeight;
    // Width-fit at neutral: the full media width maps to the full viewport.
    // Aspect ratio is preserved geometrically, so excess height lives beyond
    // the physical viewport instead of being discarded by cover-style UV crop.
    gl.uniform1f(this.locations.planeHeight, viewportAspect / mediaAspect);
    gl.uniform2f(this.locations.uvScale, 1, 1);
    gl.uniform2f(this.locations.uvOffset, 0, 0);
    gl.uniform2f(this.locations.texelSize, 1 / this.mediaWidth, 1 / this.mediaHeight);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    this.lastFold = signedTilt;
    this.lastSide = this.side;
    this.dirty = false;
    return true;
  }
}
