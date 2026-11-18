import {useState} from 'react';

/** Native LibraryExampleShuffleRow (Android 1b86ef6c/08280a4e): shuffle button, "Shuffle Songs", and a compact
 * Minimum Popularity menu listing 100%..0% then Any (default 80%; Any keeps unscored songs). */
export const EXAMPLE_SHUFFLE_DEFAULT_PERCENT=80;
export const EXAMPLE_SHUFFLE_OPTIONS:readonly (number|null)[]=Object.freeze([
  ...Array.from({length:101},(_,index)=>100-index),null,
]);

export function LibraryExampleShuffle({onShuffle}:{onShuffle:(minimumPopularityPercent:number|null)=>void}){
  const [cutoff,setCutoff]=useState<number|null>(EXAMPLE_SHUFFLE_DEFAULT_PERCENT);
  return <div className="library-example-shuffle" data-example-shuffle="">
    <button type="button" className="library-example-shuffle__button" aria-label="Shuffle example songs"
      onMouseDown={event=>event.preventDefault()} onClick={()=>onShuffle(cutoff)}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 7h3.5c2.5 0 3.7 1.4 5.5 5s3 5 5.5 5H21M18 14l3 3-3 3M3 17h3.5c1.3 0 2.2-.4 3-1.1M14 8.1c.8-.7 1.7-1.1 3-1.1H21M18 4l3 3-3 3"/>
      </svg>
    </button>
    <span className="library-example-shuffle__title">Shuffle Songs</span>
    <label className="library-example-shuffle__cutoff">
      <span>Minimum Popularity</span>
      <select aria-label="Minimum Popularity" value={cutoff===null?'any':String(cutoff)}
        onChange={event=>setCutoff(event.currentTarget.value==='any'?null:Number(event.currentTarget.value))}>
        {EXAMPLE_SHUFFLE_OPTIONS.map(option=>option===null
          ?<option key="any" value="any">Any</option>
          :<option key={option} value={option}>{option}%</option>)}
      </select>
    </label>
  </div>;
}
