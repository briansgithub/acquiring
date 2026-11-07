/** Bounded strict JSON reader: preserve provider numeric lexemes instead of Number-rounding IDs/data.
 * Native DataExtractor also accepts lenient JSON; that broader syntax is explicitly not supported yet.
 */
export interface RawJson {
  raw:string;
  kind:'object'|'array'|'string'|'primitive';
  fields?:Map<string,RawJson>;
  items?:RawJson[];
}
export function readRawJson(text:string):RawJson {
  let at=0,tokens=0;
  const whitespace=()=>{while(/[ \t\r\n]/.test(text[at]??'!'))at++;};
  function string():string {
    const start=at++;
    while(at<text.length) {
      const ch=text[at++];
      if(ch?.charCodeAt(0)===92)at++;
      else if(ch?.charCodeAt(0)===34) {const raw=text.slice(start,at);JSON.parse(raw);return raw;}
    }
    throw new Error('Unterminated JSON string');
  }
  function value(depth:number):RawJson {
    whitespace();
    if(depth>64||++tokens>200_000)throw new Error('JSON resource limit');
    const start=at,ch=text[at];
    if(ch?.charCodeAt(0)===34)return {kind:'string',raw:string()};
    if(ch==='{'||ch==='[') {
      at++;whitespace();const fields=new Map<string,RawJson>(),items:RawJson[]=[];
      const close=ch==='{'?'}':']';
      if(text[at]!==close)while(true) {
        whitespace();
        if(ch==='{') {
          if(text[at]!=='"')throw new Error('Expected JSON key');
          const key=JSON.parse(string()) as string;whitespace();
          if(text[at++]!==':')throw new Error('Expected colon');
          fields.set(key,value(depth+1));
        } else items.push(value(depth+1));
        whitespace();if(text[at]===close)break;
        if(text[at++]!==',')throw new Error('Expected comma');
      }
      at++;
      return ch==='{'?{kind:'object',raw:text.slice(start,at),fields}:{kind:'array',raw:text.slice(start,at),items};
    }
    const token=/^(?:null|true|false|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(at))?.[0];
    if(!token)throw new Error('Invalid JSON scalar');
    at+=token.length;return {kind:'primitive',raw:token};
  }
  const result=value(0);whitespace();if(at!==text.length)throw new Error('Trailing JSON');return result;
}
export function compactRawJson(value:RawJson):string {
  if(value.kind==='object')return '{'+[...value.fields!].map(([key,item])=>JSON.stringify(key)+':'+compactRawJson(item)).join(',')+'}';
  if(value.kind==='array')return '['+value.items!.map(compactRawJson).join(',')+']';
  return value.kind==='string'?JSON.stringify(JSON.parse(value.raw)):value.raw;
}
export function stringValue(value:RawJson|undefined):string|undefined {
  return value?.kind==='string'?JSON.parse(value.raw) as string:undefined;
}
