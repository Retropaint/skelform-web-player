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
    gl.bindTexture(gl.TEXTURE_2D, skf_placeholder);
  } else {
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  }

  const u_textureLoc = gl.getUniformLocation(program, "u_texture");
  gl.uniform1i(u_textureLoc, 0);

  gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
}

async function readFile(fileBytes, gl) {
  zip = await JSZip.loadAsync(fileBytes)
  let armature;

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

  return armature
}
