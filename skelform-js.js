function SkfGenericFormatFrame(frame, anim, isReverse, isLoop) {
  const lastFrame = anim.keyframes[anim.keyframes.length - 1].frame
  if (isLoop) {
    frame %= lastFrame + 1
  }

  if (isReverse) {
    frame = lastFrame - frame
  }

  return frame
}

// temporary backport of v0.4.2 field.
// SkfGenericAnimate() uses this, so this is mandatory
function SkfInitNextKf(anims) {
  for (anim of anims) {
    anim.keyframes.forEach((kf, k) => {
      anim.keyframes[k].next_kf =
        anim.keyframes.findIndex((okf) =>
          okf.bone_id == kf.bone_id && okf.element == kf.element && okf.frame > kf.frame
        );
    })
  }
}

function SkfGenericTimeFrame(time, anim, isReverse, isLoop) {
  const elapsed = time / 1000
  const frametime = 1 / anim.fps
  const frame = elapsed / frametime
  return SkfGenericFormatFrame(frame, anim, isReverse, isLoop)
}

function copyArray(src, dst) {
  for (let i = 0; i < dst.length; i++) {
    src[i] = dst[i]
  }
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
  let rev_bone_ids = [];
  for (let i = 0; i < bone_ids.length; i++) {
    rev_bone_ids.push(bone_ids[i]);
  }
  rev_bone_ids.reverse().forEach((id, b) => {
    const length = mulv2f(normalize(subv2(nextPos, bones[id].pos)), nextLength)
    if (b != rev_bone_ids.length - 1) {
      nextLength = magnitude(subv2(bones[id].pos, bones[rev_bone_ids[b + 1]].pos))
    }
    bones[id].pos = subv2(nextPos, length)
    nextPos.x = bones[id].pos.x
    nextPos.y = bones[id].pos.y
  })

  let prevPos = root
  let prevLength = 0
  bone_ids.forEach((id, b) => {
    const length = mulv2f(normalize(subv2(prevPos, bones[id].pos)), prevLength)
    if (b != rev_bone_ids.length - 1) {
      prevLength = magnitude(subv2(bones[id].pos, bones[bone_ids[b + 1]].pos))
    }
    bones[id].pos = subv2(prevPos, length)
    prevPos.x = bones[id].pos.x
    prevPos.y = bones[id].pos.y
  })
}

function arcIk(bones, ikRootIds, root, target) {
  let dist = [0.];
  let maxLength = magnitude(subv2(bones[ikRootIds[ikRootIds.length - 1]].pos, root))
  let currLength = 0
  ikRootIds.forEach((rootId, rid) => {
    if (rid == 0) { return }
    length = magnitude(subv2(bones[rootId].pos, bones[ikRootIds[rid - 1]].pos))
    currLength += length
    dist.push(currLength / maxLength)
  })

  const base = subv2(target, root)
  const baseAngle = Math.atan2(base.y, base.x)
  const baseMag = Math.min(magnitude(base), maxLength)
  const peak = maxLength / baseMag
  const valley = baseMag / maxLength

  ikRootIds.forEach((rootId, rid) => {
    if (rid == 0) { return }
    bones[rootId].pos = {
      x: bones[rootId].pos.x * valley,
      y: root.y + (1 - peak) * Math.sin(dist[rid] * 3.14) * baseMag
    }
    const rotated = rotate(subv2(bones[rootId].pos, root), baseAngle)
    bones[rootId].pos = addv2(rotated, root)
  })
}

function inverseKinematics(bones, ikRootIds) {
  let ikRots = []
  ikRootIds.forEach(rootId => {
    family = bones[rootId]

    const root = { x: family.pos.x, y: family.pos.y };
    const target = { x: bones[family.ik_target_id].pos.x, y: bones[family.ik_target_id].pos.y };
    if (family.ik_mode == "FABRIK") {
      for (i = 0; i < 10; i++) {
        fabrik(bones, family.ik_bone_ids, root, target)
      }
    } else {
      arcIk(bones, family.ik_bone_ids, root, target)
    }

    const endBone = bones[family.ik_bone_ids[family.ik_bone_ids.length - 1]]
    let tipPos = { x: endBone.pos.x, y: endBone.pos.y };
    let rev_bone_ids = [];
    copyArray(rev_bone_ids, family.ik_bone_ids);
    rev_bone_ids.reverse().forEach((bid, b) => {
      if (b == 0) {
        return
      }
      const dir = subv2(tipPos, bones[bid].pos)
      bones[bid].rot = Math.atan2(dir.y, dir.x)
      tipPos = { x: bones[bid].pos.x, y: bones[bid].pos.y };
    })

    const jointDir = normalize(subv2(bones[family.ik_bone_ids[1]].pos, root))
    const baseDir = normalize(subv2(target, root))
    const dir = jointDir.x * baseDir.y - baseDir.x * jointDir.y;
    const baseAngle = Math.atan2(baseDir.y, baseDir.x)
    const cw = family.ik_constraint == "Clockwise" && dir > 0.;
    const ccw = family.ik_constraint == "CounterClockwise" && dir < 0.;
    if (cw || ccw) {
      for (id of family.ik_bone_ids) {
        bones[id].rot = -bones[id].rot + baseAngle * 2;
      }
    }

    /* save rots to hash */
    family.ik_bone_ids.forEach((bid, b) => {
      if (b == family.ik_bone_ids.length - 1) {
        return
      }
      ikRots[bones[bid].id] = bones[bid].rot
    })
  })

  return ikRots
}

function SkfGenericGetBoneTexture(texName, styles) {
  finalTex = false
  for (style of styles) {
    for (tex of style.textures) {
      if (texName == tex.name && !finalTex) {
        return tex;
      }
    }
  }
}

function SkfGenericAnimate(bones, anims, frames, smoothFrames) {
  anims.forEach((anim, a) => {
    for (k = 0; k < anim.keyframes.length; k++) {
      let kf = anim.keyframes[k];

      // only prev keyframes are considered
      if (kf.frame > frames[a]) {
        break;
      }

      if (kf.next_kf == -1) {
        kf.next_kf = k;
      }
      let nextKf = anim.keyframes[kf.next_kf];

      // this is a redundant keyframe if the next one is also before this frame
      if (nextKf.frame < frames[a] && kf.next_kf != k) {
        continue;
      }

      let bone = bones[kf.bone_id];

      let c1 = kf.element[0];
      let c2 = kf.element[kf.element.length - 1];
      if (c1 == 'P' && c2 == 'X')
        bone.pos.x = interpolateKeyframes(bone.pos.x, kf, nextKf, frames[a], smoothFrames[a]);
      if (c1 == 'P' && c2 == 'Y')
        bone.pos.y = interpolateKeyframes(bone.pos.y, kf, nextKf, frames[a], smoothFrames[a]);
      if (c1 == 'R' && c2 == 'n')
        bone.rot = interpolateKeyframes(bone.rot, kf, nextKf, frames[a], smoothFrames[a]);
      if (c1 == 'S' && c2 == 'X')
        bone.scale.x = interpolateKeyframes(bone.scale.x, kf, nextKf, frames[a], smoothFrames[a]);
      if (c1 == 'S' && c2 == 'Y')
        bone.scale.y = interpolateKeyframes(bone.scale.y, kf, nextKf, frames[a], smoothFrames[a]);
      if (c1 == 'H' && c2 == 'n') {
        bone.hidden = kf.value == 1;
      }
    }
  })

  // reset bone fields w/ bitmasks
  const animatedMap = new Map();
  const FLAGS = {
    PositionX: 1 << 0,
    PositionY: 1 << 1,
    Rotation: 1 << 2,
    ScaleX: 1 << 3,
    ScaleY: 1 << 4,
    Hidden: 1 << 5,
  };
  for (const anim of anims) {
    for (const kf of anim.keyframes) {
      let mask = animatedMap.get(kf.bone_id) || 0;
      mask |= FLAGS[kf.element] || 0;
      animatedMap.set(kf.bone_id, mask);
    }
  }
  for (const bone of bones) {
    const mask = animatedMap.get(bone.id) || 0;
    if (!(mask & FLAGS.PositionX)) bone.pos.x = bone.init_pos.x;
    if (!(mask & FLAGS.PositionY)) bone.pos.y = bone.init_pos.y;
    if (!(mask & FLAGS.Rotation)) bone.rot = bone.init_rot;
    if (!(mask & FLAGS.ScaleX)) bone.scale.x = bone.init_scale.x;
    if (!(mask & FLAGS.ScaleY)) bone.scale.y = bone.init_scale.y;
    if (!(mask & FLAGS.Hidden)) bone.hidden = bone.init_hidden || false;
  }
}

function interpolate(current, max, startVal, endVal) {
  if (max == 0 || current >= max) {
    return endVal
  }
  const interp = current / max
  const end = endVal - startVal
  const result = startVal + (end * interp)

  return result
}

function _skfBinarySearchKeyframes(keyframes, frame) {
  let lo = 0, hi = keyframes.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const kf = keyframes[mid];
    if (kf.frame <= frame) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return lo
}

function interpolateKeyframes(field, prevKf, nextKf, frame, smoothFrame) {
  const totalFrames = nextKf.frame - prevKf.frame
  const currentFrame = frame - prevKf.frame
  const result = interpolate(currentFrame, totalFrames, prevKf.value, nextKf.value)
  return interpolate(currentFrame, smoothFrame, field, result)
}

function resetInheritance(cachedBones, ogBones) {
  cachedBones.forEach((bone, b) => {
    cachedBones[b].pos = ogBones[b].pos;
    cachedBones[b].scale = ogBones[b].scale;
    cachedBones[b].rot = ogBones[b].rot;
    cachedBones[b].hidden = ogBones[b].hidden;
  })
}

function inheritance(bones, ikRots) {
  bones.forEach((bone, b) => {
    if (bone.parent_id == -1) {
      return;
    }
    const parent = bones[bone.parent_id]

    bones[b].rot += parent.rot
    bones[b].scale = mulv2(bones[b].scale, parent.scale)
    bones[b].pos = mulv2(bones[b].pos, parent.scale)
    /* rotate child around parent as if it were orbitting */
    bones[b].pos = rotate(bones[b].pos, parent.rot)
    bones[b].pos = addv2(bones[b].pos, parent.pos)

    if (ikRots[bone.id]) {
      bones[b].rot = ikRots[bone.id]
    }
  })

  return bones
}

function SkfGenericConstruct(rawBones, ikRootIds, cachedBones) {
  if (!cachedBones) {
    cachedBones = structuredClone(rawBones);
  }

  resetInheritance(cachedBones, rawBones);
  inheritance(cachedBones, [])

  ikRots = inverseKinematics(cachedBones, ikRootIds)

  resetInheritance(cachedBones, rawBones);
  inheritance(cachedBones, ikRots)

  constructVerts(cachedBones)

  return cachedBones;
}

function constructVerts(bones) {
  bones.forEach((_, b) => {
    if (!bones[b].vertices) {
      return
    }

    bones[b].vertices.forEach((vert, v) => {
      bones[b].vertices[v].pos = vert.init_pos;
      bones[b].vertices[v].pos = inheritVert(vert.pos, bones[b]);
    })

    bones[b].binds.forEach((bind, bi) => {
      if (bind.bone_id == -1) {
        return;
      }

      const bindBone = bones[bind.bone_id];

      for (bind_vert of bones[b].binds[bi].verts) {
        if (!bind.is_path) {
          let vert = bones[b].vertices[bind_vert.id];
          endPos = subv2(inheritVert(vert.init_pos, bindBone), vert.pos);
          vert.pos = addv2(vert.pos, mulv2f(endPos, bind_vert.weight));
          continue;
        }

        const prev = bi > 0 ? bi - 1 : bi
        const next = bi + 1 <= bones[b].binds.length - 1 ? bi + 1 : bones[b].binds.length - 1
        const bone = bones[b];
        const prevBone = bones[bone.binds[prev].bone_id];
        const nextBone = bones[bone.binds[next].bone_id];

        const prevDir = subv2(bindBone.pos, prevBone.pos)
        const nextDir = subv2(nextBone.pos, bindBone.pos)
        const prevNorm = normalize({ x: -prevDir.y, y: prevDir.x })
        const nextNorm = normalize({ x: -nextDir.y, y: nextDir.x })
        const average = addv2(prevNorm, nextNorm);
        const normAngle = Math.atan2(average.y, average.x)

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
