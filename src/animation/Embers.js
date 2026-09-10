import { frontV } from './noise.js';

/**
 * Embers — a small particle system on a 2D canvas that covers the stage.
 *
 * Particle kinds:
 *   spark   — tiny, hot, fast; detaches from the burn front
 *   ember   — a glowing fragment of paper, slower, drifts and wobbles
 *   ash     — dark flake, rises gently
 *   ambient — dim, slow sparks drifting up around the paper in idle
 *   rest    — a resting ember on the ground line; pulses, then fades (afterglow)
 *
 * Also paints a soft glow halo under the burn front so the black background
 * picks up light from the fire.
 */

const rand = (a, b) => a + Math.random() * (b - a);

export class Embers {
  #canvas; #ctx;
  #w = 0; #h = 0; #scale = 1;
  #particles = [];
  #max = 260;
  #ambient = false;
  #ambientRate = 2;
  #ambientAcc = 0;
  #ambientRect = null;
  #glow = null; // { x, y, w, intensity }

  constructor(canvas) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d');
  }

  get count() { return this.#particles.length; }
  get isBusy() { return this.#particles.length > 0 || this.#glow !== null; }

  setBudget(max, ambientRate) { this.#max = max; this.#ambientRate = ambientRate; }

  /** Resize the backing store. w,h in stage CSS px; scale = dpr × preview scale. */
  resize(w, h, scale) {
    this.#w = w; this.#h = h; this.#scale = scale;
    this.#canvas.width = Math.max(1, Math.round(w * scale));
    this.#canvas.height = Math.max(1, Math.round(h * scale));
    this.#ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  /** Enable/disable the idle ambience. rect = paper rect in stage px. */
  setAmbient(on, rect = null) {
    this.#ambient = on;
    this.#ambientRect = rect ?? this.#ambientRect;
    if (on) {
      // pre-seed so idle doesn't start empty
      for (let i = 0; i < 6; i++) this.#spawnAmbient(true);
    }
  }

  /**
   * Emit particles from the burn front.
   * rect = paper rect (stage px), threshold = current shader threshold, aspect, seed.
   * dt in seconds. rates scale with budget.
   */
  emitFromFront(rect, threshold, aspect, seed, dt, strength = 1) {
    if (!(rect.w > 0 && rect.h > 0) || !Number.isFinite(aspect)) return;
    const budget = this.#max / 260;
    const sparkN = 110 * dt * strength * budget;
    const emberN = 7 * dt * strength * budget;
    const ashN = 22 * dt * strength * budget;

    const emit = (count, kind) => {
      let n = Math.floor(count) + (Math.random() < count % 1 ? 1 : 0);
      let attempts = n * 3;
      while (n > 0 && attempts-- > 0 && this.#particles.length < this.#max) {
        const u = Math.random();
        const v = frontV(u, threshold, aspect, seed);
        if (v === null) continue;
        const x = rect.x + u * rect.w;
        const y = rect.y + (1 - v) * rect.h;
        this.#spawn(kind, x, y);
        n--;
      }
    };
    emit(sparkN, 'spark');
    emit(emberN, 'ember');
    emit(ashN, 'ash');

    // glow halo: average front height across the sheet
    let sum = 0, k = 0;
    for (let i = 0; i < 9; i++) {
      const v = frontV((i + 0.5) / 9, threshold, aspect, seed);
      if (v !== null) { sum += v; k++; }
    }
    if (k > 0) {
      const v = sum / k;
      this.#glow = { x: rect.x + rect.w / 2, y: rect.y + (1 - v) * rect.h, w: rect.w, intensity: Math.min(1, strength * (k / 9) * 1.2) };
    } else if (this.#glow) {
      this.#glow.intensity *= 0.9;
      if (this.#glow.intensity < 0.02) this.#glow = null;
    }
  }

  /** Resting embers along where the paper was; they pulse and fade over `life` seconds. */
  linger(rect, life = 1.6) {
    const budget = Math.round(14 * (this.#max / 260));
    for (let i = 0; i < budget; i++) {
      const x = rect.x + rand(0.05, 0.95) * rect.w;
      const y = rect.y + rect.h * rand(0.55, 1.0);
      this.#particles.push({
        kind: 'rest', x, y, vx: 0, vy: 0,
        r: rand(1.2, 2.8), age: 0, life: life * rand(0.6, 1.1), phase: rand(0, 6.28), heat: rand(0.6, 1),
      });
    }
    // a few last sparks lifting off
    for (let i = 0; i < Math.round(budget / 2); i++) {
      this.#spawn('spark', rect.x + rand(0.1, 0.9) * rect.w, rect.y + rect.h * rand(0.6, 1.0));
    }
    this.#glow = { x: rect.x + rect.w / 2, y: rect.y + rect.h * 0.85, w: rect.w, intensity: 0.7, decay: true };
  }

  clear() {
    this.#particles.length = 0;
    this.#glow = null;
    this.#ctx.clearRect(0, 0, this.#w, this.#h);
  }

  update(dt) {
    if (this.#ambient && this.#ambientRect) {
      this.#ambientAcc += dt * this.#ambientRate;
      while (this.#ambientAcc >= 1) { this.#ambientAcc -= 1; this.#spawnAmbient(false); }
    }
    const ps = this.#particles;
    let write = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const t = p.age / p.life;
      switch (p.kind) {
        case 'spark':
          p.vy -= 60 * dt;
          p.vx += Math.sin(p.age * 12 + p.phase) * 40 * dt;
          p.vx *= 0.985; p.vy *= 0.99;
          break;
        case 'ember':
          p.vy -= 22 * dt;
          p.vx += Math.sin(p.age * 3.5 + p.phase) * 26 * dt;
          p.vx *= 0.99;
          break;
        case 'ash':
          p.vy -= 10 * dt;
          p.vx += Math.sin(p.age * 2.2 + p.phase) * 18 * dt;
          p.vx *= 0.99;
          break;
        case 'ambient':
          p.vx += Math.sin(p.age * 0.9 + p.phase) * 4 * dt;
          break;
        case 'rest':
          break;
        default:
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y < -20 || p.x < -20 || p.x > this.#w + 20) continue;
      ps[write++] = p;
    }
    ps.length = write;

    if (this.#glow?.decay) {
      this.#glow.intensity -= dt * 0.55;
      if (this.#glow.intensity <= 0) this.#glow = null;
    }
  }

  render() {
    const ctx = this.#ctx;
    ctx.clearRect(0, 0, this.#w, this.#h);

    if (this.#glow) {
      const g = this.#glow;
      const flick = 0.85 + 0.15 * Math.sin(performance.now() / 70);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(g.x, g.y);
      ctx.scale(1, 0.42);
      const rad = g.w * 0.75;
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
      grad.addColorStop(0, `rgba(255, 130, 40, ${0.28 * g.intensity * flick})`);
      grad.addColorStop(0.45, `rgba(255, 90, 20, ${0.10 * g.intensity * flick})`);
      grad.addColorStop(1, 'rgba(255, 70, 10, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
      ctx.restore();
    }

    ctx.save();
    for (const p of this.#particles) {
      const t = p.age / p.life;
      switch (p.kind) {
        case 'ash': {
          ctx.globalCompositeOperation = 'source-over';
          const a = 0.55 * (1 - t) * Math.min(1, p.age * 6);
          ctx.fillStyle = `rgba(28, 20, 16, ${a})`;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.r * 1.3, p.r * 0.8, p.phase + p.age, 0, 6.283);
          ctx.fill();
          // faint ember rim on fresh ash
          if (t < 0.35) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(255, 90, 20, ${0.35 * (1 - t / 0.35)})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.5, 0, 6.283); ctx.fill();
          }
          break;
        }
        case 'rest': {
          ctx.globalCompositeOperation = 'lighter';
          const pulse = 0.55 + 0.45 * Math.sin(p.age * 5 + p.phase);
          const a = (1 - t) * (1 - t) * pulse * p.heat;
          this.#dot(ctx, p.x, p.y, p.r, a, 0.55 + 0.45 * pulse);
          break;
        }
        case 'ambient': {
          ctx.globalCompositeOperation = 'lighter';
          const env = Math.sin(Math.PI * t); // fade in and out
          this.#dot(ctx, p.x, p.y, p.r, 0.55 * env * p.heat, 0.15);
          break;
        }
        default: {
          ctx.globalCompositeOperation = 'lighter';
          const a = (1 - t) * (1 - t);
          const heat = p.kind === 'ember' ? 0.7 - 0.6 * t : 1 - t;
          this.#dot(ctx, p.x, p.y, p.r * (p.kind === 'ember' ? 1 - 0.4 * t : 1 - 0.7 * t), a, heat);
        }
      }
    }
    ctx.restore();
  }

  /** Glowing dot. heat 1 = white-yellow, 0 = deep red. */
  #dot(ctx, x, y, r, alpha, heat) {
    if (!(alpha > 0.005) || !(r > 0.1) || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const R = 255;
    const G = Math.round(60 + 160 * heat);
    const B = Math.round(10 + 90 * Math.max(0, heat - 0.5) * 2);
    ctx.fillStyle = `rgba(${R}, ${G}, ${B}, ${alpha})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    // halo
    const hr = r * 3.2;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, hr);
    grad.addColorStop(0, `rgba(${R}, ${Math.round(G * 0.8)}, ${Math.round(B * 0.5)}, ${alpha * 0.45})`);
    grad.addColorStop(1, `rgba(${R}, 80, 10, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, hr, 0, 6.283); ctx.fill();
  }

  #spawn(kind, x, y) {
    if (this.#particles.length >= this.#max) return;
    const base = { kind, x, y, age: 0, phase: rand(0, 6.28), heat: 1 };
    switch (kind) {
      case 'spark':
        this.#particles.push({ ...base, vx: rand(-28, 28), vy: rand(-70, -18), r: rand(0.7, 1.9), life: rand(0.45, 1.3) });
        break;
      case 'ember':
        this.#particles.push({ ...base, vx: rand(-14, 14), vy: rand(-26, -4), r: rand(1.6, 3.2), life: rand(1.2, 2.3) });
        break;
      case 'ash':
        this.#particles.push({ ...base, vx: rand(-10, 10), vy: rand(-22, -6), r: rand(1.4, 3.4), life: rand(1.4, 2.6) });
        break;
      default:
    }
  }

  #spawnAmbient(preseed) {
    if (!this.#ambientRect || this.#particles.length >= this.#max) return;
    const r = this.#ambientRect;
    const x = r.x + rand(-0.35, 1.35) * r.w;
    const y = preseed ? rand(r.y + r.h * 0.4, this.#h) : rand(r.y + r.h * 0.9, this.#h + 10);
    const life = rand(3.5, 7);
    this.#particles.push({
      kind: 'ambient', x, y, vx: rand(-4, 4), vy: rand(-16, -6), r: rand(0.8, 1.8),
      age: preseed ? rand(0, life * 0.6) : 0, life, phase: rand(0, 6.28), heat: rand(0.5, 1),
    });
  }
}
