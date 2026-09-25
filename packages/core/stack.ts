import { z } from "zod";
import { newElement, type SceneElement } from "./elements";
import { parseProject } from "./schema";
import { resolveTheme, themeInputSchema } from "./themes";
import { wrapText } from "./text";
import type { CompileOptions, QuizEvent, VoiceSlot } from "./levels";

const label = z.string().trim().min(1).max(240);
const media = z.string().regex(/^(asset:[a-zA-Z0-9_-]+|file:[^\\:]+)$/);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
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
export const stackSchema = z
  .object({
    mode: z.literal("stack"),
    preset: z.literal("qff-stack").optional(),
    title: label.default("DEVINE LES SONS"),
    theme: themeInputSchema.optional(),
    language: z.enum(["fr", "en"]).default("fr"),
    bannerColor: hex.default("#C51E2A"),
    loopFade: z.boolean().default(true),
    layout: layout.optional(),
    listenVisual: z.enum(["bars", "wave", "pulse"]).default("bars"),
    timing: z
      .object({
        show: z.number().min(0.3).max(10).default(0.7),
        listen: z.number().min(0.5).max(30).default(2),
        countdown: z.number().min(0).max(10).default(0.5),
        reveal: z.number().min(0.5).max(10).default(1.5),
        endHold: z.number().min(1).max(30).default(2),
      })
      .strict()
      .default({}),
    end: z
      .object({
        text: label.default("La liste est complète !"),
        say: label.optional(),
      })
      .strict()
      .default({}),
    audioAssets: z
      .record(
        z.string().regex(/^[a-zA-Z0-9_-]+$/),
        z.string().regex(/^file:[^\\:]+$/),
      )
      .optional(),
    assets: z.record(z.unknown()).optional(),
    items: z
      .array(
        z
          .object({
            q: label.optional(),
            a: label,
            image: media.optional(),
            revealImage: media.optional(),
            backgroundImage: media.optional(),
            audio: media.optional(),
            audioStart: z.number().finite().min(0).max(3600).default(0),
            listen: z.number().finite().min(0.5).max(30).optional(),
            audioGain: z.number().finite().min(-24).max(24).default(0),
            replayOnReveal: z.boolean().default(false),
            audioDuringCountdown: z
              .enum(["stop", "continue", "loop"])
              .default("stop"),
            say: label.optional(),
            sayAnswer: label.optional(),
            layout: layout.optional(),
            elements: z
              .array(
                z
                  .object({
                    id: z.string().min(1),
                    type: z.enum([
                      "rect",
                      "text",
                      "image",
                      "ellipse",
                      "line",
                      "path",
                      "group",
                    ]),
                  })
                  .passthrough(),
              )
              .max(50)
              .optional(),
          })
          .strict(),
      )
      .min(5)
      .max(15),
  })
  .strict()
  .superRefine((spec, ctx) => {
    if (spec.timing.show + spec.timing.countdown + spec.timing.reveal < 1)
      ctx.addIssue({
        code: "custom",
        path: ["timing"],
        message: "Each stack scene must last at least one second.",
      });
  });

export function compileStack(
  input: unknown,
  baseTheme?: unknown,
  options: CompileOptions = {},
) {
  const s = stackSchema.parse(input);
  const theme = resolveTheme(
    typeof s.theme === "object"
      ? s.theme
      : (baseTheme ?? s.theme ?? (s.preset ? "qff" : "default")),
    baseTheme,
  );
  const width = 1080,
    height = 1920,
    safeBottom = 1700,
    frame = (value: number) => Math.round(value * 30) / 30;
  const events: QuizEvent[] = [],
    voiceScript: VoiceSlot[] = [],
    questions: {
      id: string;
      start: number;
      readEnd: number;
      listenStart?: number;
      listenEnd?: number;
      audio?: string;
      audioStart?: number;
      audioGain?: number;
      replayOnReveal?: boolean;
      ticks: number[];
      reveal: number;
      end: number;
    }[] = [],
    scenes: unknown[] = [],
    warnings: string[] = [];
  let now = 0;
  const listTop = 775,
    rowH = Math.min(77, 780 / s.items.length);
  function makeScene(
    id: string,
    duration: number,
    count: number,
    revealAt: number | undefined,
    item?: (typeof s.items)[number],
    endText?: string,
    readTime = s.timing.show,
  ) {
    const elements: SceneElement[] = [];
    const add = (type: SceneElement["type"], data: Record<string, unknown>) => {
      const override =
        item?.layout?.[String(data.id)] ?? s.layout?.[String(data.id)];
      const { visible, ...style } = override ?? {};
      const mapped = {
        ...data,
        ...(style.x === undefined ? {} : { x: style.x * width }),
        ...(style.y === undefined ? {} : { y: style.y * safeBottom }),
        ...(style.w === undefined ? {} : { w: style.w * width }),
        ...(style.h === undefined ? {} : { h: style.h * safeBottom }),
        ...(style.fontSize === undefined ? {} : { fontSize: style.fontSize }),
        ...(style.color === undefined ? {} : { color: style.color }),
        ...(style.fill === undefined ? {} : { fill: style.fill }),
        ...(visible === false ? { opacity: 0 } : {}),
      };
      elements.push(newElement(type, duration, mapped));
    };
    const rect = (
      id: string,
      x: number,
      y: number,
      w: number,
      h: number,
      fill: string,
      extra = {},
    ) => add("rect", { id, x, y, w, h, fill, radius: 15, ...extra });
    const txt = (
      id: string,
      value: string,
      x: number,
      y: number,
      w: number,
      h: number,
      size: number,
      color = theme.text,
      extra = {},
    ) => {
      let fontSize = size,
        lines = [value];
      for (; fontSize >= 18; fontSize -= 2) {
        lines = wrapText(value, fontSize, w, theme.typography.family, true);
        if (lines.length * fontSize * 1.2 <= h) break;
      }
      add("text", {
        id,
        x,
        y: y + fontSize,
        text: lines.join("\n"),
        fontSize,
        maxWidth: w,
        color,
        bold: true,
        ...extra,
      });
    };
    const image = (
      id: string,
      src: string,
      x: number,
      y: number,
      w: number,
      h: number,
      extra = {},
    ) => add("image", { id, src, x, y, w, h, fit: "cover", ...extra });
    if (item?.backgroundImage) {
      image("background_image", item.backgroundImage, 0, 0, width, height, {
        blur: 22,
      });
      rect("background_dim", 0, 0, width, height, theme.background, {
        opacity: 0.72,
        radius: 0,
      });
    }
    rect("title_banner", 36, 120, 1008, 150, s.bannerColor);
    txt("title", s.title, 72, 160, 940, 92, 70, "#FFFFFF");
    if (theme.logo?.scenes.includes("question")) {
      image("brand_logo", theme.logo.src, 920, 292, 100, 100, {
        fit: "contain",
      });
    }
    if (item?.image)
      image("item_image", item.image, 135, 302, 810, 390, { radius: 25 });
    else {
      rect("image_placeholder", 135, 302, 810, 390, theme.panel, {
        radius: 25,
      });
      txt("mystery_icon", "?", 470, 382, 140, 200, 165, theme.accent);
    }
    if (item?.revealImage)
      image("reveal_image", item.revealImage, 135, 302, 810, 390, {
        radius: 25,
        start: revealAt,
      });
    if (item?.q) txt("question", item.q, 158, 620, 764, 67, 46);
    for (let i = 0; i < s.items.length; i++) {
      const y = listTop + i * rowH;
      rect(`row_${i + 1}`, 90, y, 900, rowH - 7, theme.panel, {
        opacity: i < count ? 0.95 : 0.62,
        radius: 10,
      });
      txt(
        `row_number_${i + 1}`,
        `${i + 1}.`,
        115,
        y + 9,
        90,
        rowH - 17,
        40,
        theme.accent,
      );
      if (i < count)
        txt(
          `row_answer_${i + 1}`,
          s.items[i].a,
          212,
          y + 7,
          740,
          rowH - 14,
          43,
        );
      else if (i === count && item && revealAt !== undefined) {
        txt(
          `row_answer_${i + 1}`,
          item.a,
          212,
          y + 7,
          740,
          rowH - 14,
          43,
          theme.text,
          {
            start: revealAt,
            keyframes: {
              x: [
                { t: revealAt, v: 1000 },
                { t: Math.min(duration, revealAt + 0.35), v: 212 },
              ],
            },
          },
        );
      }
    }
    rect("progress_track", 90, 1605, 900, 22, theme.track, { radius: 11 });
    if (count > 0)
      rect(
        "progress_fill_before",
        90,
        1605,
        (900 * count) / s.items.length,
        22,
        theme.accent,
        {
          radius: 11,
          ...(revealAt === undefined ? {} : { end: revealAt - 1 / 60 }),
        },
      );
    if (revealAt !== undefined)
      rect(
        "progress_fill",
        90,
        1605,
        (900 * (count + 1)) / s.items.length,
        22,
        theme.accent,
        { radius: 11, start: revealAt },
      );
    txt(
      "progress_label",
      `${count} / ${s.items.length}`,
      90,
      1640,
      900,
      45,
      32,
      theme.muted,
      revealAt === undefined ? {} : { end: revealAt - 1 / 60 },
    );
    if (revealAt !== undefined)
      txt(
        "progress_label_after",
        `${count + 1} / ${s.items.length}`,
        90,
        1640,
        900,
        45,
        32,
        theme.muted,
        { start: revealAt },
      );
    if (endText) txt("end_text", endText, 90, 685, 900, 80, 48, theme.accent);
    if (item?.audio && revealAt !== undefined) {
      const listenStart = readTime,
        listenEnd = revealAt - s.timing.countdown;
      rect("listen_panel", 202, 553, 676, 105, theme.panel, {
        start: listenStart,
        end: listenEnd - 1 / 60,
      });
      txt("listen_icon", "♫", 227, 566, 90, 77, 62, theme.accent, {
        start: listenStart,
        end: listenEnd - 1 / 60,
      });
      txt(
        "listen_label",
        s.language === "fr" ? "ÉCOUTE" : "LISTEN",
        322,
        575,
        240,
        66,
        48,
        theme.text,
        { start: listenStart, end: listenEnd - 1 / 60 },
      );
      const amp = options.soundMetadata?.[id]?.amplitudes ?? [];
      for (let b = 0; b < 8; b++) {
        const samples = Array.from(
          { length: Math.max(2, amp.length) },
          (_, k) => {
            const h = 8 + (amp[k] ?? 0.2) * (35 + (b % 3) * 5);
            return {
              t:
                listenStart +
                (k * (listenEnd - listenStart)) / Math.max(1, amp.length - 1),
              h,
            };
          },
        );
        rect(
          `listen_viz_${b}`,
          570 + b * 34,
          628 - samples[0].h,
          25,
          samples[0].h,
          theme.accent,
          {
            start: listenStart,
            end: listenEnd - 1 / 60,
            radius: 5,
            keyframes: {
              h: samples.map((v) => ({ t: v.t, v: v.h })),
              y: samples.map((v) => ({ t: v.t, v: 628 - v.h })),
            },
          },
        );
      }
    }
    if (item?.elements)
      for (const element of item.elements) add(element.type, element);
    if (s.loopFade && id === "question_1")
      rect("loop_fade_in", 0, 0, width, height, theme.background, {
        radius: 0,
        keyframes: {
          opacity: [
            { t: 0, v: 1 },
            { t: Math.min(0.4, duration), v: 0 },
          ],
        },
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
  s.items.forEach((item, index) => {
    const id = `question_${index + 1}`,
      start = now;
    const available = options.soundMetadata?.[id]?.duration;
    const listen = item.audio
      ? frame(
          Math.min(
            item.listen ?? s.timing.listen,
            available === undefined
              ? 30
              : Math.max(0.5, available - item.audioStart),
          ),
        )
      : 0;
    const read = frame(
        Math.max(
          s.timing.show,
          options.voiceDurations?.[id] === undefined
            ? 0
            : options.voiceDurations[id] + 0.3,
        ),
      ),
      countdown = frame(s.timing.countdown),
      answer = frame(
        Math.max(
          s.timing.reveal,
          options.voiceDurations?.[`${id}_answer`] === undefined
            ? 0
            : options.voiceDurations[`${id}_answer`] + 0.3,
        ),
      );
    const reveal = frame(read + listen + countdown),
      duration = frame(reveal + answer);
    const ticks = countdown ? [frame(start + read + listen)] : [];
    questions.push({
      id,
      start,
      readEnd: frame(start + read),
      ...(item.audio
        ? {
            listenStart: frame(start + read),
            listenEnd: frame(start + read + listen),
            audio: item.audio,
            audioStart: item.audioStart,
            audioGain: item.audioGain,
            replayOnReveal: item.replayOnReveal,
          }
        : {}),
      ticks,
      reveal: frame(start + reveal),
      end: frame(start + duration),
    });
    events.push(
      { time: start, type: "question", id },
      ...(item.audio
        ? [{ time: frame(start + read), type: "listen", id }]
        : []),
      ...ticks.map((time) => ({ time, type: "tick", id })),
      { time: frame(start + reveal), type: "reveal", id },
    );
    if (item.say)
      voiceScript.push({ id, start, maxDuration: read, text: item.say });
    voiceScript.push({
      id: `${id}_answer`,
      start: frame(start + reveal),
      maxDuration: answer,
      text: item.sayAnswer ?? item.a,
    });
    makeScene(id, duration, index, reveal, item, undefined, read);
    now = frame(now + duration);
  });
  const outroStart = now;
  makeScene(
    "outro",
    frame(s.timing.endHold),
    s.items.length,
    undefined,
    undefined,
    s.end.text,
  );
  events.push({ time: outroStart, type: "outro", id: "outro" });
  if (s.end.say)
    voiceScript.push({
      id: "outro",
      start: outroStart,
      maxDuration: s.timing.endHold,
      text: s.end.say,
    });
  now = frame(now + s.timing.endHold);
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
    schedule: questions.map((q, i) => ({
      sceneId: q.id,
      question: i + 1,
      start: q.start,
      reveal: q.reveal,
      end: q.end,
    })),
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
