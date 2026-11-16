"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

/**
 * Simulation lab (school edition): the solids of the open design fall under gravity, like the "simulation lab" of Tinkercad.
 * Its own three.js scene and the Rapier physics engine; nothing here touches the design. The scene is in millimetres (as
 * layerling), the physics in metres. Y is up and the workplane is y = 0.
 *
 * Every solid is one rigid body: a box when it is one, otherwise the convex hull of its mesh (a hollow part is
 * simulated as a solid, and says so). A body marked "static" stays where it is: an obstacle, a ramp.
 */
export type SimulationBody = {
  id: string;
  name: string;
  color: string;
  vertices: ReadonlyArray<readonly [number, number, number]>;
  faces: ReadonlyArray<readonly [number, number, number]>;
};

type Rapier = typeof import("@dimforge/rapier3d-compat").default;
type RigidBody = import("@dimforge/rapier3d-compat").RigidBody;

const MM = 0.001;
// 240 steps a second: at 120 a ball thrown at 2 m/s covers 18 mm a step and jumps over a 5 mm domino.
const STEP = 1 / 240;
const BALL_RADIUS_MM = 8;
const DEFAULT_BALL_SPEED = 0.8; // m/s - what the power slider starts at
const MIN_BALL_SPEED = 0.2;
const MAX_BALL_SPEED = 3;
const MAX_BALLS = 12;

type Entry = {
  id: string;
  mesh: THREE.Mesh;
  edges: THREE.LineSegments;
  rb: RigidBody;
  start: THREE.Vector3; // metres
  isStatic: boolean;
  hollow: boolean;
};

type Lab = {
  play: () => void;
  pause: () => void;
  reset: () => void;
  isPlaying: () => boolean;
  setStatic: (id: string, value: boolean) => void;
  /** A ball at the point `target` (mm), thrown from the point `from` (mm) - the camera by default. */
  throwBall: (target?: [number, number, number], from?: [number, number, number]) => void;
  /** How hard the next balls are thrown, in metres a second. */
  setBallSpeed: (metresPerSecond: number) => void;
  poses: () => Array<{ id: string; name: string; yMm: number; upY: number; moved: number; startMm: [number, number, number] }>;
  dispose: () => void;
};

function meshVolume(vertices: SimulationBody["vertices"], faces: SimulationBody["faces"]) {
  let volume = 0;
  for (const [a, b, c] of faces) {
    const p = vertices[a], q = vertices[b], r = vertices[c];
    volume += (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6;
  }
  return Math.abs(volume);
}

async function startLab(canvas: HTMLCanvasElement, bodies: readonly SimulationBody[], onPlayingChange: (playing: boolean) => void): Promise<Lab> {
  const RAPIER: Rapier = (await import("@dimforge/rapier3d-compat")).default;
  await RAPIER.init();

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;
  world.integrationParameters.numSolverIterations = 10;
  world.createCollider(RAPIER.ColliderDesc.cuboid(5, 0.05, 5).setTranslation(0, -0.05, 0).setFriction(0.8).setRestitution(0.05));

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f4efe6");
  scene.add(new THREE.HemisphereLight("#ffffff", "#c8d4de", 2.0));
  const sun = new THREE.DirectionalLight("#ffffff", 2.6);
  sun.position.set(-300, 600, 400);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -500, right: 500, top: 500, bottom: -500, near: 1, far: 2500 });
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: "#e9e1d2", roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(1000, 100, "#c9bda6", "#ddd2bd");
  grid.position.y = 0.05;
  scene.add(grid);

  const disposables: Array<{ dispose: () => void }> = [renderer];
  const entries: Entry[] = [];
  const bounds = new THREE.Box3();
  for (const body of bodies) {
    const box = new THREE.Box3();
    body.vertices.forEach((v) => box.expandByPoint(new THREE.Vector3(v[0], v[1], v[2])));
    bounds.union(box);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const positions = new Float32Array(body.faces.length * 9);
    body.faces.forEach((face, i) => face.forEach((index, k) => {
      const v = body.vertices[index];
      positions[i * 9 + k * 3] = v[0] - center.x;
      positions[i * 9 + k * 3 + 1] = v[1] - center.y;
      positions[i * 9 + k * 3 + 2] = v[2] - center.z;
    }));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: body.color || "#d41721", roughness: 0.6, metalness: 0.02 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.copy(center);
    scene.add(mesh);
    const edgeGeometry = new THREE.EdgesGeometry(geometry, 25);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: "#222222" });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edges.visible = false;
    mesh.add(edges);
    disposables.push(geometry, material, edgeGeometry, edgeMaterial);

    const boxVolume = Math.max(1e-9, size.x * size.y * size.z);
    const volume = meshVolume(body.vertices, body.faces);
    const isBox = Math.abs(volume - boxVolume) / boxVolume < 0.02;
    let collider = isBox ? RAPIER.ColliderDesc.cuboid((size.x / 2) * MM, (size.y / 2) * MM, (size.z / 2) * MM) : null;
    if (!collider) {
      const points = new Float32Array(positions.length);
      for (let i = 0; i < positions.length; i++) points[i] = positions[i] * MM;
      collider = RAPIER.ColliderDesc.convexHull(points);
    }
    if (!collider) collider = RAPIER.ColliderDesc.cuboid((size.x / 2) * MM, (size.y / 2) * MM, (size.z / 2) * MM);
    collider.setFriction(0.6).setRestitution(0.05).setDensity(1000);
    const start = center.clone().multiplyScalar(MM);
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z).setCcdEnabled(true).setLinearDamping(0.05).setAngularDamping(0.1));
    world.createCollider(collider, rb);
    // A mesh much lighter than its hull is hollow: it is simulated as a solid, and the list says so.
    entries.push({ id: body.id, mesh, edges, rb, start, isStatic: false, hollow: !isBox && volume / boxVolume < 0.55 });
  }

  const camera = new THREE.PerspectiveCamera(36, 1, 1, 8000);
  const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(70, bounds.isEmpty() ? 70 : bounds.getSize(new THREE.Vector3()).length() / 2);
  camera.position.set(center.x + radius * 1.2, center.y + radius * 1.1, center.z + radius * 2.1);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(center);
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  controls.minDistance = 20;
  controls.maxDistance = 3000;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.update();

  const balls: Array<{ mesh: THREE.Mesh; rb: RigidBody }> = [];
  const ballGeometry = new THREE.SphereGeometry(BALL_RADIUS_MM, 24, 16);
  const ballMaterial = new THREE.MeshStandardMaterial({ color: "#2b6fd6", roughness: 0.35 });
  disposables.push(ballGeometry, ballMaterial);
  const removeBall = (ball: { mesh: THREE.Mesh; rb: RigidBody }) => {
    scene.remove(ball.mesh);
    world.removeRigidBody(ball.rb);
  };

  let playing = false;
  let ballSpeed = DEFAULT_BALL_SPEED;
  const setPlaying = (value: boolean) => {
    playing = value;
    onPlayingChange(value);
  };

  const raycaster = new THREE.Raycaster();
  const throwBall = (target?: [number, number, number], from?: [number, number, number]) => {
    const origin = from ? new THREE.Vector3(...from) : camera.position.clone();
    const spawn = origin.clone();
    let aim: THREE.Vector3;
    if (target) {
      aim = new THREE.Vector3(...target);
    } else {
      aim = origin.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(400));
    }
    return { spawn, aim };
  };
  const launch = (spawnMm: THREE.Vector3, aimMm: THREE.Vector3) => {
    const spawn = spawnMm.clone().multiplyScalar(MM), aim = aimMm.clone().multiplyScalar(MM);
    const direction = aim.clone().sub(spawn);
    const distance = Math.max(0.05, direction.length());
    const time = distance / ballSpeed;
    // aims at the point it was thrown at, making up for the fall during the flight
    const velocity = direction.divideScalar(time).add(new THREE.Vector3(0, 0.5 * 9.81 * time, 0));
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(spawn.x, spawn.y, spawn.z).setLinvel(velocity.x, velocity.y, velocity.z).setCcdEnabled(true));
    world.createCollider(RAPIER.ColliderDesc.ball(BALL_RADIUS_MM * MM).setDensity(4000).setFriction(0.5).setRestitution(0.1), rb);
    const mesh = new THREE.Mesh(ballGeometry, ballMaterial);
    mesh.castShadow = true;
    scene.add(mesh);
    balls.push({ mesh, rb });
    while (balls.length > MAX_BALLS) removeBall(balls.shift()!);
    if (!playing) setPlaying(true);
  };

  // A click without a drag throws a ball at the point clicked; a drag turns the view.
  let downAt: { x: number; y: number; time: number } | null = null;
  const onDown = (event: PointerEvent) => { downAt = { x: event.clientX, y: event.clientY, time: performance.now() }; };
  const onUp = (event: PointerEvent) => {
    if (!downAt || event.button !== 0) { downAt = null; return; }
    const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
    const quick = performance.now() - downAt.time < 450;
    downAt = null;
    if (moved > 5 || !quick) return;
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([ground, ...entries.map((e) => e.mesh)], false);
    const aim = hits.length ? hits[0].point.clone() : raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(400));
    const spawn = raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(30));
    launch(spawn, aim);
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);

  const resize = () => {
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  let frame = 0, last = performance.now(), accumulator = 0, disposed = false;
  const loop = (now: number) => {
    if (disposed) return;
    frame = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (playing) {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= STEP && steps < 24) { world.step(); accumulator -= STEP; steps++; }
    }
    for (const e of entries) {
      const p = e.rb.translation(), q = e.rb.rotation();
      e.mesh.position.set(p.x / MM, p.y / MM, p.z / MM);
      e.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
    for (const b of balls) {
      const p = b.rb.translation(), q = b.rb.rotation();
      b.mesh.position.set(p.x / MM, p.y / MM, p.z / MM);
      b.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
    controls.update();
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(loop);

  const lab: Lab = {
    play: () => setPlaying(true),
    setBallSpeed: (value) => { ballSpeed = Math.min(MAX_BALL_SPEED, Math.max(MIN_BALL_SPEED, value)); },
    pause: () => setPlaying(false),
    isPlaying: () => playing,
    reset: () => {
      setPlaying(false);
      accumulator = 0;
      balls.splice(0).forEach(removeBall);
      for (const e of entries) {
        e.rb.setBodyType(e.isStatic ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic, true);
        e.rb.setTranslation({ x: e.start.x, y: e.start.y, z: e.start.z }, true);
        e.rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        e.rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
        e.rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    },
    setStatic: (id, value) => {
      const e = entries.find((x) => x.id === id);
      if (!e) return;
      e.isStatic = value;
      e.edges.visible = value;
      e.rb.setBodyType(value ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic, true);
    },
    throwBall: (target, from) => {
      const { spawn, aim } = throwBall(target, from);
      launch(spawn, aim);
    },
    poses: () => entries.map((e, i) => {
      const p = e.rb.translation(), q = e.rb.rotation();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
      return { id: e.id, name: bodies[i].name, yMm: p.y / MM, upY: up.y, moved: Math.hypot(p.x - e.start.x, p.y - e.start.y, p.z - e.start.z) / MM, startMm: [e.start.x / MM, e.start.y / MM, e.start.z / MM] };
    }),
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      observer.disconnect();
      controls.dispose();
      balls.splice(0).forEach((b) => scene.remove(b.mesh));
      disposables.forEach((d) => d.dispose());
      world.free();
    },
  };
  (lab as Lab & { hollow: string[] }).hollow = entries.filter((e) => e.hollow).map((e) => e.id);
  return lab;
}

export default function SimulationLab({ bodies, onClose }: { bodies: SimulationBody[]; onClose: () => void }) {
  useLanguage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const labRef = useRef<(Lab & { hollow?: string[] }) | null>(null);
  const powerRef = useRef(DEFAULT_BALL_SPEED);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(bodies.length ? "loading" : "ready");
  const [playing, setPlaying] = useState(false);
  const [statics, setStatics] = useState<Record<string, boolean>>({});
  const [hollow, setHollow] = useState<string[]>([]);
  const [power, setPower] = useState(DEFAULT_BALL_SPEED);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bodies.length === 0) return;
    let cancelled = false;
    let started: Lab | null = null;
    startLab(canvas, bodies, setPlaying).then((lab) => {
      if (cancelled) { lab.dispose(); return; }
      started = lab;
      labRef.current = lab;
      lab.setBallSpeed(powerRef.current);
      setHollow((lab as Lab & { hollow?: string[] }).hollow ?? []);
      (window as unknown as { __layerlingLab?: Lab }).__layerlingLab = lab;
      setStatus("ready");
    }).catch(() => { if (!cancelled) setStatus("error"); });
    return () => {
      cancelled = true;
      started?.dispose();
      labRef.current = null;
      delete (window as unknown as { __layerlingLab?: Lab }).__layerlingLab;
    };
  }, [bodies]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const button = (primary = false): React.CSSProperties => ({
    border: "1.5px solid #6b4a1f", borderRadius: 10, padding: "8px 16px", fontSize: 15, fontWeight: 600, cursor: "pointer",
    background: primary ? "#e8892b" : "#fff8ec", color: primary ? "#fff" : "#4a3210",
  });
  const ready = status === "ready" && bodies.length > 0;

  return (
    <div role="dialog" aria-modal="true" aria-label={t("simulation.title")} data-simulation-lab
      style={{ position: "fixed", inset: 0, zIndex: 5000, background: "#f4efe6", display: "flex", flexDirection: "column", fontFamily: "inherit", color: "#3b2a12" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid #d9ccb3", background: "#fbf6ec" }}>
        <strong style={{ fontSize: 18, marginRight: "auto" }}>{t("simulation.title")}</strong>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15 }} title={t("simulation.power")}>
          <span>{t("simulation.power")}</span>
          <input type="range" min={MIN_BALL_SPEED} max={MAX_BALL_SPEED} step={0.1} value={power} disabled={!ready} aria-label={t("simulation.power")} style={{ width: 150 }}
            onChange={(event) => { const value = Number(event.currentTarget.value); powerRef.current = value; setPower(value); labRef.current?.setBallSpeed(value); }} />
          <span style={{ width: 62, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{power.toFixed(1)} m/s</span>
        </label>
        <button type="button" style={button(true)} disabled={!ready} aria-label={playing ? t("simulation.pause") : t("simulation.play")}
          onClick={() => (playing ? labRef.current?.pause() : labRef.current?.play())}>{playing ? `⏸ ${t("simulation.pause")}` : `▶ ${t("simulation.play")}`}</button>
        <button type="button" style={button()} disabled={!ready} onClick={() => labRef.current?.reset()}>↺ {t("simulation.reset")}</button>
        <button type="button" style={button()} onClick={onClose}>✕ {t("simulation.close")}</button>
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }} />
          {status === "loading" ? <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 18 }}>{t("simulation.loading")}</div> : null}
          {status === "error" ? <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 18, color: "#9b1c1c" }}>{t("simulation.error")}</div> : null}
          {bodies.length === 0 ? <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 18, padding: 24, textAlign: "center" }}>{t("simulation.empty")}</div> : null}
          {ready ? <div style={{ position: "absolute", left: 12, bottom: 10, right: 12, fontSize: 14, background: "rgba(251,246,236,.9)", border: "1px solid #d9ccb3", borderRadius: 8, padding: "6px 10px" }}>{t("simulation.hint")}</div> : null}
        </div>
        <aside style={{ width: 250, borderLeft: "1px solid #d9ccb3", background: "#fbf6ec", padding: 12, overflowY: "auto" }} aria-label={t("simulation.objects")}>
          <strong>{t("simulation.objects")}</strong>
          <p style={{ fontSize: 13, margin: "4px 0 10px", color: "#6b5a3c" }}>{t("simulation.staticHint")}</p>
          {bodies.map((body) => (
            <label key={body.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", fontSize: 15, borderBottom: "1px solid #eee2c9" }} title={hollow.includes(body.id) ? t("simulation.hollowNote") : undefined}>
              <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 3, background: body.color, border: "1px solid #5b4524", flex: "none" }} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{body.name}{hollow.includes(body.id) ? " ⚠" : ""}</span>
              <input type="checkbox" checked={Boolean(statics[body.id])} disabled={!ready} aria-label={`${t("simulation.static")} : ${body.name}`}
                onChange={(event) => { const value = event.currentTarget.checked; setStatics((s) => ({ ...s, [body.id]: value })); labRef.current?.setStatic(body.id, value); }} />
              <span style={{ fontSize: 13 }}>{t("simulation.static")}</span>
            </label>
          ))}
        </aside>
      </div>
    </div>
  );
}
