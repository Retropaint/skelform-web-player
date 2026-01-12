let skfPlaceholderPixel;
let skfCanvases = [];
let skfCanvasTemplate = {
  playing: false,
  selectedAnim: 0,
  animTime: 0,
  smoothFrames: 0,
  constructOptions: {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 }
  },
  elCanvas: {},
  elPlay: {},
  elProgress: {},
  armature: {},
  activeStyles: [],
  stylesOpen: [],
  gl: {},
  program: {}
};

async function SkfDownloadSample(filename) {
  response = await fetch(filename);
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

async function SkfInit(skfData, canvas) {
  skfCanvases.push(structuredClone(skfCanvasTemplate));
  const last = skfCanvases.length - 1;
  skfCanvases[last].gl = canvas.getContext("webgl");
  skfCanvases[last].program = {};
  skfCanvases[last].armature = await skfReadFile(skfData, skfCanvases[last].gl);
  skfCanvases[last].elCanvas = canvas;
  glprogram = SkfInitGl(skfCanvases[last].gl, skfCanvases[last].program);
  skfCanvases[last].gl = glprogram[0];
  skfCanvases[last].program = glprogram[1];
  canvas.addEventListener('webglcontextlost', function(event) {
    event.preventDefault();
  }, false);
}

function SkfInitGl(gl, program) {
  const vertexSource = `attribute vec2 a_position; attribute vec2 a_uv; uniform vec2 u_resolution; varying vec2 v_uv; void main(){ vec2 zeroToOne=a_position/u_resolution; vec2 zeroToTwo=zeroToOne*2.0; vec2 clipSpace=zeroToTwo-1.0; gl_Position=vec4(clipSpace*vec2(1.0,-1.0),0.0,1.0); v_uv=a_uv; }`;
  const fragmentSource = `precision mediump float; varying vec2 v_uv; uniform sampler2D u_texture; void main(){ gl_FragColor=texture2D(u_texture,v_uv); }`;

  /* transparency */
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  skfPlaceholderPixel = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, skfPlaceholderPixel);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 125, 0, 125]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vs = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
  }
  gl.useProgram(program);

  return [gl, program];
}

function SkfClearScreen(canvas, clearColor, gl, program) {
  gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const resLoc = gl.getUniformLocation(program, "u_resolution");
  gl.uniform2f(resLoc, canvas.width, canvas.height);
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function skfDrawMesh(verts, indices, atlasTex, gl, program) {
  /* convert pos and uv into arrays */
  pos = new Float32Array(verts.length * 2);
  uv = new Float32Array(verts.length * 2);
  verts.forEach((vert, idx) => {
    pos[idx * 2] = vert.pos.x;
    pos[idx * 2 + 1] = vert.pos.y;
    uv[idx * 2] = vert.uv.x;
    uv[idx * 2 + 1] = vert.uv.y;
  });

  function bindAttribute(name, data, size) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  bindAttribute("a_position", pos, 2);
  bindAttribute("a_uv", uv, 2);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  gl.activeTexture(gl.TEXTURE0);

  if (!atlasTex) {
    gl.bindTexture(gl.TEXTURE_2D, skfPlaceholderPixel);
  } else {
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  }

  const u_textureLoc = gl.getUniformLocation(program, "u_texture");
  gl.uniform1i(u_textureLoc, 0);

  gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
}

async function skfReadFile(fileBytes, gl) {
  zip = await JSZip.loadAsync(fileBytes);
  let armature;

  for (const filename of Object.keys(zip.files)) {
    if (filename == "armature.json") {
      const fileData = await zip.files[filename].async('string');
      armature = JSON.parse(fileData);
    }

    let atlasIdx = 0;
    if (filename.includes("atlas")) {
      const fileData = await zip.files[filename].async('uint8array');
      const blob = new Blob([fileData], { type: "image/png" });
      const bitmap = await createImageBitmap(blob);

      armature.atlases[atlasIdx].texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, armature.atlases[atlasIdx].texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      atlasIdx++;
    }
  }

  return armature;
}

function SkfDraw(bones, styles, atlases, gl, program) {
  bones.forEach((bone, b) => {
    let tex = getTexFromStyle(bone.tex, styles);
    if (!tex) {
      return
    }

    const size = atlases[tex.atlas_idx].size;

    const tleft = tex.offset.x / size.x;
    const tright = (tex.offset.x + tex.size.x) / size.x;
    const ttop = tex.offset.y / size.y;
    const tbot = (tex.offset.y + tex.size.y) / size.y;
    const tsize = tex.size;

    let verts;
    let indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    if (bone.vertices) {
      verts = structuredClone(bone.vertices);
      for (vert of verts) {
        const uvsize = { x: tright - tleft, y: tbot - ttop };
        vert.uv = { x: tleft + (uvsize.x * vert.uv.x), y: ttop + (uvsize.y * vert.uv.y) };
      }
      indices = new Uint16Array(bone.indices);
    } else {
      verts = [{
        uv: { x: tleft, y: ttop },
        pos: { x: (-tsize.x / 2 * bone.scale.x), y: (-tsize.y / 2 * bone.scale.y) },
      },
      {
        uv: { x: tright, y: ttop },
        pos: { x: (+tsize.x / 2 * bone.scale.x), y: (-tsize.y / 2 * bone.scale.y) },
      },
      {
        uv: { x: tright, y: tbot },
        pos: { x: (+tsize.x / 2 * bone.scale.x), y: (+tsize.y / 2 * bone.scale.y) }
      },
      {
        uv: { x: tleft, y: tbot },
        pos: { x: (-tsize.x / 2 * bone.scale.x), y: (+tsize.y / 2 * bone.scale.y) },
      }];

      const invPos = { x: bone.pos.x, y: -bone.pos.y };
      for (let i = 0; i < 4; i++) {
        verts[i].pos = rotate(verts[i].pos, -bone.rot);
        verts[i].pos = addv2(verts[i].pos, invPos);
      }
    }

    skfDrawMesh(verts, indices, atlases[tex.atlas_idx].texture, gl, program);
  })
}

function skfDrawPoints(poses) {
  poses.forEach(pos => {
    const size = 12;
    const verts = [{
      pos: { x: pos.x - size, y: pos.y - size }, uv: { x: 0, y: 0 }
    },
    {
      pos: { x: pos.x + size, y: pos.y - size }, uv: { x: 0, y: 0 }
    },
    {
      pos: { x: pos.x + size, y: pos.y + size }, uv: { x: 0, y: 0 }
    },
    {
      pos: { x: pos.x - size, y: pos.y + size }, uv: { x: 0, y: 0 }
    }];
    drawMesh(verts, new Uint16Array([0, 1, 2, 0, 2, 3]), false);
  })
}

function SkfShowPlayer(id, skfCanvas, showSkfBranding) {
  const style = document.createElement("style");
  document.head.appendChild(style)
  style.textContent = `
    .skf-display {
      display: flex;
      flex-direction: column;
    }
    .skf-canvas-container {
      position: relative;
    }
    .skf-toolbar {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      background: #352253;
      padding-left: 1rem;
      padding-right: 1rem;
      height: 3rem;
      margin-top: -6px;
    }
    .skf-toolbar-container {
      display: flex;
    }
    .skf-title {
      color: #fff;
      display: flex;
      align-items: center;
      margin-right: 0.5rem;
    }
    
    .skf-logo {
      width: 3rem;
      margin-right: 0.5rem;
    }
    
    .skf-title-text {
      font-size: 1.2rem;
      font-family: arial;
      margin: 0;
      text-decoration: none;
    }

    .skf-play-container {
      width: 3.5rem;
    }
    
    .skf-play {
      background: #412e69;
      border: 2px solid rgb(89, 70, 136);
      padding: 0.25rem;
      color: white;
      cursor: pointer;
      height: 2rem;
    }
    
    .skf-select {
      background: #412e69;
      border: 2px solid rgb(89, 70, 136);
      padding: 0.25rem;
      color: white;
      cursor: pointer;
      margin-right: 0.5rem;
      height: 2rem;
    }
    
    .skf-range {
      -webkit-appearance: none;
      appearance: none;
      bottom: 0.75rem;
      left: 0;
      width: -moz-available;
      width: -webkit-fill-available;
      margin-left: 1rem;
      margin-right: 1rem;
      height: 0.35rem;
      background: #412e69;
    }
    
    .skf-range[type="range"]::-webkit-slider-thumb,
    .skf-range::-moz-range-thumb {
      -webkit-appearance: none;
      appearance: none;
      background: rgb(89, 70, 136);
      cursor: pointer;
    }
    
    .skf-range[type="range"]::-webkit-slider-runnable-track,
    .skf-range::-moz-range-progress {
      -webkit-appearance: none;
      appearance: none;
      height: 0.35rem;
      background-color: rgb(89, 70, 136);
    }
  `;

  function newEl(str, parent, className) {
    let el = document.createElement(str);
    el.className = className, parent.appendChild(el);
    return el;
  }

  let main = document.getElementById(id);
  main.appendChild(skfCanvas.elCanvas);

  let toolbar = newEl("div", main, "skf-toolbar");
  let toolbarContainer = newEl("div", toolbar, "");

  /* animation progress bar */
  let slider = newEl("input", toolbar, "skf-range");
  slider.type = "range";
  slider.min = 0;
  slider.max = 1;
  slider.step = 0.001;
  skfCanvas.elProgress = slider;
  slider.addEventListener("input", () => {
    skfCanvas.playing = false;
    skfCanvas.elPlay.innerHTML = "Play";
    anim = skfCanvas.armature.animations[skfCanvas.selectedAnim];
    frames = anim.keyframes[anim.keyframes.length - 1].frame;
    frametime = 1 / anim.fps;
    skfCanvas.animTime = frames * slider.value * frametime * 1000;
  });

  let toolbarFlex = newEl("div", toolbarContainer, "skf-toolbar-container");

  /* play button */
  let playContainer = newEl("div", toolbarFlex, "skf-play-container");
  playContainer.className = "skf-play-container";
  let playButton = newEl("button", playContainer, "skf-play");
  skfCanvas.elPlay = playButton;
  playButton.innerText = "Play";
  playButton.addEventListener("click", () => {
    skfCanvas.playing = !skfCanvas.playing;
  });

  let animSelect = newEl("select", toolbarFlex, "skf-select");
  skfCanvas.armature.animations.forEach((anim, a) => {
    animSelect.add(new Option(anim.name, a));
  });
  animSelect.addEventListener("click", () => {
    skfCanvas.selectedAnim = animSelect.value;
    skfCanvas.animTime = 0;
    skfCanvas.elProgress.value = 0.0;
  });

  let styleSelect = newEl("select", toolbarFlex, "skf-select");
  skfCanvas.armature.styles.forEach((style, a) => {
    styleSelect.add(new Option(style.name, a));
  });
  styleSelect.addEventListener("click", () => {
    let idx = skfCanvas.activeStyles.findIndex((s) => s.id == styleSelect.value);
    if (idx == -1) {
      skfCanvas.activeStyles.splice(styleSelect.value, 0, skfCanvas.armature.styles[styleSelect.value]);
    } else {
      skfCanvas.activeStyles.splice(idx, 1);
    }
  });

  let title = newEl("a", toolbar, "");
  title.href = "https://skelform.org";
  title.target = "_blank";
  title.style.display = (showSkfBranding) ? 'block' : 'none';
  let titleContainer = newEl("div", title, "skf-title");
  let titleImg = newEl("img", titleContainer, "skf-logo");
  titleImg.src = "data:image/png;base64,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";
  let titleText = newEl("p", titleContainer, "skf-title-text");
  titleText.innerText = "SkelForm";
}

/* process all skf canvases per frame */
let skfLastTime = 0;
function SkfNewFrame(time) {
  for (skfc of skfCanvases) {
    SkfClearScreen(skfc.elCanvas, [0, 0, 0, 0], skfc.gl, skfc.program);
    skfc.animTime += (skfc.playing) ? time - skfLastTime : 0;
    skfc.elPlay.innerText = (skfc.playing) ? "Pause" : "Play ";
    anim = skfc.armature.animations[skfc.selectedAnim];
    const frame = SkfTimeFrame(skfc.animTime, anim, false, true);
    const smooth = (skfc.playing) ? skfc.smoothFrames : 0;
    SkfAnimate(skfc.armature.bones, [anim], [frame], [smooth]);
    bones = SkfConstruct(skfc.armature.bones, skfc.armature.ik_root_ids, skfc.constructOptions);
    SkfDraw(bones, skfc.activeStyles, skfc.armature.atlases, skfc.gl, skfc.program);
    if (skfc.elProgress) {
      anim = skfc.armature.animations[skfc.selectedAnim];
      const frame = SkfTimeFrame(skfc.animTime, anim, false, true);
      skfc.elProgress.value = frame / anim.keyframes[anim.keyframes.length - 1].frame;
    }
  }

  skfLastTime = time;
  requestAnimationFrame(SkfNewFrame);
}
