import type { Actor, Project, Scene } from "../core/schema";
import { locateTime, poseAt } from "../core/engine";

const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
function lines(text: string, max: number) {
  const result: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line + " " + word).length > max && line) {
      result.push(line);
      line = "";
    }
    if (word.length > max) {
      if (line) {
        result.push(line);
        line = "";
      }
      for (let i = 0; i < word.length; i += max)
        result.push(word.slice(i, i + max));
    } else line += (line ? " " : "") + word;
  }
  if (line) result.push(line);
  return result;
}
function background(kind: Scene["background"]) {
  const colors = {
    studio: ["#f2eee5", "#dedace"],
    office: ["#edf0f5", "#cdd7df"],
    park: ["#d7eae1", "#9ebc88"],
    night: ["#263047", "#37425a"],
  }[kind];
  let detail = "";
  if (kind === "studio")
    detail = `<path d="M80 550V320a170 170 0 0 1 340 0v230" fill="#e0ddf1"/><path d="M110 550V330a140 140 0 0 1 280 0v220" fill="#ece9f4"/><rect x="945" y="275" width="190" height="210" rx="4" fill="#dfd5c3"/><rect x="959" y="289" width="162" height="182" fill="#faf6ec"/><circle cx="1040" cy="355" r="40" fill="#dd996e"/><path d="m970 457 70-88 70 88" fill="#9daa86"/>`;
  if (kind === "office")
    detail = `<rect x="80" y="90" width="350" height="310" rx="12" fill="#c4dbed"/><path d="M255 90v310M80 240h350" stroke="#fff" stroke-width="12"/><rect x="890" y="285" width="285" height="18" rx="8" fill="#9e826c"/><path d="M915 303v250m230-250v250" stroke="#75695e" stroke-width="14"/><rect x="970" y="205" width="100" height="70" rx="5" fill="#566780"/>`;
  if (kind === "park")
    detail = `<circle cx="1080" cy="130" r="52" fill="#ffe6a4"/><path d="M0 520Q200 330 450 510T1280 460V720H0" fill="#aecba5"/><path d="M180 520V290m890 230V310" stroke="#8d7760" stroke-width="22"/><circle cx="180" cy="285" r="100" fill="#739d7a"/><circle cx="1070" cy="300" r="85" fill="#7ea984"/>`;
  if (kind === "night")
    detail = `<circle cx="1050" cy="130" r="45" fill="#f3e9b9"/>${[100, 260, 420, 640, 810, 1160].map((x, i) => `<circle cx="${x}" cy="${80 + (i % 3) * 60}" r="3" fill="#e6e5fa"/>`).join("")}<path d="M0 530V360h130v90h90V300h100v230h700V350h140v80h120v100" fill="#30394f"/>`;
  return `<rect width="1280" height="720" fill="${colors[0]}"/>${detail}<path d="M0 565H1280V720H0Z" fill="${colors[1]}"/><path d="M0 565H1280" stroke="#000" opacity=".04" stroke-width="2"/>`;
}
function actor(a: Actor, t: number, selected?: string) {
  const p = poseAt(a, t);
  if (!p.visible) return "";
  const limb = (
    x: number,
    y: number,
    angle: number,
    length: number,
    color: string,
    width: number,
  ) =>
    `<g transform="translate(${x} ${y}) rotate(${angle})"><path d="M0 0v${length}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/></g>`;
  const leg = (x: number, angle: number) =>
    `<g transform="translate(${x} -110) rotate(${angle})"><path d="M0 0v95" stroke="#34445b" stroke-width="25" stroke-linecap="round"/><path d="M-10 97h20" stroke="#202b3d" stroke-width="20" stroke-linecap="round"/></g>`;
  const bubbleLines = lines(a.dialogue, 30).slice(0, 9);
  const bh = bubbleLines.length * 25 + 28;
  const bubble = a.dialogue
    ? `<g transform="translate(${p.x} ${p.y - 345 * a.scale - bh})"><rect x="-180" width="360" height="${bh}" rx="18" fill="white"/><path d="m-10 ${bh} 10 15 10-15" fill="white"/><text text-anchor="middle" fill="#303440" font-size="20">${bubbleLines.map((l, i) => `<tspan x="0" y="${30 + i * 25}">${esc(l)}</tspan>`).join("")}</text></g>`
    : "";
  return `<g data-actor-id="${esc(a.id)}"><ellipse cx="${p.x}" cy="${p.y + 5}" rx="${64 * a.scale}" ry="${12 * a.scale}" fill="#000" opacity=".09"/><g transform="translate(${p.x} ${p.y - p.bob}) scale(${a.flip ? -a.scale : a.scale} ${a.scale})">
    ${a.id === selected ? '<rect x="-90" y="-315" width="180" height="330" rx="14" fill="none" stroke="#8876ef" stroke-width="2" stroke-dasharray="7 5"/>' : ""}
    ${leg(-20, p.leftLeg)}${leg(20, p.rightLeg)}
    <path d="M0-228v24" stroke="${a.skin}" stroke-width="23"/>
    <path d="M-32-206Q0-224 32-206l8 92q-40 15-80 0Z" fill="${a.color}"/>
    ${limb(-37, -197, p.leftArm, 85, a.skin, 18)}${limb(37, -197, p.rightArm, 85, a.skin, 18)}
    ${limb(-37, -197, p.leftArm, 32, a.color, 24)}${limb(37, -197, p.rightArm, 32, a.color, 24)}
    <ellipse cy="-263" rx="39" ry="45" fill="${a.skin}"/><path d="M-39-262q-13-63 41-54 48 2 36 55l-11-27q-24 18-56 0Z" fill="#333044"/>
    <circle cx="-13" cy="-263" r="3.2" fill="#333044"/><circle cx="13" cy="-263" r="3.2" fill="#333044"/>
    <ellipse cy="-241" rx="8" ry="${p.mouth}" fill="#8c494a"/>
    </g>${bubble}</g>`;
}
export function renderSceneSvg(
  scene: Scene,
  time: number,
  selected?: string,
): string {
  const titleLines = lines(scene.title, 52);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-label="${esc(scene.name)}"><g font-family="Arial, sans-serif">${background(scene.background)}<text x="640" y="78" text-anchor="middle" font-size="36" font-weight="700" fill="${scene.background === "night" ? "#f6f2e9" : "#3c4050"}">${titleLines.map((l, i) => `<tspan x="640" dy="${i === 0 ? 0 : 43}">${esc(l)}</tspan>`).join("")}</text>${[
    ...scene.actors,
  ]
    .sort((a, b) => a.y - b.y)
    .map((a) => actor(a, time, selected))
    .join("")}</g></svg>`;
}
export function renderProjectSvg(project: Project, time: number) {
  const located = locateTime(project, time);
  return renderSceneSvg(located.scene, located.time);
}
export function renderCharacterSvg(a: Actor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-110 -340 220 370" aria-hidden="true"><rect x="-110" y="-340" width="220" height="370" fill="#e8e2f2"/>${actor({ ...a, x: 0, y: 0, scale: 1, dialogue: "", action: "idle" }, 0)}</svg>`;
}
