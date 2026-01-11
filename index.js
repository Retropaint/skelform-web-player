async function start() {
  let skellington = await SkfDownloadSample("skellington.skf")
  await SkfInit(skellington, glcanvas)

  // set progress input element of first canvas
  skfCanvases[0].progressEl = skfrange;
  // activate default style
  skfCanvases[0].activeStyles = [skfCanvases[0].armature.styles[1]];

  skfCanvases[0].armature.animations.forEach((a, e) => {
    animations.add(new Option(a.name, e));
  });
  skfCanvases[0].armature.styles.forEach((a, e) => {
    styles.add(new Option(a.name, e));
  });

  requestAnimationFrame(newFrame);
}

// process all skf canvases per frame
let lastTime = 0;
function newFrame(time) {
  for (skfc of skfCanvases) {
    SkfClearScreen(skfc.canvas, [0, 0, 0, 0], skfc.gl, skfc.program);
    skfc.animTime += (skfc.playing) ? time - lastTime : 0;
    anim = skfc.armature.animations[skfc.selAnim];
    const frame = SkfTimeFrame(skfc.animTime, anim, false, true);
    smooth = skfc.playing ? 20 : 0;
    SkfAnimate(skfc.armature.bones, [anim], [frame], [smooth]);
    let options = {
      scale: { x: 0.15, y: 0.15, },
      position: { x: 300, y: -250 }
    }
    bones = SkfConstruct(skfc.armature.bones, skfc.armature.ik_root_ids, options);
    SkfDraw(bones, skfc.activeStyles, skfc.armature.atlases, skfc.gl, skfc.program);
    if (skfc.progressEl) {
      animProgress(skfc.animTime, skfc);
    }
  }

  lastTime = time;
  requestAnimationFrame(newFrame);
}
function togglePlaying(skfCanvas) {
  skfCanvas.playing = !skfCanvas.playing;
  playbutton.innerHTML = skfCanvas.playing ? "Pause" : "Play";
}
function toggleStylesDropdown() {
  stylesOpen = !stylesOpen;
  stylesdropdown.style.visibility = stylesOpen ? "visible" : "hidden"
}
function toggleStyle(event, skfc) {
  let idx = skfc.activeStyles.find((s) => s.id == event);
  if (idx) {
    skfc.activeStyles.splice(idx, 1);
  } else {
    skfc.activeStyles.splice(event, 0, skfc.armature.styles[event]);
  }
}
function animProgress(time, canvas) {
  if (!canvas.playing) {
    return;
  }
  anim = canvas.armature.animations[canvas.selAnim];
  const frame = SkfTimeFrame(time, anim, false, true);
  skfc.progressEl.value =
    frame / anim.keyframes[anim.keyframes.length - 1].frame;
}
function changeAnim(event, skfCanvas) {
  skfCanvas.selAnim = event;
  skfCanvas.animTime = 0;
  skfrange.value = 0.0;
}
function changeFrame(event, skfc) {
  skfc.playing = false;
  playbutton.innerHTML = "Play";
  anim = skfc.armature.animations[skfc.selAnim];
  frames = anim.keyframes[anim.keyframes.length - 1].frame;
  frametime = 1 / anim.fps;
  skfc.animTime = frames * skfrange.value * frametime * 1000;
}
start();
