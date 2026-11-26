// Ricochet Ink — sitedeki küçük oyun sahneleri.
// Oyundaki kuralların sadeleştirilmiş kopyası: top duvardan seker, çarptığı duvarı kendi
// rengine boyar, boyalı duvara çarparsa atış biter, küp ancak ilk sekmeden sonra kırılır.
// Atış açıları sahnelerde sabit (deg). Sahne değişirse deg'i silin: çözücü açıyı bulur,
// RicochetInk.check() konsolda yeni açıyı yazar, sonra onu deg olarak geri koyun.

(() => {
  const INK = { cyan: '#39f3ff', magenta: '#ff2bd6', amber: '#ffb703' };
  const SPEED = 560;
  const STEP = 1 / 60;
  const SUB = 4;
  const R = 7;
  const LETHAL = 6;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- geometri ----------
  function seg(ax, ay, bx, by, kind) {
    return { ax, ay, bx, by, kind, painted: null, flash: 0 };
  }

  function rim(points, pieces) {
    const walls = [];
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % points.length];
      const n = pieces[i % pieces.length];
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        walls.push(seg(ax + (bx - ax) * t0, ay + (by - ay) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1, 'rim'));
      }
    }
    return walls;
  }

  function block(cx, cy, w, h, rot) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
    const walls = pts.map((p, i) => seg(p[0], p[1], pts[(i + 1) % 4][0], pts[(i + 1) % 4][1], 'block'));
    return { pts, walls };
  }

  function closest(px, py, w) {
    const dx = w.bx - w.ax, dy = w.by - w.ay;
    const len2 = dx * dx + dy * dy;
    let t = ((px - w.ax) * dx + (py - w.ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return [w.ax + dx * t, w.ay + dy * t];
  }

  // ---------- simülasyon ----------
  function buildState(def) {
    const blocks = (def.blocks || []).map((b) => block(...b));
    const walls = rim(def.rim, def.pieces).concat(...blocks.map((b) => b.walls));
    (def.prepaint || []).forEach(([i, color]) => { walls[i].painted = INK[color]; });
    return {
      walls,
      blocks,
      cubes: def.cubes.map(([x, y, key]) => ({ x, y, key, color: INK[key], dead: false, pulse: 0 })),
      ball: null,
      particles: [],
    };
  }

  function cloneState(s) {
    return {
      walls: s.walls.map((w) => ({ ...w })),
      blocks: s.blocks,
      cubes: s.cubes.map((c) => ({ ...c })),
      ball: null,
      particles: [],
    };
  }

  function launch(state, start, angle, color) {
    state.ball = {
      x: start[0], y: start[1],
      vx: Math.cos(angle) * SPEED, vy: Math.sin(angle) * SPEED,
      color, bounces: 0, alive: true, end: null, broken: 0, trail: [],
    };
  }

  function burst(state, x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const v = speed * (0.4 + Math.random() * 0.6);
      state.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color, size: 2 + Math.random() * 2.5 });
    }
  }

  // Bir kare ilerlet. fx=false iken parçacık yok (çözücü için).
  function step(state, fx) {
    const b = state.ball;
    if (!b || !b.alive) return;
    for (let sub = 0; sub < SUB && b.alive; sub++) {
      b.x += (b.vx * STEP) / SUB;
      b.y += (b.vy * STEP) / SUB;

      for (const w of state.walls) {
        const [qx, qy] = closest(b.x, b.y, w);
        const dx = b.x - qx, dy = b.y - qy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= R * R) continue;
        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d, ny = dy / d;
        const into = b.vx * nx + b.vy * ny;
        if (into >= 0) continue;
        b.vx -= 2 * into * nx;
        b.vy -= 2 * into * ny;
        b.x = qx + nx * R;
        b.y = qy + ny * R;
        b.bounces++;
        const remaining = state.cubes.some((c) => !c.dead && c.color === b.color);
        if (w.painted) {
          if (remaining) { b.alive = false; b.end = 'painted'; w.flash = 1; }
        } else {
          w.painted = b.color;
          w.flash = 1;
          if (fx) {
            w.splat = { x: qx, y: qy, r: 4 + Math.random() * 3 };
            burst(state, qx, qy, b.color, 5, 90);
          }
          if (remaining && b.bounces >= LETHAL) { b.alive = false; b.end = 'spent'; }
        }
        if (!b.alive && fx) burst(state, b.x, b.y, b.color, 18, 200);
        break;
      }
      if (!b.alive) break;

      for (const c of state.cubes) {
        if (c.dead) continue;
        const dx = b.x - c.x, dy = b.y - c.y;
        if (dx * dx + dy * dy > (R + 9) * (R + 9)) continue;
        if (b.bounces >= 1 && c.color === b.color) {
          c.dead = true;
          b.broken++;
          if (fx) burst(state, c.x, c.y, c.color, 16, 220);
        } else {
          c.pulse = Math.max(c.pulse, 0.6);
        }
      }
      if (!state.cubes.some((c) => !c.dead && c.color === b.color)) {
        b.alive = false;
        b.end = 'cleared';
        if (fx) burst(state, b.x, b.y, b.color, 22, 240);
      }
    }
  }

  function simulate(state, start, angle, color) {
    const s = cloneState(state);
    launch(s, start, angle, color);
    let frames = 0;
    while (s.ball.alive && frames < 900) { step(s, false); frames++; }
    return { state: s, ball: s.ball, frames };
  }

  // En iyi açıyı bul. mode: 'clear' (bütün küpler) ya da 'fail' (boyalı duvara çarpar).
  function solve(state, start, color, mode) {
    let best = null;
    for (let deg = 0; deg < 360; deg += 0.5) {
      const a = (deg * Math.PI) / 180;
      const r = simulate(state, start, a, color);
      let score;
      if (mode === 'fail') {
        if (r.ball.end !== 'painted' || r.ball.broken > 0 || r.ball.bounces < 2) continue;
        score = r.ball.bounces * 10 - Math.abs(r.ball.bounces - 3) * 30;
      } else {
        score = r.ball.broken * 1000 + (r.ball.end === 'cleared' ? 500 : 0) + Math.min(r.ball.bounces, 4) * 40 - r.frames * 0.05;
      }
      if (!best || score > best.score) best = { score, angle: a, result: r };
    }
    return best;
  }

  // ---------- sahneler ----------
  const square = [[64, 20], [256, 20], [300, 64], [300, 256], [256, 300], [64, 300], [20, 256], [20, 64]];
  const squarePieces = [4, 1, 4, 1, 4, 1, 4, 1];

  const SCENES = {
    hero: {
      w: 360, h: 600, hud: true,
      rim: [[112, 76], [248, 76], [324, 168], [324, 488], [248, 580], [112, 580], [36, 488], [36, 168]],
      pieces: [4, 3, 7, 3, 4, 3, 7, 3],
      blocks: [
        [124, 228, 26, 58, 0.62], [236, 228, 26, 58, -0.62],
        [100, 336, 22, 64, 0], [260, 336, 22, 64, 0],
        [130, 450, 26, 52, -0.62], [230, 450, 26, 52, 0.62],
      ],
      cubes: [[96, 168, 'cyan'], [264, 420, 'cyan'], [180, 528, 'magenta'], [292, 260, 'magenta'], [72, 420, 'amber'], [180, 132, 'amber']],
      start: [180, 336],
      shots: [{ color: 'cyan', deg: 316 }, { color: 'magenta', deg: 38 }, { color: 'amber', deg: 40 }],
    },
    bounce: {
      w: 320, h: 320,
      rim: square, pieces: squarePieces,
      cubes: [[160, 132, 'cyan']],
      start: [160, 252],
      shots: [{ color: 'cyan', deg: -90 }],
    },
    paint: {
      w: 320, h: 320,
      rim: square, pieces: squarePieces,
      blocks: [[160, 160, 22, 70, Math.PI / 4]],
      cubes: [[84, 92, 'magenta'], [240, 220, 'magenta']],
      start: [104, 236],
      shots: [{ color: 'magenta', deg: 119 }],
    },
    plan: {
      w: 320, h: 320,
      rim: square, pieces: squarePieces,
      blocks: [[160, 150, 70, 20, 0]],
      prepaint: [[5, 'amber'], [6, 'amber'], [7, 'amber'], [8, 'amber'], [9, 'amber'], [10, 'amber']],
      cubes: [[160, 76, 'cyan']],
      start: [160, 240],
      shots: [{ color: 'cyan', mode: 'fail', deg: 73.5 }, { color: 'cyan', deg: 117.5 }],
    },
  };

  // Atış açılarını sahne durumunu koruyarak sırayla çöz.
  function plan(def) {
    let state = buildState(def);
    return def.shots.map((shot) => {
      let angle = shot.deg === undefined ? undefined : (shot.deg * Math.PI) / 180;
      let result;
      if (angle === undefined) {
        const best = solve(state, def.start, INK[shot.color], shot.mode || 'clear');
        angle = best ? best.angle : -Math.PI / 2;
        result = best ? best.result : simulate(state, def.start, angle, INK[shot.color]);
      } else {
        result = simulate(state, def.start, angle, INK[shot.color]);
      }
      if (shot.mode !== 'fail') state = result.state;
      return { color: INK[shot.color], angle, mode: shot.mode };
    });
  }

  // ---------- çizim ----------
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function draw(ctx, def, state, view) {
    const { w, h } = def;
    ctx.clearRect(0, 0, w, h);

    // zemin ızgarası, yalnız arenanın içinde
    ctx.save();
    ctx.beginPath();
    def.rim.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = '#07060d';
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(190,180,255,0.045)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 24) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
    ctx.restore();

    // engeller
    for (const b of state.blocks) {
      ctx.beginPath();
      b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = '#1b1730';
      ctx.fill();
    }

    // duvarlar
    ctx.lineCap = 'round';
    for (const wl of state.walls) {
      const dx = wl.bx - wl.ax, dy = wl.by - wl.ay;
      const len = Math.hypot(dx, dy);
      const gap = wl.kind === 'rim' ? Math.min(2.5, len * 0.1) : 0;
      const ux = (dx / len) * gap, uy = (dy / len) * gap;
      ctx.beginPath();
      ctx.moveTo(wl.ax + ux, wl.ay + uy);
      ctx.lineTo(wl.bx - ux, wl.by - uy);
      if (wl.painted) {
        ctx.strokeStyle = wl.painted;
        ctx.lineWidth = wl.kind === 'rim' ? 5 : 3;
        ctx.shadowColor = wl.painted;
        ctx.shadowBlur = 10 + wl.flash * 18;
      } else {
        ctx.strokeStyle = wl.kind === 'rim' ? 'rgba(196,186,255,0.62)' : 'rgba(196,186,255,0.4)';
        ctx.lineWidth = wl.kind === 'rim' ? 4 : 2;
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
      if (wl.flash > 0 && wl.painted && state.ball && state.ball.end === 'painted' && wl.flash > 0.5) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      if (wl.splat) {
        ctx.fillStyle = hexA(wl.painted, 0.9);
        ctx.beginPath();
        ctx.arc(wl.splat.x, wl.splat.y, wl.splat.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // küpler
    for (const c of state.cubes) {
      if (c.dead) continue;
      const col = c.color;
      const s = 9 * (1 + c.pulse * 0.25);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(Math.PI / 4);
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.fillStyle = hexA(col, 0.16 + c.pulse * 0.3);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-s, -s, s * 2, s * 2, 3);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = col;
      ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();
    }

    // atış önizlemesi ve sapan
    if (view.aim) {
      const { start, angle, color, t } = view.aim;
      const pull = Math.min(1, t * 1.6);
      ctx.save();
      ctx.globalAlpha = pull;
      view.preview.forEach(([x, y], i) => {
        ctx.fillStyle = hexA(color, 0.75 * (1 - i / view.preview.length));
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
      const px = start[0] - Math.cos(angle) * 46 * pull;
      const py = start[1] - Math.sin(angle) * 46 * pull;
      ctx.strokeStyle = 'rgba(236,232,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(start[0], start[1]);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(236,232,255,0.7)';
      ctx.beginPath();
      ctx.arc(px, py, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // top ve izi
    const b = state.ball || view.idle;
    if (b && (b.alive === undefined || b.alive)) {
      (b.trail || []).forEach(([x, y], i, arr) => {
        ctx.fillStyle = hexA(b.color, (i / arr.length) * 0.35);
        ctx.beginPath();
        ctx.arc(x, y, R * (0.4 + (i / arr.length) * 0.5), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(b.x - 2, b.y - 2, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // parçacıklar
    for (const p of state.particles) {
      ctx.fillStyle = hexA(p.color, p.life);
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }

    if (def.hud) drawHud(ctx, def, state, view);
  }

  function drawHud(ctx, def, state, view) {
    ctx.save();
    ctx.font = '600 15px Oxanium, sans-serif';
    ctx.fillStyle = 'rgba(236,232,255,0.9)';
    ctx.textBaseline = 'middle';
    ctx.fillText('LV 17', 36, 36);

    // sekme hakkı
    const used = state.ball ? Math.min(state.ball.bounces, 5) : 0;
    const color = view.current;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < 5 - used ? color : 'rgba(236,232,255,0.14)';
      ctx.beginPath();
      ctx.roundRect(140 + i * 17, 33, 13, 5, 2.5);
      ctx.fill();
    }

    // mürekkepler
    ['cyan', 'magenta', 'amber'].forEach((k, i) => {
      const left = state.cubes.some((c) => c.key === k && !c.dead);
      const active = INK[k] === color;
      ctx.fillStyle = left ? INK[k] : 'rgba(236,232,255,0.14)';
      ctx.beginPath();
      ctx.arc(284 + i * 16, 36, active ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // ---------- oynatıcı ----------
  function tracePreview(state, start, angle, color) {
    const s = cloneState(state);
    launch(s, start, angle, color);
    const pts = [];
    for (let f = 0; f < 70 && s.ball.alive; f++) {
      step(s, false);
      if (f % 3 === 0) pts.push([s.ball.x, s.ball.y]);
      if (s.ball.bounces >= 2) break;
    }
    return pts;
  }

  class Player {
    constructor(canvas, def) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.def = def;
      this.shots = plan(def);
      this.visible = false;
      this.reset();
      this.resize();
    }

    reset() {
      this.state = buildState(this.def);
      this.shotIndex = 0;
      this.beginAim();
    }

    beginAim() {
      const shot = this.shots[this.shotIndex];
      this.phase = 'aim';
      this.t = 0;
      this.state.ball = null;
      this.snapshot = shot.mode === 'fail' ? cloneState(this.state) : null;
      this.preview = tracePreview(this.state, this.def.start, shot.angle, shot.color);
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(rect.width * dpr);
      this.canvas.height = Math.round(rect.height * dpr);
      this.scale = (rect.width * dpr) / this.def.w;
    }

    update(dt) {
      const shot = this.shots[this.shotIndex];
      this.t += dt;
      const st = this.state;

      for (const w of st.walls) w.flash = Math.max(0, w.flash - dt * 2.5);
      for (const c of st.cubes) c.pulse = Math.max(0, c.pulse - dt * 2);
      for (const p of st.particles) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.94; p.vy *= 0.94;
        p.life -= dt * 1.6;
      }
      st.particles = st.particles.filter((p) => p.life > 0);

      if (this.phase === 'aim' && this.t > 1.2) {
        launch(st, this.def.start, shot.angle, shot.color);
        this.phase = 'fly';
        this.t = 0;
        this.acc = 0;
      } else if (this.phase === 'fly') {
        this.acc += dt;
        while (this.acc >= STEP && st.ball.alive) {
          step(st, true);
          st.ball.trail.push([st.ball.x, st.ball.y]);
          if (st.ball.trail.length > 10) st.ball.trail.shift();
          this.acc -= STEP;
        }
        if (!st.ball.alive || this.t > 15) { this.phase = 'end'; this.t = 0; }
      } else if (this.phase === 'end' && this.t > 1.1) {
        // başarısız atış gösterimden sonra geri alınır, bölüm yeniden denenir
        if (shot.mode === 'fail' && this.snapshot) this.state = cloneState(this.snapshot);
        this.shotIndex++;
        if (this.shotIndex >= this.shots.length) {
          this.phase = 'hold';
          this.t = 0;
        } else {
          this.beginAim();
        }
      } else if (this.phase === 'hold' && this.t > 1.6) {
        this.reset();
      }
    }

    render() {
      const ctx = this.ctx;
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      const shot = this.shots[Math.min(this.shotIndex, this.shots.length - 1)];
      const view = { current: shot.color, preview: this.preview || [] };
      if (this.phase === 'aim') {
        view.aim = { start: this.def.start, angle: shot.angle, color: shot.color, t: this.t };
        view.idle = { x: this.def.start[0], y: this.def.start[1], color: shot.color };
      }
      let fade = 1;
      if (this.phase === 'hold') fade = Math.max(0, 1 - Math.max(0, this.t - 1.1) / 0.5);
      if (this.phase === 'aim' && this.shotIndex === 0) fade = Math.min(1, this.t / 0.4);
      ctx.globalAlpha = fade;
      draw(ctx, this.def, this.state, view);
      ctx.globalAlpha = 1;
    }

    // hareket azaltma: bütün atışları anında oynat, son kareyi bırak
    renderStatic() {
      for (const shot of this.shots) {
        if (shot.mode === 'fail') continue;
        launch(this.state, this.def.start, shot.angle, shot.color);
        let f = 0;
        while (this.state.ball.alive && f < 900) { step(this.state, false); f++; }
      }
      this.state.ball = null;
      this.phase = 'static';
      const last = this.shots[this.shots.length - 1];
      const ctx = this.ctx;
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      draw(ctx, this.def, this.state, { current: last.color, preview: [], idle: { x: this.def.start[0], y: this.def.start[1], color: last.color } });
    }
  }

  // Sahne çözümlerini konsoldan denetlemek için: RicochetInk.check()
  window.RicochetInk = {
    check() {
      return Object.entries(SCENES).map(([name, def]) => {
        let state = buildState(def);
        const shots = plan(def).map((shot) => {
          const r = simulate(state, def.start, shot.angle, shot.color);
          if (shot.mode !== 'fail') state = r.state;
          return `${shot.mode || 'clear'}@${((shot.angle * 180) / Math.PI).toFixed(1)}:${r.ball.end}/${r.ball.bounces}b/${r.ball.broken}k`;
        });
        return `${name} ${shots.join(' ')} left=${state.cubes.filter((c) => !c.dead).length}`;
      });
    },
  };

  // ---------- başlat ----------
  function init() {
    const players = [];
    document.querySelectorAll('canvas[data-scene]').forEach((canvas) => {
      const def = SCENES[canvas.dataset.scene];
      if (!def) return;
      const p = new Player(canvas, def);
      players.push(p);
      if (reduceMotion) p.renderStatic();
      else p.render();
    });
    if (reduceMotion) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const p = players.find((x) => x.canvas === e.target);
        if (p) p.visible = e.isIntersecting;
      });
    }, { threshold: 0.15 });
    players.forEach((p) => io.observe(p.canvas));

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const p of players) {
        if (!p.visible) continue;
        p.update(dt);
        p.render();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => players.forEach((p) => { p.resize(); p.render(); }), 120);
    });
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(init);
  else window.addEventListener('load', init);
})();
