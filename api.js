let skfPlaceholderPixel;
let skfCanvases = []
let skfCanvasTemplate = {
  playing: false,
  selAnim: 0,
  animTime: 0,
  canvas: {},
  armature: {},
  activeStyles: [],
  stylesOpen: [],
  gl: {},
  program: {}
}

async function SkfDownloadSample(filename) {
  response = await fetch(filename)
  const arrayBuffer = await response.arrayBuffer()
  return new Uint8Array(arrayBuffer);
}

async function SkfInit(skfData, canvas) {
  skfCanvases.push(structuredClone(skfCanvasTemplate))
  const last = skfCanvases.length - 1;
  skfCanvases[last].gl = canvas.getContext("webgl");
  skfCanvases[last].program = {};
  skfCanvases[last].armature = await skfReadFile(skfData, skfCanvases[last].gl);
  skfCanvases[last].canvas = canvas;
  glprogram = SkfInitGl(skfCanvases[last].gl, skfCanvases[last].program);
  skfCanvases[last].gl = glprogram[0]
  skfCanvases[last].program = glprogram[1]
  canvas.addEventListener('webglcontextlost', function(event) {
    event.preventDefault();
  }, false);
}

function SkfInitGl(gl, program) {
  const vertexSource = `attribute vec2 a_position; attribute vec2 a_uv; uniform vec2 u_resolution; varying vec2 v_uv; void main(){ vec2 zeroToOne=a_position/u_resolution; vec2 zeroToTwo=zeroToOne*2.0; vec2 clipSpace=zeroToTwo-1.0; gl_Position=vec4(clipSpace*vec2(1.0,-1.0),0.0,1.0); v_uv=a_uv; }`;
  const fragmentSource = `precision mediump float; varying vec2 v_uv; uniform sampler2D u_texture; void main(){ gl_FragColor=texture2D(u_texture,v_uv); }`;

  // transparency
  gl.enable(gl.BLEND)
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
  gl.useProgram(program)

  return [gl, program]
}

function SkfClearScreen(canvas, clearColor, gl, program) {
  gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const resLoc = gl.getUniformLocation(program, "u_resolution");
  gl.uniform2f(resLoc, canvas.width, canvas.height);
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function skfDrawMesh(verts, indices, atlasTex, gl, program) {
  // convert pos and uv into arrays
  pos = new Float32Array(verts.length * 2)
  uv = new Float32Array(verts.length * 2)
  verts.forEach((vert, idx) => {
    pos[idx * 2] = vert.pos.x
    pos[idx * 2 + 1] = vert.pos.y
    uv[idx * 2] = vert.uv.x
    uv[idx * 2 + 1] = vert.uv.y
  })

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
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    indices,
    gl.STATIC_DRAW
  );

  gl.activeTexture(gl.TEXTURE0)

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
  zip = await JSZip.loadAsync(fileBytes)
  let armature;

  for (const filename of Object.keys(zip.files)) {
    if (filename == "armature.json") {
      const fileData = await zip.files[filename].async('string')
      armature = JSON.parse(fileData)
    }

    let atlasIdx = 0
    if (filename.includes("atlas")) {
      const fileData = await zip.files[filename].async('uint8array')
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

  return armature
}

function SkfDraw(bones, styles, atlases, gl, program) {
  bones.forEach((bone, b) => {
    let tex = getTexFromStyle(bone.tex, styles)
    if (!tex) {
      return
    }

    const size = atlases[tex.atlas_idx].size

    const tleft = tex.offset.x / size.x
    const tright = (tex.offset.x + tex.size.x) / size.x
    const ttop = tex.offset.y / size.y
    const tbot = (tex.offset.y + tex.size.y) / size.y
    const tsize = tex.size

    let verts;
    let indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    if (bone.vertices) {
      verts = structuredClone(bone.vertices)
      for (vert of verts) {
        const uvsize = { x: tright - tleft, y: tbot - ttop }
        vert.uv = { x: tleft + (uvsize.x * vert.uv.x), y: ttop + (uvsize.y * vert.uv.y) }
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

      const invPos = { x: bone.pos.x, y: -bone.pos.y }
      for (let i = 0; i < 4; i++) {
        verts[i].pos = rotate(verts[i].pos, -bone.rot);
        verts[i].pos = addv2(verts[i].pos, invPos);
      }
    }

    skfDrawMesh(verts, indices, atlases[tex.atlas_idx].texture, gl, program)
  })
}

function skfDrawPoints(poses) {
  poses.forEach(pos => {
    const size = 12
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
    drawMesh(verts, new Uint16Array([0, 1, 2, 0, 2, 3]), false)
  })
}

function showPlayer(id) {
  const container = document.getElementById(id);
}
