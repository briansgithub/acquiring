import {describe,expect,it} from 'vitest';
import {
  INTRODUCTION_COMPLETED_KEY,INTRODUCTION_PREFS_KEY,createIntroductionPrefs,parseIntroductionCompleted,
} from './introduction-prefs';

describe('native IntroductionPrefs',()=>{
  it('defaults incomplete and survives only an explicit completed write',()=>{
    const data=new Map<string,string>();
    const prefs=createIntroductionPrefs({
      getItem(key){return data.get(key)??null;},
      setItem(key,value){data.set(key,value);},
    });
    expect(prefs.hasCompleted()).toBe(false);
    prefs.markCompleted();
    expect(prefs.hasCompleted()).toBe(true);
    expect(JSON.parse(data.get(INTRODUCTION_PREFS_KEY)!)).toEqual({[INTRODUCTION_COMPLETED_KEY]:true});
  });

  it('refuses malformed or non-true payloads',()=>{
    expect(parseIntroductionCompleted(null)).toBe(false);
    expect(parseIntroductionCompleted('{')).toBe(false);
    expect(parseIntroductionCompleted('{"hasCompletedIntroduction":false}')).toBe(false);
    expect(parseIntroductionCompleted('{"hasCompletedIntroduction":"true"}')).toBe(false);
    expect(parseIntroductionCompleted('{"hasCompletedIntroduction":true}')).toBe(true);
  });
});
