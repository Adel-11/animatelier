// QFF quiz à 3 niveaux, 1080x1920 (Reels 9:16), couleurs du logo
const fs = require("fs");
const metrics = JSON.parse(fs.readFileSync("/home/claude/animatelier/assets/fonts/metrics.json", "utf8"));
const measure = (t, size, bold) => {
  const f = metrics[bold ? "DejaVuSans-Bold" : "DejaVuSans"];
  return Array.from(t).reduce((s, c) => s + (f.advances[String(c.codePointAt(0))] ?? f.missing), 0) * size;
};
const wrap = (t, size, width, bold) => {
  const out = []; let line = "";
  for (const w of t.split(/\s+/)) {
    const cand = line ? line + " " + w : w;
    if (measure(cand, size, bold) <= width) { line = cand; continue; }
    if (line) out.push(line);
    line = w;
  }
  if (line) out.push(line);
  return out;
};
const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const OUT = process.argv[3];
const C = { bg: "#07275F", panel: "#0F3678", track: "#1B478F", text: "#FDF8E3", muted: "#B7C3E6", accent: "#FECD1B" };
const LV = [
  { key: "ROOKIE", color: "#3DDC97", sub: "Warm-up time" },
  { key: "MASTER", color: "#FF8A3D", sub: "Getting harder..." },
  { key: "GOAT", color: "#FF4D6D", sub: "Only legends survive" },
];
const W = 1080, H = 1920, CX = 540, M = 50;
const COUNT = 4, ANS = 2.4, INTRO = 6.5, CARD = 2.2, OUTRO = 7;
const readTime = q => Math.min(4.5, Math.max(3.5, Math.round((2 + q.length / 20) * 2) / 2));
const base = (id, end, extra) => ({ id, x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, z: 0, anchor: { x: 0, y: 0 }, keyframes: {}, start: 0, end, ...extra });
const rect = (id, end, x, y, w, h, fill, radius = 0, extra = {}) => base(id, end, { type: "rect", x, y, w, h, fill, stroke: "none", strokeWidth: 2, radius, ...extra });
const text = (id, end, x, y, t, fontSize, color, bold = true, extra = {}) => base(id, end, { type: "text", x, y, text: t, fontSize, color, align: "center", bold, progress: 0, ...extra });
const fadeIn = (t0, d = 0.3) => ({ opacity: [{ t: t0, v: 0 }, { t: t0 + d, v: 1, ease: "easeOut" }] });
const pop = (t0) => ({ ...fadeIn(t0, 0.25), scale: [{ t: t0, v: 0.8 }, { t: t0 + 0.35, v: 1, ease: "easeOut" }] });
const block = (id, end, cy, t, size, color, bold, maxW, extra = {}) => {
  const lines = wrap(t, size, maxW, bold), lh = size * 1.2;
  const y = cy - ((lines.length - 1) * lh) / 2 + size * 0.35;
  return text(id, end, CX, y, lines.join("\n"), size, color, bold, extra);
};
// pastille avec texte centré
const pill = (id, end, cx, cy, label, size, fill, color, padX, h, extra = {}) => {
  const w = Math.ceil(measure(label, size, true)) + 2 * padX;
  return [rect(id + "_bg", end, cx - w / 2, cy - h / 2, w, h, fill, h / 2, extra), text(id, end, cx, cy + size * 0.35, label, size, color, true, extra)];
};
// barres de progression par niveau ; done = nb de questions terminées au total, revealAt = instant où la question courante se remplit
const bars = (end, done, cur, revealAt) => {
  const els = [], bw = 300, gap = 40, sg = 8, sw = (bw - 4 * sg) / 5, y = 400;
  LV.forEach((lv, l) => {
    const x0 = M + l * (bw + gap);
    for (let s = 0; s < 5; s++) {
      const idx = l * 5 + s, x = x0 + s * (sw + sg);
      const filled = idx < done;
      els.push(rect(`bar_${l}_${s}`, end, x, y, sw, 22, filled ? lv.color : C.track, 11));
      if (idx === cur) {
        els.push(rect(`bar_cur_${l}_${s}`, end, x, y, sw, 22, C.text, 11, { keyframes: { opacity: [{ t: 0, v: 0.9 }, { t: revealAt, v: 0.9 }, { t: revealAt + 0.01, v: 0 }] } }));
        els.push(rect(`bar_fill_${l}_${s}`, end, x, y, sw, 22, lv.color, 11, { keyframes: { opacity: [{ t: 0, v: 0 }, { t: revealAt, v: 0 }, { t: revealAt + 0.3, v: 1 }] } }));
      }
    }
    const active = Math.floor(Math.max(cur, done - 1) / 5) >= l || cur < 0 && done === 0 && l === 0;
    els.push(text(`bar_lbl_${l}`, end, x0 + bw / 2, y + 68, lv.key, 28, lv.color, true, { opacity: active ? 1 : 0.4 }));
  });
  return els;
};
const header = (end, lvl, qLabel) => [
  ...pill("lvl", end, 650, 220, `LEVEL ${lvl + 1} · ${LV[lvl].key}`, 44, LV[lvl].color, C.bg, 40, 84),
  text("qnum", end, 650, 330, qLabel, 36, C.muted, true),
];
const scenes = [], marks = [];
let T = 0;
// Intro : le logo est incrusté par ffmpeg de 0 à 3 s
{
  const d = INTRO, e = [rect("bg", d, 0, 0, W, H, C.bg)];
  e.push(text("i1", d, CX, 560, "15 QUESTIONS", 110, C.text, true, { keyframes: pop(3.1) }));
  e.push(text("i2", d, CX, 700, "3 LEVELS", 90, C.accent, true, { keyframes: pop(3.4) }));
  LV.forEach((lv, l) => e.push(...pill(`i_lv${l}`, d, CX, 850 + l * 130, lv.key, 56, lv.color, C.bg, 70, 104, { keyframes: pop(3.8 + l * 0.35) })));
  e.push(text("i6", d, CX, 1330, "How far can you go?", 58, C.text, true, { keyframes: fadeIn(5.1) }));
  scenes.push({ id: "intro", name: "Intro", duration: d, background: "studio", title: "", actors: [], elements: e });
  marks.push({ type: "intro", s: 0, end: d }); T += d;
}
let qi = 0;
spec.levels.forEach((level, l) => {
  // carte de niveau
  {
    const d = CARD, e = [rect("bg", d, 0, 0, W, H, C.bg), ...bars(d, qi, -1, 0)];
    e.push(text("c1", d, CX, 760, `LEVEL ${l + 1}`, 90, C.text, true, { keyframes: fadeIn(0.05) }));
    e.push(text("c2", d, CX, 960, LV[l].key, 200, LV[l].color, true, { anchor: { x: 0, y: -70 }, keyframes: pop(0.2) }));
    e.push(text("c3", d, CX, 1100, LV[l].sub, 50, C.muted, false, { keyframes: fadeIn(0.6) }));
    scenes.push({ id: `level${l + 1}`, name: `Level ${l + 1}`, duration: d, background: "studio", title: "", actors: [], elements: e });
    marks.push({ type: "level", level: l, s: T, end: T + d }); T += d;
  }
  level.questions.forEach(({ q, a }) => {
    const R = readTime(q), T1 = R, T2 = R + COUNT, d = T2 + ANS;
    const qSize = wrap(q, 70, 880, true).length > 4 ? 60 : 70;
    const e = [rect("bg", d, 0, 0, W, H, C.bg), ...header(d, l, `QUESTION ${qi + 1} OF 15`), ...bars(d, qi, qi, T2),
      rect("qpanel", d, M, 530, W - 2 * M, 500, C.panel, 36)];
    e.push(block("question", d, 780, q, qSize, C.text, true, 880, { keyframes: {
      blur: [{ t: 0, v: 0 }, { t: T1, v: 0 }, { t: T1 + 0.4, v: 16, ease: "easeInOut" }, { t: T2, v: 16 }, { t: T2 + 0.4, v: 0, ease: "easeInOut" }],
      opacity: [{ t: 0, v: 1 }, { t: T1, v: 1 }, { t: T1 + 0.4, v: 0.55 }, { t: T2, v: 0.55 }, { t: T2 + 0.4, v: 1 }] } }));
    const cy = 1290, r = 150;
    const circle = `M ${CX} ${cy - r} A ${r} ${r} 0 1 1 ${CX} ${cy + r} A ${r} ${r} 0 1 1 ${CX} ${cy - r}`;
    const cdOp = { opacity: [{ t: T1, v: 0 }, { t: T1 + 0.25, v: 1 }, { t: T2 - 0.05, v: 1 }, { t: T2 + 0.2, v: 0 }] };
    e.push(base("cd_track", d, { type: "path", d: circle, fill: "none", stroke: C.track, strokeWidth: 22, draw: 1, start: T1, end: T2 + 0.2, keyframes: cdOp }));
    e.push(base("cd_ring", d, { type: "path", d: circle, fill: "none", stroke: C.accent, strokeWidth: 22, draw: 1, start: T1, end: T2 + 0.2,
      keyframes: { draw: [{ t: T1, v: 1 }, { t: T2, v: 0 }], ...cdOp } }));
    for (let n = COUNT; n >= 1; n--) {
      const s = T1 + (COUNT - n);
      e.push(text(`cd_${n}`, s + 1, CX, cy + 60, String(n), 170, C.text, true, { start: s, anchor: { x: 0, y: -60 },
        keyframes: { scale: [{ t: s, v: 1.4 }, { t: s + 0.35, v: 1, ease: "easeOut" }], opacity: [{ t: s, v: 0 }, { t: s + 0.15, v: 1 }, { t: s + 0.85, v: 1 }, { t: s + 1, v: 0.2 }] } }));
    }
    const aSize = measure(a, 96, true) > 760 ? 72 : 96;
    const aLines = wrap(a, aSize, 760, true), alh = aSize * 1.2;
    const ay = -((aLines.length - 1) * alh) / 2 + aSize * 0.35 + 40;
    e.push(base("answer", d, { type: "group", start: T2, x: CX, y: 1280, anchor: { x: 0, y: 0 },
      keyframes: { opacity: [{ t: T2, v: 0 }, { t: T2 + 0.3, v: 1, ease: "easeOut" }], scale: [{ t: T2, v: 0.85 }, { t: T2 + 0.4, v: 1, ease: "easeOut" }] }, children: [
      rect("ans_panel", d, -430, -190, 860, 380, LV[l].color, 42, { start: T2 }),
      text("ans_label", d, 0, -100, "ANSWER", 42, C.bg, true, { start: T2 }),
      text("ans_text", d, 0, ay, aLines.join("\n"), aSize, C.bg, true, { start: T2 }),
    ] }));
    scenes.push({ id: `q${qi + 1}`, name: `Question ${qi + 1}`, duration: d, background: "studio", title: "", actors: [], elements: e });
    marks.push({ type: "q", n: qi + 1, level: l, q, a, s: T, cd: T + T1, ans: T + T2, end: T + d }); T += d; qi++;
  });
});
{
  const d = OUTRO, e = [rect("bg", d, 0, 0, W, H, C.bg)];
  e.push(block("o1", d, 520, "What's your score?", 92, C.text, true, 900, { keyframes: fadeIn(0) }));
  const tiers = ["0-5 · ROOKIE", "6-10 · MASTER", "11-15 · GOAT"];
  tiers.forEach((t, l) => e.push(...pill(`o_t${l}`, d, CX, 740 + l * 135, t, 54, LV[l].color, C.bg, 60, 104, { keyframes: pop(0.7 + l * 0.35) })));
  e.push(text("o5", d, CX, 1200, "Drop it in the comments!", 58, C.text, true, { keyframes: fadeIn(2.4) }));
  e.push(text("o6", d, CX, 1300, "Follow Quiz Factory Forever", 48, C.accent, true, { keyframes: fadeIn(3.2) }));
  e.push(text("o7", d, CX, 1370, "for more quizzes", 40, C.muted, false, { keyframes: fadeIn(3.5) }));
  scenes.push({ id: "outro", name: "Outro", duration: d, background: "studio", title: "", actors: [], elements: e });
  marks.push({ type: "outro", s: T, end: T + d }); T += d;
}
const project = { schemaVersion: 2, id: spec.id, name: spec.name, width: W, height: H, fps: 30, fontFamily: "DejaVu Sans", scenes };
fs.writeFileSync(OUT, JSON.stringify(project));
fs.writeFileSync(OUT.replace(/\.json$/, ".marks.json"), JSON.stringify({ duration: T, intro: INTRO, marks }, null, 1));
console.log("duration", T.toFixed(2), "scenes", scenes.length);
