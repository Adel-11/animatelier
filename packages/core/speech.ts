// Bounded deterministic spelling for narration; no network or platform locale lookup.
function en(n: number): string {
  const small = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  if (n < 20) return small[n];
  if (n < 100)
    return (
      [
        "",
        "",
        "twenty",
        "thirty",
        "forty",
        "fifty",
        "sixty",
        "seventy",
        "eighty",
        "ninety",
      ][Math.floor(n / 10)] + (n % 10 ? "-" + en(n % 10) : "")
    );
  if (n < 1000)
    return (
      en(Math.floor(n / 100)) +
      " hundred" +
      (n % 100 ? " and " + en(n % 100) : "")
    );
  for (const [v, s] of [
    [1e9, "billion"],
    [1e6, "million"],
    [1000, "thousand"],
  ] as const)
    if (n >= v)
      return en(Math.floor(n / v)) + " " + s + (n % v ? " " + en(n % v) : "");
  return "";
}
function fr(n: number): string {
  const small = [
    "zéro",
    "un",
    "deux",
    "trois",
    "quatre",
    "cinq",
    "six",
    "sept",
    "huit",
    "neuf",
    "dix",
    "onze",
    "douze",
    "treize",
    "quatorze",
    "quinze",
    "seize",
  ];
  if (n < 17) return small[n];
  if (n < 20) return "dix-" + fr(n - 10);
  if (n < 70) {
    const t = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"][
      Math.floor(n / 10)
    ];
    return t + (n % 10 === 1 ? " et un" : n % 10 ? "-" + fr(n % 10) : "");
  }
  if (n < 80) return "soixante" + (n === 71 ? " et onze" : "-" + fr(n - 60));
  if (n < 100) return "quatre-vingt" + (n === 80 ? "s" : "-" + fr(n - 80));
  if (n < 1000)
    return (
      (n < 200
        ? "cent"
        : fr(Math.floor(n / 100)) + " cent" + (n % 100 ? "" : "s")) +
      (n % 100 ? " " + fr(n % 100) : "")
    );
  for (const [v, s] of [
    [1e9, "milliard"],
    [1e6, "million"],
    [1000, "mille"],
  ] as const)
    if (n >= v) {
      const q = Math.floor(n / v);
      return (
        (v === 1000 && q === 1 ? "" : fr(q) + " ") +
        s +
        (v > 1000 && q > 1 ? "s" : "") +
        (n % v ? " " + fr(n % v) : "")
      );
    }
  return "";
}
export function spokenNumbers(text: string, language: "en" | "fr") {
  return text.replace(/-?\d+(?:[.,]\d+)?/g, (raw) => {
    const [integer, fraction] = raw.replace(",", ".").split(".");
    const n = Math.abs(Number(integer));
    if (n > 999999999999) return raw;
    const spell = language === "fr" ? fr : en;
    return (
      (raw.startsWith("-") ? (language === "fr" ? "moins " : "minus ") : "") +
      spell(n) +
      (fraction
        ? (language === "fr" ? " virgule " : " point ") +
          [...fraction].map((d) => spell(Number(d))).join(" ")
        : "")
    );
  });
}
