import {expect,it,vi} from 'vitest';
import {harvestCommitMutation,persistHarvest,type HarvestCommitRequest} from './commit-harvest';
import {base64ToBytes} from './user-harvest-ledger';
const data='{"10":{"songId":"10","numericId":"9007199254740993","sectionName":"Verse","sectionIndex":0,"songInfo":"S","metadata":{"keys":[{"scale":"major"},{"scale":"natural minor"},{"scale":"dorian"},{"scale":"major"}],"version":9007199254740993},"chords":[{"root":1}]}}';
const request:HarvestCommitRequest={operationId:'op',harvestedAt:42,document:{song:{slug:'a__s',artist:'A',title:' Song',url:'https://www.hooktheory.com/theorytab/view/a/s',status:'enriched'},data,sectionCount:1}};
it('derives native alpha and sorted distinct modes; reuses existing T06 encoded mutation unchanged',()=>{
 const mutation=harvestCommitMutation(request);expect(mutation).toMatchObject({namespace:'guest',store:'harvests',id:'a__s',operationId:'op',createdAt:42,value:{alphaGroup:'S',modes:'aeolian\ndorian\nionian',harvestedAt:42}});
 expect(new TextDecoder().decode(base64ToBytes((mutation.value as {dataBlob:string}).dataBlob)!)).toBe(data);
});
it.each([null,{}, {...request,harvestedAt:-1},{...request,operationId:''},{...request,document:{...request.document,sectionCount:2}},{...request,document:{...request.document,data:'{}'}},{...request,document:{...request.document,data:data.replace('"sectionIndex":0','"sectionIndex":1')}},{...request,document:{...request.document,song:{...request.document.song,slug:'__meta:flag'}}}])('rejects incomplete/invalid request before a write %#',async bad=>{
 const store={mutate:vi.fn()};await expect(persistHarvest(bad as HarvestCommitRequest,store)).rejects.toThrow();expect(store.mutate).not.toHaveBeenCalled();
});
it('forwards cancellation and returns only a completed existing transaction receipt',async()=>{
 const signal=new AbortController().signal;const mutate=vi.fn().mockResolvedValue({applied:false,receipt:{sequence:7}});
 expect(await persistHarvest(request,{mutate},signal)).toEqual({slug:'a__s',applied:false,sequence:7});expect(mutate.mock.calls[0]![1]).toBe(signal);
});
