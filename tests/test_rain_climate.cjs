const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),zlib=require('node:zlib'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
const context=vm.createContext({console,Uint8Array,atob,pako:{ungzip:(bytes)=>zlib.gunzipSync(bytes).toString()},rainActiveEntry:null});
vm.runInContext(source.slice(source.indexOf('let rainClimateReference=null;'),source.indexOf('function climateMode()')),context);
const envelope=JSON.parse(fs.readFileSync(path.join(root,'data/reference.json'),'utf8'));
const raw=JSON.parse(zlib.gunzipSync(Buffer.from(envelope.parts.map(p=>fs.readFileSync(path.join(root,p),'utf8')).join(''),'base64')));
context.raw=raw;vm.runInContext('rainClimateReference=validateRainReference(raw)',context);
const bad=structuredClone(raw);bad.months['2'].expectedDays--;context.bad=bad;
assert.throws(()=>vm.runInContext('validateRainReference(bad)',context));
for(const coords of [[-12.05,-77.05],[-3.55,-80.45]]){
 context.r={coords,value:.1,periodStart:'2026-11-11T07:00:00-05:00'};
 const c=vm.runInContext('rainClimateClass(r)',context);assert.equal(c.supported,true);assert.equal(c.basis,'all');assert.notEqual(c.code,0);
 context.r.value=0;assert.equal(vm.runInContext('rainClimateClass(r).code',context),0);
}
const month=raw.months['11'],idx=month.validDays.findIndex(n=>n>=month.expectedDays*.8);
const saved=['p90','p95','p99'].map(k=>month.allDays[k][idx]);for(const k of ['p90','p95','p99'])month.allDays[k][idx]=0;
assert.ok(idx>=0);context.r={coords:[raw.lat[Math.floor(idx/raw.lon.length)],raw.lon[idx%raw.lon.length]],value:.1,periodStart:'2026-11-11'};
assert.equal(vm.runInContext('rainClimateClass(r).code',context),4);
['p90','p95','p99'].forEach((k,i)=>month.allDays[k][idx]=saved[i]);
vm.runInContext(source.slice(source.indexOf('function rainGridValue('),source.indexOf('function buildIntensitySurface(')),context);
context.grid={width:3,height:2,transform:[.1,0,-77,0,-.1,-12],values:[0,20,null,.09,.1,30]};
for(const expr of ['rainGridValue(grid,-12.05,-76.95)','rainGridValue(grid,-12.05,-76.75)','rainGridValue(grid,-12.15,-76.95)','rainGridValue(grid,-12.05,-76.901)','rainGridValue(grid,-10,-70)'])assert.equal(vm.runInContext(expr,context),null);
assert.ok(Math.abs(vm.runInContext('rainGridValue(grid,-12.15,-76.85)',context)-.1)<1e-9);
assert.ok(vm.runInContext('rainGridValue(grid,-12.05,-76.899)',context)>=.1);
console.log('OK: 12 months, Lima/Tumbes, zero thresholds, trace rainfall, dry/nodata masks.');
