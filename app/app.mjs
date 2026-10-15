import {selectRecords,summarize,groupedPoints,exportTable,sourceUrl,filtersToQuery,filtersFromQuery,CHORO,departmentClass,
  rate,periodYears,rateRank,quantileThresholds,quantileClass,MIN_TOWN_POPULATION,territorySheet} from './stats.mjs';
const started=performance.now();
const $=id=>document.getElementById(id);
const fmt=new Intl.NumberFormat('fr-FR');
const num=x=>fmt.format(x);
const pct=(n,d)=>d?(100*n/d).toLocaleString('fr-FR',{maximumFractionDigits:1})+' %':'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=['#e7edef','#d0e8ec','#97cbd3','#58a9b8','#298394','#166176','#123f55'];
const f={from:null,to:null,category:'',dep:'',search:'',includeUndated:true};  // période remplie par populate() à partir des données
let data,departments,map,current,summary,mode='heat',rank='dep',popup,hover,ready=false,queued;
let measure='count',rateThresholds=[];  // mesure : 'count' (nombre d'entrées) ou 'rate' (entrées par an pour 10 000 habitants)
// Taux annuels : petites valeurs (ex. 1,38), d'où 2 décimales ; le rapport à la France garde 1 décimale.
const fmtRate=new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtRatio=new Intl.NumberFormat('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1});
const rateText=x=>x===null?'population inconnue':`${fmtRate.format(x)} par an pour 10 000 hab.`;
let rendered=false,basemapLoaded=false,baseErrors=0;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const getJSON=async path=>{const response=await fetch(path);if(!response.ok)throw Error(`${path} : HTTP ${response.status}`);return response.json();};

function populate(){
  f.from=data.audit.min_year;f.to=data.audit.max_year;
  for(let y=f.from;y<=f.to;y++) for(const id of ['from','to']) $(id).add(new Option(y,y));
  $('from').value=f.from;$('to').value=f.to;
  for(const [key,label] of Object.entries(data.categories)) $('category').add(new Option(label,key));
  const depKeys=[...new Set(data.records.map(r=>r.dep).filter(Boolean))].sort();
  depKeys.forEach(code=>$('department').add(new Option(`${code} · ${data.departments[code]}`,code)));
  const uniqueNames=[...new Set([...Object.values(data.communes).map(c=>c.name),...depKeys.map(code=>data.departments[code])])].sort((a,b)=>a.localeCompare(b,'fr'));
  uniqueNames.forEach(name=>$('town-list').append(new Option(name,name)));
  depKeys.filter(code=>code.length===3).forEach(code=>$('overseas').add(new Option(`${code} · ${data.departments[code]}`,code)));
  $('export').disabled=false;$('share').disabled=false;
}

// Lien partageable : à l'ouverture, on applique les filtres écrits dans l'adresse de la page…
function applyQuery(){
  const shared=filtersFromQuery(location.search,data);
  Object.assign(f,shared.filters);
  $('from').value=f.from;$('to').value=f.to;$('category').value=f.category;$('search').value=f.search;
  $('department').value=f.dep;
  if($('department').value!==f.dep)f.dep=$('department').value='';  // département sans aucune entrée
  setMeasure(shared.measure);
  switchMode(shared.mode);
  sheet=shared.sheet;  // la fiche partagée s'affiche au premier calcul (update)
}
// Bouton « Nombre d'entrées / Par an pour 10 000 hab. » : change le classement et la carte des départements.
function setMeasure(next){
  measure=next;
  for(const m of ['count','rate'])$('measure-'+m).setAttribute('aria-pressed',String(m===measure));
  if(!summary)return;  // à l'ouverture, le premier calcul n'est pas encore fait
  renderRanking();if(ready)colorDepartments();syncQuery();
}
// … et à chaque changement, on réécrit l'adresse (sans ajouter d'étape au bouton « Précédent »).
function syncQuery(){
  const query=filtersToQuery(f,mode,data.audit,measure,sheet);
  history.replaceState(null,'',query?`?${query}`:location.pathname);
}

function update(){
  const t=performance.now();
  f.includeUndated=f.from===data.audit.min_year&&f.to===data.audit.max_year;
  current=selectRecords(data.records,f,data.communes,data.departments);summary=summarize(current);
  $('total').textContent=num(summary.total);
  const years=Object.keys(summary.years).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  $('period-label').textContent=years.length?`${years[0]}–${years.at(-1)} · ${num(years.length)} année${years.length>1?'s représentées':' représentée'}`:'Aucune entrée pour ces filtres';
  $('dep-count').textContent=num(Object.keys(summary.deps).length);
  const leader=summary.depRank[0];
  $('leader').textContent=leader?data.departments[leader[0]]:'—';
  $('leader-detail').textContent=leader?`${leader[0]} · ${num(leader[1])} entrées · ${pct(leader[1],summary.total)} de la sélection`:'Aucun département identifié';
  renderRanking();renderTimeline();renderAnnualCurve();
  if(ready) updateSources();
  $('performance').textContent=`Filtres calculés en ${Math.round(performance.now()-t)} ms · ${num(data.audit.valid_rows)} entrées Licitor`;
  window.atlasState={filters:{...f},summary,mode,filteredIds:current.map(r=>r.id),ready,basemapLoaded};
  if(sheet)renderSheet();  // la fiche ouverte suit les filtres de période et de catégorie
  syncQuery();
}

// Populations des communes présentes dans la base, pour les taux (calculées une seule fois).
let townPopulations;
function rankingItems(){
  if(measure==='count')return rank==='dep'?summary.depRank:summary.townRank;
  townPopulations??=Object.fromEntries(Object.entries(data.communes).map(([code,c])=>[code,c.population]));
  const ranked=rank==='dep'?rateRank(summary.deps,data.departmentPopulation,1,periodYears(f)):rateRank(summary.towns,townPopulations,MIN_TOWN_POPULATION,periodYears(f));
  return ranked.filter(([,value])=>value>0);
}
function renderRanking(){
  const items=rankingItems().slice(0,10),isRate=measure==='rate';
  $('ranking-subtitle').textContent=isRate
    ?`Top 10 · entrées par an pour 10 000 habitants${rank==='town'?` · communes de ${num(MIN_TOWN_POPULATION)} habitants et plus`:''}`
    :'Top 10 · sélection active';
  $('ranking').replaceChildren();
  if(!items.length){const li=document.createElement('li');li.className='empty-state';li.textContent='Aucun territoire identifié pour cette sélection. Ajustez les filtres.';$('ranking').append(li);}
  items.forEach(([code,value],i)=>{
    const label=rank==='dep'?data.departments[code]:`${data.communes[code].name} · ${data.communes[code].dep}`;
    const count=(rank==='dep'?summary.deps:summary.towns)[code]||0;
    const li=document.createElement('li'),button=document.createElement('button');
    button.title=`Explorer ${label} · ${num(count)} entrées${isRate?` · ${rateText(value)}`:''}`;
    button.innerHTML=`<span class="rank-number">${String(i+1).padStart(2,'0')}</span><span class="rank-name">${esc(label)}</span><span class="rank-count">${isRate?fmtRate.format(value):num(value)}</span><span class="rank-bar" style="width:${value/items[0][1]*75}%"></span>`;
    const kind=rank;button.onclick=()=>{focusTerritory(code,kind);openSheet(kind,code);};li.append(button);$('ranking').append(li);
  });
}

function renderTimeline(){
  $('year-chart').replaceChildren();
  const max=Math.max(1,...Object.values(summary.years));
  for(let y=data.audit.min_year;y<=data.audit.max_year;y++){
    const n=summary.years[y]||0,button=document.createElement('button');
    button.title=`${y} : ${num(n)} entrées`;button.setAttribute('aria-label',button.title);
    button.setAttribute('aria-pressed',String(f.from===y&&f.to===y));
    button.innerHTML=`<span class="year-bar" style="height:${n/max*49}px"></span><span class="year-label">${String(y).slice(2)}</span>`;
    button.onclick=()=>{f.from=f.to=y;$('from').value=$('to').value=y;update();};$('year-chart').append(button);
  }
}

function renderAnnualCurve(){
  const first=data.audit.min_year,last=data.audit.max_year;
  const years=Array.from({length:last-first+1},(_,i)=>first+i);
  const active=years.filter(y=>y>=f.from&&y<=f.to);
  const maximum=Math.max(1,...active.map(y=>summary.years[y]||0));
  const magnitude=10**Math.floor(Math.log10(maximum/4));
  const step=([1,2,5,10].find(v=>v*magnitude>=maximum/4)||10)*magnitude;
  const ceiling=Math.max(4,step*4),width=1200,height=300,left=72,right=28,top=30,bottom=52;
  const x=y=>left+(y-first)/(last-first)*(width-left-right);
  const y=n=>height-bottom-n/ceiling*(height-top-bottom);
  const points=active.map(year=>({year,count:summary.years[year]||0,x:x(year),y:y(summary.years[year]||0)}));
  const complete=points.filter(p=>p.year!==last);
  const path=ps=>ps.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const ticks=Array.from({length:5},(_,i)=>ceiling*i/4);
  const lastPair=points.slice(-2);
  const partial=lastPair.length===2&&lastPair[1].year===last?`<path d="${path(lastPair)}" class="curve-line curve-partial"/>`:'';
  const fill=complete.length>1?`<path d="${path(complete)} L${complete.at(-1).x},${y(0)} L${complete[0].x},${y(0)} Z" fill="url(#annual-area)"/>`:'';
  const total=points.reduce((n,p)=>n+p.count,0);
  const scope=[f.dep?data.departments[f.dep]:'France entière',f.category?data.categories[f.category]:'toutes catégories',f.search?`recherche : ${f.search}`:''].filter(Boolean).join(' · ');
  $('curve-scope').textContent=`Base Licitor · ${scope} · ${f.from}–${f.to} · ${num(total)} entrées datées`;
  $('annual-chart').innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="group" aria-label="Courbe annuelle de ${f.from} à ${f.to} : ${num(total)} entrées datées dans la sélection">
    <defs><linearGradient id="annual-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#168c98" stop-opacity=".15"/><stop offset="100%" stop-color="#168c98" stop-opacity=".02"/></linearGradient></defs>
    <text x="${left}" y="15" class="curve-axis-title">Nombre d’entrées de biens/lots</text>
    ${ticks.map(n=>`<line x1="${left}" x2="${width-right}" y1="${y(n)}" y2="${y(n)}" class="curve-grid"/><text x="${left-12}" y="${y(n)+4}" text-anchor="end" class="curve-axis">${num(n)}</text>`).join('')}
    ${fill}<path d="${path(complete)}" class="curve-line"/>${partial}
    ${years.map(year=>`<text x="${x(year)}" y="${height-bottom+24}" text-anchor="middle" class="curve-axis ${year<f.from||year>f.to?'curve-inactive':''}">${year}</text>`).join('')}
    <text x="${width-right}" y="${height-6}" text-anchor="end" class="curve-axis-title">Année de l’audience annoncée</text>
    ${points.map(p=>`<g class="curve-point" tabindex="0" role="button" data-year="${p.year}" data-count="${p.count}" aria-label="${p.year} : ${num(p.count)} entrées${p.year===last?', année partielle':''}. Filtrer sur cette année."><title>${p.year} : ${num(p.count)} entrées${p.year===last?' — année partielle, audiences à venir incluses':''}</title><circle cx="${p.x}" cy="${p.y}" r="13" fill="transparent"/><circle cx="${p.x}" cy="${p.y}" r="4" class="curve-dot ${p.year===last?'curve-open':''}"/></g>`).join('')}
  </svg><div id="curve-tooltip" role="status" hidden></div>`;
  const note=()=>`Un point par année · clic : filtrer la carte. ${num(summary.years.null||0)} date atypique hors courbe. ${last} est partielle et inclut des audiences à venir. Les entrées ne prouvent pas des ventes réalisées.`;
  $('curve-note').textContent=note();
  const tooltip=$('curve-tooltip');
  for(const point of $('annual-chart').querySelectorAll('[data-year]')){
    const year=Number(point.dataset.year),count=Number(point.dataset.count);
    const show=()=>{tooltip.textContent=`${year} : ${num(count)} entrées${year===last?' · année partielle':''}`;tooltip.hidden=false;};
    const hide=()=>{tooltip.hidden=true;};
    const select=()=>{f.from=f.to=year;$('from').value=$('to').value=year;update();};
    point.onpointerenter=point.onfocus=show;point.onpointerleave=point.onblur=hide;
    point.onclick=select;point.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}};
  }
}

function coordinatesInGeometry(g){return g.coordinates.flat(g.type==='MultiPolygon'?2:1);}
function focusTerritory(code,kind){
  if(!ready)return;
  if(kind==='town'){
    const c=data.communes[code];if(c?.center) map.flyTo({center:c.center,zoom:12,duration:reduceMotion?0:800});
    return;
  }
  const feature=departments.features.find(d=>d.properties.code===code);if(!feature)return;
  const coords=coordinatesInGeometry(feature.geometry);
  const bounds=new maplibregl.LngLatBounds();coords.forEach(c=>bounds.extend(c));
  map.fitBounds(bounds,{padding:{top:120,bottom:135,left:60,right:65},duration:reduceMotion?0:800,maxZoom:10});
}

function initMap(){
  // Fond de carte OpenFreeMap « Positron » : gratuit, sans clé, autorisé pour un site public.
  // Le style est gardé dans vendor/ pour que les données s'affichent même sans Internet ;
  // seuls les dessins du fond et les polices viennent de tiles.openfreemap.org.
  map=new maplibregl.Map({container:'map',center:[2.7,46.55],zoom:4.8,maxZoom:18,
    style:'vendor/openfreemap-positron.json',
    attributionControl:{compact:true},fadeDuration:reduceMotion?0:150});
  window.atlasMap=map;
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
  map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-right');
  const basemapSources=['openmaptiles','ne2_shaded'];
  map.on('sourcedata',e=>{if(e.sourceId==='openmaptiles'&&e.isSourceLoaded){basemapLoaded=true;if(window.atlasState)window.atlasState.basemapLoaded=true;}});
  map.on('error',e=>{
    if(e.error?.message?.includes('openfreemap')||basemapSources.includes(e.sourceId)){
      baseErrors++;if(baseErrors>2){$('map-error').hidden=false;$('map-error').textContent='Le fond de carte nécessite une connexion Internet. Les entrées et les contours restent disponibles localement.';}
    }else console.warn('MapLibre',e.error);
  });
  map.on('load',()=>{
    map.addSource('departments',{type:'geojson',data:departments});
    map.addSource('heat',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addSource('points',{type:'geojson',data:{type:'FeatureCollection',features:[]},cluster:true,clusterMaxZoom:14,clusterRadius:42,
      clusterProperties:{annonces:['+',['get','n']]}});
    map.addSource('approx',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    // Chaque département reçoit un numéro de classe (0 à 6), calculé dans updateSources selon la mesure choisie.
    const ramp=['step',['coalesce',['feature-state','cls'],0],colors[0],...colors.slice(1).flatMap((color,i)=>[i+1,color])];
    map.addLayer({id:'department-fill',type:'fill',source:'departments',paint:{'fill-color':ramp,'fill-opacity':.85}});
    map.addLayer({id:'department-border',type:'line',source:'departments',paint:{'line-color':'#718e9a','line-width':.65,'line-opacity':.55}});
    map.addLayer({id:'heatmap',type:'heatmap',source:'heat',maxzoom:9,paint:{
      'heatmap-weight':['sqrt',['get','n']],'heatmap-intensity':['interpolate',['linear'],['zoom'],4,.18,9,.6,14,1.1],
      'heatmap-radius':['interpolate',['linear'],['zoom'],4,7,8,15,12,24,17,32],
      'heatmap-opacity':.85,
      'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(166,222,237,0)',.12,'#a6deed',.3,'#39b0c5',.5,'#169798',.67,'#f6d068',.83,'#f28d45',1,'#ba3546']}});
    map.addLayer({id:'clusters',type:'circle',source:'points',filter:['has','point_count'],paint:{
      'circle-color':['step',['get','annonces'],'#319ca8',50,'#16808f',200,'#175367'],
      'circle-radius':['step',['get','annonces'],17,20,21,100,27,500,33],
      'circle-opacity':.93,'circle-stroke-width':2,'circle-stroke-color':'#ffffff'}});
    map.addLayer({id:'cluster-label',type:'symbol',source:'points',filter:['has','point_count'],layout:{
      'text-field':['to-string',['get','annonces']],'text-font':['Noto Sans Regular'],'text-size':11},paint:{'text-color':'#ffffff'}});
    map.addLayer({id:'single-points',type:'circle',source:'points',filter:['!',['has','point_count']],paint:{
      'circle-color':['match',['get','precision'],'adresse','#087f8c','#b67523'],
      'circle-radius':['interpolate',['linear'],['get','n'],1,5,20,10,100,14],
      'circle-stroke-width':1.5,'circle-stroke-color':'#fff','circle-opacity':.9}});
    map.addLayer({id:'single-label',type:'symbol',source:'points',filter:['all',['!',['has','point_count']],['>', ['get','n'],1]],layout:{
      'text-field':['concat','≈ ',['to-string',['get','n']]],'text-font':['Noto Sans Regular'],'text-size':10,
      'text-offset':[0,1.5]},paint:{'text-color':'#183b48','text-halo-color':'#fff','text-halo-width':1.5}});
    map.addLayer({id:'approx-points',type:'circle',source:'approx',minzoom:9,paint:{'circle-radius':10,
      'circle-color':'#fff8ea','circle-opacity':.8,'circle-stroke-color':'#b67523','circle-stroke-width':2}});
    map.addLayer({id:'approx-label',type:'symbol',source:'approx',minzoom:9,layout:{
      'text-field':['concat','≈ ',['to-string',['get','n']]],'text-size':10,'text-font':['Noto Sans Regular'],
      'text-offset':[0,1.8],'text-allow-overlap':false},paint:{'text-color':'#86531c','text-halo-color':'#fff','text-halo-width':1.5}});
    ready=true;updateSources();switchMode(mode);
    $('loading').hidden=true;
    map.once('idle',()=>{
      rendered=true;window.atlasPerformance={firstUsefulMs:Math.round(performance.now()),initializationMs:Math.round(performance.now()-started),records:data.records.length,basemapLoaded};
      console.info('ATLAS premier affichage utile',window.atlasPerformance);
    });
    attachMapEvents();if(window.atlasState)window.atlasState.ready=true;
    // Lien partagé : zoom sur le département ou la commune choisis.
    if(f.dep)focusTerritory(f.dep,'dep');else if(f.search)focusSearch(f.search);
  });
  map.on('moveend',()=>{
    const c=map.getCenter();$('map-scope').textContent=c.lat>=41&&c.lat<=52&&c.lng>=-6&&c.lng<=10?'France métropolitaine':'Vue outre-mer / internationale';
  });
}

function updateSources(){
  popup?.remove();
  // Les trois sources affichent les mêmes groupes de communes : on les calcule une seule fois.
  const grouped=groupedPoints(current,['commune']);
  for(const id of ['heat','points','approx'])map.getSource(id).setData(grouped);
  colorDepartments();
}
// Couleur des départements : seuils fixes pour le nombre, 6 groupes de même taille pour le taux.
function colorDepartments(){
  const depRate=code=>rate(summary.deps[code]||0,data.departmentPopulation[code],periodYears(f));
  rateThresholds=quantileThresholds(departments.features.map(feature=>depRate(feature.properties.code)));
  departments.features.forEach(feature=>{
    const code=feature.properties.code,count=summary.deps[code]||0;
    const cls=measure==='rate'?quantileClass(depRate(code),rateThresholds):departmentClass(count);
    map.setFeatureState({source:'departments',id:feature.id},{cls});
  });
  renderLegend();
}
function switchMode(next){
  mode=next;
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  if(ready){
    const visibility={heatmap:mode==='heat','department-fill':mode==='departments',
      clusters:mode==='points','cluster-label':mode==='points','single-points':mode==='points','single-label':mode==='points',
      'approx-points':mode==='heat','approx-label':mode==='heat'};
    for(const [id,visible] of Object.entries(visibility))map.setLayoutProperty(id,'visibility',visible?'visible':'none');
    popup?.remove();hover?.remove();renderLegend();
  }
  if(window.atlasState){window.atlasState.mode=mode;syncQuery();}
}
function renderLegend(){
  if(mode==='heat'){
    $('legend').innerHTML=`<strong>Concentrations par commune · approximatives</strong><div class="gradient"></div><div class="legend-scale"><span>Plus diffuse</span><span>Plus concentrée</span></div><p>${num(summary.precision.commune)} entrées localisées · intensité relative.<br>Vue territoriale, remplacée par des repères ≈ dès le zoom 9.</p>`;
    $('map-note').textContent='Centres de communes uniquement : cette chaleur ne localise ni les rues ni les quartiers des biens.';
  }else if(mode==='points'){
    $('legend').innerHTML=`<strong>Entrées regroupées par proximité</strong><div class="legend-item"><span class="legend-circle"></span> Groupe de communes · nombre d’entrées</div><div class="legend-item"><span class="legend-circle approx"></span> ≈ Centre de commune, emplacement approximatif</div><p>${num(summary.precision.commune)} entrées incluses.<br>Aucun point ne représente une adresse exacte.</p>`;
    $('map-note').textContent='Cliquez sur un groupe pour zoomer, puis sur un emplacement pour lire les entrées.';
  }else if(measure==='rate'){
    // Légende fabriquée à partir des seuils réellement calculés pour la sélection.
    const t=rateThresholds.map(x=>fmtRate.format(x));
    const labels=['Aucune entrée',...(t.length?[`moins de ${t[0]}`,...t.slice(1).map((x,i)=>`${t[i]} à ${x}`),`${t.at(-1)} et plus`]:[])];
    $('legend').innerHTML=`<strong>Entrées par an pour 10 000 habitants</strong>${labels.map((label,i)=>`<div class="legend-item"><span class="swatch" style="background:${colors[i]}"></span>${label}</div>`).join('')}<p>6 groupes de départements de même taille, recalculés pour chaque sélection.<br>Population municipale INSEE.</p>`;
    $('map-note').textContent=`Taux annuel moyen = entrées de la sélection ÷ ${num(periodYears(f))} année${periodYears(f)>1?'s':''} (${f.from}–${f.to}) ÷ population × 10 000. ${num(summary.unknownDep)} entrées non attribuées à un département.`;
  }else{
    // Textes de la légende fabriqués à partir des seuils de couleur (CHORO), pour qu'ils restent toujours d'accord.
    const labels=CHORO.map((n,i)=>i===0?'0':i===CHORO.length-1?`≥ ${num(n)}`:`${num(n)}–${num(CHORO[i+1]-1)}`);
    $('legend').innerHTML=`<strong>Nombre d’entrées par département</strong>${labels.map((label,i)=>`<div class="legend-item"><span class="swatch" style="background:${colors[i]}"></span>${label} entrées</div>`).join('')}<p>Seuils fixes, identiques pour tous les filtres.<br>La part est calculée sur les ${num(summary.total)} entrées sélectionnées.</p>`;
    $('map-note').textContent=`Toutes les entrées au département identifié sont comptées, quelle que soit leur précision. ${num(summary.unknownDep)} non attribuées.`;
  }
}

function attachMapEvents(){
  map.on('click','clusters',async e=>{
    const feature=e.features[0];try{
      const zoom=await map.getSource('points').getClusterExpansionZoom(feature.properties.cluster_id);
      map.easeTo({center:feature.geometry.coordinates,zoom,duration:reduceMotion?0:600});
    }catch(error){console.warn(error);}
  });
  for(const id of ['single-points','approx-points'])map.on('click',id,e=>showPoint(e.features[0]));
  for(const id of ['clusters','single-points','approx-points']){
    map.on('mouseenter',id,()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave',id,()=>map.getCanvas().style.cursor='');
  }
  map.on('mousemove','department-fill',e=>{
    if(mode!=='departments')return;
    map.getCanvas().style.cursor='pointer';
    const feature=e.features[0],code=feature.properties.code,count=summary.deps[code]||0;
    hover?.remove();hover=new maplibregl.Popup({closeButton:false,closeOnClick:false,offset:12}).setLngLat(e.lngLat)
      .setHTML(`<h3>${esc(feature.properties.nom)} · ${esc(code)}</h3><p><strong>${num(count)} entrées</strong> · ${rateText(rate(count,data.departmentPopulation[code],periodYears(f)))}<br>${pct(count,summary.total)} de la sélection nationale observée${f.dep||f.search?' (filtres actifs)':''}</p>`).addTo(map);
  });
  map.on('mouseleave','department-fill',()=>{hover?.remove();map.getCanvas().style.cursor='';});
  map.on('click','department-fill',e=>{if(mode==='departments'){const code=e.features[0].properties.code;focusTerritory(code,'dep');openSheet('dep',code);}});
}

function showPoint(feature){
  const {coordinates}=feature.geometry,precision=feature.properties.precision;
  // WebGL tile geometries can be quantized: use the original stable position key.
  const records=current.filter(r=>r.coordinates&&r.coordinates.join(',')+':'+r.precision===feature.properties.key);
  const approx=precision!=='adresse';
  const title=precision==='commune'?data.communes[feature.properties.commune]?.name:'Emplacement des entrées';
  const html=`<h3>${esc(title)}</h3><p><strong>${num(records.length)} entrée${records.length>1?'s':''} à cette position</strong></p>${approx?`<span class="approx-badge">${precision==='rue'?'Rue ou lieu-dit approximatif':'Localisation communale approximative — adresse exacte non connue'}</span>`:'<p>Correspondance à l’adresse acceptée · précision cadastrale non établie.</p>'}
    ${records.slice(0,30).map(r=>`<div class="popup-record"><strong>${esc(data.natures[r.nature])}</strong> · ${r.dateAnomaly?'Date à vérifier':new Date(r.date).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'})}<p>${esc(data.addresses[r.address]||'Adresse absente')}<br>${esc(data.organizers[r.organizer])}</p>${r.similar?'<p>Plusieurs entrées partagent cette annonce ; les lots sont conservés.</p>':''}<a href="${esc(sourceUrl(r,data))}" target="_blank" rel="noopener noreferrer">Consulter l’annonce source ↗</a></div>`).join('')}
    ${records.length>30?`<p>${num(records.length-30)} autres entrées à cette position. L’export contient toute la sélection.</p>`:''}`;
  const town=precision==='commune'?feature.properties.commune:'';
  const sheetLink=town?`<button class="popup-sheet" data-town="${esc(town)}">Voir la fiche de la commune →</button>`:'';
  popup?.remove();popup=new maplibregl.Popup({maxWidth:'350px',offset:14}).setLngLat(coordinates).setHTML(html.replace('</h3>','</h3>'+sheetLink)).addTo(map);
  popup.getElement().querySelector('.popup-sheet')?.addEventListener('click',()=>openSheet('town',town));
}

// ---------- Fiche territoire : volet à droite avec chiffres clés, courbe, barres et audiences ----------
let sheet=null;  // territoire affiché : {kind:'dep'|'town', code} ou null
const fmtTick=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2});
const ordinal=n=>n===1?'1er':`${n}e`;
function openSheet(kind,code){sheet={kind,code};renderSheet();syncQuery();$('sheet-close').focus({preventScroll:true});}
function closeSheet(){sheet=null;$('sheet').hidden=true;syncQuery();}

function renderSheet(){
  const s=territorySheet(data,f,sheet.kind,sheet.code),isDep=sheet.kind==='dep';
  const town=data.communes[sheet.code],name=isDep?data.departments[sheet.code]:town.name;
  $('sheet-kind').textContent=isDep?`DÉPARTEMENT ${sheet.code}`:`COMMUNE · ${data.departments[town.dep]||''} (${town.dep})`;
  $('sheet-title').textContent=name;
  $('sheet-scope').textContent=`${f.from}–${f.to} · ${f.category?data.categories[f.category]:'toutes catégories'} · ${num(s.population)} habitants. La période et la catégorie choisies s’appliquent à la fiche.`;
  const ratio=s.rate!==null&&s.franceRate?s.rate/s.franceRate:null;
  const rankText=s.rank?`<strong>${ordinal(s.rank)}</strong><small>sur ${num(s.rankOf)} ${isDep?'départements':`communes de ${num(MIN_TOWN_POPULATION)} hab. et plus`}</small>`
    :`<strong>—</strong><small>${isDep?'non classé : aucune entrée dans la base Licitor':`non classée : moins de ${num(MIN_TOWN_POPULATION)} habitants`}</small>`;
  const tiles=`<section class="sheet-tiles" aria-label="Chiffres clés">
    <article><p>Entrées</p><strong>${num(s.count)}</strong><small>sur la période choisie</small></article>
    <article><p>Par an pour 10 000 hab.</p><strong>${s.rate===null?'—':fmtRate.format(s.rate)}</strong><small>France : ${s.franceRate===null?'—':fmtRate.format(s.franceRate)}${ratio?` · ×${fmtRatio.format(ratio)}`:''}</small></article>
    <article><p>Rang national du taux</p>${rankText}</article></section>`;
  const partial=f.to===data.audit.max_year?` ${f.to} est partielle.`:'';
  const evolution=s.years.length<2
    ?`<section class="sheet-block"><h3>Évolution annuelle pour 10 000 habitants</h3><p class="sheet-note">Choisissez une période d’au moins deux années pour voir l’évolution.</p></section>`
    :`<section class="sheet-block"><h3>Évolution annuelle pour 10 000 habitants</h3><p class="sheet-note">Entrées de chaque année rapportées à la population, comparées à la France.${partial}</p>
      <div class="sheet-legend"><span style="--key:var(--territory)">${esc(name)}</span><span style="--key:var(--france)">France</span></div>
      <div class="sheet-chart" id="sheet-chart"></div>
      <details><summary>Voir les données en tableau</summary><table><thead><tr><th>Année</th><th>Entrées</th><th>Pour 10 000 hab.</th><th>France</th></tr></thead>
      <tbody>${s.years.map(y=>`<tr><td>${y.year}</td><td>${num(y.count)}</td><td>${y.rate===null?'—':fmtRate.format(y.rate)}</td><td>${fmtRate.format(y.franceRate)}</td></tr>`).join('')}</tbody></table></details></section>`;
  // Une seule barre n'apprend rien : la répartition n'apparaît que s'il y a au moins deux types de biens.
  const categories=s.categories.length<2?'':`<section class="sheet-block"><h3>Types de biens</h3><p class="sheet-note">Nombre d’entrées et part du territoire.</p>
    <div class="sheet-bars">${barRows(s.categories.map(([key,n])=>[data.categories[key],n,pct(n,s.count)]))}</div></section>`;
  const towns=!isDep||!s.towns.length?'':`<section class="sheet-block"><h3>Communes les plus représentées</h3><p class="sheet-note">Cliquez sur une commune pour ouvrir sa fiche.</p>
    <div class="sheet-bars">${barRows(s.towns.slice(0,8).map(([code,n])=>[data.communes[code].name,n,pct(n,s.count),code]))}</div></section>`;
  const next=s.upcoming.slice(0,5);
  const upcoming=`<section class="sheet-block"><h3>Prochaines audiences</h3>${next.length?`<ul class="sheet-list">${next.map(r=>`<li><strong>${new Date(r.date).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})}</strong> · ${esc(data.natures[r.nature])}<br>${esc(data.organizers[r.organizer])} · <a href="${esc(sourceUrl(r,data))}" target="_blank" rel="noopener noreferrer">Annonce ↗</a></li>`).join('')}</ul>${s.upcoming.length>5?`<p class="sheet-note">et ${num(s.upcoming.length-5)} autres audiences à venir.</p>`:''}`:'<p class="sheet-note">Aucune audience à venir annoncée pour ce territoire.</p>'}</section>`;
  $('sheet-body').innerHTML=tiles+(s.count?evolution+categories+towns:'<p class="sheet-note" style="margin-top:20px">Aucune entrée pour cette sélection. Élargissez la période ou la catégorie.</p>')+upcoming
    +'<p class="sheet-actions"><button class="outline-button" data-action="share">Copier le lien de la fiche ⧉</button><button class="outline-button" data-action="print">Imprimer / PDF</button></p>';
  if(s.count&&s.years.length>1)sheetLineChart(s.years,name);
  $('sheet').hidden=false;
}

// Barres horizontales : [libellé, nombre, part, code de commune facultatif]. Avec un code, la ligne est un bouton.
function barRows(items){
  const max=Math.max(1,...items.map(([,n])=>n));
  return items.map(([label,n,share,code])=>{
    const tag=code?'button':'div',attr=code?` data-town="${esc(code)}" title="Ouvrir la fiche de ${esc(label)}"`:'';
    return `<${tag} class="bar-row"${attr}><span class="bar-label">${esc(label)}</span><span class="bar-track"><span class="bar" style="width:${n/max*100}%"></span></span><span class="bar-value">${num(n)}<small>${share}</small></span></${tag}>`;
  }).join('');
}

// Courbe territoire / France avec réticule : une ligne verticale suit la souris (ou les flèches du clavier)
// et une bulle donne les deux valeurs de l'année.
function sheetLineChart(years,name){
  const W=480,H=210,L=34,R=52,T=12,B=26,last=years.length-1;
  const max=Math.max(1e-6,...years.flatMap(y=>[y.rate||0,y.franceRate||0]));
  const magnitude=10**Math.floor(Math.log10(max/4));
  // Graduations « rondes » (1, 2, 2,5, 5…) et au plus 4 lignes, juste au-dessus de la valeur la plus haute.
  const step=([1,2,2.5,5,10].find(v=>v*magnitude>=max/4)||10)*magnitude,lines=Math.max(1,Math.ceil(max/step-1e-9)),top=step*lines;
  const x=i=>L+i/last*(W-L-R),y=v=>T+(1-(v||0)/top)*(H-T-B);
  const path=key=>years.map((d,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join('');
  // Années affichées sous l'axe : les multiples de 5, plus la première et la dernière si elles ne gênent pas.
  const shown=years.map((d,i)=>i).filter(i=>i===0||i===last||years[i].year%5===0)
    .filter((i,k,list)=>!(i===0&&list[1]-i<3)&&!(i===last&&i-list.at(-2)<3)||list.length<3);
  const yT=y(years[last].rate),yF=y(years[last].franceRate),labels=Math.abs(yT-yF)>=13;
  const partialYear=years[last].year===data.audit.max_year;
  $('sheet-chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution pour 10 000 habitants de ${esc(name)} et de la France, ${years[0].year} à ${years[last].year}. Données détaillées dans le tableau ci-dessous.">
    ${Array.from({length:lines+1},(_,k)=>k).map(k=>`<line class="grid" x1="${L}" x2="${W-R}" y1="${y(k*step)}" y2="${y(k*step)}"/><text class="axis" x="${L-6}" y="${y(k*step)+3}" text-anchor="end">${fmtTick.format(k*step)}</text>`).join('')}
    ${shown.map(i=>`<text class="axis" x="${x(i)}" y="${H-8}" text-anchor="middle">${years[i].year}</text>`).join('')}
    <line class="crosshair" x1="0" x2="0" y1="${T}" y2="${H-B}" visibility="hidden"/>
    <path class="line" d="${path('franceRate')}" stroke="var(--france)"/><path class="line" d="${path('rate')}" stroke="var(--territory)"/>
    ${[['france',yF],['territory',yT]].map(([key,cy])=>partialYear
      // Année partielle : point creux, comme sur la courbe annuelle d'ATLAS.
      ?`<circle cx="${x(last)}" cy="${cy}" r="4" fill="white" stroke="var(--${key})" stroke-width="2"/>`
      :`<circle class="dot" cx="${x(last)}" cy="${cy}" r="4" fill="var(--${key})"/>`).join('')}
    ${labels?`<text class="end-label" x="${x(last)+8}" y="${yT+4}">${fmtRate.format(years[last].rate||0)}</text><text class="end-label" x="${x(last)+8}" y="${yF+4}">${fmtRate.format(years[last].franceRate)}</text>`:''}
    <rect class="overlay" x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}" tabindex="0" aria-label="Parcourir les années avec les flèches gauche et droite"/>
  </svg><div class="sheet-tooltip" role="status" hidden></div>`;
  const svg=$('sheet-chart').querySelector('svg'),overlay=svg.querySelector('.overlay'),cross=svg.querySelector('.crosshair'),tip=$('sheet-chart').querySelector('.sheet-tooltip');
  let current=last;
  const show=i=>{
    current=Math.max(0,Math.min(last,i));const d=years[current],scale=svg.getBoundingClientRect().width/W;
    cross.setAttribute('x1',x(current));cross.setAttribute('x2',x(current));cross.setAttribute('visibility','visible');
    // Contenu inséré en texte (jamais en HTML) : les valeurs d'abord, puis le nom de la série.
    const row=(color,value,label)=>{const p=document.createElement('div'),key=document.createElement('i'),strong=document.createElement('strong'),span=document.createElement('span');
      key.style.borderColor=color;strong.textContent=value;span.textContent=label;p.append(key,strong,span);return p;};
    const title=document.createElement('b');title.textContent=`${d.year}${d.year===data.audit.max_year?' (partielle)':''}`;
    tip.replaceChildren(title,row('var(--territory)',d.rate===null?'—':fmtRate.format(d.rate),`${name} · ${num(d.count)} entrées`),row('var(--france)',fmtRate.format(d.franceRate),'France'));
    tip.hidden=false;
    const px=x(current)*scale,width=tip.offsetWidth;
    tip.style.left=`${px+width+14>svg.clientWidth?px-width-12:px+12}px`;
  };
  const hide=()=>{tip.hidden=true;cross.setAttribute('visibility','hidden');};
  overlay.onpointermove=e=>{const rect=svg.getBoundingClientRect(),scale=rect.width/W;show(Math.round(((e.clientX-rect.left)/scale-L)/(W-L-R)*last));};
  overlay.onpointerleave=hide;overlay.onblur=hide;overlay.onfocus=()=>show(current);
  overlay.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();show(current+(e.key==='ArrowRight'?1:-1));}};
}

// Copie l'adresse de la page (avec ses filtres et sa fiche) et le signale sur le bouton.
async function copyLink(button){
  const label=button.textContent;
  try{await navigator.clipboard.writeText(location.href);button.textContent='Lien copié ✓';}
  catch{prompt('Copiez ce lien :',location.href);}  // presse-papiers refusé : on affiche le lien
  setTimeout(()=>{button.textContent=label;},2000);
}

function renderMethod(pilot,anomalies){
  const a=data.audit;
  $('method-content').innerHTML=`
    <h3>Objectif</h3>
    <p>ATLAS permet de visualiser où se concentrent les biens annoncés aux enchères immobilières dans la base Licitor et comment leur répartition évolue en France de ${a.min_year} à ${a.max_year}.</p>
    <h3>À quoi peut-il servir ?</h3>
    <p>ATLAS peut servir de <strong>base d’analyse géographique et historique</strong> pour un mémoire :</p>
    <ul>
      <li>Repérer les départements et communes qui concentrent le plus de biens annoncés aux enchères.</li>
      <li>Comparer les volumes année par année, de ${a.min_year} à ${a.max_year}.</li>
      <li>Étudier les différences entre catégories de biens et entre territoires.</li>
      <li>Produire des cartes et graphiques pour illustrer tes résultats et choisir des territoires à étudier plus précisément.</li>
    </ul>
    <p>ATLAS a collecté, le ${new Date(a.collected_at).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})}, <strong>${num(a.source_rows)} entrées de biens/lots</strong>.</p>
    <p>Les ${num(a.historical)} entrées historiques et les ${num(a.upcoming)} à venir concordent avec les compteurs des ${num(a.juridictions)} juridictions. Une annonce peut regrouper plusieurs lots.</p>
    <p>À savoir : dans certaines annonces Licitor, on n’a pas la confirmation officielle que le bien a été vendu, mais on a la certitude qu’il a été mis en annonce.</p>
    <p>Le but de cette carte est de comprendre l’évolution par zone et où se trouvent les zones avec le plus de biens mis en annonce, afin de délimiter notre terrain d’étude pour un mémoire et de comprendre où il y a le plus de mises en annonce de ventes aux enchères.</p>
    <h3>Période et dates</h3>
    <p>Filtres ${a.min_year}–${a.max_year}, dates d’audience annoncées extraites des URL publiques, et non dates effectives d’adjudication. ${a.max_year} est partielle et inclut des audiences à venir.</p>
    <h3>Localisation des biens</h3>
    <p><strong>${num(a.precision.commune)} entrées</strong> ont pu être rattachées à une commune, en vérifiant son nom et son département dans une liste officielle.</p>
    <p>Les points sont placés <strong>au centre de la commune</strong>, pas à l’adresse exacte du bien ni au tribunal. Ils donnent donc une localisation approximative.</p>
    <p>Entrées réparties dans les communes : <strong>${num(a.precision.commune)}, soit ${pct(a.precision.commune,a.valid_rows)} de la base étudiée</strong>. Entrées sans point cartographique : <strong>${num(a.precision.non_resolue)}, soit ${pct(a.precision.non_resolue,a.valid_rows)}</strong>.</p>
    <p>${num(a.without_commune)} entrées dont la commune n’a pas été identifiée et ${num(a.immaterial)} actifs immatériels explicitement repérés (parts sociales, fonds…). Ces catégories se chevauchent. Les actifs immatériels restent comptabilisés et identifiables par catégorie, mais aucun point ne leur est attribué. Un département fiable peut contribuer au classement même sans point.</p>
    <h3>Lecture des cartes</h3>
    <ul>
      <li><strong>Chaleur :</strong> les couleurs montrent où se concentrent les annonces par commune. En zoomant, elles laissent place à des points approximatifs au centre des communes.</li>
      <li><strong>Points :</strong> les cercles regroupent les communes proches et indiquent le nombre d’entrées.</li>
      <li><strong>Départements :</strong> plus la couleur est foncée, plus le département compte d’entrées. Les mêmes seuils de couleur sont utilisés pour tous les filtres.</li>
    </ul>
    <p>Les pourcentages sont calculés sur toutes les entrées sélectionnées. Les chiffres décrivent uniquement la base Licitor.</p>
    <h3>Fiches territoire</h3>
    <p>Un clic sur un territoire du classement, sur un département (mode Départements) ou sur « Voir la fiche de la commune » ouvre sa fiche : chiffres clés, évolution annuelle pour 10 000 habitants comparée à la France, types de biens, communes principales et prochaines audiences. La fiche applique la période et la catégorie choisies ; les audiences à venir sont listées quelle que soit la période. Son lien peut être copié et elle peut être imprimée en PDF.</p>
    <h3>Taux pour 10 000 habitants</h3>
    <p>Le bouton « Par an pour 10 000 hab. » rapporte le nombre d’entrées de la sélection à la population et à la durée de la période : <strong>taux annuel moyen = entrées de la période ÷ nombre d’années ÷ population × 10 000</strong>. Il permet de comparer des territoires de tailles différentes, et des périodes de durées différentes. La courbe des fiches donne le taux de chaque année.</p>
    <ul>
      <li>Population : ${esc(a.population_source)} (${num(a.population_total)} habitants au total). ${esc(a.population_note)} La population d’un département est la somme de celle de ses communes. Elle est la même pour toutes les années : un taux sur plusieurs années ne tient pas compte de l’évolution de la population.</li>
      <li>Le classement des communes ne retient que celles d’au moins ${num(MIN_TOWN_POPULATION)} habitants : dans une très petite commune, une ou deux ventes suffisent à produire un taux très élevé mais peu significatif.</li>
      <li>Sur la carte des départements, les couleurs forment 6 groupes de même taille, recalculés pour chaque sélection : la légende indique les valeurs exactes. Les cartes « Chaleur » et « Points » restent en nombre d’entrées.</li>
    </ul>
    <h3>Sources et fonctionnement local</h3>
    <p><a href="https://www.licitor.com/historique-des-adjudications.html" target="_blank" rel="noopener">Archives publiques Licitor</a> ; <a href="https://geo.api.gouv.fr/decoupage-administratif/communes" target="_blank" rel="noopener">référentiel officiel des communes</a> ; contours départementaux Etalab 2024. Les listes d’audiences sont mises en cache ; les fiches individuelles ne sont pas toutes analysées. Aucun statut ou prix d’adjudication n’est déduit de la présence d’une entrée. Données et bibliothèque MapLibre locales, fond de carte OpenFreeMap (données OpenStreetMap) et polices en ligne, sans compte ni service payant. L’ancienne base est retirée de l’application active.</p>`;
}

// Zoome sur la commune ou le département dont le nom (ou le code) est tapé dans la recherche.
function focusSearch(text){
  const value=text.trim().toLocaleLowerCase('fr');
  const towns=Object.entries(data.communes).filter(([code,c])=>c.name.toLocaleLowerCase('fr')===value||code===value);
  if(towns.length===1)focusTerritory(towns[0][0],'town');
  else if(!towns.length){const dep=Object.entries(data.departments).find(([code,name])=>name.toLocaleLowerCase('fr')===value||code.toLowerCase()===value);if(dep)focusTerritory(dep[0],'dep');}
}

function wire(){
  for(const id of ['from','to']) $(id).onchange=()=>{
    f.from=Number($('from').value);f.to=Number($('to').value);
    if(f.from>f.to){if(id==='from')f.to=f.from;else f.from=f.to;}
    $('from').value=f.from;$('to').value=f.to;update();
  };
  $('category').onchange=()=>{f.category=$('category').value;update();};
  $('department').onchange=()=>{f.dep=$('department').value;update();if(f.dep)focusTerritory(f.dep,'dep');};
  $('search').oninput=()=>{clearTimeout(queued);queued=setTimeout(()=>{f.search=$('search').value;update();},140);};
  $('search').onchange=()=>focusSearch($('search').value);
  $('share').onclick=()=>copyLink($('share'));
  // Fiche territoire : fermeture (bouton ou Échap), clics dans la fiche, impression complète.
  $('sheet-close').onclick=closeSheet;
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sheet&&!$('method-dialog').open)closeSheet();});
  $('sheet-body').onclick=e=>{
    const target=e.target.closest('[data-town],[data-action]');if(!target)return;
    if(target.dataset.town){focusTerritory(target.dataset.town,'town');openSheet('town',target.dataset.town);}
    else if(target.dataset.action==='share')copyLink(target);
    else if(target.dataset.action==='print')print();
  };
  addEventListener('beforeprint',()=>$('sheet').querySelectorAll('details').forEach(d=>{d.open=true;}));
  $('reset').onclick=()=>{clearTimeout(queued);Object.assign(f,{from:data.audit.min_year,to:data.audit.max_year,category:'',dep:'',search:'',includeUndated:true});$('from').value=f.from;$('to').value=f.to;$('category').value=$('department').value=$('search').value='';update();$('annual-chart').scrollLeft=0;map?.flyTo({center:[2.7,46.55],zoom:4.8,duration:reduceMotion?0:700});};
  document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>switchMode(button.dataset.mode));
  for(const m of ['count','rate'])$('measure-'+m).onclick=()=>setMeasure(m);
  for(const kind of ['dep','town'])$('rank-'+kind).onclick=()=>{rank=kind;['dep','town'].forEach(k=>$('rank-'+k).setAttribute('aria-pressed',String(k===kind)));renderRanking();};
  $('home').onclick=()=>map?.flyTo({center:[2.7,46.55],zoom:4.8,duration:reduceMotion?0:700});
  $('overseas').onchange=()=>{if($('overseas').value)focusTerritory($('overseas').value,'dep');$('overseas').value='';};
  for(const id of ['methodology'])$(id).onclick=()=>$('method-dialog').showModal();
  $('close-dialog').onclick=()=>$('method-dialog').close();
  $('method-dialog').onclick=e=>{if(e.target===$('method-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
  $('export').onclick=()=>{
    const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
    const blob=new Blob(['\ufeff'+exportTable(current,data).map(row=>row.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`atlas-annonces-${f.from}-${f.to}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  };
}

try{
  const loaded=await Promise.all([getJSON('data/atlas.json'),getJSON('data/departements.geojson'),getJSON('data/pilot.json'),getJSON('data/anomalies.json')]);
  [data,departments]=loaded;
  // Version en ligne : les biens sont répartis en plusieurs fichiers (voir scripts/publish_vercel.py).
  if(data.recordChunks)data.records=(await Promise.all(data.recordChunks.map(name=>getJSON('data/'+name)))).flat();
  populate();applyQuery();wire();renderMethod(loaded[2],loaded[3]);update();
  if(!window.maplibregl)throw Error('La bibliothèque locale MapLibre n’est pas disponible.');
  initMap();
}catch(error){
  console.error(error);$('loading').hidden=true;$('map-error').hidden=false;
  // La consigne technique n'a de sens que sur le Mac ; un visiteur du site public doit seulement réessayer.
  const local=location.hostname==='127.0.0.1'||location.hostname==='localhost';
  $('map-error').textContent=`Chargement impossible : ${error.message}. `+(local
    ?'Lancez python3 scripts/serve.py depuis le projet et ouvrez l’adresse locale indiquée.'
    :'Vérifiez votre connexion Internet puis rechargez la page.');
}
