/**
 * Interactive knowledge graph (canvas, force-directed).
 * Neo4j Browser / Bloom style explorer: pan, zoom, drag, box-select, expand.
 */
class MemoryGraph {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true });
    this.onSelect = options.onSelect || (() => {});
    this.onFullscreen = options.onFullscreen || null;
    this.nodes = [];
    this.edges = [];
    this.nodeMap = new Map();
    this.adj = new Map();
    this.inc = new Map();
    this.highlightIds = new Set();
    this.selected = new Set();
    this.primaryId = null;
    this.folded = new Set();
    this.focusEdge = null;
    this.offset = { x: 0, y: 0 };
    this.scale = 1;
    this.drag = null;
    this.hoverId = null;
    this.alpha = 0;
    this._raf = 0;
    this._pulse = 0;
    this._autoFit = false;
    this.settings = {
      showNodeLabels: true,
      showEdgeLabels: true,
      nodeScale: 1,
      charge: 1,
    };
    this._cameraDirty = false;
    this._abort = new AbortController();
    this._bind();
    this._buildChrome();
    this.canvas._kg = this;
    this._resize();
  }

  _bind() {
    const signal = this._abort.signal;
    this._onResize = () => this._resize();
    window.addEventListener("resize", this._onResize);
    document.addEventListener("fullscreenchange", this._onResize);

    this.canvas.addEventListener("pointerdown", (e) => this._onDown(e), { signal });
    this.canvas.addEventListener("pointermove", (e) => this._onMove(e), { signal });
    this.canvas.addEventListener("pointerup", (e) => this._onUp(e), { signal });
    this.canvas.addEventListener("pointerleave", () => {
      if (!this.drag && this.hoverId) {
        this.hoverId = null;
        this._paint();
      }
    }, { signal });
    this.canvas.addEventListener("dblclick", (e) => this._onDbl(e), { signal });
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this._zoomAt(e.clientX, e.clientY, factor);
    }, { passive: false, signal });
    this.canvas.style.touchAction = "none";
  }

  _buildChrome() {
    const host = this.canvas.parentElement;
    if (!host) return;
    host.querySelectorAll(".kg-float-tools, .kg-settings, .kg-hint").forEach((el) => el.remove());

    const tools = document.createElement("div");
    tools.className = "kg-float-tools";
    tools.innerHTML = `
      <button type="button" data-act="in" title="放大" aria-label="放大">${this._ico("plus")}</button>
      <button type="button" data-act="out" title="缩小" aria-label="缩小">${this._ico("minus")}</button>
      <button type="button" data-act="fit" title="适应画布" aria-label="适应画布">${this._ico("fit")}</button>
      <button type="button" data-act="reset" title="重置布局" aria-label="重置布局">${this._ico("reset")}</button>
      <button type="button" data-act="fs" title="全屏" aria-label="全屏">${this._ico("fs")}</button>
      <button type="button" data-act="settings" title="图谱设置" aria-label="图谱设置">${this._ico("gear")}</button>`;
    tools.addEventListener("pointerdown", (e) => e.stopPropagation());
    tools.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "in") this.zoomIn();
      else if (act === "out") this.zoomOut();
      else if (act === "fit") this.fit();
      else if (act === "reset") this.resetLayout();
      else if (act === "fs") this._toggleFullscreen();
      else if (act === "settings") this._settingsEl?.classList.toggle("hidden");
    });

    const settings = document.createElement("div");
    settings.className = "kg-settings hidden";
    settings.innerHTML = `
      <h4>图谱设置</h4>
      <label><span>显示节点名称</span><input type="checkbox" data-set="showNodeLabels" checked /></label>
      <label><span>显示关系名称</span><input type="checkbox" data-set="showEdgeLabels" checked /></label>
      <label><span>节点大小</span><input type="range" data-set="nodeScale" min="0.75" max="1.45" step="0.05" value="1" /></label>
      <label><span>节点斥力</span><input type="range" data-set="charge" min="0.6" max="1.8" step="0.05" value="1" /></label>
      <p class="kg-settings-note">Shift + 拖拽框选节点。双击节点展开或收起关联关系。</p>`;
    settings.addEventListener("pointerdown", (e) => e.stopPropagation());
    settings.addEventListener("change", (e) => this._onSetting(e));
    settings.addEventListener("input", (e) => this._onSetting(e));

    const hint = document.createElement("div");
    hint.className = "kg-hint";
    hint.textContent = "滚轮缩放 · 拖拽平移 · 拖动节点 · 双击展开/收起 · Shift 框选";

    host.appendChild(tools);
    host.appendChild(settings);
    host.appendChild(hint);
    this._tools = tools;
    this._settingsEl = settings;
    this._hint = hint;
  }

  _onSetting(e) {
    const key = e.target?.dataset?.set;
    if (!key) return;
    if (e.target.type === "checkbox") this.settings[key] = e.target.checked;
    else this.settings[key] = Number(e.target.value);
    if (key === "nodeScale") this._syncRadius();
    if (key === "charge") {
      this.nodes.forEach((n) => {
        n.pinned = false;
      });
      this._warm(90);
      this._autoFit = true;
      this.alpha = 0.6;
      this._schedule();
    } else {
      this._paint();
    }
  }

  _ico(name) {
    const p = {
      plus: '<path d="M12 5v14M5 12h14"/>',
      minus: '<path d="M5 12h14"/>',
      fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
      reset: '<path d="M4 12a8 8 0 0113.7-5.6M20 12a8 8 0 01-13.7 5.6"/><path d="M16 3v4h-4M8 21v-4h4"/>',
      fs: '<path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4"/>',
      gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
    };
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p[name] || ""}</svg>`;
  }

  destroy() {
    this._abort.abort();
    window.removeEventListener("resize", this._onResize);
    document.removeEventListener("fullscreenchange", this._onResize);
    this._tools?.remove();
    this._settingsEl?.remove();
    this._hint?.remove();
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  _resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w < 2 || h < 2) {
      const tries = (this._resizeTries || 0) + 1;
      this._resizeTries = tries;
      if (tries < 8) {
        cancelAnimationFrame(this._resizeRetry || 0);
        this._resizeRetry = requestAnimationFrame(() => this._resize());
      }
      return;
    }
    this._resizeTries = 0;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
    if (this._pendingGraph) this._applyData(this._pendingGraph, this._pendingHi);
    else this._paint();
  }

  setData(graph, highlightIds = []) {
    this._pendingGraph = graph;
    this._pendingHi = highlightIds;
    if (!this.w) this._resize();
    if (!this.w) return;
    this._applyData(graph, highlightIds);
  }

  _applyData(graph, highlightIds = []) {
    const prev = new Map(this.nodes.map((n) => [n.id, n]));
    const fresh = prev.size === 0;
    const w = this.w || 720;
    const h = this.h || 480;
    this.nodes = (graph?.nodes || []).map((n, i) => {
      const old = prev.get(n.id);
      const count = graph.nodes.length || 1;
      const ang = (i / count) * Math.PI * 2;
      const ring = Math.min(w, h) * 0.28;
      return {
        ...n,
        px: old?.px ?? (n.x != null ? n.x * w : w / 2 + Math.cos(ang) * ring),
        py: old?.py ?? (n.y != null ? n.y * h : h / 2 + Math.sin(ang) * ring),
        vx: 0,
        vy: 0,
        pinned: old?.pinned || false,
        r: 20,
      };
    });
    this.edges = (graph?.edges || []).map((e) => ({ ...e }));
    this.highlightIds = new Set(highlightIds || []);
    this._index();
    this._syncRadius();
    this._pendingGraph = null;
    if (fresh) {
      this._warm(160);
      this.fit();
    }
    this._paint();
  }

  _index() {
    this.nodeMap = new Map(this.nodes.map((n) => [n.id, n]));
    this.adj = new Map();
    this.inc = new Map();
    this.nodes.forEach((n) => {
      this.adj.set(n.id, new Set());
      this.inc.set(n.id, []);
    });
    this.edges.forEach((e) => {
      this.adj.get(e.from)?.add(e.to);
      this.adj.get(e.to)?.add(e.from);
      this.inc.get(e.from)?.push(e);
      this.inc.get(e.to)?.push(e);
    });
  }

  _syncRadius() {
    const s = this.settings.nodeScale || 1;
    this.nodes.forEach((n) => {
      const deg = this.adj.get(n.id)?.size || 0;
      n.r = (11 + Math.min(4, deg * 0.9)) * s;
    });
  }

  setHighlight(ids = []) {
    this.highlightIds = new Set(ids);
    this._paint();
  }

  pulseNew(nodeIds = []) {
    this.setHighlight(nodeIds);
    let t = 0;
    const tick = () => {
      t += 1;
      this._pulse = 0.5 + 0.5 * Math.sin(t / 4);
      this._paint();
      if (t < 36) this._raf = requestAnimationFrame(tick);
      else {
        this._pulse = 0;
        this._raf = 0;
      }
    };
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(tick);
  }

  zoomIn() {
    this._zoomAtCenter(1.18);
  }
  zoomOut() {
    this._zoomAtCenter(0.85);
  }

  _zoomAtCenter(factor) {
    const rect = this.canvas.getBoundingClientRect();
    this._zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  _zoomAt(clientX, clientY, factor) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const next = Math.min(2.8, Math.max(0.22, this.scale * factor));
    const wx = (cx - this.offset.x) / this.scale;
    const wy = (cy - this.offset.y) / this.scale;
    this.scale = next;
    this.offset.x = cx - wx * this.scale;
    this.offset.y = cy - wy * this.scale;
    this._cameraDirty = true;
    this._paint();
  }

  fit() {
    const nodes = this.nodes.filter((n) => this._nodeVisible(n));
    if (!nodes.length || !this.w || !this.h) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    nodes.forEach((n) => {
      const pad = n.r + 46;
      minX = Math.min(minX, n.px - pad);
      minY = Math.min(minY, n.py - pad);
      maxX = Math.max(maxX, n.px + pad);
      maxY = Math.max(maxY, n.py + n.r + 36);
    });
    const bw = Math.max(40, maxX - minX);
    const bh = Math.max(40, maxY - minY);
    const m = 28;
    this.scale = Math.min(1.7, Math.max(0.28, Math.min((this.w - m * 2) / bw, (this.h - m * 2) / bh)));
    this.offset.x = this.w / 2 - ((minX + maxX) / 2) * this.scale;
    this.offset.y = this.h / 2 - ((minY + maxY) / 2) * this.scale;
    this._paint();
  }

  resetLayout() {
    const n = this.nodes.length || 1;
    const cx = (this.w || 640) / 2;
    const cy = (this.h || 420) / 2;
    const ring = Math.min(this.w || 640, this.h || 420) * 0.32;
    this.nodes.forEach((node, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      node.px = cx + Math.cos(a) * ring;
      node.py = cy + Math.sin(a) * ring;
      node.vx = 0;
      node.vy = 0;
      node.pinned = false;
    });
    this.folded.clear();
    this._warm(180);
    this.fit();
  }

  _toggleFullscreen() {
    if (this.onFullscreen) {
      this.onFullscreen();
      return;
    }
    const host = this.canvas.parentElement;
    if (!host) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else host.requestFullscreen?.();
  }

  _warm(steps) {
    const total = steps || 140;
    for (let i = 0; i < total; i++) {
      const t = 1 - i / total;
      this._step(0.25 + 0.75 * t);
    }
    this.nodes.forEach((n) => {
      n.vx = 0;
      n.vy = 0;
    });
    this.alpha = 0;
  }

  _step(alpha) {
    const nodes = this.nodes;
    const n = nodes.length;
    if (n < 2) return;
    const w = this.w || 800;
    const h = this.h || 520;
    const k = Math.sqrt((w * h) / n);
    const charge = 320 * (this.settings.charge || 1);

    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        let dx = a.px - b.px;
        let dy = a.py - b.py;
        let d2 = dx * dx + dy * dy;
        if (d2 < 4) {
          dx = (i - j) * 0.7 || 1;
          dy = (j % 3) - 1 || 1;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        const force = charge / d2;
        const fx = (dx / d) * force;
        const fy = (dy / d) * force;
        if (!a.pinned) {
          a.vx += fx;
          a.vy += fy;
        }
        if (!b.pinned) {
          b.vx -= fx;
          b.vy -= fy;
        }
        const min = a.r + b.r + 32;
        if (d < min) {
          const push = (min - d) * 0.55;
          if (!a.pinned) {
            a.vx += (dx / d) * push;
            a.vy += (dy / d) * push;
          }
          if (!b.pinned) {
            b.vx -= (dx / d) * push;
            b.vy -= (dy / d) * push;
          }
        }
      }
    }

    for (const e of this.edges) {
      const a = this.nodeMap.get(e.from);
      const b = this.nodeMap.get(e.to);
      if (!a || !b) continue;
      const dx = b.px - a.px;
      const dy = b.py - a.py;
      const d = Math.hypot(dx, dy) || 1;
      const rest = Math.max(k * 0.72, a.r + b.r + 78);
      const f = (d - rest) * 0.05;
      if (!a.pinned) {
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
      }
      if (!b.pinned) {
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
    }

    const cx = w / 2;
    const cy = h / 2;
    const maxV = 16;
    for (const a of nodes) {
      if (a.pinned) {
        a.vx = 0;
        a.vy = 0;
        continue;
      }
      a.vx += (cx - a.px) * 0.012;
      a.vy += (cy - a.py) * 0.012;
      a.vx *= 0.7;
      a.vy *= 0.7;
      const sp = Math.hypot(a.vx, a.vy);
      if (sp > maxV) {
        a.vx = (a.vx / sp) * maxV;
        a.vy = (a.vy / sp) * maxV;
      }
      a.px += a.vx * alpha;
      a.py += a.vy * alpha;
    }
  }

  _schedule() {
    if (this._raf) return;
    const loop = () => {
      this._raf = 0;
      if (this.alpha > 0.02) {
        this._step(this.alpha);
        this.alpha *= 0.96;
        if (this._autoFit && this.alpha < 0.08) {
          this._autoFit = false;
          this.fit();
          return;
        }
        this._paint();
        this._schedule();
      }
    };
    this._raf = requestAnimationFrame(loop);
  }

  _nodeVisible(n) {
    if (this.folded.has(n.id)) return true;
    const edges = this.inc.get(n.id);
    if (!edges || !edges.length) return true;
    return edges.some((e) => !this.folded.has(e.from) && !this.folded.has(e.to));
  }

  _edgeVisible(e) {
    return !this.folded.has(e.from) && !this.folded.has(e.to);
  }

  _focusIds() {
    if (this.selected.size) {
      const s = new Set(this.selected);
      this.selected.forEach((id) => {
        this.adj.get(id)?.forEach((nb) => s.add(nb));
      });
      return s;
    }
    if (this.focusEdge) return new Set([this.focusEdge.from, this.focusEdge.to]);
    if (this.highlightIds.size) return this.highlightIds;
    return null;
  }

  _pointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.offset.x) / this.scale,
      y: (e.clientY - rect.top - this.offset.y) / this.scale,
      sx: e.clientX - rect.left,
      sy: e.clientY - rect.top,
    };
  }

  _hit(x, y) {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      if (!this._nodeVisible(n)) continue;
      const dx = x - n.px;
      const dy = y - n.py;
      if (dx * dx + dy * dy <= (n.r + 4) * (n.r + 4)) return n;
    }
    return null;
  }

  _hitEdge(x, y) {
    const thresh = 7 / this.scale;
    let best = null;
    let bestD = thresh;
    for (const e of this.edges) {
      if (!this._edgeVisible(e)) continue;
      const a = this.nodeMap.get(e.from);
      const b = this.nodeMap.get(e.to);
      if (!a || !b || !this._nodeVisible(a) || !this._nodeVisible(b)) continue;
      const d = this._distToSeg(x, y, a.px, a.py, b.px, b.py);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  _distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  _onDown(e) {
    this._settingsEl?.classList.add("hidden");
    const p = this._pointer(e);
    const hit = this._hit(p.x, p.y);
    if (hit) {
      this.drag = {
        id: hit.id,
        ox: p.x - hit.px,
        oy: p.y - hit.py,
        moved: false,
        shift: e.shiftKey,
      };
      hit.pinned = true;
    } else if (e.shiftKey) {
      this.drag = { box: true, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    } else {
      this.drag = { pan: true, sx: e.clientX, sy: e.clientY, ox: this.offset.x, oy: this.offset.y };
    }
    this.canvas.setPointerCapture?.(e.pointerId);
  }

  _onMove(e) {
    const p = this._pointer(e);
    if (this.drag?.id) {
      const n = this.nodeMap.get(this.drag.id);
      if (n) {
        const nx = p.x - this.drag.ox;
        const ny = p.y - this.drag.oy;
        if (Math.hypot(nx - n.px, ny - n.py) > 0.5) this.drag.moved = true;
        n.px = nx;
        n.py = ny;
        n.vx = 0;
        n.vy = 0;
        this._cameraDirty = true;
        this.canvas.style.cursor = "grabbing";
        this._paint();
      }
    } else if (this.drag?.box) {
      this.drag.x1 = p.x;
      this.drag.y1 = p.y;
      this._paint();
    } else if (this.drag?.pan) {
      this.offset.x = this.drag.ox + (e.clientX - this.drag.sx);
      this.offset.y = this.drag.oy + (e.clientY - this.drag.sy);
      this._cameraDirty = true;
      this.canvas.style.cursor = "grabbing";
      this._paint();
    } else {
      const hit = this._hit(p.x, p.y);
      const next = hit?.id || null;
      if (next !== this.hoverId) {
        this.hoverId = next;
        this.canvas.style.cursor = next ? "pointer" : "grab";
        this._paint();
      }
    }
  }

  _onUp(e) {
    const p = this._pointer(e);
    if (this.drag?.id && !this.drag.moved) {
      const n = this.nodeMap.get(this.drag.id);
      if (n) this._selectNode(n, this.drag.shift);
    } else if (this.drag?.box) {
      const x0 = Math.min(this.drag.x0, this.drag.x1);
      const x1 = Math.max(this.drag.x0, this.drag.x1);
      const y0 = Math.min(this.drag.y0, this.drag.y1);
      const y1 = Math.max(this.drag.y0, this.drag.y1);
      const picked = this.nodes.filter(
        (n) => this._nodeVisible(n) && n.px >= x0 && n.px <= x1 && n.py >= y0 && n.py <= y1
      );
      if (Math.hypot(x1 - x0, y1 - y0) > 6) {
        this.focusEdge = null;
        this.selected = new Set(picked.map((n) => n.id));
        this.primaryId = picked[0]?.id || null;
        if (picked[0]) this._emitNode(picked[0]);
        else this._clearSelection();
      }
    } else if (this.drag?.pan) {
      const moved = Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy) > 4;
      if (!moved) {
        const edge = this._hitEdge(p.x, p.y);
        if (edge) this._emitEdge(edge, p);
        else this._clearSelection();
      }
    }
    this.drag = null;
    this.canvas.style.cursor = this.hoverId ? "pointer" : "grab";
    this._paint();
  }

  _onDbl(e) {
    const p = this._pointer(e);
    const hit = this._hit(p.x, p.y);
    if (!hit) return;
    if (this.folded.has(hit.id)) this.folded.delete(hit.id);
    else this.folded.add(hit.id);
    this._paint();
  }

  _selectNode(n, additive) {
    this.focusEdge = null;
    if (additive) {
      if (this.selected.has(n.id)) this.selected.delete(n.id);
      else this.selected.add(n.id);
    } else {
      this.selected = new Set([n.id]);
    }
    this.primaryId = n.id;
    this._emitNode(n);
    this._paint();
  }

  _clearSelection() {
    this.selected.clear();
    this.primaryId = null;
    this.focusEdge = null;
    this.onSelect({ kind: "clear" });
    this._paint();
  }

  _emitNode(n) {
    const rect = this.canvas.getBoundingClientRect();
    this.onSelect({
      kind: "node",
      data: n,
      screen: {
        x: rect.left + n.px * this.scale + this.offset.x,
        y: rect.top + n.py * this.scale + this.offset.y,
        r: n.r * this.scale,
      },
    });
  }

  _emitEdge(edge, p) {
    const rect = this.canvas.getBoundingClientRect();
    this.selected.clear();
    this.primaryId = null;
    this.focusEdge = edge;
    this.onSelect({
      kind: "edge",
      data: edge,
      screen: {
        x: rect.left + p.sx,
        y: rect.top + p.sy,
        r: 8,
      },
    });
    this._paint();
  }

  _cat(n) {
    return n.category || n.type || "其他";
  }

  _glyph(cat) {
    if (cat === "人物" || cat === "用户" || cat === "艺人") return "person";
    if (cat === "地点" || cat === "场馆") return "pin";
    if (cat === "事件") return "star";
    if (cat === "时间") return "clock";
    if (cat === "交通") return "route";
    return "dot";
  }

  _paint() {
    const ctx = this.ctx;
    const w = this.w || this.canvas.clientWidth;
    const h = this.h || this.canvas.clientHeight;
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.fillStyle = "#f7f8fa";
    ctx.fillRect(0, 0, w, h);

    if (!this.nodes.length) {
      ctx.fillStyle = "#86909c";
      ctx.font = "500 13px Inter, 'Noto Sans SC', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("暂无图谱数据", w / 2, h / 2);
      return;
    }

    const focus = this._focusIds();
    const dimming = !!focus;

    ctx.save();
    ctx.translate(this.offset.x, this.offset.y);
    ctx.scale(this.scale, this.scale);

    const visibleEdges = [];
    for (const e of this.edges) {
      if (!this._edgeVisible(e)) continue;
      const a = this.nodeMap.get(e.from);
      const b = this.nodeMap.get(e.to);
      if (!a || !b || !this._nodeVisible(a) || !this._nodeVisible(b)) continue;
      visibleEdges.push(e);
    }

    for (const e of visibleEdges) {
      const a = this.nodeMap.get(e.from);
      const b = this.nodeMap.get(e.to);
      const on = !dimming || (focus.has(e.from) && focus.has(e.to)) || focus.has(e.id);
      const touch = !dimming || focus.has(e.from) || focus.has(e.to);
      ctx.globalAlpha = on ? 1 : touch ? 0.28 : 0.1;
      this._drawEdge(ctx, a, b, e, on);
    }
    ctx.globalAlpha = 1;

    const labels = [];
    for (const n of this.nodes) {
      if (!this._nodeVisible(n)) continue;
      const on = !dimming || focus.has(n.id);
      const selected = this.selected.has(n.id);
      const hover = this.hoverId === n.id;
      ctx.globalAlpha = on ? 1 : 0.16;
      this._drawNode(ctx, n, { selected, hover, on, pulse: selected && this._pulse ? this._pulse : 0 });
      if (this.settings.showNodeLabels && (on || this.scale > 0.85)) {
        labels.push(n);
      }
    }
    ctx.globalAlpha = 1;
    if (this.settings.showNodeLabels) this._drawLabels(ctx, labels, focus, dimming);

    if (this.drag?.box) {
      const x = Math.min(this.drag.x0, this.drag.x1);
      const y = Math.min(this.drag.y0, this.drag.y1);
      const bw = Math.abs(this.drag.x1 - this.drag.x0);
      const bh = Math.abs(this.drag.y1 - this.drag.y0);
      ctx.save();
      ctx.fillStyle = "rgba(0,103,222,0.08)";
      ctx.strokeStyle = "rgba(0,103,222,0.85)";
      ctx.lineWidth = 1 / this.scale;
      ctx.setLineDash([4 / this.scale, 3 / this.scale]);
      ctx.fillRect(x, y, bw, bh);
      ctx.strokeRect(x, y, bw, bh);
      ctx.restore();
    }

    ctx.restore();
  }

  _drawEdge(ctx, a, b, e, emphasized) {
    const dx = b.px - a.px;
    const dy = b.py - a.py;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const sx = a.px + ux * (a.r + 1);
    const sy = a.py + uy * (a.r + 1);
    const ex = b.px - ux * (b.r + 7);
    const ey = b.py - uy * (b.r + 7);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = emphasized ? "rgba(0,103,222,0.85)" : "rgba(134,144,156,0.55)";
    ctx.lineWidth = (emphasized ? 1.8 : 1.15) / Math.max(0.75, Math.min(this.scale, 1.4));
    ctx.stroke();

    const ah = 7;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - ux * ah - uy * 3.2, ey - uy * ah + ux * 3.2);
    ctx.lineTo(ex - ux * ah + uy * 3.2, ey - uy * ah - ux * 3.2);
    ctx.closePath();
    ctx.fillStyle = emphasized ? "#0067de" : "#a0a7b4";
    ctx.fill();

    if (!this.settings.showEdgeLabels) return;
    if (!emphasized && this.scale < 0.72) return;
    const label = e.label || "";
    if (!label) return;
    const mx = (a.px + b.px) / 2;
    const my = (a.py + b.py) / 2;
    ctx.save();
    ctx.font = "500 11px Inter, 'Noto Sans SC', sans-serif";
    const tw = ctx.measureText(label).width;
    const padX = 5;
    const bw = tw + padX * 2;
    const bh = 16;
    ctx.fillStyle = emphasized ? "#ffffff" : "rgba(247,248,250,0.92)";
    ctx.strokeStyle = emphasized ? "rgba(0,103,222,0.35)" : "rgba(229,230,235,0.9)";
    ctx.lineWidth = 1;
    this._roundRect(ctx, mx - bw / 2, my - bh / 2, bw, bh, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = emphasized ? "#0056c0" : "#86909c";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, mx, my + 0.5);
    ctx.restore();
  }

  _drawNode(ctx, n, { selected, hover, pulse }) {
    const r = n.r + (hover ? 1.5 : 0) + (pulse || 0) * 2;
    if (selected || hover) {
      ctx.beginPath();
      ctx.arc(n.px, n.py, r + 7, 0, Math.PI * 2);
      ctx.fillStyle = selected ? "rgba(0,103,222,0.16)" : "rgba(0,103,222,0.08)";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(n.px, n.py, r, 0, Math.PI * 2);
    ctx.fillStyle = n.color || "#0067de";
    ctx.fill();
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeStyle = selected ? "#0067de" : "#ffffff";
    ctx.stroke();
    if (this.folded.has(n.id)) {
      ctx.beginPath();
      ctx.arc(n.px, n.py, r + 4, 0, Math.PI * 2);
      ctx.setLineDash([3, 2]);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(31,35,41,0.45)";
      ctx.stroke();
      ctx.setLineDash([]);
    }
    this._icon(ctx, this._glyph(this._cat(n)), n.px, n.py);
  }

  _drawLabels(ctx, nodes, focus, dimming) {
    const placed = [];
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "600 12px Inter, 'Noto Sans SC', sans-serif";
    for (const n of nodes) {
      const on = !dimming || !focus || focus.has(n.id);
      let text = n.label || "";
      if (text.length > 16) text = text.slice(0, 15) + "…";
      const tw = Math.min(ctx.measureText(text).width, 140);
      let y = n.py + n.r + 8;
      const h = 16;
      for (let i = 0; i < 3; i++) {
        const hit = placed.some(
          (p) => Math.abs(p.x - n.px) < (p.w + tw) / 2 + 6 && Math.abs(p.y - y) < h
        );
        if (!hit) break;
        y += 14;
      }
      placed.push({ x: n.px, y, w: tw });
      ctx.globalAlpha = on ? 1 : 0.2;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(247,248,250,0.94)";
      ctx.strokeText(text, n.px, y);
      ctx.fillStyle = "#1f2329";
      ctx.fillText(text, n.px, y);
    }
    ctx.globalAlpha = 1;
  }

  _icon(ctx, kind, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (kind === "person") {
      ctx.beginPath();
      ctx.arc(0, -3.2, 2.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 7.2, 5.2, Math.PI * 1.08, Math.PI * 1.92);
      ctx.fill();
    } else if (kind === "pin") {
      ctx.beginPath();
      ctx.arc(0, -2, 3.3, 0, Math.PI * 2);
      ctx.moveTo(-3, 0.2);
      ctx.lineTo(0, 7);
      ctx.lineTo(3, 0.2);
      ctx.fill();
    } else if (kind === "star") {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const px = Math.cos(a) * 6;
        const py = Math.sin(a) * 6;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
        const b = a + Math.PI / 5;
        ctx.lineTo(Math.cos(b) * 2.6, Math.sin(b) * 2.6);
      }
      ctx.closePath();
      ctx.fill();
    } else if (kind === "clock") {
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0.4);
      ctx.lineTo(0, -3);
      ctx.moveTo(0, 0.4);
      ctx.lineTo(2.3, 1.6);
      ctx.stroke();
    } else if (kind === "route") {
      ctx.beginPath();
      ctx.moveTo(-5, 2.5);
      ctx.lineTo(0.5, 2.5);
      ctx.lineTo(0.5, -2.5);
      ctx.lineTo(5.5, -2.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(3.2, -4.4);
      ctx.lineTo(5.8, -2.5);
      ctx.lineTo(3.2, -0.6);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}

window.MemoryGraph = MemoryGraph;
