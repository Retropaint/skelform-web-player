let program;
let gl = glcanvas.getContext("webgl");
let skfData;
let playing;
let skf_placeholder;
let armature = {};
let selAnim = 0;
let animTime = 0;
let lastTime = 0;
let activeStyles = [];
let stylesOpen = false;
async function start() {
  init(gl);
  await downloadSample("skellington.skf"),
    await readFile(skfData),
    armature.animations.forEach((a, e) => {
      animations.add(new Option(a.name, e));
    }),
    armature.styles.forEach((a, e) => {
      styles.add(new Option(a.name, e));
    }),
    requestAnimationFrame(newFrame);
}
function newFrame(time) {
  clearScreen();
  if (playing) {
    animTime += time - lastTime;
  }

  anim = armature.animations[selAnim];
  const frame = timeFrame(animTime, anim, false, true);
  smooth = playing ? 20 : 0;
  animate(armature.bones, [anim], [frame], [smooth]);
  lastTime = time;
  bones = construct(armature.bones, armature.ik_root_ids);
  drawBones(bones, activeStyles, armature.atlases);
  requestAnimationFrame(newFrame);
  animProgress(animTime);
}
function togglePlaying() {
  playing = !playing;
  playbutton.innerHTML = playing ? "Pause" : "Play";
}
function toggleStylesDropdown() {
  stylesOpen = !stylesOpen;
  stylesdropdown.style.visibility = stylesOpen ? "visible" : "hidden"
}
function toggleStyle(event) {
  let idx = activeStyles.find((s) => s.id == event);
  if (idx) {
    activeStyles.splice(idx, 1);
  } else {
    activeStyles.splice(event, 0, armature.styles[event]);
  }
  console.log(event)
}
function animProgress(time) {
  if (!playing) {
    return;
  }
  anim = armature.animations[selAnim];
  const frame = timeFrame(time, anim, false, true);
  skfrange.value =
    frame / anim.keyframes[anim.keyframes.length - 1].frame;
}
function changeAnim() {
  selAnim = animations.value;
  animTime = 0;
  skfrange.value = 0.0;
}
function changeFrame(event) {
  playing = false;
  playbutton.innerHTML = "Play";
  anim = armature.animations[selAnim];
  frames = anim.keyframes[anim.keyframes.length - 1].frame;
  frametime = 1 / anim.fps;
  animTime = frames * skfrange.value * frametime * 1000;
}
start();
