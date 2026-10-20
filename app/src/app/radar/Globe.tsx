"use client";

import { useEffect, useRef, useState } from "react";
import type { BufferAttribute, Texture } from "three";
import { latLonToVector3, latitudeCircle, topoJsonToSegments } from "@/lib/geo";

/**
 * 3D globe.
 *
 * three.js is imported dynamically inside the effect, so the ~600 KB library
 * is only fetched when someone actually opens the radar — the rest of the
 * site never pays for it. All 4,000 aircraft are drawn as a single
 * THREE.Points object, which means one draw call instead of 4,000.
 */

export interface Contact {
  hex: string;
  flight: string;
  country: string;
  lat: number;
  lon: number;
  altKm: number | null;
  speedKt: number | null;
  heading: number | null;
  onGround: boolean;
}

interface Props {
  aircraft: Contact[];
  selected: Contact | null;
  onSelect: (c: Contact | null) => void;
  onReady?: (api: { pick: (x: number, y: number) => Contact | null; reset: () => void; zoom: (d: number) => void }) => void;
}

const R = 1;
/** Altitude exaggeration: real cruise altitude would be invisible at this scale. */
/**
 * Altitude exaggeration. Real cruise altitude is ~11 km on a 6,371 km radius
 * (0.17%), which would be invisible, so we stretch it — but only enough to
 * read as a layer above the surface, not a cloud floating off the planet.
 */
const ALT_SCALE = 1.004;
const ALT_EXAGGERATION = 0.0013;

function altColor(km: number | null): [number, number, number] {
  if (km == null) return [0.58, 0.65, 0.75];
  if (km < 3) return [0.38, 0.65, 0.98];
  if (km < 8) return [0.2, 0.83, 0.6];
  if (km < 11) return [0.98, 0.75, 0.14];
  return [0.96, 0.45, 0.71];
}

export default function Globe({ aircraft, selected, onSelect, onReady }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState("");
  const apiRef = useRef<{
    pick: (x: number, y: number) => Contact | null;
    reset: () => void;
    zoom: (d: number) => void;
  } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      try {
        const THREE = await import("three");
        if (disposed) return;

        const width = mount.clientWidth || 800;
        const height = mount.clientHeight || 520;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
        camera.position.set(0, 0.9, 3.05);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height);
        mount.appendChild(renderer.domElement);

        // Globe group: everything rotates together.
        const globe = new THREE.Group();
        scene.add(globe);

        const loader = new THREE.TextureLoader();
        const loadTexture = (url: string) =>
          new Promise<Texture>((resolve, reject) => {
            loader.load(url, resolve, undefined, () => reject(new Error(`texture ${url} failed`)));
          });

        const [earthTex, atmosTex, topo] = await Promise.all([
          loadTexture("/earth/blue-marble.jpg"),
          loadTexture("/earth/atmosphere.jpg"),
          fetch("/earth/countries-110m.json").then((r) => r.json()),
        ]);
        if (disposed) return;

        earthTex.colorSpace = THREE.SRGBColorSpace;
        earthTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

        // Lighting: a Phong material needs a light, otherwise the Earth
        // renders black. Ambient keeps the night side readable, a directional
        // light gives it a day side, and a rim light picks out the horizon.
        const ambient = new THREE.AmbientLight(0x8fb4e8, 1.15);
        scene.add(ambient);
        const sun = new THREE.DirectionalLight(0xffffff, 2.1);
        sun.position.set(5, 1.5, 4);
        scene.add(sun);
        const rim = new THREE.DirectionalLight(0x6aa8ff, 0.6);
        rim.position.set(-4, -1, -5);
        scene.add(rim);

        const earth = new THREE.Mesh(
          new THREE.SphereGeometry(R, 96, 64),
          new THREE.MeshPhongMaterial({ map: earthTex, shininess: 4, specular: 0x0a1424 }),
        );
        globe.add(earth);

        // Atmosphere: a slightly larger back-faced shell that glows at the rim.
        const atmosphere = new THREE.Mesh(
          new THREE.SphereGeometry(R * 1.035, 64, 48),
          new THREE.MeshBasicMaterial({
            map: atmosTex,
            side: THREE.BackSide,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        globe.add(atmosphere);

        // Country borders, decoded from the vendored TopoJSON.
        const segments = topoJsonToSegments(topo);
        const borderPts: number[] = [];
        for (const seg of segments) {
          for (const p of seg) {
            const v = latLonToVector3(
              (Math.asin(Math.max(-1, Math.min(1, p.y))) * 180) / Math.PI,
              (Math.atan2(p.z, -p.x) * 180) / Math.PI,
              R * 1.001,
            );
            borderPts.push(v.x, v.y, v.z);
          }
        }
        const borderGeom = new THREE.BufferGeometry();
        borderGeom.setAttribute("position", new THREE.Float32BufferAttribute(borderPts, 3));
        globe.add(
          new THREE.LineSegments(
            borderGeom,
            new THREE.LineBasicMaterial({ color: 0x9ec5ff, transparent: true, opacity: 0.22 }),
          ),
        );

        // Equator + tropics.
        for (const lat of [0, 23.44, -23.44]) {
          const pts = latitudeCircle(lat, R * 1.002);
          const arr: number[] = [];
          for (const p of pts) arr.push(p.x, p.y, p.z);
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
          globe.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.3 })));
        }

        // Aircraft as one Points cloud (single draw call for all contacts).
        const positions = new Float32Array(aircraft.length * 3);
        const colors = new Float32Array(aircraft.length * 3);
        for (let i = 0; i < aircraft.length; i++) {
          const c = aircraft[i];
          const radius = R * (c.onGround ? 1.001 : ALT_SCALE + Math.min(0.022, (c.altKm ?? 0) * ALT_EXAGGERATION));
          const v = latLonToVector3(c.lat, c.lon, radius);
          positions[i * 3] = v.x;
          positions[i * 3 + 1] = v.y;
          positions[i * 3 + 2] = v.z;
          const [r, g, b] = altColor(c.altKm);
          colors[i * 3] = r;
          colors[i * 3 + 1] = g;
          colors[i * 3 + 2] = b;
        }
        const pointGeom = new THREE.BufferGeometry();
        pointGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        pointGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        const points = new THREE.Points(
          pointGeom,
          new THREE.PointsMaterial({
            size: 0.016,
            vertexColors: true,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.95,
          }),
        );
        globe.add(points);

        // Selection marker + a drop line to the surface.
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.022, 16, 12),
          new THREE.MeshBasicMaterial({ color: 0xffffff }),
        );
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(0.035, 0.042, 32),
          new THREE.MeshBasicMaterial({ color: 0x1d4ed8, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
        );
        const dropGeom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 0, 0),
        ]);
        const drop = new THREE.Line(dropGeom, new THREE.LineBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.6 }));
        globe.add(marker, halo, drop);
        globe.remove(marker, halo, drop);

        // Starfield: cheap, and it sells the "space" look.
        const starCount = 1200;
        const starPos = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
          const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 20);
          starPos[i * 3] = v.x;
          starPos[i * 3 + 1] = v.y;
          starPos[i * 3 + 2] = v.z;
        }
        const starGeom = new THREE.BufferGeometry();
        starGeom.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
        scene.add(new THREE.Points(starGeom, new THREE.PointsMaterial({ color: 0xcbd5e1, size: 0.35, transparent: true, opacity: 0.6 })));

        // Interaction state.
        let rotX = -0.25;
        let rotY = 0.6;
        let velX = 0;
        let velY = 0.0016;
        let dragging = false;
        let lastX = 0;
        let lastY = 0;
        let camDist = 3.05;
        let camTarget = 3.05;

        const applyRotation = () => {
          globe.rotation.y = rotY;
          globe.rotation.x = Math.max(-1.2, Math.min(1.2, rotX));
        };
        applyRotation();

        const onDown = (e: PointerEvent) => {
          dragging = true;
          lastX = e.clientX;
          lastY = e.clientY;
          renderer.domElement.setPointerCapture(e.pointerId);
        };
        const onMove = (e: PointerEvent) => {
          if (!dragging) return;
          const dx = e.clientX - lastX;
          const dy = e.clientY - lastY;
          lastX = e.clientX;
          lastY = e.clientY;
          rotY += dx * 0.005;
          rotX += dy * 0.005;
          velX = dy * 0.005;
          velY = dx * 0.005;
          applyRotation();
        };
        const onUp = (e: PointerEvent) => {
          dragging = false;
          try {
            renderer.domElement.releasePointerCapture(e.pointerId);
          } catch {
            /* pointer already released */
          }
        };
        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          camTarget = Math.max(1.55, Math.min(5, camTarget + e.deltaY * 0.0016));
        };
        renderer.domElement.addEventListener("pointerdown", onDown);
        renderer.domElement.addEventListener("pointermove", onMove);
        renderer.domElement.addEventListener("pointerup", onUp);
        renderer.domElement.addEventListener("pointercancel", onUp);
        renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

        // Picking: raycast against the aircraft points.
        const raycaster = new THREE.Raycaster();
        raycaster.params.Points = { threshold: 0.02 };
        const pointer = new THREE.Vector2();

        const pick = (clientX: number, clientY: number): Contact | null => {
          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const hits = raycaster.intersectObject(points);
          if (hits.length === 0) return null;
          const idx = hits[0]?.index;
          return idx === undefined ? null : aircraft[idx] ?? null;
        };

        let clickMoved = false;
        let downX = 0;
        let downY = 0;
        const onClick = (e: MouseEvent) => {
          if (Math.abs(e.clientX - downX) > 4 || Math.abs(e.clientY - downY) > 4) return;
          onSelect(pick(e.clientX, e.clientY));
        };
        const onDown2 = (e: MouseEvent) => {
          downX = e.clientX;
          downY = e.clientY;
        };
        renderer.domElement.addEventListener("click", onClick);
        renderer.domElement.addEventListener("pointerdown", onDown2 as unknown as EventListener);

        let raf = 0;
        let last = performance.now();
        const animate = (now: number) => {
          const dt = Math.min((now - last) / 1000, 0.05);
          last = now;
          if (!dragging) {
            rotY += (velY + 0.0016) * dt * 60 * 0.016;
            rotX += velX * dt * 60 * 0.016;
            velX *= 0.94;
            velY *= 0.94;
            applyRotation();
          }
          camDist += (camTarget - camDist) * Math.min(1, dt * 6);
          camera.position.set(0, 0.9, camDist);
          camera.lookAt(0, 0, 0);

          // Selection marker follows the picked aircraft.
          if (selected) {
            const radius = R * (selected.onGround ? 1.001 : ALT_SCALE + Math.min(0.022, (selected.altKm ?? 0) * ALT_EXAGGERATION));
            const v = latLonToVector3(selected.lat, selected.lon, radius);
            marker.position.set(v.x, v.y, v.z);
            halo.position.set(v.x, v.y, v.z);
            halo.lookAt(camera.position);
            const ground = latLonToVector3(selected.lat, selected.lon, R * 1.002);
            const attr = dropGeom.getAttribute("position") as BufferAttribute;
            attr.setXYZ(0, v.x, v.y, v.z);
            attr.setXYZ(1, ground.x, ground.y, ground.z);
            attr.needsUpdate = true;
            marker.visible = true;
            halo.visible = true;
            drop.visible = true;
            const pulse = 1 + Math.sin(now / 260) * 0.18;
            halo.scale.setScalar(pulse);
          } else {
            marker.visible = false;
            halo.visible = false;
            drop.visible = false;
          }

          renderer.render(scene, camera);
          raf = requestAnimationFrame(animate);
        };
        raf = requestAnimationFrame(animate);

        apiRef.current = {
          pick,
          reset: () => {
            rotX = -0.25;
            rotY = 0.6;
            camTarget = 3.05;
            applyRotation();
          },
          zoom: (d: number) => {
            camTarget = Math.max(1.55, Math.min(5, camTarget + d));
          },
        };
        setReady(true);
        onReady?.(apiRef.current!);

        cleanup = () => {
          cancelAnimationFrame(raf);
          renderer.domElement.removeEventListener("pointerdown", onDown);
          renderer.domElement.removeEventListener("pointermove", onMove);
          renderer.domElement.removeEventListener("pointerup", onUp);
          renderer.domElement.removeEventListener("pointercancel", onUp);
          renderer.domElement.removeEventListener("wheel", onWheel);
          renderer.domElement.removeEventListener("click", onClick);
          renderer.domElement.removeEventListener("pointerdown", onDown2 as unknown as EventListener);
          scene.traverse((obj) => {
            const mesh = obj as unknown as { geometry?: { dispose?: () => void }; material?: { dispose?: () => void } };
            mesh.geometry?.dispose?.();
            if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose?.());
            else mesh.material?.dispose?.();
          });
          renderer.dispose();
          if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
        };
      } catch (err) {
        setFailed(err instanceof Error ? err.message : "3D view unavailable.");
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aircraft, selected]);

  return (
    <div className="globe-host">
      <div ref={mountRef} className="globe-canvas" />
      {!ready && failed === "" && (
        <div className="globe-loading">
          <div className="shimmer" style={{ height: 8, width: 180, borderRadius: 4 }} />
          <span className="muted mono" style={{ fontSize: 12 }}>Loading 3D globe…</span>
        </div>
      )}
      {failed !== "" && (
        <div className="globe-fallback">
          <p className="muted">3D view unavailable ({failed}).</p>
        </div>
      )}
    </div>
  );
}
