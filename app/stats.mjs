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
export const sourceUrl = (r, data) => data.urlPrefix + r.url;  // lien complet de l'annonce Licitor
// Tableau de l'export CSV : une ligne d'en-tête puis une ligne par entrée.
// Les cases oui/non absentes des données valent « non » (voir scripts/prepare_licitor.py).
export const EXPORT_HEADER = ['id_entree','date_audience_annoncee','categorie','adresse_source','organisateur','url','code_insee','departement','precision','longitude','latitude','score_geocodage_non_disponible','origine_commune','raison_precision','annonce_multi_entrees','id_annonce_licitor','nature_publiee','url_audience','date_atypique','actif_immateriel'];
export function exportTable(records, data) {
  const rows = records.map(r => [r.id, r.date, data.categories[r.category], data.addresses[r.address], data.organizers[r.organizer],
    sourceUrl(r, data), r.commune, r.dep, r.precision, ...(r.coordinates || ['', '']), '', data.audit.origin, data.reasons[r.reason],
    Boolean(r.similar), r.announcementId, data.natures[r.nature], data.audiences[r.audience], Boolean(r.dateAnomaly), Boolean(r.immaterial)]);
  return [EXPORT_HEADER, ...rows];
}
// Lien partageable : les filtres et le mode de carte sont écrits dans l'adresse de la page
// (ex. ?debut=2015&departement=93&mode=points). Les valeurs par défaut ne sont pas écrites.
const MODE_NAMES = {heat:'chaleur', points:'points', departments:'departements'};
export function filtersToQuery(f, mode, audit) {
  const p = new URLSearchParams();
  if (f.from !== audit.min_year) p.set('debut', f.from);
  if (f.to !== audit.max_year) p.set('fin', f.to);
  if (f.category) p.set('categorie', f.category);
  if (f.dep) p.set('departement', f.dep);
  if (f.search) p.set('recherche', f.search);
  if (mode !== 'heat') p.set('mode', MODE_NAMES[mode]);
  return p.toString();
}
// Lit une adresse partagée. Toute valeur inconnue ou impossible est ignorée (valeur par défaut).
export function filtersFromQuery(query, data) {
  const p = new URLSearchParams(query), a = data.audit;
  const year = (key, fallback) => { const y = Number(p.get(key)); return p.has(key) && Number.isInteger(y) && y >= a.min_year && y <= a.max_year ? y : fallback; };
  let from = year('debut', a.min_year), to = year('fin', a.max_year);
  if (from > to) [from, to] = [to, from];
  const known = (table, value) => value !== null && Object.hasOwn(table, value) ? value : '';
  const mode = Object.keys(MODE_NAMES).find(k => MODE_NAMES[k] === p.get('mode')) || 'heat';
  return {mode, filters: {from, to, category: known(data.categories, p.get('categorie')),
    dep: known(data.departments, p.get('departement')), search: (p.get('recherche') || '').trim().slice(0, 100)}};
}
export const CHORO = [0,1,50,150,300,600,1200];
export function departmentClass(count) {
  let result=0;
  CHORO.forEach((threshold,i)=>{if(count>=threshold) result=i;});
  return result;
}
