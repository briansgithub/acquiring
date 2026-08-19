export function activeKeyAtBeat(keys, beat) {
  const timeline = Array.isArray(keys) && keys.length
    ? [...keys].sort((left, right) => Number(left.beat ?? 1) - Number(right.beat ?? 1))
    : [{ tonic: "C", scale: "major", beat: 1 }];
  let selected = timeline[0];
  for (const key of timeline) {
    if (Number(key.beat ?? 1) <= Number(beat)) selected = key;
    else break;
  }
  return {
    tonic: String(selected.tonic || "C").replace(/♭/g, "b").replace(/♯/g, "#").replace(/♮/g, ""),
    scale: String(selected.scale || "major"),
  };
}
