'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
async function run(viewCut){
 const calls=[],elements={embeddedData:{textContent:'{"data":""}'},liveData:{textContent:'null'},sourceStatusData:{textContent:'null'},rainClimateReference:{textContent:'null'}};
 const manifest={schema:'fen-site/v1',runtime:'data/view.json',parts:['data/base-000.txt'],payloadCharacters:4,payloadSha256:'hash',reference:'data/reference.json',assets:[],snapshotDate:'2026-11-09'};
 const files={'data/manifest.json':JSON.stringify(manifest),'data/status.json':JSON.stringify({checkedAt:'new'}),'data/view.json':JSON.stringify({schema:'fen-view/v1',baseSha256:'hash',checkedAt:viewCut,encoding:'gzip-base64',data:'thin'}),'data/base-000.txt':'full','data/live.json':'{"schema":"fen-live/v1"}','data/reference.json':'null'};
 const context={window:{},document:{getElementById:id=>elements[id]},fetch:async path=>{calls.push(path);return {ok:true,text:async()=>files[path]};}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('assets/web-loader.js','utf8'),context);
 await context.prepareWebData();return {context,calls,elements};
}
(async()=>{
 const fast=await run('new');assert(!fast.calls.includes('data/base-000.txt'));assert(!fast.calls.includes('data/live.json'));assert.equal(JSON.parse(fast.elements.embeddedData.textContent).data,'thin');
 await fast.context.ensureFullSiteData();assert(fast.calls.includes('data/base-000.txt'));assert(fast.calls.includes('data/live.json'));assert.equal(JSON.parse(fast.elements.embeddedData.textContent).data,'full');
 const stale=await run('old');assert(stale.calls.includes('data/base-000.txt'));assert.equal(JSON.parse(stale.elements.embeddedData.textContent).data,'full');
 console.log('Carga: vista ligera vigente, respaldo ante desfase y base completa para descargas.');
})().catch(error=>{console.error(error);process.exitCode=1;});
