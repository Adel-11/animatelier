import { z } from "zod";
import { newElement, identifier, type SceneElement } from "./elements";
import { parseProject } from "./schema";
import { resolveTheme, themeInputSchema } from "./themes";
import { measureText, wrapText } from "./text";
import { emojiOnly, emojiRow } from "./emoji";
import type { CompileOptions, QuizEvent, VoiceSlot } from "./levels";

// Mode « odd » : trouve l'intrus. Les choix sont disposés en cercle autour d'un
// minuteur ; à la révélation les autres disparaissent, l'intrus vient au centre
// en rouge et l'explication s'affiche. Même habillage que le mode stack.
const label = z.string().trim().min(1).max(240);
const media = z.string().regex(/^(asset:[a-zA-Z0-9_-]+|file:[^\\:]+)$/);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const isMedia = (value: string) => /^(asset:|file:)/.test(value);
const extraElements = z
  .array(
    z
      .object({
        id: identifier,
        type: z.enum(["rect", "text", "image", "ellipse", "line", "path", "group"]),
      })
      .passthrough(),
  )
  .max(50)
  .optional();
const layout = z.record(
  z
    .object({
      x: z.number().finite().min(0).max(1).optional(),
      y: z.number().finite().min(0).max(1).optional(),
      w: z.number().finite().min(0.02).max(1).optional(),
      h: z.number().finite().min(0.02).max(1).optional(),
      fontSize: z.number().finite().min(8).max(250).optional(),
      color: hex.optional(),
      fill: hex.optional(),
      visible: z.boolean().optional(),
    })
    .strict(),
);
const choice = z.union([media, z.string().trim().min(1).max(60)]);
export const oddSchema = z
  .object({
    mode: z.literal("odd"),
    preset: z.literal("qff-odd").optional(),
    title: label.default("TROUVE L'INTRUS"),
    theme: themeInputSchema.optional(),
    language: z.enum(["fr", "en"]).default("fr"),
    bannerColor: hex.default("#C51E2A"),
    oddColor: hex.default("#FF3B5C"),
    // Mélange déterministe des choix : l'intrus ne tombe pas toujours au même endroit du cercle.
    shuffle: z.boolean().default(true),
    seed: z.number().int().min(0).max(1_000_000).default(0),
    background: z
      .object({
        images: z.array(media).min(1).max(15),
        blur: z.number().finite().min(0).max(50).default(16),
        dim: z.number().finite().min(0).max(1).default(0.5),
        motion: z.enum(["in", "out", "pingpong"]).default("pingpong"),
        zoom: z.number().finite().min(1).max(2).default(1.12),
      })
      .strict()
      .optional(),
    loopFade: z.boolean().default(true),
    layout: layout.optional(),
    timing: z
      .object({
        show: z.number().min(0.3).max(10).default(1),
        think: z.number().min(0).max(30).default(0),
        countdown: z.number().min(0).max(10).default(3),
        reveal: z.number().min(1.5).max(10).default(2.5),
        endHold: z.number().min(1).max(30).default(3),
      })
      .strict()
      .default({}),
    end: z
      .object({ text: label.default("Combien en as-tu trouvé ?"), say: label.optional() })
      .strict()
      .default({}),
    assets: z.record(z.unknown()).optional(),
    items: z
      .array(
        z
          .object({
            q: label.optional(),
            choices: z.array(choice).min(3).max(6),
            correctIndex: z.number().int().min(0).max(5).optional(),
            a: label.optional(),
            explanation: label.optional(),
            think: z.number().finite().min(0).max(30).optional(),
            say: label.optional(),
            sayAnswer: label.optional(),
            layout: layout.optional(),
            elements: extraElements,
          })
          .strict()
          .superRefine((item, ctx) => {
            const index =
              item.correctIndex ??
              (item.a === undefined ? -1 : item.choices.indexOf(item.a));
            if (index < 0 || index >= item.choices.length)
              ctx.addIssue({
                code: "custom",
                path: ["correctIndex"],
                message: "Indiquer l'intrus : correctIndex valide, ou a égal à un des choix.",
              });
          }),
      )
      .min(3)
      .max(15),
    sequence: z
      .array(
        z
          .object({
            after: z.string().min(1).max(100),
            id: identifier,
            duration: z.number().finite().min(1).max(120),
            elements: extraElements,
            say: label.optional(),
            showList: z.boolean().default(true),
          })
          .strict(),
      )
      .max(40)
      .optional(),
  })
  .strict();

export function compileOdd(input: unknown, baseTheme?: unknown, options: CompileOptions = {}) {
  const parsed = oddSchema.parse(input);
  const s = parsed.shuffle ? { ...parsed, items: parsed.items.map((item, i) => shuffleItem(item, parsed.seed, i)) } : parsed;
  const theme = resolveTheme(
    typeof s.theme === "object" ? s.theme : (baseTheme ?? s.theme ?? (s.preset ? "qff" : "default")),
    baseTheme,
  );
  const width = 1080,
    height = 1920,
    safeBottom = 1700,
    eps = 1 / 60,
    frame = (value: number) => Math.round(value * 30) / 30;
  const french = s.language === "fr";
  const events: QuizEvent[] = [],
    voiceScript: VoiceSlot[] = [],
    questions: {
      id: string;
      start: number;
      readEnd: number;
      ticks: number[];
      reveal: number;
      end: number;
    }[] = [],
    scenes: unknown[] = [],
    warnings: string[] = [];
  let now = 0;
  const center = { x: 540, y: 960 };

  function makeScene(
    id: string,
    duration: number,
    count: number,
    item?: (typeof s.items)[number],
    phase?: { countdownStart: number; reveal: number },
    endText?: string,
  ) {
    const elements: SceneElement[] = [];
    const style = (data: Record<string, unknown>, type: string) => {
      const override = item?.layout?.[String(data.id)] ?? s.layout?.[String(data.id)];
      const { visible, ...o } = override ?? {};
      return {
        ...data,
        ...(o.x === undefined ? {} : { x: o.x * width }),
        ...(o.y === undefined || type === "text" ? {} : { y: o.y * safeBottom }),
        ...(o.w === undefined || type === "text" ? {} : { w: o.w * width }),
        ...(o.h === undefined || type === "text" ? {} : { h: o.h * safeBottom }),
        ...(o.fontSize === undefined || type === "text" ? {} : { fontSize: o.fontSize }),
        ...(o.color === undefined ? {} : { color: o.color }),
        ...(o.fill === undefined ? {} : { fill: o.fill }),
        ...(visible === false ? { opacity: 0 } : {}),
      };
    };
    const add = (type: SceneElement["type"], data: Record<string, unknown>) =>
      elements.push(newElement(type, duration, style(data, type)));
    const rect = (id: string, x: number, y: number, w: number, h: number, fill: string, extra = {}) =>
      add("rect", { id, x, y, w, h, fill, radius: 15, ...extra });
    // Texte ajusté dans une boîte : retour à la ligne et taille réduite jusqu'à ce qu'il tienne.
    const fit = (value: string, w: number, h: number, size: number, min = 22) => {
      let fontSize = size,
        lines = [value];
      for (; fontSize >= min; fontSize -= 2) {
        lines = wrapText(value, fontSize, w, theme.typography.family, true);
        // Ne jamais couper un mot : chaque mot doit tenir sur la largeur.
        const wordsFit = value
          .split(/\s+/)
          .every((word) => measureText(word, fontSize, theme.typography.family, true) <= w);
        if (wordsFit && lines.length * fontSize * 1.2 <= h) break;
      }
      return { fontSize, lines };
    };
    const txt = (
      id: string,
      value: string,
      x: number,
      y: number,
      w: number,
      h: number,
      size: number,
      color = theme.text,
      extra: Record<string, unknown> = {},
    ) => {
      const override = item?.layout?.[id] ?? s.layout?.[id];
      const boxW = override?.w === undefined ? w : override.w * width;
      const boxH = override?.h === undefined ? h : override.h * safeBottom;
      const boxY = override?.y === undefined ? y : override.y * safeBottom;
      const { fontSize, lines } = fit(value, boxW, boxH, override?.fontSize ?? size);
      const centered = extra.align === "center";
      add("text", {
        id,
        x,
        y: boxY + fontSize + (centered ? Math.max(0, (boxH - lines.length * fontSize * 1.2) / 2) : 0),
        text: lines.join("\n"),
        fontSize,
        maxWidth: boxW,
        color,
        bold: true,
        ...extra,
      });
    };
    const image = (id: string, src: string, x: number, y: number, w: number, h: number, extra = {}) =>
      add("image", { id, src, x, y, w, h, fit: "cover", ...extra });

    // Fond photo flou animé, bandeau, logo : identiques au mode stack.
    const index = id.startsWith("question_") ? Number(id.slice(9)) - 1 : id === "outro" ? s.items.length : Math.max(0, count - 1);
    const bg = s.background;
    if (bg) {
      const motionIn = bg.motion === "in" || (bg.motion === "pingpong" && index % 2 === 0);
      image("background_image", bg.images[index % bg.images.length], 0, 0, width, height, {
        blur: bg.blur,
        zoom: motionIn ? 1 : bg.zoom,
        keyframes: {
          zoom: [
            { t: 0, v: motionIn ? 1 : bg.zoom },
            { t: Math.max(0, duration - 1 / 30), v: motionIn ? bg.zoom : 1 },
          ],
        },
      });
      rect("background_dim", 0, 0, width, height, theme.background, { opacity: bg.dim, radius: 0 });
    }
    rect("title_banner", 36, 120, 1008, 150, s.bannerColor);
    txt("title", s.title, 72, 160, 940, 92, 70, "#FFFFFF");
    if (theme.logo?.scenes.includes("question"))
      image("brand_logo", theme.logo.src, 920, 292, 100, 100, { fit: "contain" });

    if (item && phase) {
      const { countdownStart, reveal } = phase;
      // Consigne facultative (le titre dit déjà « trouve l'intrus »).
      if (item.q) {
        rect("question_panel", 90, 300, 900, 130, theme.panel, { opacity: 0.92, radius: 25 });
        txt("question", item.q, 540, 310, 840, 110, 54, theme.text, { align: "center" });
      }

      const n = item.choices.length;
      const odd = item.correctIndex ?? item.choices.indexOf(item.a!);
      const radius = { 3: 320, 4: 340, 5: 360, 6: 365 }[n] ?? 350;
      const size = { 3: 330, 4: 310, 5: 265, 6: 235 }[n] ?? 270;
      const move = Math.min(reveal + 0.55, duration - eps);
      item.choices.forEach((value, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = center.x + radius * Math.cos(angle),
          y = center.y + radius * Math.sin(angle);
        const isOdd = i === odd;
        const children: Record<string, unknown>[] = [
          {
            id: `choice_${i + 1}_disc`,
            type: "ellipse",
            x: -size / 2,
            y: -size / 2,
            w: size,
            h: size,
            fill: theme.panel,
            stroke: theme.accent,
            strokeWidth: 8,
          },
        ];
        if (isOdd)
          children.push({
            id: `choice_${i + 1}_odd`,
            type: "ellipse",
            x: -size / 2,
            y: -size / 2,
            w: size,
            h: size,
            fill: s.oddColor,
            stroke: "#FFFFFF",
            strokeWidth: 8,
            start: reveal,
            keyframes: { opacity: [{ t: reveal, v: 0 }, { t: Math.min(reveal + 0.3, duration - eps), v: 1 }] },
          });
        const emojis = isMedia(value) ? undefined : emojiOnly(value);
        if (isMedia(value))
          children.push({
            id: `choice_${i + 1}_image`,
            type: "image",
            src: value,
            x: -size / 2 + 12,
            y: -size / 2 + 12,
            w: size - 24,
            h: size - 24,
            radius: (size - 24) / 2,
            fit: "cover",
          });
        else if (emojis)
          children.push(...emojiRow(`choice_${i + 1}`, emojis, 0, 0, size * 0.72, size * 0.55));
        else {
          const { fontSize, lines } = fit(value, size * 0.8, size * 0.62, 60, 24);
          children.push({
            id: `choice_${i + 1}_text`,
            type: "text",
            x: 0,
            y: -(lines.length * fontSize * 1.2) / 2 + fontSize * 0.95,
            text: lines.join("\n"),
            fontSize,
            maxWidth: size * 0.8,
            color: theme.text,
            bold: true,
            align: "center",
          });
        }
        const shake = [0, -7, 7, -5, 4, -2, 0].map((v, k) => ({
          t: Math.min(move + k * 0.07, duration - eps),
          v,
        }));
        const keyframes = isOdd
          ? {
              x: [
                { t: reveal, v: x, ease: "easeInOut" },
                { t: move, v: center.x },
              ],
              y: [
                { t: reveal, v: y, ease: "easeInOut" },
                { t: move, v: center.y },
              ],
              scale: [
                { t: reveal, v: 1, ease: "easeOut" },
                { t: move, v: 1.3 },
              ],
              rotation: shake,
            }
          : {
              opacity: [
                { t: reveal, v: 1 },
                { t: Math.min(reveal + 0.45, duration - eps), v: 0 },
              ],
              scale: [
                { t: reveal, v: 1, ease: "easeIn" },
                { t: Math.min(reveal + 0.45, duration - eps), v: 0.5 },
              ],
            };
        add("group", {
          id: `choice_${i + 1}`,
          x,
          y,
          z: isOdd ? 2 : 1,
          children: children.map((child) => newElement(child.type as SceneElement["type"], duration, child)),
          keyframes,
        });
      });

      // Minuteur au centre du cercle : « ? » pendant la lecture, puis compte à rebours.
      const timerEnd = reveal - eps;
      add("ellipse", {
        id: "timer_disc",
        x: center.x - 85,
        y: center.y - 85,
        w: 170,
        h: 170,
        fill: theme.accent,
        stroke: "#FFFFFF",
        strokeWidth: 6,
        end: timerEnd,
      });
      if (countdownStart > 0.05)
        txt("timer_wait", "?", center.x, center.y - 62, 170, 110, 100, theme.background, {
          align: "center",
          end: Math.max(eps, countdownStart - eps),
        });
      const steps = Math.ceil(reveal - countdownStart - 1e-6);
      for (let k = 0; k < steps; k++) {
        const from = countdownStart + k,
          to = Math.min(countdownStart + k + 1, reveal) - eps;
        if (to <= from) continue;
        txt(`timer_${k + 1}`, String(steps - k), center.x, center.y - 62, 170, 110, 100, theme.background, {
          align: "center",
          start: from,
          end: to,
        });
      }

      // Révélation : bandeau « intrus » et explication écrite.
      const shown = Math.min(move, duration - 0.2);
      const fadeIn = (t: number) => ({ opacity: [{ t, v: 0 }, { t: Math.min(t + 0.3, duration - eps), v: 1 }] });
      txt("odd_label", french ? "L'INTRUS !" : "ODD ONE OUT!", 540, 1215, 900, 80, 66, s.oddColor, {
        align: "center",
        start: shown,
        keyframes: fadeIn(shown),
      });
      if (item.explanation) {
        rect("explanation_panel", 90, 1335, 900, 230, theme.panel, {
          opacity: 0.95,
          radius: 25,
          start: shown,
          keyframes: { opacity: [{ t: shown, v: 0 }, { t: Math.min(shown + 0.3, duration - eps), v: 0.95 }] },
        });
        txt("explanation", item.explanation, 540, 1355, 840, 190, 52, theme.text, {
          align: "center",
          start: shown,
          keyframes: fadeIn(shown),
        });
      }
    }

    // Progression.
    const done = phase ? count : count;
    rect("progress_track", 90, 1605, 900, 22, theme.track, { radius: 11 });
    if (done > 0 || phase)
      rect("progress_fill", 90, 1605, (900 * done) / s.items.length || 0.01, 22, theme.accent, {
        radius: 11,
        ...(phase
          ? {
              keyframes: {
                w: [
                  { t: phase.reveal, v: (900 * done) / s.items.length || 0.01 },
                  { t: Math.min(phase.reveal + 0.4, duration - eps), v: (900 * (done + 1)) / s.items.length },
                ],
              },
            }
          : {}),
      });
    txt(
      "progress_label",
      `${phase ? done + 1 : done} / ${s.items.length}`,
      90,
      1640,
      900,
      45,
      32,
      theme.muted,
    );
    if (endText) txt("end_text", endText, 540, 760, 900, 300, 80, theme.accent, { align: "center" });
    if (item?.elements) for (const element of item.elements) add(element.type, element);
    if (s.loopFade && id === "question_1")
      rect("loop_fade_in", 0, 0, width, height, theme.background, {
        radius: 0,
        keyframes: { opacity: [{ t: 0, v: 1 }, { t: Math.min(0.4, duration), v: 0 }] },
      });
    if (s.loopFade && id === "outro")
      rect("loop_fade_out", 0, 0, width, height, theme.background, {
        radius: 0,
        keyframes: {
          opacity: [
            { t: 0, v: 0 },
            { t: Math.max(0, duration - 0.4), v: 0 },
            { t: duration - 1 / 30, v: 1 },
          ],
        },
      });
    scenes.push({
      id,
      name: id,
      duration,
      background: "studio",
      backdrop: theme.backdrop ?? { type: "solid", color: theme.background },
      title: "",
      actors: [],
      elements,
    });
  }

  const sceneIds = new Set(s.items.map((_, i) => `question_${i + 1}`));
  const sequenceIds = new Set<string>();
  for (const entry of s.sequence ?? []) {
    if (sceneIds.has(entry.id) || entry.id === "outro" || sequenceIds.has(entry.id))
      throw new Error(`Duplicate custom scene id: ${entry.id}`);
    if (entry.after !== "start" && !sceneIds.has(entry.after))
      throw new Error(`Unknown sequence anchor: ${entry.after}`);
    sequenceIds.add(entry.id);
  }
  function insertSequence(after: string, count: number) {
    for (const entry of s.sequence?.filter((c) => c.after === after) ?? []) {
      const duration = frame(Math.max(entry.duration, (options.voiceDurations?.[entry.id] ?? 0) + 0.3));
      makeScene(entry.id, duration, count);
      const scene = scenes.at(-1) as { elements: SceneElement[] };
      if (!entry.showList)
        scene.elements = scene.elements.filter(
          (e) => e.id === "background_image" || e.id === "background_dim",
        );
      for (const element of entry.elements ?? []) scene.elements.push(newElement(element.type, duration, element));
      events.push({ time: now, type: "custom", id: entry.id });
      if (entry.say) voiceScript.push({ id: entry.id, start: now, maxDuration: duration, text: entry.say });
      now = frame(now + duration);
    }
  }
  insertSequence("start", 0);
  s.items.forEach((item, index) => {
    const id = `question_${index + 1}`,
      start = now;
    const read = frame(
        Math.max(
          s.timing.show,
          options.voiceDurations?.[id] === undefined ? 0 : options.voiceDurations[id] + 0.3,
        ),
      ),
      think = frame(item.think ?? s.timing.think),
      countdown = frame(s.timing.countdown),
      answer = frame(
        Math.max(
          s.timing.reveal,
          1.6,
          options.voiceDurations?.[`${id}_answer`] === undefined ? 0 : options.voiceDurations[`${id}_answer`] + 0.3,
        ),
      );
    const countdownStart = frame(read + think),
      reveal = frame(countdownStart + countdown),
      duration = frame(reveal + answer);
    const ticks = countdown ? [frame(start + countdownStart)] : [];
    questions.push({ id, start, readEnd: frame(start + read), ticks, reveal: frame(start + reveal), end: frame(start + duration) });
    events.push(
      { time: start, type: "question", id },
      ...(think ? [{ time: frame(start + read), type: "think", id }] : []),
      ...ticks.map((time) => ({ time, type: "tick", id })),
      { time: frame(start + reveal), type: "reveal", id },
    );
    const odd = item.correctIndex ?? item.choices.indexOf(item.a!);
    const oddValue = item.choices[odd];
    if (item.say) voiceScript.push({ id, start, maxDuration: read, text: item.say });
    voiceScript.push({
      id: `${id}_answer`,
      start: frame(start + reveal),
      maxDuration: answer,
      text: item.sayAnswer ?? item.a ?? (isMedia(oddValue) ? item.explanation ?? "" : oddValue),
    });
    if (!item.sayAnswer && !item.a && isMedia(oddValue) && !item.explanation)
      warnings.push(`${id}: sayAnswer conseillé quand l'intrus est une image.`);
    makeScene(id, duration, index, item, { countdownStart, reveal });
    now = frame(now + duration);
    insertSequence(id, index + 1);
  });
  const outroStart = now;
  const outroDuration = frame(Math.max(s.timing.endHold, (options.voiceDurations?.outro ?? 0) + 0.3));
  makeScene("outro", outroDuration, s.items.length, undefined, undefined, s.end.text);
  events.push({ time: outroStart, type: "outro", id: "outro" });
  if (s.end.say) voiceScript.push({ id: "outro", start: outroStart, maxDuration: outroDuration, text: s.end.say });
  now = frame(now + outroDuration);
  const project = parseProject({
    schemaVersion: 2,
    id: "quiz_compiled",
    name: s.title,
    width,
    height,
    fontFamily: theme.typography.family,
    fps: 30,
    scenes,
    ...(s.assets ? { assets: s.assets } : {}),
  });
  return {
    ok: true as const,
    project,
    duration: now,
    schedule: questions.map((q, i) => ({ sceneId: q.id, question: i + 1, start: q.start, reveal: q.reveal, end: q.end })),
    warnings,
    layoutReport: [],
    timeline: {
      duration: now,
      events,
      questions,
      intro: { start: 0, end: 0 },
      levels: [],
      outro: { start: outroStart, end: now },
    },
    voiceScript,
  };
}

/** Permutation pseudo-aléatoire reproductible (même spec, même rendu) ; l'intrus change de place d'une question à l'autre. */
function shuffleItem<T extends { choices: string[]; correctIndex?: number; a?: string }>(item: T, seed: number, index: number): T {
  const odd = item.correctIndex ?? item.choices.indexOf(item.a!);
  let state = (Math.imul(seed + 1, 2654435761) ^ Math.imul(index + 7, 40503)) >>> 0;
  const next = () => {
    state = (Math.imul(state ^ (state >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    return state / 4294967296;
  };
  const order = item.choices.map((_, k) => k);
  for (let k = order.length - 1; k > 0; k--) {
    const j = Math.floor(next() * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  return { ...item, choices: order.map((k) => item.choices[k]), correctIndex: order.indexOf(odd) };
}
