// Feature unit tests supply a signed-in identity through the shared auth interface.
// Full credential/session/transport behavior is tested by auth*.test.cjs.
module.exports=function(context){
 let who=null;const listeners=[],selects=[];
 const auth={identity:()=>who,epoch:0,bindIdentity:s=>{s.hidden=true;selects.push(s)},summary(){},open(){},beforeLogout(){},subscribe:f=>listeners.push(f),errorText:e=>e.code||e.message,
  async request(q,options={}){
   if(options.required&&who===null)throw Object.assign(Error('auth_required'),{code:'auth_required'});
   const r=await context.fetch(context.window.GJ_API,{method:'POST',body:JSON.stringify(q),keepalive:!!options.keepalive});
   const j=await r.json();if(!j.ok)throw Object.assign(Error(j.err),{code:j.err});return j;
  },async login(i){who=i;auth.epoch++;selects.forEach(s=>s.value=i===null?'':String(i));listeners.forEach(f=>f());await new Promise(r=>setImmediate(r));}};
 context.window.GJ_AUTH=auth;return auth;
};
