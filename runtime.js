function formatFrame(frame, anim, isReverse, isLoop) {
  lastFrame = anim.keyframes[anim.keyframes.length - 1].frame
  if (isLoop) {
    frame %= lastFrame + 1
  }

  if (isReverse) {
    frame = lastFrame - frame
  }

  return frame
}

function timeFrame(time, anim, isReverse, isLoop) {
  let elapsed = time / 1000
  let frametime = 1 / anim.fps
  let frame = elapsed / frametime
  return formatFrame(frame, anim, isReverse, isLoop)
}

function rotate(point, rot) {
  return { x: point.x * Math.cos(rot) - point.y * Math.sin(rot), y: point.x * Math.sin(rot) + point.y * Math.cos(rot), }
}

function mulv2(self, other) {
  return { x: self.x * other.x, y: self.y * other.y }
}

function mulv2f(self, otherf) {
  return { x: self.x * otherf, y: self.y * otherf }
}

function addv2(self, other) {
  return { x: self.x + other.x, y: self.y + other.y }
}

function addv2f(self, other) {
  return { x: self.x + other, y: self.y + other }
}

function subv2(self, other) {
  return { x: self.x - other.x, y: self.y - other.y }
}

function subv2f(self, otherf) {
  return { x: self.x - otherf, y: self.y - otherf }
}

function magnitude(vec) {
  return Math.sqrt((vec.x * vec.x) + (vec.y * vec.y))
}

function normalize(vec) {
  let mag = magnitude(vec);
  if (mag == 0) {
    return { x: 0, y: 0 }
  }
  return { x: vec.x / mag, y: vec.y / mag }
}

function fabrik(bones, bone_ids, root, target) {
  let nextPos = target
  let nextLength = 0
  let rev_bone_ids = structuredClone(bone_ids)
  rev_bone_ids.reverse().forEach((id, b) => {
    let length = mulv2f(normalize(subv2(nextPos, bones[id].pos)), nextLength)
    if (b != rev_bone_ids.length - 1) {
      nextLength = magnitude(subv2(bones[id].pos, bones[rev_bone_ids[b + 1]].pos))
    }
    bones[id].pos = subv2(nextPos, length)
    nextPos = structuredClone(bones[id].pos)
  })

  let prevPos = root
  let prevLength = 0
  bone_ids.forEach((id, b) => {
    let length = mulv2f(normalize(subv2(prevPos, bones[id].pos)), prevLength)
    if (b != rev_bone_ids.length - 1) {
      prevLength = magnitude(subv2(bones[id].pos, bones[bone_ids[b + 1]].pos))
    }
    bones[id].pos = subv2(prevPos, length)
    prevPos = structuredClone(bones[id].pos)
  })
}

function arcIk(bones, ikRootIds, root, target) {
  dist = [0.];
  let maxLength = magnitude(subv2(bones[ikRootIds[ikRootIds.length - 1]].pos, root))
  currLength = 0
  ikRootIds.forEach((rootId, rid) => {
    if (rid == 0) { return }
    length = magnitude(subv2(bones[rootId].pos, bones[ikRootIds[rid - 1]].pos))
    currLength += length
    dist.push(currLength / maxLength)
  })

  base = subv2(target, root)
  baseAngle = Math.atan2(base.y, base.x)
  baseMag = Math.min(magnitude(base), maxLength)
  peak = maxLength / baseMag
  valley = baseMag / maxLength

  ikRootIds.forEach((rootId, rid) => {
    if (rid == 0) { return }
    bones[rootId].pos = {
      x: bones[rootId].pos.x * valley,
      y: root.y + (1 - peak) * Math.sin(dist[rid] * 3.14) * baseMag
    }
    rotated = rotate(subv2(bones[rootId].pos, root), baseAngle)
    bones[rootId].pos = addv2(rotated, root)
  })
}

function inverseKinematics(bones, ikRootIds) {
  ikRots = []
  ikRootIds.forEach(rootId => {
    family = bones[rootId]
    let bone_ids = structuredClone(family.ik_bone_ids);

    let root = structuredClone(family.pos);
    let target = structuredClone(bones[family.ik_target_id].pos);
    if (family.ik_mode == 0) {
      for (i = 0; i < 10; i++) {
        fabrik(bones, structuredClone(bone_ids), root, target)
      }
    } else {
      arcIk(bones, structuredClone(bone_ids), root, target)
    }



    endBone = bones[bone_ids[bone_ids.length - 1]]
    tipPos = structuredClone(endBone.pos);
    let rev_bone_ids = structuredClone(bone_ids)
    rev_bone_ids.reverse().forEach((bid, b) => {
      if (b == 0) {
        return
      }
      dir = subv2(tipPos, bones[bid].pos)
      bones[bid].rot = Math.atan2(dir.y, dir.x)
      tipPos = structuredClone(bones[bid].pos)
    })

    jointDir = normalize(subv2(bones[bone_ids[1]].pos, root))
    baseDir = normalize(subv2(target, root))
    dir = jointDir.x * baseDir.y - baseDir.x * jointDir.y;
    baseAngle = Math.atan2(baseDir.y, baseDir.x)
    cw = family.ik_constraint == 1 && dir > 0.;
    ccw = family.ik_constraint == 2 && dir < 0.;
    if (cw || ccw) {
      for (id of family.ik_bone_ids) {
        bones[id].rot = -bones[id].rot + baseAngle * 2;
      }
    }

    // save rots to hash
    bone_ids.forEach((bid, b) => {
      if (b == bone_ids.length - 1) {
        return
      }
      ikRots[bones[bid].id] = bones[bid].rot
    })
  })

  return ikRots
}

function getTexFromStyle(texName, styles) {
  let finalTex = false

  styles.forEach(style => {
    style.textures.forEach(tex => {
      if (texName == tex.name && !finalTex) {
        finalTex = tex
      }
    })
  })

  return finalTex
}

function animate(bones, anims, frames, smoothFrames) {
  anims.forEach((anim, a) => {
    bones.forEach(bone => {
      bone.pos.x = interpolateKeyframes(bone.id, bone.pos.x, anim.keyframes, 0, frames[a], smoothFrames[a])
      bone.pos.y = interpolateKeyframes(bone.id, bone.pos.y, anim.keyframes, 1, frames[a], smoothFrames[a])
      bone.rot = interpolateKeyframes(bone.id, bone.rot, anim.keyframes, 2, frames[a], smoothFrames[a])
      bone.scale.x = interpolateKeyframes(bone.id, bone.scale.x, anim.keyframes, 3, frames[a], smoothFrames[a])
      bone.scale.y = interpolateKeyframes(bone.id, bone.scale.y, anim.keyframes, 4, frames[a], smoothFrames[a])
    })
  })

  bones.forEach(bone => {
    if (!isAnimated(bone.id, anims, 0)) {
      bone.pos.x = interpolate(frames[0], smoothFrames[0], bone.pos.x, bone.init_pos.x);
    }
    if (!isAnimated(bone.id, anims, 1)) {
      bone.pos.y = interpolate(frames[0], smoothFrames[0], bone.pos.y, bone.init_pos.y);
    }
    if (!isAnimated(bone.id, anims, 2)) {
      bone.rot = interpolate(frames[0], smoothFrames[0], bone.rot, bone.init_rot);
    }
    if (!isAnimated(bone.id, anims, 3)) {
      bone.scale.x = interpolate(frames[0], smoothFrames[0], bone.scale.x, bone.init_scale.x);
    }
    if (!isAnimated(bone.id, anims, 4)) {
      bone.scale.y = interpolate(frames[0], smoothFrames[0], bone.scale.y, bone.init_scale.y);
    }
  })
}

function isAnimated(bone_id, anims, element) {
  let yes = false;
  anims.forEach((anim, a) => {
    anim.keyframes.forEach(kf => {
      if (kf.bone_id == bone_id && kf.element == element) {
        yes = true;
      }
    })
  })
  return yes
}

function interpolate(current, max, startVal, endVal) {
  if (max == 0 || current >= max) {
    return endVal
  }
  interp = current / max
  end = endVal - startVal
  result = startVal + (end * interp)

  return result
}

function interpolateKeyframes(bone_id, field, keyframes, element, frame, smoothFrames) {
  prev = false;
  next = false;
  for (kf of keyframes) {
    if (kf.frame <= frame && kf.element == element && kf.bone_id == bone_id) {
      prev = kf
    }
  }

  for (kf of keyframes) {
    if (kf.frame > frame && kf.element == element && kf.bone_id == bone_id) {
      next = kf
      break
    }
  }

  if (!prev) {
    prev = next
  }
  if (!next) {
    next = prev
  }

  if (!prev && !next) {
    return field;
  }

  totalFrames = next.frame - prev.frame
  currentFrame = frame - prev.frame

  result = interpolate(currentFrame, totalFrames, prev.value, next.value)
  return interpolate(currentFrame, smoothFrames, field, result)
}

function inheritance(bones, ikRots) {
  bones.forEach((bone, b) => {
    if (bone.parent_id == -1) {
      return;
    }
    parent = bones[bone.parent_id]

    bones[b].rot += parent.rot
    bones[b].scale = mulv2(bones[b].scale, parent.scale)
    bones[b].pos = mulv2(bones[b].pos, parent.scale)
    // rotate child around parent as if it were orbitting
    bones[b].pos = rotate(bones[b].pos, parent.rot)
    bones[b].pos = addv2(bones[b].pos, parent.pos)

    if (ikRots[bone.id]) {
      bones[b].rot = ikRots[bone.id]
    }
  })

  return bones
}

function construct(rawBones, ikRootIds) {
  inhBones = inheritance(structuredClone(rawBones), [])
  ikRots = inverseKinematics(structuredClone(inhBones), ikRootIds)
  finalBones = inheritance(structuredClone(rawBones), ikRots)
  constructVerts(finalBones)
  let scale = { x: 0.15, y: 0.15 }
  finalBones.forEach((bone, b) => {
    finalBones[b].scale = mulv2(finalBones[b].scale, scale)
    finalBones[b].pos = mulv2(finalBones[b].pos, scale)
    finalBones[b].pos = addv2(finalBones[b].pos, { x: 300, y: -275 })

    if (finalBones[b].vertices) {
      for (vert of finalBones[b].vertices) {
        vert.pos.y = -vert.pos.y;
        vert.pos = mulv2(vert.pos, scale);
        vert.pos = addv2(vert.pos, { x: 300, y: 275 });
      }
    }
  })

  return finalBones
}

function constructVerts(bones) {
  bones.forEach((_, b) => {
    if (!bones[b].vertices) {
      return
    }

    for (vert of bones[b].vertices) {
      vert.pos = inheritVert(vert.init_pos, bones[b])
    }

    bones[b].binds.forEach((bind, bi) => {
      if (bind.bone_id == -1) {
        return;
      }

      let bindBone = bones.find((b) => b.id == bind.bone_id);

      for (bind_vert of bones[b].binds[bi].verts) {
        if (!bind.is_path) { continue }

        let prev = bi > 0 ? bi - 1 : bi
        let next = bi + 1 <= bones[b].binds.length - 1 ? bi + 1 : bones[b].binds.length - 1
        let bone = bones[b];
        let prevBone = bones.find((b) => b.id == bone.binds[prev].bone_id)
        let nextBone = bones.find((b) => b.id == bone.binds[next].bone_id)

        let prevDir = subv2(bindBone.pos, prevBone.pos)
        let nextDir = subv2(nextBone.pos, bindBone.pos)
        let prevNorm = normalize({ x: -prevDir.y, y: prevDir.x })
        let nextNorm = normalize({ x: -nextDir.y, y: nextDir.x })
        let average = addv2(prevNorm, nextNorm);
        let normAngle = Math.atan2(average.y, average.x)

        let vert = bones[b].vertices[bind_vert.id]
        vert.pos = addv2(vert.init_pos, bindBone.pos)
        let rotated = rotate(subv2(vert.pos, bindBone.pos), normAngle)
        vert.pos = addv2(bindBone.pos, mulv2f(rotated, bind_vert.weight))
      }
    })
  })
}

function inheritVert(pos, bone) {
  pos = mulv2(pos, bone.scale);
  pos = rotate(pos, bone.rot);
  pos = addv2(pos, bone.pos);
  return pos
}

function SkfDrawBones(bones, styles, atlases, gl, program) {
  bones.forEach((bone, b) => {
    let tex = getTexFromStyle(bone.tex, styles)
    if (!tex) {
      return
    }

    let size = atlases[tex.atlas_idx].size

    let tleft = tex.offset.x / size.x
    let tright = (tex.offset.x + tex.size.x) / size.x
    let ttop = tex.offset.y / size.y
    let tbot = (tex.offset.y + tex.size.y) / size.y
    let tsize = tex.size

    let verts;
    let indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    if (bone.vertices) {
      verts = structuredClone(bone.vertices)
      for (vert of verts) {
        let uvsize = { x: tright - tleft, y: tbot - ttop }
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

      let invPos = { x: bone.pos.x, y: -bone.pos.y }
      for (let i = 0; i < 4; i++) {
        verts[i].pos = rotate(verts[i].pos, -bone.rot);
        verts[i].pos = addv2(verts[i].pos, invPos);
      }
    }

    skfDrawMesh(verts, indices, atlases[tex.atlas_idx].texture, gl, program)
  })
}

function drawPoints(poses) {
  poses.forEach(pos => {
    let size = 12
    let verts = [{
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
