const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
function setup(){
 const data=new Map();let time=Date.parse('2026-10-29T12:00:00+09:00');
 const p={getProperty:k=>data.get(k)||null,getProperties:()=>Object.fromEntries(data),setProperty:(k,v)=>{assert.ok(Buffer.byteLength(v)<9000);data.set(k,v)},deleteProperty:k=>data.delete(k)};
 const ctx=vm.createContext({Date:class extends Date{static now(){return time}},PropertiesService:{getScriptProperties:()=>p},Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(algorithm,text)=>Array.from(crypto.createHash(algorithm).update(text).digest())},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this}})}});
 for(const name of ['Auth','Raffle','Vote','Quiz','Third'])vm.runInContext(fs.readFileSync('server/'+name+'.gs','utf8'),ctx);
 vm.runInContext(fs.readFileSync('tests/fixtures/legacy-server.cjs','utf8')+'\nfunction giftAction(q){return raffleAction(q)}',ctx);
 const call=q=>JSON.parse(ctx.handle(JSON.parse(JSON.stringify(q))).text);
 const seed=(i,ver='a'.repeat(64))=>{data.set('reg_'+i,JSON.stringify({salt:Buffer.alloc(16,i+1).toString('base64'),ver,pub:'encrypted-public',enc:'encrypted-private',iv:'encrypted-iv',fails:0}));};
 for(let i=0;i<11;i++)seed(i);
 const op=(op,extra={})=>call({a:'gift',op,...extra});
 const login=(i,ver='a'.repeat(64))=>{const s=op('authSalt',{i});return op('authLogin',{i,ver,revision:s.revision})};
 const admin=(action,extra={})=>op(action,{pw:'test-only-password',...extra});
 return{data,call,op,login,admin,seed,time:()=>time,setTime:t=>time=t,ctx};
}
module.exports=setup;
