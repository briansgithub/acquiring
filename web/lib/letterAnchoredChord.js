export function isLetterAnchoredChord(chord) {
  return (chord?.root == null || chord.root === 0)
    && /^[A-G][#bx]*$/.test(chord?._letterRootName || "");
}

export function getLetterAnchoredName(chord) {
  if (!isLetterAnchoredChord(chord)) return "";
  const quality = { minor: "m", diminished: "°", augmented: "+" }[chord._letterQuality] || "";
  const extension = chord.type >= 7 ? `${chord.useMaj7 ? "maj" : ""}${chord.type}` : "";
  const suspensions = (chord.suspensions || []).map((value) => `sus${value}`).join("");
  const alterations = (chord.alterations || []).map((value) => `(${value})`).join("");
  const adds = (chord.adds || []).map((value) => `(add${value})`).join("");
  const bass = chord._letterBassName ? `/${chord._letterBassName}` : "";
  return `${chord._letterRootName}${quality}${extension}${suspensions}${alterations}${adds}${bass}`;
}
