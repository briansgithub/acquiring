/** Native HummingIntervalPopup EXPAND_ANIMATION_MS/clearAfterCollapse, visual data only. */
export const SINGING_EXPAND_MS=300;
export class SingingExit<T> {
  private revision=0;
  snapshot:T|null=null;
  begin(snapshot:T):number {this.snapshot=snapshot;return ++this.revision;}
  get token():number {return this.revision;}
  finish(token:number):boolean {if(token!==this.revision)return false;this.clear();return true;}
  reopen():T|null {const snapshot=this.snapshot;this.clear();return snapshot;}
  clear():void {++this.revision;this.snapshot=null;}
}
