// Ricochet Ink — sitedeki mürekkep animasyonları.
// Oyunun kopyası değil, fikrinin hareketli anlatımı: serbest duran duvarlardan seken bir mürekkep
// topu, çarptığı duvarı boyar ve damlatır, kendi rengindeki küpleri ancak ilk sekmeden sonra kırar.
// Her yol elle çizilir (P0 … Pn). Duvarlar köşe noktalarında yansımaya göre yerleştirilir,
// böylece her sekiş fiziksel olarak doğru açıda görünür.

(() => {
  const INK = { cyan: '#39f3ff', magenta: '#ff2bd6', amber: '#ffb703' };
  const R = 8;          // top yarıçapı
  const BAR_T = 10;     // duvar kalınlığı
  const SPEED = 430;    // px/sn (mantıksal)
  const HIT = 22;       // top-küp temas mesafesi
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // Her açılışta aynı görünsün diye sabit tohumlu rastgele.
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  // ---------- sahneler ----------
  // path: köşe noktaları; ilk ve son nokta genelde tuval dışında.
  // endOnWall: son noktada o renge boyalı bir duvara çarpıp atış biter.
  // shared: bütün denemelerin duvarları her denemede görünür.
  const SCENES = {
    hero: {
      w: 560, h: 600, bar: 112,
      cycles: [
        { color: 'cyan', path: [[-40, 420], [170, 556], [470, 360], [250, 80], [610, 172]], cubes: [[320, 458], [360, 220], [430, 127]] },
        { color: 'magenta', path: [[620, 470], [430, 556], [90, 330], [300, 62], [-40, 200]], cubes: [[260, 443], [195, 196], [130, 131]] },
        { color: 'amber', path: [[300, -40], [120, 250], [460, 470], [520, 130], [250, 640]], cubes: [[290, 360], [490, 300], [400, 360]] },
      ],
    },
    bounce: {
      w: 320, h: 320, bar: 96,
      cycles: [{ color: 'cyan', path: [[150, 360], [175, 44], [195, 360]], cubes: [[165, 180]] }],
    },
    paint: {
      w: 320, h: 320, bar: 84,
      cycles: [{ color: 'magenta', path: [[-30, 250], [110, 296], [288, 170], [170, 34], [-30, 178]], cubes: [[229, 102], [90, 92]] }],
    },
    plan: {
      w: 320, h: 320, bar: 84, shared: true,
      cycles: [
        { color: 'cyan', path: [[160, 350], [60, 200], [200, 40]], endOnWall: 'amber', cubes: [[120, 87]] },
        { color: 'cyan', path: [[160, 350], [270, 190], [-20, -10]], cubes: [[120, 87]] },
      ],
    },
  };

  // ---------- kurulum ----------
  function wallsFor(cycle, barLen, rand) {
    const p = cycle.path;
    const walls = [];
    const last = cycle.endOnWall ? p.length - 1 : p.length - 2;
    for (let i = 1; i <= last; i++) {
      const din = norm(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      let n;
      if (i < p.length - 1) {
        const dout = norm(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
        n = norm(dout[0] - din[0], dout[1] - din[1]);
      } else {
        n = [-din[0], -din[1]];
      }
      const off = R + BAR_T / 2;
      walls.push({
        vertex: i,
        cx: p[i][0] - n[0] * off, cy: p[i][1] - n[1] * off,
        nx: n[0], ny: n[1], tx: -n[1], ty: n[0],
        len: barLen,
        prepaint: cycle.endOnWall && i === p.length - 1 ? INK[cycle.endOnWall] : null,
        drips: [0, 1, 2].map(() => ({ u: (rand() - 0.5) * 0.7, max: 8 + rand() * 22, w: 2.5 + rand() * 2.5 })),
      });
    }
    return walls;
  }

  function prepare(def) {
    const rand = rng(def.w * 31 + def.h);
    def.cycles.forEach((c) => {
      c.ink = INK[c.color];
      c.walls = wallsFor(c, def.bar, rand);
      c.seg = [];
      c.total = 0;
      for (let i = 1; i < c.path.length; i++) {
        const l = Math.hypot(c.path[i][0] - c.path[i - 1][0], c.path[i][1] - c.path[i - 1][1]);
        c.seg.push(l);
        c.total += l;
      }
    });
    const all = def.cycles.flatMap((c) => c.walls);
    def.cycles.forEach((c) => { c.shown = def.shared ? all : c.walls; });
  }

  // ---------- oynatıcı ----------
  class Player {
    constructor(canvas, def) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.def = def;
      this.rand = rng(def.w + 7);
      this.visible = false;
      this.cycleIndex = 0;
      this.startCycle();
      this.resize();
    }

    startCycle() {
      const c = this.def.cycles[this.cycleIndex];
      this.cycle = c;
      this.t = 0;
      this.clock = 0;
      this.phase = 'in';
      this.dist = 0;
      this.vertex = 0;
      this.ball = null;
      this.trail = [];
      this.shards = [];
      this.splats = [];
      this.marks = [];
      this.cubes = c.cubes.map(([x, y]) => ({ x, y, dead: false, wobble: 0, touched: false }));
      for (const w of c.shown) {
        w.color = w.prepaint;
        w.paintAt = w.prepaint ? -10 : null;
        w.flash = 0;
      }
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
      this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
      this.scale = (rect.width * dpr) / this.def.w;
    }

    pointAt(d) {
      const c = this.cycle;
      let acc = 0;
      for (let i = 0; i < c.seg.length; i++) {
        if (d <= acc + c.seg[i] || i === c.seg.length - 1) {
          const k = Math.min(1, (d - acc) / c.seg[i]);
          const a = c.path[i], b = c.path[i + 1];
          return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k };
        }
        acc += c.seg[i];
      }
      return null;
    }

    splat(x, y, color, size) {
      const blobs = [{ dx: 0, dy: 0, r: size }];
      const n = 4 + Math.floor(this.rand() * 4);
      for (let i = 0; i < n; i++) {
        const a = this.rand() * Math.PI * 2;
        const d = size * (1 + this.rand() * 1.4);
        blobs.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: 1.2 + this.rand() * size * 0.35 });
      }
      this.splats.push({ x, y, color, blobs, born: this.clock });
    }

    hitWall(w) {
      const c = this.cycle;
      w.flash = 1;
      if (w.color) {
        // boyalı duvar: atış biter
        this.splat(this.ball.x, this.ball.y, c.ink, 7);
        this.marks.push({ x: this.ball.x + w.nx * 24, y: this.ball.y + w.ny * 24, born: this.clock });
        this.ball = null;
        this.phase = 'linger';
        this.t = 0;
        return;
      }
      w.color = c.ink;
      w.paintAt = this.clock;
      this.splat(this.ball.x - w.nx * 2, this.ball.y - w.ny * 2, c.ink, 7);
    }

    shatter(q, color) {
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], i) => {
        const a = Math.atan2(dy, dx) + (this.rand() - 0.5) * 0.6;
        const v = 120 + this.rand() * 90;
        this.shards.push({ x: q.x + dx * 4, y: q.y + dy * 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, rot: (i * Math.PI) / 2, vr: (this.rand() - 0.5) * 9, life: 1, color, s: 11 });
      });
      this.splat(q.x, q.y, color, 12);
    }

    update(dt) {
      this.t += dt;
      this.clock += dt;
      const c = this.cycle;
      for (const w of c.shown) w.flash = Math.max(0, w.flash - dt * 3);
      for (const q of this.cubes) q.wobble = Math.max(0, q.wobble - dt * 2.2);
      for (const s of this.shards) {
        s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 260 * dt;
        s.rot += s.vr * dt; s.life -= dt * 1.3;
      }
      this.shards = this.shards.filter((s) => s.life > 0);

      if (this.phase === 'in' && this.t > 0.7) {
        this.phase = 'run';
        this.t = 0;
      } else if (this.phase === 'run') {
        this.dist = Math.min(c.total, this.dist + SPEED * dt);
        const p = this.pointAt(this.dist);
        this.ball = { x: p.x, y: p.y };
        this.trail.push({ x: p.x, y: p.y, at: this.clock });

        // köşeye ulaşıldıysa duvara çarptı
        let reach = 0;
        for (let i = 0; i <= this.vertex && i < c.seg.length; i++) reach += c.seg[i];
        while (this.vertex < c.path.length - 1 && this.dist + 0.01 >= reach) {
          this.vertex++;
          const w = c.walls.find((x) => x.vertex === this.vertex);
          if (w) {
            this.ball = { x: c.path[this.vertex][0], y: c.path[this.vertex][1] };
            this.hitWall(w);
            if (this.phase !== 'run') return;
          }
          reach += c.seg[this.vertex] || Infinity;
        }

        // küpler: ilk sekmeden önce yalnızca sallanır
        for (const q of this.cubes) {
          if (q.dead) continue;
          if (Math.hypot(this.ball.x - q.x, this.ball.y - q.y) >= HIT) { q.touched = false; continue; }
          if (this.vertex >= 1) {
            q.dead = true;
            this.shatter(q, c.ink);
          } else if (!q.touched) {
            q.touched = true;
            q.wobble = 1;
          }
        }

        if (this.dist >= c.total) {
          this.ball = null;
          this.phase = 'linger';
          this.t = 0;
        }
      } else if (this.phase === 'linger' && this.t > 1.4) {
        this.phase = 'out';
        this.t = 0;
      } else if (this.phase === 'out' && this.t > 0.6) {
        this.cycleIndex = (this.cycleIndex + 1) % this.def.cycles.length;
        this.startCycle();
      }
    }

    // ---------- çizim ----------
    render() {
      const ctx = this.ctx;
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      ctx.clearRect(0, 0, this.def.w, this.def.h);
      const alpha = this.phase === 'out' ? 1 - ease(this.t / 0.6) : 1;
      const grow = this.phase === 'in' ? ease(this.t / 0.6) : 1;
      ctx.globalAlpha = alpha;
      this.drawTrail(ctx);
      for (const wl of this.cycle.shown) this.drawWall(ctx, wl, grow);
      for (const s of this.splats) this.drawSplat(ctx, s);
      for (const q of this.cubes) if (!q.dead) this.drawCube(ctx, q, grow);
      for (const s of this.shards) this.drawShard(ctx, s);
      for (const m of this.marks) this.drawMark(ctx, m);
      if (this.ball) this.drawBall(ctx, this.ball);
      ctx.globalAlpha = 1;
    }

    drawTrail(ctx) {
      const tr = this.trail;
      ctx.lineCap = 'round';
      for (let i = 1; i < tr.length; i++) {
        const a = Math.max(0, 1 - (this.clock - tr[i].at) / 3.2);
        if (a <= 0) continue;
        ctx.strokeStyle = rgba(this.cycle.ink, a * 0.85);
        ctx.lineWidth = 2.5 + a * 3;
        ctx.beginPath();
        ctx.moveTo(tr[i - 1].x, tr[i - 1].y);
        ctx.lineTo(tr[i].x, tr[i].y);
        ctx.stroke();
      }
    }

    drawWall(ctx, wl, grow) {
      const half = (wl.len / 2) * grow;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(214,206,255,0.3)';
      ctx.lineWidth = BAR_T;
      ctx.beginPath();
      ctx.moveTo(wl.cx - wl.tx * half, wl.cy - wl.ty * half);
      ctx.lineTo(wl.cx + wl.tx * half, wl.cy + wl.ty * half);
      ctx.stroke();
      if (!wl.color) return;

      const age = this.clock - wl.paintAt;
      const spread = Math.min(half, ease(age / 0.35) * wl.len / 2);

      // damlalar duvarın aşağı bakan kenarından sarkar
      const down = wl.ny > 0 ? 1 : -1;
      const ex = wl.nx * down * (BAR_T / 2 - 1), ey = wl.ny * down * (BAR_T / 2 - 1);
      const dripGrow = ease((age - 0.15) / 1.4);
      ctx.fillStyle = wl.color;
      ctx.strokeStyle = wl.color;
      for (const d of wl.drips) {
        if (Math.abs(d.u) * wl.len > spread - 2) continue;
        const L = d.max * dripGrow;
        if (L < 1) continue;
        const bx = wl.cx + wl.tx * d.u * wl.len + ex;
        const by = wl.cy + wl.ty * d.u * wl.len + ey;
        ctx.lineWidth = d.w;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + L); ctx.stroke();
        ctx.beginPath(); ctx.arc(bx, by + L, d.w * 0.8, 0, Math.PI * 2); ctx.fill();
      }

      // boya temas noktasından dışa yayılır
      ctx.lineWidth = BAR_T;
      ctx.beginPath();
      ctx.moveTo(wl.cx - wl.tx * spread, wl.cy - wl.ty * spread);
      ctx.lineTo(wl.cx + wl.tx * spread, wl.cy + wl.ty * spread);
      ctx.stroke();

      if (wl.flash > 0) {
        ctx.strokeStyle = `rgba(255,255,255,${wl.flash * 0.7})`;
        ctx.lineWidth = BAR_T * 0.4;
        ctx.beginPath();
        ctx.moveTo(wl.cx - wl.tx * spread, wl.cy - wl.ty * spread);
        ctx.lineTo(wl.cx + wl.tx * spread, wl.cy + wl.ty * spread);
        ctx.stroke();
      }
    }

    drawSplat(ctx, s) {
      const k = ease((this.clock - s.born) / 0.18);
      ctx.fillStyle = s.color;
      for (const b of s.blobs) {
        ctx.beginPath();
        ctx.arc(s.x + b.dx * k, s.y + b.dy * k, Math.max(0.1, b.r * k), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawCube(ctx, q, grow) {
      const col = this.cycle.ink;
      const s = 11 * grow;
      const wob = Math.sin(q.wobble * 18) * q.wobble * 0.35;
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(Math.PI / 4 + wob);
      ctx.fillStyle = rgba(col, 0.14 + q.wobble * 0.25);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-s, -s, s * 2, s * 2, 3);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    drawShard(ctx, s) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.globalAlpha *= Math.max(0, s.life);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(0, -s.s * 0.9);
      ctx.lineTo(s.s * 0.7, 0);
      ctx.lineTo(-s.s * 0.7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawMark(ctx, m) {
      const a = ease((this.clock - m.born) / 0.2);
      const s = 7;
      ctx.strokeStyle = `rgba(236,232,255,${0.9 * a})`;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(m.x - s, m.y - s); ctx.lineTo(m.x + s, m.y + s);
      ctx.moveTo(m.x + s, m.y - s); ctx.lineTo(m.x - s, m.y + s);
      ctx.stroke();
    }

    drawBall(ctx, b) {
      const col = this.cycle.ink;
      ctx.fillStyle = rgba(col, 0.18);
      ctx.beginPath(); ctx.arc(b.x, b.y, R * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(b.x - 2.5, b.y - 2.5, 2.4, 0, Math.PI * 2); ctx.fill();
    }

    // hareket azaltma: son denemenin bitmiş hâli, sabit
    renderStatic() {
      this.cycleIndex = this.def.cycles.length - 1;
      this.startCycle();
      let guard = 0;
      while (this.phase !== 'linger' && guard++ < 3000) this.update(1 / 60);
      this.clock += 2;
      this.render();
    }
  }

  // ---------- başlat ----------
  function init() {
    Object.values(SCENES).forEach(prepare);
    const players = [];
    document.querySelectorAll('canvas[data-scene]').forEach((canvas) => {
      const def = SCENES[canvas.dataset.scene];
      if (!def) return;
      const p = new Player(canvas, def);
      players.push(p);
      if (reduceMotion) p.renderStatic();
      else p.render();
    });
    // Konsoldan kare kare denemek için: RicochetInk.advance(1.5)
    window.RicochetInk = {
      advance(seconds) {
        for (let t = 0; t < seconds; t += 1 / 60) players.forEach((p) => p.update(1 / 60));
        players.forEach((p) => p.render());
        return players.map((p) => `${p.canvas.dataset.scene}:${p.cycleIndex}/${p.phase}`);
      },
    };
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
