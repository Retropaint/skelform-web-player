function init() {
  const canvas = document.getElementById("glcanvas");

  if (!gl) {
    alert("WebGL not supported");
    throw new Error("WebGL not supported");
  }

  const vertexSource = `attribute vec2 a_position; attribute vec2 a_uv; uniform vec2 u_resolution; varying vec2 v_uv; void main(){ vec2 zeroToOne=a_position/u_resolution; vec2 zeroToTwo=zeroToOne*2.0; vec2 clipSpace=zeroToTwo-1.0; gl_Position=vec4(clipSpace*vec2(1.0,-1.0),0.0,1.0); v_uv=a_uv; }`;

  const fragmentSource = `precision mediump float; varying vec2 v_uv; uniform sampler2D u_texture; void main(){ gl_FragColor=texture2D(u_texture,v_uv); }`;

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

  function createProgram(gl, vsSource, fsSource) {
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  // transparency
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  skf_placeholder = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, skf_placeholder);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 125, 0, 125]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  program = createProgram(gl, vertexSource, fragmentSource)
  gl.useProgram(program)
}

function clearScreen() {
  gl.clearColor(0.1, 0.1, 0.1, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const resLoc = gl.getUniformLocation(program, "u_resolution");
  gl.uniform2f(resLoc, glcanvas.width, glcanvas.height);
  gl.viewport(0, 0, glcanvas.width, glcanvas.height);
}

function drawMesh(verts, indices, atlasTex) {
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
    gl.bindTexture(gl.TEXTURE_2D, skf_placeholder);
  } else {
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  }

  const u_textureLoc = gl.getUniformLocation(program, "u_texture");
  gl.uniform1i(u_textureLoc, 0);

  gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
}

async function downloadSample(filename) {
  response = await fetch(filename)
  let arrayBuffer = await response.arrayBuffer()
  skfData = new Uint8Array(arrayBuffer);
}

async function readFile(fileBytes) {
  zip = await JSZip.loadAsync(fileBytes)

  for (const filename of Object.keys(zip.files)) {
    if (filename == "armature.json") {
      fileData = await zip.files[filename].async('string')
      armature = JSON.parse(fileData)
    }

    let atlasIdx = 0
    if (filename.includes("atlas")) {
      fileData = await zip.files[filename].async('uint8array')
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
}
