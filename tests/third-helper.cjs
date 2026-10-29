const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
module.exports=function setup(){
 const data=new Map();let uuid=0,time=1000;
 const p={getProperty:k=>data.get(k)||null,getProperties:()=>Object.fromEntries(data),setProperty:(k,v)=>{assert.ok(Buffer.byteLength(v)<9000,'property fits Apps Script limit');data.set(k,v)},deleteProperty:k=>data.delete(k)};
 const ctx=vm.createContext({Date:class extends Date{static now(){return time++}},Utilities:{getUuid:()=>((++uuid*2654435761)>>>0).toString(16).padStart(8,'0')+'-1234-1234-1234-123456789abc'},PropertiesService:{getScriptProperties:()=>p},isAdmin:q=>q.pw==='test-only-password'});
 vm.runInContext(fs.readFileSync('server/Third.gs','utf8')+'\n'+fs.readFileSync('server/Raffle.gs','utf8'),ctx);
 const call=q=>JSON.parse(JSON.stringify(ctx.raffleAction(q))),status=i=>call({op:'thirdStatus',i});
 const admin=(op,extra={})=>call({op,pw:'test-only-password',revision:status().revision,...extra});
 const save=(i,prompt='질문 주인공 '+i,extra={})=>call({op:'thirdSave',i,prompt,entryRevision:status(i).mine.entry?.revision,...extra});
 const vote=(i,choices,extra={})=>{const s=status();return call({op:'thirdVote',i,runId:s.runId,round:s.round,stage:s.stage,choices,...extra})};
 return{data,call,status,admin,save,vote,start:(i=2)=>{save(i);return admin('thirdStart')}};
};
