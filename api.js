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

function SkfShowPlayer(id, skfCanvas) {
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
    }
    
    .skf-select {
      background: #412e69;
      border: 2px solid rgb(89, 70, 136);
      padding: 0.25rem;
      color: white;
      cursor: pointer;
      margin-right: 0.5rem;
    }
    
    .skf-range {
      -webkit-appearance: none;
      appearance: none;
      position: absolute;
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

  let container = newEl("div", main, "skf-canvas-container");
  container.appendChild(skfCanvas.elCanvas);

  /* animation progress bar */
  let slider = newEl("input", container, "skf-range");
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

  let toolbar = newEl("div", main, "skf-toolbar");
  let toolbarContainer = newEl("div", toolbar, "skf-toolbar-container");

  /* play button */
  let playContainer = newEl("div", toolbarContainer, "skf-play-container");
  playContainer.className = "skf-play-container";
  let playButton = newEl("button", playContainer, "skf-play");
  skfCanvas.elPlay = playButton;
  playButton.innerText = "Play";
  playButton.addEventListener("click", () => {
    skfCanvas.playing = !skfCanvas.playing;
  });

  let animSelect = newEl("select", toolbarContainer, "skf-select");
  skfCanvas.armature.animations.forEach((anim, a) => {
    animSelect.add(new Option(anim.name, a));
  });
  animSelect.addEventListener("click", () => {
    skfCanvas.selectedAnim = animSelect.value;
    skfCanvas.animTime = 0;
    skfCanvas.elProgress.value = 0.0;
  });

  let styleSelect = newEl("select", toolbarContainer, "skf-select");
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
