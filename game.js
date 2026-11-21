/* =========================================================================
   NEON DERBY — Destruction Arena
   Moteur WebGL arcade (Three.js) : physique, IA, dégâts, particules, audio
   ========================================================================= */
(function () {
'use strict';

// ---------------------------------------------------------------- utils
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const TAU = Math.PI * 2;
const wrapAngle = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

const ARENA_R = 62;          // rayon intérieur du mur
const CAR_R = 2.0;           // rayon de collision d'une voiture
const GRAV = -30;

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060c);
scene.fog = new THREE.FogExp2(0x05060c, 0.0048);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(0, 20, -45);
let camShake = 0;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0x8ab4ff, 0x0a0d18, 0.55);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xdfeaff, 1.5);
sun.position.set(45, 70, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -75; sun.shadow.camera.right = 75;
sun.shadow.camera.top = 75; sun.shadow.camera.bottom = -75;
sun.shadow.camera.far = 220;
sun.shadow.bias = -0.0004;
scene.add(sun);

const neonA = new THREE.PointLight(0xff2d95, 380, 150, 1.7); neonA.position.set(0, 9, -50); scene.add(neonA);
const neonB = new THREE.PointLight(0x00e5ff, 380, 150, 1.7); neonB.position.set(50, 9, 25); scene.add(neonB);
const neonC = new THREE.PointLight(0x8a2dff, 320, 150, 1.7); neonC.position.set(-50, 9, 25); scene.add(neonC);

const headlight = new THREE.SpotLight(0xbfe8ff, 160, 60, 0.55, 0.5, 1.2);
headlight.visible = false;
scene.add(headlight); scene.add(headlight.target);

const boomLight = new THREE.PointLight(0xffa540, 0, 110, 1.5);
scene.add(boomLight);
let boomT = 0;

// ---------------------------------------------------------------- textures procédurales
function makeFloorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#14161d'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 9000; i++) {
    const s = rand(1, 3);
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '10,12,16' : '34,38,48'},${rand(0.15, 0.5)})`;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, s, s);
  }
  for (let i = 0; i < 26; i++) {           // traces de gomme
    g.strokeStyle = `rgba(8,8,10,${rand(0.12, 0.3)})`;
    g.lineWidth = rand(14, 42);
    g.beginPath();
    const a = Math.random() * TAU, r = rand(80, 480);
    g.moveTo(512 + Math.cos(a) * r, 512 + Math.sin(a) * r);
    g.arc(512, 512, r, a, a + rand(0.4, 2.2));
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,210,80,0.35)'; g.lineWidth = 10;
  g.beginPath(); g.arc(512, 512, 170, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(0,200,255,0.3)';
  g.beginPath(); g.arc(512, 512, 420, 0, TAU); g.stroke();
  g.font = '900 110px Arial Black, Arial'; g.textAlign = 'center';
  g.fillStyle = 'rgba(255,60,90,0.22)';
  g.save(); g.translate(512, 512); g.rotate(0.5);
  g.fillText('DERBY', 0, 40); g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function makeCrowdTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0c14'; g.fillRect(0, 0, 1024, 128);
  for (let i = 0; i < 2600; i++) {
    const h = Math.random();
    g.fillStyle = h < 0.55 ? `hsl(${rand(190, 230)},70%,${rand(35, 70)}%)`
      : h < 0.85 ? `hsl(${rand(320, 350)},70%,${rand(35, 65)}%)`
      : `hsl(${rand(40, 60)},80%,${rand(45, 75)}%)`;
    g.globalAlpha = rand(0.35, 0.95);
    g.fillRect(Math.random() * 1024, Math.random() * 128, 3, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(24, 1);
  return t;
}

// ---------------------------------------------------------------- arena
const obstacles = [];   // {x,z,r}
const ramps = [];       // {cx,cz,ux,uz,width,len}

(function buildArena() {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_R + 3, 72),
    new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.92, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_R + 1.5, ARENA_R + 1.5, 9, 72, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.4, metalness: 0.85, side: THREE.DoubleSide })
  );
  wall.position.y = 4.5;
  scene.add(wall);

  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ARENA_R + 0.8, 0.22, 8, 90),
      new THREE.MeshStandardMaterial({
        color: 0x111111, emissive: i % 2 ? 0x00e5ff : 0xff2d95,
        emissiveIntensity: 2.2, roughness: 0.5
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2 + i * 2.4;
    scene.add(ring);
  }

  // tribunes + public
  const stands = new THREE.Mesh(
    new THREE.CylinderGeometry(84, 88, 16, 72, 1, true),
    new THREE.MeshBasicMaterial({ map: makeCrowdTexture(), side: THREE.BackSide })
  );
  stands.position.y = 8;
  scene.add(stands);

  for (let i = 0; i < 4; i++) {           // pylônes projecteurs
    const a = i * Math.PI / 2 + Math.PI / 4;
    const x = Math.cos(a) * (ARENA_R + 6), z = Math.sin(a) * (ARENA_R + 6);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.1, 30, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a1e28, roughness: 0.6, metalness: 0.7 })
    );
    pole.position.set(x, 15, z); scene.add(pole);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(5, 2, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xcfe8ff, emissiveIntensity: 3 })
    );
    head.position.set(x * 0.94, 30, z * 0.94);
    head.lookAt(0, 20, 0);
    scene.add(head);
  }

  // piliers béton destructibles-aussi
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.85 });
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6 + 0.4;
    const x = Math.cos(a) * 30, z = Math.sin(a) * 30;
    const p = new THREE.Mesh(new THREE.BoxGeometry(3.2, 6, 3.2), pillarMat);
    p.position.set(x, 3, z);
    p.castShadow = true; p.receiveShadow = true;
    scene.add(p);
    obstacles.push({ x, z, r: 2.6 });
  }

  // piles de pneus
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 });
  for (let i = 0; i < 10; i++) {
    const a = rand(0, TAU), r = rand(40, 52);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const stack = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.34, 8, 16), tireMat);
      t.rotation.x = Math.PI / 2;
      t.position.y = 0.35 + j * 0.62;
      stack.add(t);
    }
    stack.position.set(x, 0, z);
    scene.add(stack);
    obstacles.push({ x, z, r: 1.3 });
  }

  // ramps de saut
  const rampMat = new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.5, metalness: 0.4 });
  [[0, -22, -Math.PI / 2], [0, 22, Math.PI / 2]].forEach(([x, z, rot]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 13), rampMat);
    m.castShadow = true; m.receiveShadow = true;
    m.position.set(x, 1.7, z);
    m.rotation.y = rot;
    m.rotateX(-0.32);
    scene.add(m);
    const dir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    ramps.push({ cx: x, cz: z, ux: dir.x, uz: dir.z, width: 9, len: 12 });
  });

  obstacles.push({ x: 0, z: 0, r: 0 });   // (placeholder, aucun)
})();

// ---------------------------------------------------------------- particules
const PARTICLE_VS = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vA; varying vec3 vC;
void main() {
  vA = aAlpha; vC = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (150.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const PARTICLE_FS = `
varying float vA; varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  if (r > 0.5) discard;
  gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.05, r));
}`;

class Pool {
  constructor(cap, blending) {
    this.cap = cap;
    this.head = 0;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.baseA = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS,
      transparent: true, depthWrite: false, blending
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, life, size, r, gc, b, grav, drag, baseA) {
    const i = this.head; this.head = (this.head + 1) % this.cap;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = gc; this.col[i * 3 + 2] = b;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life;
    this.grav[i] = grav; this.drag[i] = drag; this.baseA[i] = baseA;
    this.alpha[i] = baseA;
  }
  update(dt) {
    const { pos, vel, life, maxLife, alpha, baseA, size, grav, drag, cap } = this;
    for (let i = 0; i < cap; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { alpha[i] = 0; continue; }
      const k = 1 - drag[i] * dt;
      vel[i * 3] *= k; vel[i * 3 + 1] = vel[i * 3 + 1] * k + grav[i] * dt; vel[i * 3 + 2] *= k;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.05 && grav[i] < 0) { pos[i * 3 + 1] = 0.05; vel[i * 3 + 1] *= -0.4; }
      const t = life[i] / maxLife[i];
      alpha[i] = baseA[i] * t;
      size[i] *= 1 + 0.4 * dt;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }
}
const sparks = new Pool(1400, THREE.AdditiveBlending);
const smoke = new Pool(900, THREE.NormalBlending);

function burstSparks(p, n, power) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), up = rand(0.5, 6) * power;
    const hot = Math.random() < 0.6;
    sparks.spawn(p.x, p.y, p.z,
      Math.cos(a) * rand(2, 12) * power, up, Math.sin(a) * rand(2, 12) * power,
      rand(0.3, 0.8), rand(0.6, 1.4),
      hot ? 1 : 1, hot ? rand(0.6, 0.9) : rand(0.3, 0.5), hot ? 0.35 : 0.08,
      -22, 1.5, 1);
  }
}
function burstSmoke(p, n, dark) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const c = dark ? rand(0.06, 0.16) : rand(0.35, 0.6);
    smoke.spawn(p.x + rand(-0.5, 0.5), p.y + rand(0, 0.8), p.z + rand(-0.5, 0.5),
      Math.cos(a) * rand(0.5, 3), rand(1, 4), Math.sin(a) * rand(0.5, 3),
      rand(0.8, 1.8), rand(1.6, 3.4), c, c, c, 0.6, 1.1, 0.34);
  }
}
function explosion(p) {
  burstSparks(p, 90, 2.2);
  burstSmoke(p, 26, true);
  for (let i = 0; i < 26; i++) {
    const a = rand(0, TAU), e = rand(4, 16);
    smoke.spawn(p.x, p.y + 0.5, p.z,
      Math.cos(a) * rand(3, 14), rand(6, 18), Math.sin(a) * rand(3, 14),
      rand(1, 2), rand(0.8, 1.8), 0.14, 0.12, 0.1, -26, 0.6, 0.8);
  }
  boomLight.position.set(p.x, p.y + 3, p.z);
  boomLight.intensity = 5200; boomT = 1;
  camShake = Math.min(1.6, camShake + 0.9);
}

// ---------------------------------------------------------------- audio
const AudioMan = {
  ctx: null,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.75;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.eOsc1 = ctx.createOscillator(); this.eOsc1.type = 'sawtooth';
    this.eOsc2 = ctx.createOscillator(); this.eOsc2.type = 'square';
    this.eFilter = ctx.createBiquadFilter(); this.eFilter.type = 'lowpass'; this.eFilter.frequency.value = 750;
    this.eGain = ctx.createGain(); this.eGain.gain.value = 0;
    this.eOsc1.connect(this.eFilter); this.eOsc2.connect(this.eFilter);
    this.eFilter.connect(this.eGain); this.eGain.connect(this.master);
    this.eOsc1.start(); this.eOsc2.start();

    this.skidSrc = ctx.createBufferSource(); this.skidSrc.buffer = this.noise; this.skidSrc.loop = true;
    this.skidF = ctx.createBiquadFilter(); this.skidF.type = 'bandpass'; this.skidF.frequency.value = 900; this.skidF.Q.value = 1.4;
    this.skidGain = ctx.createGain(); this.skidGain.gain.value = 0;
    this.skidSrc.connect(this.skidF); this.skidF.connect(this.skidGain); this.skidGain.connect(this.master);
    this.skidSrc.start();
  },
  engine(speed, throttle, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = on ? 55 + Math.abs(speed) * 3.4 : 55;
    this.eOsc1.frequency.setTargetAtTime(f, t, 0.05);
    this.eOsc2.frequency.setTargetAtTime(f * 1.5, t, 0.05);
    this.eFilter.frequency.setTargetAtTime(500 + Math.abs(speed) * 40, t, 0.1);
    const g = on ? 0.05 + Math.min(1, Math.abs(speed) / 30) * 0.05 + Math.max(0, throttle) * 0.035 : 0;
    this.eGain.gain.setTargetAtTime(g, t, 0.08);
  },
  skid(slip) {
    if (!this.ctx) return;
    this.skidGain.gain.setTargetAtTime(clamp((slip - 5) / 32, 0, 0.22), this.ctx.currentTime, 0.06);
  },
  _burst(dur, filterType, f0, f1, vol, rate) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = rate;
    const flt = ctx.createBiquadFilter(); flt.type = filterType;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 1.2, dur);
  },
  crash(strength) { this._burst(0.28, 'bandpass', rand(350, 900), 120, clamp(0.15 + strength / 30, 0.15, 0.6), rand(0.7, 1.3)); },
  land() { this._burst(0.12, 'lowpass', 300, 80, 0.2, 0.7); },
  boost() { this._burst(0.5, 'highpass', 200, 2600, 0.14, 1.4); },
  explosion() {
    this._burst(1.1, 'lowpass', 1400, 45, 0.8, 0.45);
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 1.0);
  }
};

// ---------------------------------------------------------------- usine à voitures
const PAINTS = [
  0x00e5ff, 0xff2244, 0xff8800, 0x33ff66, 0xaa44ff, 0xffd000
];

function buildCarMesh(paint) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';

  const bodyMat = new THREE.MeshStandardMaterial({
    color: paint, roughness: 0.32, metalness: 0.65,
    emissive: paint, emissiveIntensity: 0.12
  });
  const bodyGeo = new THREE.BoxGeometry(2.35, 1.1, 5.2, 3, 2, 5);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.8, 2.5),
    new THREE.MeshStandardMaterial({ color: 0x0a0d13, roughness: 0.12, metalness: 0.4 })
  );
  cabin.position.set(0, 1.82, -0.25);
  cabin.castShadow = true;
  group.add(cabin);

  const bumperMat = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.6, metalness: 0.8 });
  const fBumper = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 0.6), bumperMat);
  fBumper.position.set(0, 0.7, 2.7); group.add(fBumper);
  const rBumper = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 0.6), bumperMat);
  rBumper.position.set(0, 0.7, -2.7); group.add(rBumper);

  const rollBar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.16, 0.16), bumperMat);
  rollBar.position.set(0, 2.35, -1.2); group.add(rollBar);

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.14, 0.7), bodyMat);
  spoiler.position.set(0, 2.0, -2.5); group.add(spoiler);

  const lightMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff6d8, emissiveIntensity: 3.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2222, emissiveIntensity: 3.2 });
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.12), lightMat);
    hl.position.set(0.75 * s, 1.1, 2.62); group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.1), tailMat);
    tl.position.set(0.75 * s, 1.15, -2.62); group.add(tl);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.42, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.44, 8);
  rimGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.95 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b0, roughness: 0.3, metalness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [[-1.18, 1.75], [1.18, 1.75], [-1.18, -1.75], [1.18, -1.75]]) {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    w.add(tire); w.add(rim);
    w.position.set(wx, 0.58, wz);
    group.add(w);
    wheels.push(w);
  }

  return { group, body, bodyGeo, bodyBase: bodyGeo.attributes.position.array.slice(), wheels, bodyMat };
}

const cars = [];
let player = null;

function spawnCar(idx, isPlayer) {
  const paint = PAINTS[idx % PAINTS.length];
  const parts = buildCarMesh(paint);
  const a = idx * (TAU / 6) + 0.3;
  const r = 42;
  const car = {
    name: isPlayer ? 'VOUS' : `CPU-${idx}`,
    isPlayer,
    mesh: parts.group, body: parts.body, bodyGeo: parts.bodyGeo,
    bodyBase: parts.bodyBase, wheels: parts.wheels, bodyMat: parts.bodyMat,
    color: paint,
    pos: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r),
    vel: new THREE.Vector3(),
    yaw: -a - Math.PI / 2,
    yawVel: 0, y: 0, vy: 0, airborne: false,
    hp: isPlayer ? 135 : 100, maxHp: isPlayer ? 135 : 100,
    alive: true, lastHitBy: null, lastHitTime: -99,
    throttle: 0, steer: 0, handbrake: false, boosting: false,
    nitro: 100, wheelSpin: 0,
    ai: { phase: rand(0, TAU), retarget: 0, target: null, stuck: 0, reverse: 0, skill: rand(0.75, 1) },
    score: 0, kills: 0
  };
  scene.add(parts.group);
  cars.push(car);
  return car;
}

function carForward(car, out) {
  out.set(Math.sin(car.yaw), 0, Math.cos(car.yaw));
  return out;
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

// ---------------------------------------------------------------- déformation
function deformCar(car, worldPoint, dmg) {
  if (dmg < 1.5) return;
  const geo = car.bodyGeo;
  const arr = geo.attributes.position.array;
  const base = car.bodyBase;
  const local = _v1.copy(worldPoint);
  car.body.worldToLocal(local);
  const radius = clamp(1.1 + dmg * 0.05, 1.1, 2.2);
  const power = clamp(dmg * 0.028, 0.06, 0.5);
  let touched = false;
  for (let i = 0; i < arr.length; i += 3) {
    const dx = arr[i] - local.x, dy = arr[i + 1] - local.y, dz = arr[i + 2] - local.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > radius) continue;
    const w = (1 - d / radius) * power;
    const jitter = () => (Math.random() - 0.5) * w;
    let nx = arr[i] + dx * w * 0.8 + jitter();
    let ny = arr[i + 1] + dy * w * 0.5 + jitter() * 0.6;
    let nz = arr[i + 2] + dz * w * 0.8 + jitter();
    const bx = base[i], by = base[i + 1], bz = base[i + 2];
    const mx = nx - bx, my = ny - by, mz = nz - bz;
    const m = Math.sqrt(mx * mx + my * my + mz * mz);
    if (m > 0.6) { const s = 0.6 / m; nx = bx + mx * s; ny = by + my * s; nz = bz + mz * s; }
    arr[i] = nx; arr[i + 1] = ny; arr[i + 2] = nz;
    touched = true;
  }
  if (touched) {
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }
}

// ---------------------------------------------------------------- dégâts / élimination
function applyDamage(car, dmg, attacker, point) {
  if (!car.alive || dmg <= 0) return;
  if (car !== player) dmg *= 0.85;
  car.hp -= dmg;
  car.lastHitBy = attacker || car.lastHitBy;
  car.lastHitTime = elapsed;
  deformCar(car, point, dmg);

  if (attacker === player && car !== player && dmg >= 2) {
    comboT = 2.6; combo++;
    const mult = Math.min(5, 1 + Math.floor(combo / 3));
    const pts = Math.round(dmg * 2 * mult);
    player.score += pts;
    floatNotif(`+${pts}`, 'gain');
  }

  burstSparks(point, clamp(Math.round(dmg), 4, 26), clamp(dmg / 10, 0.6, 1.8));
  if (dmg > 6) burstSmoke(point, clamp(Math.round(dmg / 3), 1, 5), false);

  if (car === player) {
    flashDamage();
    camShake = Math.min(1.4, camShake + dmg / 22);
    AudioMan.crash(dmg);
  } else if (camera.position.distanceTo(point) < 40) {
    AudioMan.crash(dmg * 0.6);
  }

  if (car.hp <= 0) destroyCar(car, attacker);
  updateHud();
}

function destroyCar(car, killer) {
  car.alive = false;
  car.hp = 0;
  const p = _v2.copy(car.pos); p.y = 1.4;
  explosion(p);
  AudioMan.explosion();

  car.bodyMat.color.setHex(0x161719);
  car.bodyMat.metalness = 0.2; car.bodyMat.roughness = 0.95;
  car.bodyMat.emissiveIntensity = 0;
  car.mesh.traverse(o => {
    if (o.material && o.material.emissive && o.material.emissiveIntensity > 1) {
      o.material.emissiveIntensity = 0;
    }
  });

  if (killer === player && car !== player) {
    player.kills++;
    player.score += 500;
    notif(`ÉLIMINATION — ${car.name}`, 'kill');
    floatNotif('+500', 'gain');
  }
  if (car === player) {
    notif('VOUS ÊTES DÉTRUIT !', 'kill');
    gameOver(false);
  }
  checkVictory();
  updateHud();
}

function checkVictory() {
  const aliveAi = cars.filter(c => c.alive && !c.isPlayer).length;
  if (aliveAi === 0 && player && player.alive) gameOver(true);
}

// ---------------------------------------------------------------- physique
function physicsCar(car, dt) {
  if (!car.airborne) {
    const fwd = carForward(car, _v1);
    const speedFwd = car.vel.dot(fwd);

    const maxSpd = car.boosting && car.alive ? 46 : 36;
    if (car.alive) {
      const acc = car.boosting ? 38 : 26;
      if (car.throttle > 0 && speedFwd < maxSpd) car.vel.addScaledVector(fwd, acc * car.throttle * dt);
      else if (car.throttle < 0) {
        if (speedFwd > 0.5) car.vel.addScaledVector(fwd, 34 * car.throttle * dt);
        else if (speedFwd > -14) car.vel.addScaledVector(fwd, 14 * car.throttle * dt);
      }
    }
    if (car.handbrake && car.alive) car.vel.addScaledVector(fwd, -10 * dt * Math.sign(speedFwd || 1));

    // adhérence latérale : drift si frein à main
    const lateral = _v2.copy(car.vel).addScaledVector(fwd, -speedFwd);
    const grip = !car.alive ? 10 : (car.handbrake ? 1.6 : 7);
    const gk = Math.exp(-grip * dt);
    lateral.multiplyScalar(gk);
    car.vel.copy(lateral).addScaledVector(fwd, speedFwd);

    // roues : vitesse de lacet contrôlée
    const speed = car.vel.length();
    const steerAuth = clamp(speed / 9, 0, 1) * (car.throttle < -0.1 ? -1 : 1);
    const targetYawVel = car.steer * 2.5 * steerAuth * (car.handbrake ? 1.5 : 1);
    car.yawVel = damp(car.yawVel, targetYawVel, 7, dt);
    car.yaw += car.yawVel * dt;

    // résistance de roulement
    dragVec(car, car.alive ? 0.5 : 1.7, dt);

    // vitesse max dure
    if (car.vel.length() > maxSpd) car.vel.setLength(maxSpd);

    // ramps
    {
      for (const rp of ramps) {
        const dx = car.pos.x - rp.cx, dz = car.pos.z - rp.cz;
        const u = dx * rp.ux + dz * rp.uz;
        const v = dx * -rp.uz + dz * rp.ux;
        if (Math.abs(u) < rp.len / 2 && Math.abs(v) < rp.width / 2 && speed > 12) {
          car.vy = clamp(speed * 0.34, 8, 17);
          car.airborne = true;
          car.y = 0.4;
          break;
        }
      }
    }
  } else {
    car.yawVel *= Math.exp(-0.8 * dt);
    car.yaw += car.yawVel * dt;
    dragVec(car, 0.12, dt);
  }

  // vertical
  if (car.airborne || car.y > 0) {
    car.vy += GRAV * dt;
    car.y += car.vy * dt;
    if (car.y <= 0) {
      if (car.vy < -8) {
        if (car === player) { camShake = Math.min(1.2, camShake + 0.4); AudioMan.land(); }
        burstSmoke(_v3.set(car.pos.x, 0.2, car.pos.z), 4, false);
      }
      car.y = 0; car.vy = 0; car.airborne = false;
    }
  }

  car.pos.addScaledVector(car.vel, dt);
  car.pos.y = car.y;

  // murs circulaires
  const dist = Math.hypot(car.pos.x, car.pos.z);
  const lim = ARENA_R - CAR_R;
  if (dist > lim) {
    const ox = car.pos.x / dist, oz = car.pos.z / dist;
    car.pos.x = ox * lim; car.pos.z = oz * lim;
    const rv = car.vel.x * ox + car.vel.z * oz;
    if (rv > 0) {
      car.vel.x -= ox * rv * 1.5;
      car.vel.z -= oz * rv * 1.5;
      if (rv > 9 && car.alive) {
        const pt = _v3.set(ox * ARENA_R, 1.1, oz * ARENA_R);
        applyDamage(car, (rv - 8) * 1.2, null, pt);
      } else if (rv > 4) {
        burstSparks(_v3.set(ox * ARENA_R, 1.1, oz * ARENA_R), 5, 0.6);
      }
    }
  }

  // obstacles statiques
  for (const ob of obstacles) {
    if (!ob.r) continue;
    const dx = car.pos.x - ob.x, dz = car.pos.z - ob.z;
    const d = Math.hypot(dx, dz);
    const minD = ob.r + CAR_R;
    if (d < minD && d > 0.001) {
      const nx = dx / d, nz = dz / d;
      car.pos.x = ob.x + nx * minD;
      car.pos.z = ob.z + nz * minD;
      const rv = car.vel.x * nx + car.vel.z * nz;
      if (rv < 0) {
        car.vel.x -= nx * rv * 1.5;
        car.vel.z -= nz * rv * 1.5;
        const impact = -rv;
        if (impact > 10 && car.alive) {
          applyDamage(car, (impact - 9) * 1.4, null, _v3.set(car.pos.x - nx * CAR_R, 1.1, car.pos.z - nz * CAR_R));
        } else if (impact > 4) {
          burstSparks(_v3.set(car.pos.x - nx * CAR_R, 1.1, car.pos.z - nz * CAR_R), 4, 0.6);
        }
      }
    }
  }

  // visuel
  car.mesh.position.set(car.pos.x, car.y, car.pos.z);
  car.mesh.rotation.y = car.yaw;
  const pitchT = car.airborne ? clamp(-car.vy * 0.022, -0.4, 0.34) : 0;
  car.mesh.rotation.x = damp(car.mesh.rotation.x, pitchT, 6, dt);
  car.mesh.rotation.z = damp(car.mesh.rotation.z, clamp(-car.yawVel * 0.06, -0.14, 0.14), 6, dt);

  car.wheelSpin += car.vel.length() * dt / 0.58;
  const steerVis = car.steer * 0.45;
  car.wheels.forEach((w, i) => {
    w.rotation.x = car.wheelSpin;
    if (i < 2) w.rotation.y = damp(w.rotation.y, steerVis, 10, dt);
  });
}

function dragVec(car, k, dt) {
  car.vel.multiplyScalar(Math.exp(-k * dt));
}

// collisions voiture / voiture
function collideCars(dt) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      const minD = CAR_R * 2 - 0.25;
      if (d2 > minD * minD || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d;
      const push = (minD - d) * 0.5;
      a.pos.x -= nx * push; a.pos.z -= nz * push;
      b.pos.x += nx * push; b.pos.z += nz * push;

      const rvx = b.vel.x - a.vel.x, rvz = b.vel.z - a.vel.z;
      const relN = rvx * nx + rvz * nz;
      if (relN < 0) {
        const e = 0.55;
        const jj = -(1 + e) * relN / 2;
        a.vel.x -= nx * jj; a.vel.z -= nz * jj;
        b.vel.x += nx * jj; b.vel.z += nz * jj;

        const impact = -relN;
        if (impact > 4.5) {
          const cx = (a.pos.x + b.pos.x) / 2, cz = (a.pos.z + b.pos.z) / 2;
          const pt = _v3.set(cx, 1.1, cz);
          const appA = a.vel.x * nx + a.vel.z * nz;
          const appB = -(b.vel.x * nx + b.vel.z * nz);
          const dealer = appA > appB ? a : b;
          const victim = dealer === a ? b : a;
          const base = (impact - 5) * 1.05;
          applyDamage(victim, base * 1.0, dealer, pt);
          applyDamage(dealer, base * 0.35, victim, pt);
          if (impact > 10) {
            shakelessCrash(pt, impact);
            burstSmoke(pt, 3, false);
          }
        }
      }
    }
  }
  checkVictory();
}
function shakelessCrash(pt, impact) {
  if (camera.position.distanceTo(pt) < 45) AudioMan.crash(impact * 0.7);
  camShake = Math.min(1.3, camShake + impact / 40);
}

// ---------------------------------------------------------------- IA
function aiUpdate(car, dt) {
  const ai = car.ai;
  if (!car.alive) { car.throttle = 0; car.steer = 0; return; }
  ai.retarget -= dt;
  if (!ai.target || !ai.target.alive || ai.retarget <= 0) {
    let best = null, bd = 1e9;
    for (const c of cars) {
      if (c === car || !c.alive) continue;
      let d = car.pos.distanceToSquared(c.pos);
      if (c.isPlayer) d *= 0.8;
      if (d < bd) { bd = d; best = c; }
    }
    ai.target = best;
    ai.retarget = rand(2.5, 5);
  }
  const t = ai.target;
  if (!t) { car.throttle = 0; return; }

  _v1.copy(t.pos).addScaledVector(t.vel, 0.35).sub(car.pos);
  let desiredYaw = Math.atan2(_v1.x, _v1.z);

  const distC = Math.hypot(car.pos.x, car.pos.z);
  if (distC > ARENA_R - 14) {
    _v2.set(-car.pos.x, 0, -car.pos.z);
    const toCenter = Math.atan2(_v2.x, _v2.z);
    const blend = clamp((distC - (ARENA_R - 16)) / 8, 0, 1);
    desiredYaw = toCenter + wrapAngle(desiredYaw - toCenter) * (1 - blend);
  }

  const diff = wrapAngle(desiredYaw - car.yaw);
  car.steer = clamp(diff * 2.6 + Math.sin(elapsed * 1.9 + ai.phase) * 0.12, -1, 1);
  car.throttle = Math.abs(diff) > 2.1 && car.vel.length() > 13 ? -0.4 : 1;
  car.handbrake = Math.abs(diff) > 1.5 && car.vel.length() > 16;
  if (Math.abs(diff) < 0.35 && car.pos.distanceTo(t.pos) < 26 && Math.random() < 0.012 * ai.skill) {
    car.boosting = true; setTimeout(() => { car.boosting = false; }, 900);
  }

  if (car.vel.length() < 2.2) ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt * 2);
  if (ai.stuck > 1.5) { ai.reverse = 1.0; ai.stuck = 0; }
  if (ai.reverse > 0) {
    ai.reverse -= dt;
    car.throttle = -1;
    car.steer = -car.steer;
    car.handbrake = false;
  }
}

// ---------------------------------------------------------------- entrées
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function playerInput(dt) {
  if (!player.alive) { player.throttle = 0; player.steer = 0; return; }
  const up = keys['KeyW'] || keys['ArrowUp'];
  const down = keys['KeyS'] || keys['ArrowDown'];
  const left = keys['KeyA'] || keys['ArrowLeft'];
  const right = keys['KeyD'] || keys['ArrowRight'];
  player.throttle = (up ? 1 : 0) - (down ? 1 : 0);
  player.steer = (right ? 1 : 0) - (left ? 1 : 0);
  player.handbrake = !!keys['Space'];

  const wantBoost = !!keys['ShiftLeft'] || !!keys['ShiftRight'];
  if (wantBoost && player.nitro > 0 && player.throttle > 0) {
    if (!player.boosting) AudioMan.boost();
    player.boosting = true;
    player.nitro = Math.max(0, player.nitro - 30 * dt);
  } else {
    player.boosting = false;
    player.nitro = Math.min(100, player.nitro + 9 * dt);
  }
  if (player.boosting && player.vel.length() > 4) {
    const f = carForward(player, _v1);
    burstSparks(_v2.copy(player.pos).addScaledVector(f, -2.6).setY(0.7), 1, 0.7);
  }
}

// ---------------------------------------------------------------- HUD
const $ = id => document.getElementById(id);
const minimapCtx = $('minimap').getContext('2d');
let combo = 0, comboT = 0, elapsed = 0;

function updateHud() {
  if (!player) return;
  $('scoreVal').textContent = Math.round(player.score).toLocaleString('fr-FR');
  const alive = cars.filter(c => c.alive && !c.isPlayer).length;
  $('enemiesVal').textContent = alive;
  const hp = Math.max(0, Math.round(player.hp / player.maxHp * 100));
  const hf = $('hpFill');
  hf.style.width = hp + '%';
  hf.classList.toggle('low', hp < 35);
  $('hpTxt').textContent = hp + '%';
  const ntr = Math.round(player.nitro);
  $('nitroFill').style.width = ntr + '%';
  $('nTxt').textContent = ntr + '%';
}

function hudFrame() {
  const fwd = carForward(player, _v1);
  const kmh = Math.round(Math.abs(player.vel.dot(fwd)) * 3.4);
  $('kmhVal').textContent = kmh;
  const spd = Math.abs(player.vel.dot(fwd));
  const gear = spd < 0.8 ? 'N' : (fwd.dot(player.vel) < 0 ? 'R' : 'D' + clamp(1 + Math.floor(kmh / 40), 1, 6));
  $('gear').textContent = player.alive ? gear : '—';
  $('multVal').textContent = combo >= 3 ? `COMBO x${Math.min(5, 1 + Math.floor(combo / 3))}` : '';

  // minimap
  const g = minimapCtx, S = 150, c = S / 2, k = (S / 2 - 8) / ARENA_R;
  g.clearRect(0, 0, S, S);
  g.fillStyle = 'rgba(6,10,20,0.85)';
  g.beginPath(); g.arc(c, c, c - 4, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(0,229,255,0.5)'; g.lineWidth = 2;
  g.beginPath(); g.arc(c, c, c - 5, 0, TAU); g.stroke();
  for (const p of ramps) {
    g.fillStyle = 'rgba(255,160,20,0.8)';
    g.fillRect(c + p.cx * k - 3, c + p.cz * k - 3, 6, 6);
  }
  for (const ob of obstacles) {
    if (!ob.r) continue;
    g.fillStyle = 'rgba(140,150,165,0.7)';
    g.fillRect(c + ob.x * k - 1.5, c + ob.z * k - 1.5, 3, 3);
  }
  for (const car of cars) {
    const x = c + car.pos.x * k, y = c + car.pos.z * k;
    if (car === player) {
      g.save();
      g.translate(x, y); g.rotate(-car.yaw + Math.PI);
      g.fillStyle = '#00e5ff';
      g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(-4, 5); g.closePath(); g.fill();
      g.restore();
    } else {
      g.fillStyle = car.alive ? '#ff3355' : '#444a55';
      g.beginPath(); g.arc(x, y, 3.4, 0, TAU); g.fill();
    }
  }
}

function notif(text, cls) {
  const n = document.createElement('div');
  n.className = 'notif ' + (cls || '');
  n.textContent = text;
  $('notifs').appendChild(n);
  setTimeout(() => n.remove(), 2500);
}
function floatNotif(text, cls) {
  const n = document.createElement('div');
  n.className = 'notif ' + (cls || 'gain');
  n.style.fontSize = '16px';
  n.textContent = text;
  $('notifs').appendChild(n);
  setTimeout(() => n.remove(), 2500);
}
function flashDamage() {
  const f = $('damageFlash');
  f.style.opacity = '0.85';
  setTimeout(() => { f.style.opacity = '0'; }, 110);
}

// ---------------------------------------------------------------- camera
const camPos = new THREE.Vector3(0, 26, -50);
const camLook = new THREE.Vector3();
function updateCamera(dt) {
  const t = performance.now() / 1000;
  if (state === 'menu') {
    const a = t * 0.12;
    camPos.set(Math.cos(a) * 52, 16 + Math.sin(t * 0.3) * 3, Math.sin(a) * 52);
    camera.position.lerp(camPos, 1 - Math.exp(-2 * dt));
    camLook.lerp(_v1.set(0, 3, 0), 1 - Math.exp(-3 * dt));
    camera.lookAt(camLook);
    camera.fov = damp(camera.fov, 58, 3, dt);
    camera.updateProjectionMatrix();
    return;
  }
  const fwd = carForward(player, _v1);
  _v2.copy(player.pos).addScaledVector(fwd, -15).setY(player.y + 7.4);
  camPos.lerp(_v2, 1 - Math.exp(-4.5 * dt));
  const camD = Math.hypot(camPos.x, camPos.z);
  if (camD > ARENA_R - 4) {
    const s = (ARENA_R - 4) / camD;
    camPos.x *= s; camPos.z *= s;
  }
  camera.position.copy(camPos);
  if (camShake > 0.005) {
    camera.position.x += (Math.random() - 0.5) * camShake * 1.1;
    camera.position.y += (Math.random() - 0.5) * camShake * 0.8;
    camera.position.z += (Math.random() - 0.5) * camShake * 1.1;
    camShake *= Math.exp(-6 * dt);
  }
  camLook.lerp(_v3.copy(player.pos).addScaledVector(fwd, 7).setY(player.y + 2), 1 - Math.exp(-7 * dt));
  camera.lookAt(camLook);

  const spd = Math.abs(player.vel.dot(fwd));
  const fovT = 60 + spd * 0.28 + (player.boosting ? 8 : 0);
  camera.fov = damp(camera.fov, fovT, 4, dt);
  camera.updateProjectionMatrix();

  // phares
  headlight.visible = player.alive;
  if (player.alive) {
    headlight.position.copy(player.pos).setY(player.y + 1.6).addScaledVector(fwd, 2);
    headlight.target.position.copy(player.pos).addScaledVector(fwd, 26).setY(0.5);
  }
}

// ---------------------------------------------------------------- état de partie
let state = 'menu';   // menu | countdown | play | pause | over
let countdownT = 0;
let endTimer = 0;

function startGame() {
  AudioMan.init();
  if (player) return;
  for (let i = 0; i < 6; i++) spawnCar(i, i === 0);
  player = cars[0];
  combo = 0; comboT = 0;
  state = 'countdown';
  countdownT = 3.6;
  $('menu').classList.add('hidden');
  $('endScreen').classList.add('hidden');
  updateHud();
}

function togglePause() {
  if (state === 'play') { state = 'pause'; $('hudPause').style.display = 'flex'; AudioMan.engine(0, 0, false); }
  else if (state === 'pause') { state = 'play'; $('hudPause').style.display = 'none'; }
}

function gameOver(win) {
  state = 'over';
  endTimer = win ? 1.2 : 2.2;
  gWin = win;
}
let gWin = false;

function showEnd() {
  $('endTitle').textContent = gWin ? 'CHAMPION !' : 'DÉTRUIT';
  $('endTitle').style.filter = gWin
    ? 'drop-shadow(0 0 22px rgba(0,255,140,.8))'
    : 'drop-shadow(0 0 22px rgba(255,40,60,.8))';
  $('endSub').textContent = gWin
    ? 'DERNIER PILOTE SUR LA PISTE — L\'ARÈNE VOUS APPARTIENT'
    : 'VOUS AVEZ ÉTÉ FRACTURÉ DANS L\'ARÈNE';
  $('endScore').textContent = Math.round(player.score).toLocaleString('fr-FR');
  $('endKills').textContent = player.kills + ' détruit(s)';
  $('endScreen').classList.remove('hidden');
}

$('btnStart').addEventListener('click', startGame);
$('btnRetry').addEventListener('click', () => {
  for (const c of cars) scene.remove(c.mesh);
  cars.length = 0; player = null;
  startGame();
});

const countdownEl = $('countdown');
function runCountdown(dt) {
  countdownT -= dt;
  const n = Math.ceil(countdownT - 0.6);
  const label = countdownT <= 0.6 ? 'GO !' : String(Math.max(1, n));
  if (countdownEl.textContent !== label) {
    countdownEl.textContent = label;
    countdownEl.style.animation = 'none';
    void countdownEl.offsetWidth;
    countdownEl.style.animation = 'countPop .5s ease';
    if (label === 'GO !') { state = 'play'; notif('GO ! DÉTRUISEZ-LES TOUS', 'go'); }
  }
  if (countdownT < -1.2) countdownEl.style.display = 'none';
  else countdownEl.style.display = 'flex';
}

// ---------------------------------------------------------------- boucle
const clock = new THREE.Clock();
let wreckSmokeT = 0;

function tick() {
  requestAnimationFrame(tick);
  let dt = Math.min(clock.getDelta(), 1 / 25);
  if (state === 'pause') { renderer.render(scene, camera); return; }
  elapsed += dt;

  if (state === 'countdown' || (state !== 'menu' && countdownT > -2)) runCountdown(dt);
  if (state === 'play') {
    playerInput(dt);
    if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }
  } else {
    if (player) { player.throttle = 0; player.steer = 0; }
  }

  if (state !== 'menu') for (const c of cars) {
    if (!c.isPlayer) { if (state === 'play' || state === 'over') aiUpdate(c, dt); }
    physicsCar(c, dt);
  }
  if (state !== 'menu') collideCars(dt);

  // fumée / feu des épaves & voitures très abîmées
  wreckSmokeT -= dt;
  if (wreckSmokeT <= 0) {
    wreckSmokeT = 0.05;
    for (const c of cars) {
      const dmgLevel = 1 - c.hp / c.maxHp;
      if (!c.alive) {
        if (Math.random() < 0.55) {
          _v1.set(c.pos.x + rand(-0.8, 0.8), 1.5, c.pos.z + rand(-0.8, 0.8));
          sparks.spawn(_v1.x, _v1.y, _v1.z, rand(-0.5, 0.5), rand(2, 5), rand(-0.5, 0.5),
            rand(0.3, 0.6), rand(1.2, 2.2), 1, rand(0.25, 0.55), 0.06, 3, 1, 0.8);
          burstSmoke(_v1, 1, true);
        }
      } else if (dmgLevel > 0.55 && Math.random() < dmgLevel) {
        carForward(c, _v2);
        _v1.copy(c.pos).addScaledVector(_v2, 1.9).setY(1.2);
        burstSmoke(_v1, 1, dmgLevel > 0.85);
      }
    }
  }

  if (boomT > 0) { boomT -= dt * 2; boomLight.intensity = Math.max(0, boomT) * 5200; }

  sparks.update(dt);
  smoke.update(dt);
  updateCamera(dt);

  if (player) {
    hudFrame();
    AudioMan.engine(player.vel.length(), player.throttle, state === 'play' && player.alive);
    AudioMan.skid(player.airborne || !player.alive ? 0 : (lateralSlip(player)));
  }
  if (state === 'over') {
    endTimer -= dt;
    if (endTimer <= 0 && $('endScreen').classList.contains('hidden')) showEnd();
  }
  renderer.render(scene, camera);
}

function lateralSlip(car) {
  const f = carForward(car, _v2);
  const lat = _v3.copy(car.vel).addScaledVector(f, -car.vel.dot(f));
  return Math.sqrt(lat.x * lat.x + lat.z * lat.z);
}

const styleTag = document.createElement('style');
styleTag.textContent = '@keyframes countPop{0%{transform:scale(2.2);opacity:0}30%{transform:scale(1);opacity:1}100%{opacity:.9}}';
document.head.appendChild(styleTag);

tick();

})();
