/** Frozen Scraper.sectionRefsFromDocument; HTML5 parsing, never regex scraping. */
import {parse,type DefaultTreeAdapterMap} from 'parse5';
import {sectionTypeKey} from '../data/section-order';
type Node=DefaultTreeAdapterMap['node'];
type Element=DefaultTreeAdapterMap['element'];
export interface HarvestSectionRef {songId:string;sectionName:string|null}
const isElement=(node:Node):node is Element=>'tagName' in node;
const attribute=(node:Element,name:string)=>node.attrs.find(attr=>attr.name===name)?.value??'';
const BLOCKS=new Set(['address','article','aside','blockquote','div','dl','fieldset','figcaption','figure','footer','form','h1','h2','h3','h4','h5','h6','header','hr','li','main','nav','ol','p','pre','section','table','tr','ul']);
function textOf(root:Element):string {
  const pieces:string[]=[];
  function visit(node:Node,depth:number) {
    if(depth>256)throw new Error('HTML nesting limit');
    if(node.nodeName==='#text')pieces.push((node as DefaultTreeAdapterMap['textNode']).value);
    if(!isElement(node))return;
    if(['script','style','template'].includes(node.tagName))return;
    const boundary=BLOCKS.has(node.tagName)||node.tagName==='br';
    if(boundary)pieces.push(' ');
    for(const child of node.childNodes)visit(child,depth+1);
    if(boundary)pieces.push(' ');
  }
  visit(root,0);
  return pieces.join('').replace(/[\u200b\u00ad]/g,'').replace(/[ \t\n\f\r\u00a0]+/g,' ').trim();
}
export function pageSectionRefs(html:string):HarvestSectionRef[] {
  const elements:Element[]=[],stack:{node:Node;depth:number}[]=[{node:parse(html),depth:0}];
  while(stack.length) {
    const {node,depth}=stack.pop()!;
    if(depth>256||elements.length>100_000)throw new Error('HTML resource limit');
    if(isElement(node))elements.push(node);
    if('childNodes' in node)for(let i=node.childNodes.length-1;i>=0;i--)stack.push({node:node.childNodes[i]!,depth:depth+1});
  }
  const sections:HarvestSectionRef[]=[],seen=new Set<string>();
  for(const tab of elements) {
    if(tab.tagName!=='a'||!attribute(tab,'class').split(/[ \t\r\n\f]+/).includes('tb-section-tab'))continue;
    const href=attribute(tab,'href');if(!href.startsWith('#tab-'))continue;
    const id=href.slice(5),name=textOf(tab);
    if(!id||name.toLowerCase()==='all sections')continue;
    const key=sectionTypeKey(name);
    if(!seen.has(key)){seen.add(key);sections.push({songId:id,sectionName:name});}
  }
  if(sections.length)return sections;
  for(const container of elements) {
    const id=attribute(container,'id');if(!id.startsWith('tab-'))continue;
    const songId=id.slice(4);
    if(songId&&songId!=='player'&&!seen.has(songId)){seen.add(songId);sections.push({songId,sectionName:null});}
  }
  return sections;
}
