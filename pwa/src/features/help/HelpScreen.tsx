/** Frozen 801cf798 HelpIndex / HelpArticleScreen. Rich notation-article prose remains a later slice. */
import {useState} from 'react';
import {
  HELP_C_MAJOR_NOTES,HELP_INTERVAL_ROWS,HELP_ROMAN_QUALITY,HELP_SCALE_DEGREES,
  HELP_TOPIC_INSTRUCTIONS,HELP_TOPIC_INTERVALS,HELP_TOPIC_ROMAN,HELP_TOPIC_SCALE_DEGREES,
  HELP_TOPICS,type HelpTopic,
} from './help-catalog';
import {IntroductionCopy} from './introduction-copy';
import './help.css';

export function HelpScreen(){
  const [topicId,setTopicId]=useState<string|null>(null);
  const topic=HELP_TOPICS.find(item=>item.id===topicId)??null;
  if(topic)return <HelpArticle topic={topic} onBack={()=>setTopicId(null)}/>;
  return <nav className="help-index" data-help-index="true" aria-label="Help contents">
    <h2>Card notation</h2>
    {HELP_TOPICS.map(item=>(
      <button key={item.id} className="help-topic" type="button" aria-label={item.title} onClick={()=>setTopicId(item.id)}>
        <span className="help-topic__title">{item.title}</span>
        <span className="help-topic__detail">{item.detail}</span>
      </button>
    ))}
    <p>This reference is built into Acquiring and works offline.</p>
  </nav>;
}

function HelpArticle({topic,onBack}:{topic:HelpTopic;onBack:()=>void}){
  const title=topic.id===HELP_TOPIC_INSTRUCTIONS?IntroductionCopy.TITLE:topic.title;
  return <article className="help-article" data-help-article={topic.id}>
    <button className="help-article__back" type="button" onClick={onBack}>&lt; Back</button>
    <h2>{title}</h2>
    {topic.id===HELP_TOPIC_INSTRUCTIONS&&<IntroductionArticle/>}
    {topic.id===HELP_TOPIC_SCALE_DEGREES&&<p data-help-degrees={HELP_SCALE_DEGREES.join('')}>{HELP_SCALE_DEGREES.join(' ')} / {HELP_C_MAJOR_NOTES.join(' ')}</p>}
    {topic.id===HELP_TOPIC_INTERVALS&&<table className="help-intervals"><tbody>{HELP_INTERVAL_ROWS.map(row=>
      <tr key={row.abbreviation+row.semitones}><th>{row.abbreviation}</th><td>{row.meaning}</td><td>{row.semitones}</td></tr>
    )}</tbody></table>}
    {topic.id===HELP_TOPIC_ROMAN&&<ul data-help-roman="quality">{HELP_ROMAN_QUALITY.map(example=>
      <li key={example.symbol}>{example.symbol} — {example.meaning}</li>
    )}</ul>}
  </article>;
}

function IntroductionArticle(){
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
