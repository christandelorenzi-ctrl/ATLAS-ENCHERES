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
// Taux pour 10 000 habitants : nombre d'entrées de la sélection rapporté à la population.
// Une commune trop peu peuplée donne un taux trompeur (2 ventes dans un village de 40 habitants
// = 500 pour 10 000) : le classement des communes ne retient que celles d'au moins 5 000 habitants.
export const MIN_TOWN_POPULATION = 5000;
// Taux annuel moyen : sur une période de plusieurs années, on divise par le nombre d'années (years),
// pour qu'un taux sur 5 ans et un taux sur 20 ans restent comparables.
export const rate = (count, population, years = 1) => population > 0 && years > 0 ? count / years / population * 10000 : null;
export const periodYears = f => f.to - f.from + 1;
export function rateRank(counts, populations, minPopulation = 1, years = 1) {
  return Object.entries(populations).filter(([, p]) => p >= minPopulation)
    .map(([code, p]) => [code, rate(counts[code] || 0, p, years)])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
// Couleurs de la carte en mode taux : 6 groupes de même taille parmi les territoires ayant au moins
// une entrée (la classe 0 = aucune entrée). Renvoie les 5 seuils qui séparent ces groupes.
export function quantileThresholds(values, classes = 6) {
  const sorted = values.filter(v => v > 0).sort((a, b) => a - b);
  if (!sorted.length) return [];
  return Array.from({length: classes - 1}, (_, i) => sorted[Math.floor((i + 1) * sorted.length / classes)]);
}
export function quantileClass(value, thresholds) {
  if (!(value > 0)) return 0;
  return 1 + thresholds.filter(t => value >= t).length;
}

// Fiche territoire : les chiffres d'un département (kind 'dep') ou d'une commune (kind 'town')
// pour la sélection en cours. Période et catégorie s'appliquent ; le territoire remplace les filtres
// « département » et « recherche ». Les taux de la France utilisent la même population totale.
export function territorySheet(data, f, kind, code) {
  const all = selectRecords(data.records, {...f, dep: '', search: ''}, data.communes, data.departments);
  const inTerritory = r => kind === 'dep' ? r.dep === code : r.commune === code;
  const inside = all.filter(inTerritory);
  const townPopulations = Object.fromEntries(Object.entries(data.communes).map(([c, t]) => [c, t.population]));
  const population = kind === 'dep' ? data.departmentPopulation[code] : townPopulations[code];
  const francePopulation = Object.values(data.departmentPopulation).reduce((a, b) => a + b, 0);
  const own = summarize(inside), france = summarize(all);
  const years = [];
  for (let year = f.from; year <= f.to; year++) {
    const count = own.years[year] || 0;
    years.push({year, count, rate: rate(count, population), franceRate: rate(france.years[year] || 0, francePopulation)});
  }
  const categories = {};
  for (const r of inside) categories[r.category] = (categories[r.category] || 0) + 1;
  // Rang du taux parmi les départements présents dans la base (pas les territoires que Licitor ne couvre pas),
  // ou parmi les communes d'au moins MIN_TOWN_POPULATION habitants.
  const covered = new Set(data.records.map(r => r.dep));
  const depPopulations = Object.fromEntries(Object.entries(data.departmentPopulation).filter(([d]) => covered.has(d)));
  const ranked = kind === 'dep' ? rateRank(france.deps, depPopulations)
    : population >= MIN_TOWN_POPULATION ? rateRank(france.towns, townPopulations, MIN_TOWN_POPULATION) : [];
  const position = ranked.findIndex(([c]) => c === code) + 1;
  const n = periodYears(f);  // taux annuels moyens sur la période ; ceux de la courbe sont déjà annuels
  return {kind, code, population, count: inside.length, rate: rate(inside.length, population, n),
    franceRate: rate(all.length, francePopulation, n), rank: position || null, rankOf: ranked.length, years,
    categories: Object.entries(categories).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    towns: kind === 'dep' ? own.townRank : [],
    // Audiences à venir du territoire, quelle que soit la période choisie (catégorie respectée).
    upcoming: data.records.filter(r => r.upcoming && inTerritory(r) && (!f.category || r.category === f.category))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))};
}

// Lien partageable : les filtres et le mode de carte sont écrits dans l'adresse de la page
// (ex. ?debut=2015&departement=93&mode=points). Les valeurs par défaut ne sont pas écrites.
const MODE_NAMES = {heat:'chaleur', points:'points', departments:'departements'};
const SHEET_NAMES = {dep: 'departement', town: 'commune'};
export function filtersToQuery(f, mode, audit, measure = 'count', sheet = null) {
  const p = new URLSearchParams();
  if (f.from !== audit.min_year) p.set('debut', f.from);
  if (f.to !== audit.max_year) p.set('fin', f.to);
  if (f.category) p.set('categorie', f.category);
  if (f.dep) p.set('departement', f.dep);
  if (f.search) p.set('recherche', f.search);
  if (mode !== 'heat') p.set('mode', MODE_NAMES[mode]);
  if (measure === 'rate') p.set('mesure', 'taux');
  if (sheet) p.set('fiche', `${SHEET_NAMES[sheet.kind]}-${sheet.code}`);  // ex. fiche=departement-93
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
  const [sheetName, sheetCode] = (p.get('fiche') || '').split('-');
  const sheetKind = Object.keys(SHEET_NAMES).find(k => SHEET_NAMES[k] === sheetName);
  const sheetTable = sheetKind === 'dep' ? data.departmentPopulation : data.communes;
  const sheet = sheetKind && known(sheetTable, sheetCode ?? null) ? {kind: sheetKind, code: sheetCode} : null;
  return {mode, sheet, measure: p.get('mesure') === 'taux' ? 'rate' : 'count', filters: {from, to, category: known(data.categories, p.get('categorie')),
    dep: known(data.departments, p.get('departement')), search: (p.get('recherche') || '').trim().slice(0, 100)}};
}
export const CHORO = [0,1,50,150,300,600,1200];
export function departmentClass(count) {
  let result=0;
  CHORO.forEach((threshold,i)=>{if(count>=threshold) result=i;});
  return result;
}
