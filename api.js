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
  let arrayBuffer = await response.arrayBuffer()
  return new Uint8Array(arrayBuffer);
}

async function SkfInit(skfData, canvas) {
  skfCanvases.push(structuredClone(skfCanvasTemplate))
  let last = skfCanvases.length - 1;
  skfCanvases[last].gl = canvas.getContext("webgl");
  skfCanvases[last].program = {};
  skfCanvases[last].armature = await readFile(skfData, skfCanvases[last].gl);
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
