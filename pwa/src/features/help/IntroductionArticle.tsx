import {IntroductionCopy} from './introduction-copy';

/** Frozen 801cf798 IntroductionView.kt IntroductionArticle. Shared by /help Instructions and the one-shot intro. */
export function IntroductionArticle(){
  return <>
    <section data-introduction="objective"><h3>{IntroductionCopy.OBJECTIVE_HEADING}</h3><p>{IntroductionCopy.OBJECTIVE}</p></section>
    <section data-introduction="gestures"><h3>{IntroductionCopy.GESTURES_HEADING}</h3>
      <p>{IntroductionCopy.TAP_ACTION} — {IntroductionCopy.TAP_DETAIL}</p>
      <p>{IntroductionCopy.DOUBLE_TAP_ACTION} — {IntroductionCopy.DOUBLE_TAP_DETAIL}</p>
      <p>{IntroductionCopy.MIC_ACTION} — {IntroductionCopy.MIC_DETAIL}</p>
    </section>
    <section data-introduction="octave"><h3>{IntroductionCopy.OCTAVE_HEADING}</h3><p>{IntroductionCopy.OCTAVE}</p></section>
  </>;
}
