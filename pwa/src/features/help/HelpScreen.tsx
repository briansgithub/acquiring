/** Frozen 801cf798 HelpIndex / HelpArticleScreen. */
import {useState} from 'react';
import {
  HELP_TOPIC_INSTRUCTIONS,HELP_TOPIC_INTERVALS,HELP_TOPIC_ROMAN,HELP_TOPIC_SCALE_DEGREES,
  HELP_TOPICS,type HelpTopic,
} from './help-catalog';
import {IntroductionArticle} from './IntroductionArticle';
import {IntroductionCopy} from './introduction-copy';
import {IntervalsHelpArticle,ScaleDegreesHelpArticle} from './notation-articles';
import {RomanNumeralsHelpArticle} from './roman-article';
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
    {topic.id===HELP_TOPIC_SCALE_DEGREES&&<ScaleDegreesHelpArticle/>}
    {topic.id===HELP_TOPIC_INTERVALS&&<IntervalsHelpArticle/>}
    {topic.id===HELP_TOPIC_ROMAN&&<RomanNumeralsHelpArticle/>}
  </article>;
}
