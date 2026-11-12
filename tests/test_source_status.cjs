'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={};vm.createContext(context);
vm.runInContext(fs.readFileSync('assets/web-loader.js','utf8'),context);
const data={hydro:[{id:'1',station:'La Capilla'}],hydroHistory:{sourceDate:'2026-11-12',errors:[{id:'1',variable:'caudal'}],byStation:{
 '1':{caudal:{days:{'2026-11-12':{value:13.7}}}},
 '2':{level:{days:{'2026-11-10':{value:0},'2026-11-13':{value:3}}}}
}}};
const status={records:1,requested:2,failedStations:1,cut:'2026-11-12'};
const summary=context.hydroUpdateSummary(data,status,x=>x);
assert.match(summary,/1 de 2 series consultadas; 1 sin respuesta válida/);
assert.match(summary,/1 series con lectura al 2026-11-12; 1 con última lectura anterior/);
assert.match(summary,/La Capilla \(caudal; último dato 2026-11-12\)/);
assert.equal(data.hydroHistory.byStation['1'].caudal.days['2026-11-12'].value,13.7);
data.hydroHistory.errors=[];
const complete=context.hydroUpdateSummary(data,{...status,records:2,failedStations:0},x=>x);
assert.doesNotMatch(complete,/sin respuesta válida/);
assert.match(complete,/1 con última lectura anterior/);
console.log('Estado de ríos: consultas, antigüedad, lectura cero y fecha futura comprobados.');
