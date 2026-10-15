export const normalize = s => String(s).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
export function selectRecords(records, f, communes, departments={}) {
  const q=normalize(f.search||'').trim();
  const exactTowns=new Set(Object.entries(communes).filter(([code,c])=>normalize(c.name)===q||normalize(code)===q).map(([code])=>code));
  const exactDeps=new Set(Object.entries(departments).filter(([code,name])=>normalize(code)===q||normalize(name)===q).map(([code])=>code));
  const matchedDeps=new Set(Object.entries(departments).filter(([code,name])=>normalize(code)===q||normalize(name).includes(q)).map(([code])=>code));
  return records.filter(r => ((r.year!==null && r.year>=f.from && r.year<=f.to) || (r.year===null && f.includeUndated)) &&
    (!f.category || r.category===f.category) && (!f.dep || r.dep===f.dep) &&
    (!q || (exactTowns.size?exactTowns.has(r.commune):exactDeps.size?exactDeps.has(r.dep):
      normalize(`${communes[r.commune]?.name||''} ${r.commune}`).includes(q)||matchedDeps.has(r.dep))));
}
export function summarize(records) {
  const deps={},towns={},years={},precision={adresse:0,rue:0,commune:0,non_resolue:0};
  for (const r of records) {
    if(r.dep) deps[r.dep]=(deps[r.dep]||0)+1;
    if(r.commune) towns[r.commune]=(towns[r.commune]||0)+1;
    years[r.year]=(years[r.year]||0)+1;
    precision[r.precision]++;
  }
  const rank=values=>Object.entries(values).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  return {total:records.length,deps,towns,years,precision,depRank:rank(deps),townRank:rank(towns),
    geolocated:records.length-precision.non_resolue,unknownDep:records.filter(r=>!r.dep).length,
    unknownTown:records.filter(r=>!r.commune).length};
}
export function groupedPoints(records, levels) {
  const groups=new Map();
  for(const r of records) {
    if(!r.coordinates || !levels.includes(r.precision)) continue;
    const key=r.coordinates.join(',')+':'+r.precision;
    if(!groups.has(key)) groups.set(key,{type:'Feature',geometry:{type:'Point',coordinates:r.coordinates},
      properties:{key,n:0,precision:r.precision,commune:r.commune}});
    groups.get(key).properties.n++;
  }
  return {type:'FeatureCollection',features:[...groups.values()]};
}
export const CHORO = [0,1,50,150,300,600,1200];
export function departmentClass(count) {
  let result=0;
  CHORO.forEach((threshold,i)=>{if(count>=threshold) result=i;});
  return result;
}
