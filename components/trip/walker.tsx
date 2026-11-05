const LIMBS = [
  "walker-head",
  "walker-pack",
  "walker-body",
  "walker-arm",
  "walker-arm-back",
  "walker-leg",
  "walker-leg-back",
];

export function Walker() {
  return (
    <div className="walker" aria-hidden>
      {LIMBS.map((limb) => (
        <span key={limb} className={limb} />
      ))}
    </div>
  );
}

export function walkerElement() {
  const walker = document.createElement("div");
  walker.className = "walker";
  for (const limb of LIMBS) {
    const part = document.createElement("span");
    part.className = limb;
    walker.append(part);
  }
  return walker;
}
