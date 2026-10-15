import {selectRecords,summarize,groupedPoints,CHORO} from './stats.mjs';
const started=performance.now();
const $=id=>document.getElementById(id);
const fmt=new Intl.NumberFormat('fr-FR');
const num=x=>fmt.format(x);
const pct=(n,d)=>d?(100*n/d).toLocaleString('fr-FR',{maximumFractionDigits:1})+' %':'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=['#e7edef','#d0e8ec','#97cbd3','#58a9b8','#298394','#166176','#123f55'];
const f={from:1999,to:2026,category:'',dep:'',search:'',includeUndated:true};
let data,departments,map,current,summary,mode='heat',rank='dep',popup,hover,ready=false,queued;
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
  $('export').disabled=false;
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
}

function renderRanking(){
  const items=(rank==='dep'?summary.depRank:summary.townRank).slice(0,10);
  $('ranking').replaceChildren();
  if(!items.length){const li=document.createElement('li');li.className='empty-state';li.textContent='Aucun territoire identifié pour cette sélection. Ajustez les filtres.';$('ranking').append(li);}
  items.forEach(([code,count],i)=>{
    const label=rank==='dep'?data.departments[code]:`${data.communes[code].name} · ${data.communes[code].dep}`;
    const li=document.createElement('li'),button=document.createElement('button');
    button.title=`Explorer ${label} · ${num(count)} entrées`;
    button.innerHTML=`<span class="rank-number">${String(i+1).padStart(2,'0')}</span><span class="rank-name">${esc(label)}</span><span class="rank-count">${num(count)}</span><span class="rank-bar" style="width:${count/items[0][1]*75}%"></span>`;
    button.onclick=()=>focusTerritory(code,rank);li.append(button);$('ranking').append(li);
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
    const ramp=['step',['coalesce',['feature-state','count'],0],colors[0],...CHORO.slice(1).flatMap((n,i)=>[n,colors[i+1]])];
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
  departments.features.forEach(feature=>map.setFeatureState({source:'departments',id:feature.id},{count:summary.deps[feature.properties.code]||0}));
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
  if(window.atlasState)window.atlasState.mode=mode;
}
function renderLegend(){
  if(mode==='heat'){
    $('legend').innerHTML=`<strong>Concentrations par commune · approximatives</strong><div class="gradient"></div><div class="legend-scale"><span>Plus diffuse</span><span>Plus concentrée</span></div><p>${num(summary.precision.commune)} entrées localisées · intensité relative.<br>Vue territoriale, remplacée par des repères ≈ dès le zoom 9.</p>`;
    $('map-note').textContent='Centres de communes uniquement : cette chaleur ne localise ni les rues ni les quartiers des biens.';
  }else if(mode==='points'){
    $('legend').innerHTML=`<strong>Entrées regroupées par proximité</strong><div class="legend-item"><span class="legend-circle"></span> Groupe de communes · nombre d’entrées</div><div class="legend-item"><span class="legend-circle approx"></span> ≈ Centre de commune, emplacement approximatif</div><p>${num(summary.precision.commune)} entrées incluses.<br>Aucun point ne représente une adresse exacte.</p>`;
    $('map-note').textContent='Cliquez sur un groupe pour zoomer, puis sur un emplacement pour lire les entrées.';
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
      .setHTML(`<h3>${esc(feature.properties.nom)} · ${esc(code)}</h3><p><strong>${num(count)} entrées</strong><br>${pct(count,summary.total)} de la sélection nationale observée${f.dep||f.search?' (filtres actifs)':''}</p>`).addTo(map);
  });
  map.on('mouseleave','department-fill',()=>{hover?.remove();map.getCanvas().style.cursor='';});
  map.on('click','department-fill',e=>{if(mode==='departments')focusTerritory(e.features[0].properties.code,'dep');});
}

function showPoint(feature){
  const {coordinates}=feature.geometry,precision=feature.properties.precision;
  // WebGL tile geometries can be quantized: use the original stable position key.
  const records=current.filter(r=>r.coordinates&&r.coordinates.join(',')+':'+r.precision===feature.properties.key);
  const approx=precision!=='adresse';
  const title=precision==='commune'?data.communes[feature.properties.commune]?.name:'Emplacement des entrées';
  const html=`<h3>${esc(title)}</h3><p><strong>${num(records.length)} entrée${records.length>1?'s':''} à cette position</strong></p>${approx?`<span class="approx-badge">${precision==='rue'?'Rue ou lieu-dit approximatif':'Localisation communale approximative — adresse exacte non connue'}</span>`:'<p>Correspondance à l’adresse acceptée · précision cadastrale non établie.</p>'}
    ${records.slice(0,30).map(r=>`<div class="popup-record"><strong>${esc(data.natures[r.nature])}</strong> · ${r.dateAnomaly?'Date à vérifier':new Date(r.date).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'})}<p>${esc(data.addresses[r.address]||'Adresse absente')}<br>${esc(data.organizers[r.organizer])}</p>${r.similar?'<p>Plusieurs entrées partagent cette annonce ; les lots sont conservés.</p>':''}<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Consulter l’annonce source ↗</a></div>`).join('')}
    ${records.length>30?`<p>${num(records.length-30)} autres entrées à cette position. L’export contient toute la sélection.</p>`:''}`;
  popup?.remove();popup=new maplibregl.Popup({maxWidth:'350px',offset:14}).setLngLat(coordinates).setHTML(html).addTo(map);
}

function renderMethod(pilot,anomalies){
  const a=data.audit;
  $('method-content').innerHTML=`
    <h3>Objectif</h3>
    <p>ATLAS permet de visualiser où se concentrent les biens annoncés aux enchères immobilières dans la base Licitor et comment leur répartition évolue en France de 1999 à 2026.</p>
    <h3>À quoi peut-il servir ?</h3>
    <p>ATLAS peut servir de <strong>base d’analyse géographique et historique</strong> pour un mémoire :</p>
    <ul>
      <li>Repérer les départements et communes qui concentrent le plus de biens annoncés aux enchères.</li>
      <li>Comparer les volumes année par année, de 1999 à 2026.</li>
      <li>Étudier les différences entre catégories de biens et entre territoires.</li>
      <li>Produire des cartes et graphiques pour illustrer tes résultats et choisir des territoires à étudier plus précisément.</li>
    </ul>
    <p>ATLAS a collecté, le 14 octobre 2026, <strong>${num(a.source_rows)} entrées de biens/lots</strong>.</p>
    <p>Les ${num(a.historical)} entrées historiques et les ${num(a.upcoming)} à venir concordent avec les compteurs des 167 juridictions. Une annonce peut regrouper plusieurs lots.</p>
    <p>À savoir : dans certaines annonces Licitor, on n’a pas la confirmation officielle que le bien a été vendu, mais on a la certitude qu’il a été mis en annonce.</p>
    <p>Le but de cette carte est de comprendre l’évolution par zone et où se trouvent les zones avec le plus de biens mis en annonce, afin de délimiter notre terrain d’étude pour un mémoire et de comprendre où il y a le plus de mises en annonce de ventes aux enchères.</p>
    <h3>Période et dates</h3>
    <p>Filtres ${a.min_year}–${a.max_year}, dates d’audience annoncées extraites des URL publiques, et non dates effectives d’adjudication. 2026 est partielle et inclut des audiences à venir.</p>
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
    <p>Les pourcentages sont calculés sur toutes les entrées sélectionnées. Les chiffres ne tiennent pas compte du nombre d’habitants et décrivent uniquement la base Licitor.</p>
    <h3>Sources et fonctionnement local</h3>
    <p><a href="https://www.licitor.com/historique-des-adjudications.html" target="_blank" rel="noopener">Archives publiques Licitor</a> ; <a href="https://geo.api.gouv.fr/decoupage-administratif/communes" target="_blank" rel="noopener">référentiel officiel des communes</a> ; contours départementaux Etalab 2024. Les listes d’audiences sont mises en cache ; les fiches individuelles ne sont pas toutes analysées. Aucun statut ou prix d’adjudication n’est déduit de la présence d’une entrée. Données et bibliothèque MapLibre locales, fond de carte OpenFreeMap (données OpenStreetMap) et polices en ligne, sans compte ni service payant. L’ancienne base est retirée de l’application active.</p>`;
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
  $('search').onchange=()=>{
    const value=$('search').value.trim().toLocaleLowerCase('fr');
    const towns=Object.entries(data.communes).filter(([code,c])=>c.name.toLocaleLowerCase('fr')===value||code===value);
    if(towns.length===1)focusTerritory(towns[0][0],'town');
    else if(!towns.length){const dep=Object.entries(data.departments).find(([code,name])=>name.toLocaleLowerCase('fr')===value||code.toLowerCase()===value);if(dep)focusTerritory(dep[0],'dep');}
  };
  $('reset').onclick=()=>{clearTimeout(queued);Object.assign(f,{from:data.audit.min_year,to:data.audit.max_year,category:'',dep:'',search:'',includeUndated:true});$('from').value=f.from;$('to').value=f.to;$('category').value=$('department').value=$('search').value='';update();$('annual-chart').scrollLeft=0;map?.flyTo({center:[2.7,46.55],zoom:4.8,duration:reduceMotion?0:700});};
  document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>switchMode(button.dataset.mode));
  for(const kind of ['dep','town'])$('rank-'+kind).onclick=()=>{rank=kind;['dep','town'].forEach(k=>$('rank-'+k).setAttribute('aria-pressed',String(k===kind)));renderRanking();};
  $('home').onclick=()=>map?.flyTo({center:[2.7,46.55],zoom:4.8,duration:reduceMotion?0:700});
  $('overseas').onchange=()=>{if($('overseas').value)focusTerritory($('overseas').value,'dep');$('overseas').value='';};
  for(const id of ['methodology'])$(id).onclick=()=>$('method-dialog').showModal();
  $('close-dialog').onclick=()=>$('method-dialog').close();
  $('method-dialog').onclick=e=>{if(e.target===$('method-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
  $('export').onclick=()=>{
    const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
    const header=['id_entree','date_audience_annoncee','categorie','adresse_source','organisateur','url','code_insee','departement','precision','longitude','latitude','score_geocodage_non_disponible','origine_commune','raison_precision','annonce_multi_entrees','id_annonce_licitor','nature_publiee','url_audience','date_atypique','actif_immateriel'];
    const lines=current.map(r=>[r.id,r.date,data.categories[r.category],data.addresses[r.address],data.organizers[r.organizer],r.url,r.commune,r.dep,r.precision,...(r.coordinates||['','']),r.score,r.origin,r.reason,r.similar,r.announcementId,data.natures[r.nature],data.audiences[r.audience],r.dateAnomaly,r.immaterial]);
    const blob=new Blob(['\ufeff'+[header,...lines].map(row=>row.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`atlas-annonces-${f.from}-${f.to}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  };
}

try{
  const loaded=await Promise.all([getJSON('data/atlas.json'),getJSON('data/departements.geojson'),getJSON('data/pilot.json'),getJSON('data/anomalies.json')]);
  [data,departments]=loaded;
  // Version en ligne : les biens sont répartis en plusieurs fichiers (voir scripts/publish_vercel.py).
  if(data.recordChunks)data.records=(await Promise.all(data.recordChunks.map(name=>getJSON('data/'+name)))).flat();
  populate();wire();renderMethod(loaded[2],loaded[3]);update();
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
