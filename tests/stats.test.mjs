import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {selectRecords,summarize,groupedPoints,departmentClass,exportTable,EXPORT_HEADER} from '../app/stats.mjs';
const data=JSON.parse(readFileSync(new URL('../app/data/atlas.json',import.meta.url)));
const aggregates=JSON.parse(readFileSync(new URL('../reports/aggregates.json',import.meta.url)));
const base={from:data.audit.min_year,to:data.audit.max_year,category:'',dep:'',search:'',includeUndated:true};
const cases=[base,...Array.from({length:base.to-base.from+1},(_,i)=>({...base,from:base.from+i,to:base.from+i,includeUndated:false})),
  ...Object.keys(data.categories).map(category=>({...base,category})),
  ...Object.keys(data.departments).map(dep=>({...base,dep})),
  ...['Paris','Saint-Denis','Marseille','75056','ZZZ INEXISTANT','Seine-Saint-Denis','Ariege','93'].map(search=>({...base,search})),
  ...['06','93','974','2A'].flatMap(dep=>['appartements','maisons'].map(category=>({...base,dep,category,from:2015,to:2024,includeUndated:false})))];
for(const f of cases){
  const records=selectRecords(data.records,f,data.communes,data.departments),s=summarize(records);
  assert.equal(Object.values(s.precision).reduce((a,b)=>a+b,0),s.total);
  assert.equal(Object.values(s.deps).reduce((a,b)=>a+b,0)+s.unknownDep,s.total);
  assert.equal(Object.values(s.towns).reduce((a,b)=>a+b,0)+s.unknownTown,s.total);
  assert.equal(Object.values(s.years).reduce((a,b)=>a+b,0),s.total);
  for(const levels of [['adresse'],['adresse','rue'],['commune']]){
    assert.equal(groupedPoints(records,levels).features.reduce((a,p)=>a+p.properties.n,0),levels.reduce((a,k)=>a+s.precision[k],0));
  }
  // Independent precomputed cube provides a second route for filters and aggregation.
  if(!f.search){
    const n=aggregates.filter(a=>((a[0]!==null&&a[0]>=f.from&&a[0]<=f.to)||(a[0]===null&&f.includeUndated))&&(!f.category||a[1]===f.category)&&(!f.dep||a[2]===f.dep)).reduce((n,a)=>n+a[5],0);
    assert.equal(s.total,n);
  }
}
assert.equal(summarize(data.records).total,87811);
assert.equal(summarize(data.records).geolocated,85232);
assert.equal(selectRecords(data.records,{...base,from:2024,to:2024,includeUndated:false},data.communes).length,4601);
assert.equal(selectRecords(data.records,{...base,from:2027,to:2028,includeUndated:false},data.communes).length,0);
assert.equal(selectRecords(data.records,{...base,category:'actifs-immateriels'},data.communes).length,117);
assert.equal(groupedPoints(data.records,['commune']).features.reduce((n,p)=>n+p.properties.n,0),85232);
assert.equal(departmentClass(0),0);assert.equal(departmentClass(49),1);assert.equal(departmentClass(50),2);assert.equal(departmentClass(1200),6);
assert.equal(selectRecords(data.records,{...base,search:'Seine-Saint-Denis'},data.communes,data.departments).length,summarize(data.records).deps['93']);
assert.equal(selectRecords(data.records,{...base,search:'93'},data.communes,data.departments).length,summarize(data.records).deps['93']);
const table=exportTable(data.records,data);
assert.equal(table.length,data.records.length+1);assert.ok(table.every(row=>row.length===EXPORT_HEADER.length));
assert.ok(table.slice(1).every(row=>row[5].startsWith('https://www.licitor.com/annonce/')&&!row.includes(undefined)));
console.log(`${cases.length} scénarios de filtres réels : comptages, cube, pondération des points et chaleur concordants.`);
