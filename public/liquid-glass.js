(() => {
  const TARGET_SELECTOR =
    "#motion-permission, #keiazo-quick-menu, dialog[aria-labelledby='fullscreen-help-title']";
  const source = () => document.querySelector("#gl");
  const icon = (path) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;

  function createQuickMenu() {
    if (document.querySelector("#keiazo-quick-menu")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "keiazo-quick-menu";
    dialog.setAttribute("aria-labelledby", "keiazo-quick-menu-title");
    dialog.innerHTML = `
      <h2 id="keiazo-quick-menu-title">Choose an action</h2>
      <div class="keiazo-quick-actions">
        <button type="button" data-action="upload">${icon('<path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M5 14v5h14v-5"/>')}Upload new photo/video</button>
        <button type="button" data-action="home">${icon('<path d="m3.5 11 8.5-7 8.5 7"/><path d="M5.5 9.5V20h13V9.5M9.5 20v-6h5v6"/>')}Return to Home Screen</button>
        <button type="button" data-action="fullscreen">${icon('<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>')}Enable full screen</button>
        <a href="https://github.com/yadasa/iphonesolo/archive/refs/heads/main.zip">${icon('<path d="M12 4v11m0 0-4-4m4 4 4-4"/><path d="M5 19h14"/>')}Download the code</a>
      </div>`;
    document.body.append(dialog);

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      dialog.close();
    });
    dialog
      .querySelector('[data-action="upload"]')
      .addEventListener("click", () => {
        dialog.close();
        document.querySelector('#settings-dialog input[type="file"]')?.click();
      });
    dialog
      .querySelector('[data-action="home"]')
      .addEventListener("click", () => {
        dialog.close();
        window.location.reload();
      });
    dialog
      .querySelector('[data-action="fullscreen"]')
      .addEventListener("click", async () => {
        dialog.close();
        try {
          if (
            document.fullscreenEnabled &&
            document.documentElement.requestFullscreen
          ) {
            await document.documentElement.requestFullscreen();
            return;
          }
        } catch {}
        document
          .querySelector("dialog[aria-labelledby='fullscreen-help-title']")
          ?.showModal();
      });
  }

  function compile(gl, type, sourceCode) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Unable to create Liquid Glass shader");
    gl.shaderSource(shader, sourceCode);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(
        gl.getShaderInfoLog(shader) || "Liquid Glass shader failed",
      );
    }
    return shader;
  }

  function attachLiquidGlass(dialog) {
    if (dialog.dataset.liquidGlassAttached) return;
    dialog.dataset.liquidGlassAttached = "true";
    const canvas = document.createElement("canvas");
    canvas.className = "keiazo-liquid-glass";
    canvas.setAttribute("aria-hidden", "true");
    dialog.prepend(canvas);

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      desynchronized: true,
      powerPreference: "high-performance",
    });
    if (!gl) return;

    const vertexSource = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;
    const fragmentSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_capture;
      uniform vec2 u_resolution;
      uniform vec2 u_captureResolution;
      uniform float u_padding;
      uniform float u_radius;

      vec3 tgSampleScene(vec2 px) {
        vec2 uv = (px + vec2(u_padding)) / u_captureResolution;
        return texture2D(u_capture, vec2(uv.x, 1.0 - uv.y)).rgb;
      }

      float tgSdRoundedRect(vec2 p, vec2 halfSize, float r) {
        vec2 q = abs(p) - halfSize + r;
        return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
      }

      vec3 tgBlurredScene(vec2 px) {
        vec3 sum = tgSampleScene(px) * 0.36;
        sum += tgSampleScene(px + vec2(2.0, 0.0)) * 0.16;
        sum += tgSampleScene(px - vec2(2.0, 0.0)) * 0.16;
        sum += tgSampleScene(px + vec2(0.0, 2.0)) * 0.16;
        sum += tgSampleScene(px - vec2(0.0, 2.0)) * 0.16;
        return sum;
      }

      vec3 tgApplyGlass(vec3 color, vec2 frag, vec4 rect, float radius) {
        vec2 center = rect.xy + rect.zw * 0.5;
        vec2 halfSize = rect.zw * 0.5;
        vec2 p = frag - center;
        float r = min(radius, min(halfSize.x, halfSize.y) - 1.0);
        float sd = tgSdRoundedRect(p, halfSize, r);
        if (sd > 0.0) return color;

        vec3 beige = vec3(0.93725, 0.91373, 0.81176);
        const float beigeOpacity = 0.38;
        vec3 tintedColor = mix(color, beige, beigeOpacity);
        float dist = -sd;
        float edge = 1.0 - smoothstep(4.0, 16.0, dist);
        if (edge <= 0.001) return tintedColor;

        float eps = 0.65;
        vec2 grad;
        grad.x = tgSdRoundedRect(p + vec2(eps, 0.0), halfSize, r) - sd;
        grad.y = tgSdRoundedRect(p + vec2(0.0, eps), halfSize, r) - sd;
        grad = normalize(grad + vec2(0.0001));

        float displacement = (5.0 + 13.0 * edge) * edge;
        vec3 glass = tgBlurredScene(frag - grad * displacement);
        float rim = 1.0 - smoothstep(0.0, 5.0, dist);
        float light = max(0.0, dot(grad, normalize(vec2(-0.55, -0.83))));
        glass += vec3(1.0) * rim * (0.18 + light * 0.42);
        glass = mix(glass, vec3(0.95, 0.98, 1.0), 0.075 * edge);
        glass = mix(glass, beige, beigeOpacity);
        return mix(tintedColor, glass, edge);
      }

      void main() {
        vec2 frag = vec2(v_uv.x * u_resolution.x, (1.0 - v_uv.y) * u_resolution.y);
        vec3 scene = tgSampleScene(frag);
        vec3 glass = tgApplyGlass(scene, frag, vec4(0.0, 0.0, u_resolution), u_radius);
        gl_FragColor = vec4(glass, 1.0);
      }
    `;

    let program;
    try {
      program = gl.createProgram();
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error();
    } catch (error) {
      console.warn("[liquid-glass] WebGL refraction unavailable", error);
      return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, "u_capture"), 0);

    const capture = document.createElement("canvas");
    const context = capture.getContext("2d", { alpha: false });
    const resolution = gl.getUniformLocation(program, "u_resolution");
    const captureResolution = gl.getUniformLocation(
      program,
      "u_captureResolution",
    );
    const paddingUniform = gl.getUniformLocation(program, "u_padding");
    const radius = gl.getUniformLocation(program, "u_radius");
    let frame = 0;
    let lastDraw = -Infinity;
    const padding = 24;

    const draw = (now) => {
      if (!dialog.open) return;
      frame = requestAnimationFrame(draw);
      if (now - lastDraw < 1000 / 30) return;
      lastDraw = now;
      const scene = source();
      if (!scene || !context) return;
      const bounds = dialog.getBoundingClientRect();
      const sceneBounds = scene.getBoundingClientRect();
      const dpr = Math.min(1.35, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(bounds.width * dpr));
      const height = Math.max(1, Math.round(bounds.height * dpr));
      const pad = Math.round(padding * dpr);
      const captureWidth = width + pad * 2;
      const captureHeight = height + pad * 2;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        capture.width = captureWidth;
        capture.height = captureHeight;
      }
      const sx =
        ((bounds.left - padding - sceneBounds.left) / sceneBounds.width) *
        scene.width;
      const sy =
        ((bounds.top - padding - sceneBounds.top) / sceneBounds.height) *
        scene.height;
      const sw =
        ((bounds.width + padding * 2) / sceneBounds.width) * scene.width;
      const sh =
        ((bounds.height + padding * 2) / sceneBounds.height) * scene.height;
      try {
        context.drawImage(
          scene,
          sx,
          sy,
          sw,
          sh,
          0,
          0,
          captureWidth,
          captureHeight,
        );
        gl.viewport(0, 0, width, height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          capture,
        );
        gl.uniform2f(resolution, width, height);
        gl.uniform2f(captureResolution, captureWidth, captureHeight);
        gl.uniform1f(paddingUniform, pad);
        gl.uniform1f(radius, 29 * dpr);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        dialog.classList.add("keiazo-liquid-ready");
      } catch (error) {
        dialog.classList.remove("keiazo-liquid-ready");
      }
    };

    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      if (dialog.open) frame = requestAnimationFrame(draw);
    });
    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    if (dialog.open) frame = requestAnimationFrame(draw);
  }

  function boot() {
    createQuickMenu();
    document.querySelectorAll(TARGET_SELECTOR).forEach(attachLiquidGlass);
    const scene = source();
    if (!scene) return;
    scene.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const menu = document.querySelector("#keiazo-quick-menu");
        if (!menu?.open) menu?.showModal();
      },
      true,
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
