import {IntroductionArticle} from '../help/IntroductionArticle';
import {IntroductionCopy} from '../help/introduction-copy';
import './introduction.css';

/** Frozen 801cf798 IntroductionView.kt one-shot gate. Continue only; diagnostics/reset stay separate. */
export function IntroductionScreen({onContinue}:{onContinue:()=>void}){
  return <main className="introduction-screen" data-introduction-screen="true">
    <h1>{IntroductionCopy.TITLE}</h1>
    <div className="introduction-screen__body">
      <IntroductionArticle/>
    </div>
    <button className="action introduction-screen__continue" type="button" data-introduction-continue="true"
      onClick={onContinue}>{IntroductionCopy.CONTINUE}</button>
  </main>;
}
