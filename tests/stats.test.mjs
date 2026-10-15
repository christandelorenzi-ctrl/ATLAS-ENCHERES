import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {selectRecords,summarize,groupedPoints,departmentClass,exportTable,EXPORT_HEADER,filtersToQuery,filtersFromQuery,rate,rateRank,quantileThresholds,quantileClass,MIN_TOWN_POPULATION,territorySheet} from '../app/stats.mjs';
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
// Lien partageable : écrire puis relire l'adresse redonne exactement les mêmes filtres.
const {includeUndated,...defaults}=base;
assert.equal(filtersToQuery(defaults,'heat',data.audit),'');
assert.deepEqual(filtersFromQuery('',data),{mode:'heat',measure:'count',sheet:null,filters:defaults});
for(const f of cases)for(const mode of ['heat','points','departments'])for(const measure of ['count','rate']){
  const {includeUndated,...filters}=f;
  assert.deepEqual(filtersFromQuery('?'+filtersToQuery(filters,mode,data.audit,measure),data),{mode,measure,sheet:null,filters});
}
assert.equal(filtersFromQuery('?mesure=nimporte',data).measure,'count');
// Adresses mal tapées ou trafiquées : chaque valeur impossible est ignorée.
for(const bad of ['?debut=1800','?fin=3000','?debut=abc','?debut=2010.5','?categorie=chateaux','?categorie=constructor',
  '?departement=99','?departement=__proto__','?mode=satellite','?debut=&fin=']){
  const {filters,mode}=filtersFromQuery(bad,data);
  assert.equal(mode,'heat',bad);assert.equal(filters.from,base.from,bad);assert.equal(filters.to,base.to,bad);
  assert.equal(filters.category,'',bad);assert.equal(filters.dep,'',bad);
}
assert.deepEqual(filtersFromQuery('?debut=2020&fin=2010',data).filters.from,2010);  // années inversées : remises dans l'ordre
assert.equal(filtersFromQuery('?recherche='+'x'.repeat(500),data).filters.search.length,100);
// Taux pour 10 000 habitants.
assert.equal(rate(5,10000),5);assert.equal(rate(3,0),null);assert.equal(rate(3,undefined),null);
const all=summarize(data.records);
const depRates=rateRank(all.deps,data.departmentPopulation);
assert.ok(depRates.every(([code,value])=>Math.abs(value-(all.deps[code]||0)/data.departmentPopulation[code]*1e4)<1e-9));
assert.ok(depRates.every(([,v],i)=>i===0||depRates[i-1][1]>=v));  // trié du plus fort au plus faible
const townPops=Object.fromEntries(Object.entries(data.communes).map(([code,c])=>[code,c.population]));
assert.ok(rateRank(all.towns,townPops,MIN_TOWN_POPULATION).every(([code])=>townPops[code]>=MIN_TOWN_POPULATION));
// Classes de la carte : 6 groupes de même taille, classe 0 réservée aux départements sans entrée.
const values=depRates.map(([,v])=>v),th=quantileThresholds(values);
assert.equal(th.length,5);assert.ok(th.every((t,i)=>i===0||th[i-1]<=t));
const sizes=[0,0,0,0,0,0,0];values.forEach(v=>sizes[quantileClass(v,th)]++);
assert.equal(sizes[0],values.filter(v=>!(v>0)).length);
assert.ok(sizes.slice(1).every(n=>Math.abs(n-values.filter(v=>v>0).length/6)<=2),String(sizes));
assert.equal(quantileClass(0,th),0);assert.equal(quantileClass(null,th),0);assert.deepEqual(quantileThresholds([0,0]),[]);
// Fiche territoire : lien partageable.
for(const sheet of [{kind:'dep',code:'93'},{kind:'dep',code:'2A'},{kind:'dep',code:'974'},{kind:'town',code:'75056'},{kind:'town',code:'06088'}]){
  const {includeUndated,...filters}=base;
  assert.deepEqual(filtersFromQuery('?'+filtersToQuery(filters,'heat',data.audit,'count',sheet),data).sheet,sheet);
}
for(const bad of ['?fiche=departement-99','?fiche=commune-00000','?fiche=pays-FR','?fiche=departement','?fiche=departement-__proto__','?fiche=-93'])
  assert.equal(filtersFromQuery(bad,data).sheet,null,bad);
// Fiche territoire : chaque chiffre est comparé à un calcul indépendant fait avec les filtres existants.
const francePop=Object.values(data.departmentPopulation).reduce((a,b)=>a+b,0);
for(const f of [base,{...base,from:2015,to:2024,includeUndated:false},{...base,category:'maisons'},{...base,from:2026,to:2026,includeUndated:false}]){
  for(const [kind,code] of [['dep','93'],['dep','06'],['dep','2A'],['dep','971'],['town','75056'],['town','13055'],['town','06088']]){
    const s=territorySheet(data,f,kind,code);
    const expected=selectRecords(data.records,{...f,dep:kind==='dep'?code:''},data.communes,data.departments).filter(r=>kind==='dep'||r.commune===code);
    assert.equal(s.count,expected.length,`${kind} ${code}`);
    assert.equal(s.categories.reduce((n,[,c])=>n+c,0),s.count);
    const undated=expected.filter(r=>r.year===null).length;
    assert.equal(s.years.reduce((n,y)=>n+y.count,0)+undated,s.count);
    assert.equal(s.years.length,f.to-f.from+1);
    const pop=kind==='dep'?data.departmentPopulation[code]:data.communes[code].population;
    assert.ok(Math.abs(s.rate-s.count/pop*1e4)<1e-9);
    assert.ok(Math.abs(s.franceRate-selectRecords(data.records,f,data.communes,data.departments).length/francePop*1e4)<1e-9);
    // Un département absent de toute la base (ex. Corse-du-Sud) n'a pas de rang.
    if(kind==='dep'){assert.ok(data.records.some(r=>r.dep===code)?s.rank>=1&&s.rank<=s.rankOf:s.rank===null,code);assert.equal(s.towns.reduce((n,[,c])=>n+c,0)+expected.filter(r=>!r.commune).length,s.count);}
    assert.ok(s.upcoming.every(r=>r.upcoming&&(kind==='dep'?r.dep===code:r.commune===code)));
    assert.ok(s.upcoming.every((r,i)=>i===0||s.upcoming[i-1].date<=r.date));
  }
}
assert.equal(territorySheet(data,base,'dep','75').rank,5);  // Paris : 5e taux national (vérifié à la main dans le classement)
assert.equal(territorySheet(data,base,'dep','93').rankOf,new Set(data.records.map(r=>r.dep).filter(Boolean)).size);  // rang parmi les départements couverts
console.log(`${cases.length} scénarios de filtres réels : comptages, cube, pondération des points et chaleur concordants.`);
