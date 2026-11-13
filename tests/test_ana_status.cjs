'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync('assets/ana-status.js','utf8'),context);
for(const state of ['Ejecutado','Culminado',' EJECUTADA ','Concluido'])assert.equal(context.anaOfficialState(state).completed,true);
for(const state of ['En Ejecución','En Ejecucion','Por Ejecutar','Programado','Ejecutado parcialmente','',null])assert.equal(context.anaOfficialState(state).completed,false);
assert.equal(context.anaStatusMatches('Culminado','completed'),true);
assert.equal(context.anaStatusMatches('En Ejecucion','executing'),true);
assert.equal(context.anaStatusMatches('Programado','pending'),true);
assert.equal(context.anaStatusMatches('En Ejecución','completed'),false);
assert.equal(context.anaOfficialState('Culminado').color,'#2f7352');
console.log('ANA: estados oficiales normalizados; sin inferir culminación a partir del avance.');

for(const done of [1,1.01,'1','1,0']){
 const row={ESTADO:'En Ejecucion',AVANCEKM:done,META:1};
 assert.equal(context.anaProgressState(row).completed,true);
 assert.equal(context.anaStatusMatches(row,'completed'),true);
 assert.equal(context.anaStatusMatches(row,'executing'),false);
 assert.equal(row.ESTADO,'En Ejecucion');
}
for(const done of [0,.9999,null,undefined,'','no disponible'])assert.equal(context.anaProgressState({ESTADO:'En Ejecucion',AVANCEKM:done,META:1}).completed,false);
for(const target of [0,null,undefined,''])assert.equal(context.anaProgressState({ESTADO:'En Ejecucion',AVANCEKM:1,META:target}).completed,false);
assert.equal(context.anaProgressState({ESTADO:'En Ejecucion',AVANCEKM:.5,META:1,AVANCEPRESUPUESTOPOR:100}).completed,false);
assert.equal(context.anaProgressState({ESTADO:'Culminado',AVANCEKM:null,META:1}).completed,true);
console.log('ANA: ejecutado y en ejecución al 100 %; meta válida, avance físico y estado preservado.');
