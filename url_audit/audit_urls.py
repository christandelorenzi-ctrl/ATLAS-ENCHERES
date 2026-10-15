#!/usr/bin/env python3
"""Independent ATLAS URL access audit. Hard limit: first ten sampled URLs only."""
import csv, datetime, hashlib, json, re, subprocess, time
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'url_audit'
SEED='ATLAS-URL-AUDIT-2026-10-09-v1'
FIELDS=['mise_a_prix','prix_adjudication','date_effective_adjudication','statut_vente',
        'surenchere','adresse_publiee','nature_bien','surface_habitable_utile','surface_terrain',
        'nombre_pieces','occupation','references_cadastrales','procedure_juridique',
        'liquidation_explicitement_identifiee','cahier_conditions_vente','pv_adjudication',
        'expertise','annonce_legale','documents_pdf']

def period(year):
    if not 2006<=year<=2024:return 'date_anormale'
    if year<=2010:return '2006-2010'
    if year<=2015:return '2011-2015'
    if year<=2020:return '2016-2020'
    return '2021-2024'

def features(row):
    year=int(row['Date de vente'][:4])
    geo=re.search(r'/([^/]+)-(\d{2,3}|2[AB])/',row['Url'],re.I)
    dep=geo[2].upper() if geo else 'inconnu'
    return {'periode':period(year),'annee':str(year),'categorie':row['Categorie'] or 'non_renseignee',
            'organisateur':row['Organisateur_id'],'departement_url':dep}

def sample():
    with (ROOT/'resultats-vente-2006-2024.csv').open(encoding='utf-8-sig',newline='') as f:rows=list(csv.DictReader(f))
    # Diversity-maximizing purposeful sample; deterministic hash breaks ties.
    attributes=[features(row) for row in rows];seen={k:set() for k in attributes[0]}
    weights={'periode':8,'annee':4,'categorie':9,'organisateur':2,'departement_url':2}
    priorities=[hashlib.sha256((SEED+'|'+r['Url']).encode()).hexdigest() for r in rows]
    selected=[0];remaining=set(range(1,len(rows)))
    for k,v in attributes[0].items():seen[k].add(v)
    while len(selected)<100:
        index=min(remaining,key=lambda i:(-sum(weights[k] for k,v in attributes[i].items() if v not in seen[k]),priorities[i]))
        selected.append(index);remaining.remove(index)
        for k,v in attributes[index].items():seen[k].add(v)
    sampled=[dict(ordre_echantillon=i+1,ligne_enregistrement=index+2,
                  id_annonce=re.search(r'_(\d+)$',rows[index]['Url'])[1],**attributes[index],**rows[index]) for i,index in enumerate(selected)]
    with (OUT/'echantillon_100.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(sampled[0]));w.writeheader();w.writerows(sampled)
    meta={'seed':SEED,'method':'greedy weighted diversity, deterministic SHA256 tie-break; first CSV observation forced',
          'weights':weights,'source_sha256':hashlib.sha256((ROOT/'resultats-vente-2006-2024.csv').read_bytes()).hexdigest(),
          'n_sample':100,'n_access_limit':10,'coverage_100':{k:sorted(v) for k,v in seen.items()},
          'coverage_10':{k:sorted({r[k] for r in sampled[:10]}) for k in seen}}
    (OUT/'sampling.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2))
    return sampled

def audit():
    sampled=sample();outcomes=[]
    for row in sampled[:10]:
        order=row['ordre_echantillon'];prefix=f'{order:03}'
        html_path=OUT/'pages'/f'{prefix}.html';header_path=OUT/'pages'/f'{prefix}.headers'
        checked=datetime.datetime.now(datetime.timezone.utc).isoformat()
        if order==1 and html_path.exists():
            status=403;final=row['Url'];redirects=0;error='';checked='2026-10-09 (première vérification conservée)'
        else:
            time.sleep(2)
            response=subprocess.run(['curl','-LsS','--max-time','25','--max-redirs','3','-D',str(header_path),
                '-o',str(html_path),'-w','%{http_code}\t%{url_effective}\t%{num_redirects}',row['Url']],capture_output=True,text=True)
            parts=response.stdout.split('\t');status=int(parts[0] or 0) if parts else 0
            final=parts[1] if len(parts)>1 else row['Url'];redirects=int(parts[2]) if len(parts)>2 else 0;error=response.stderr
        html=html_path.read_text(errors='replace') if html_path.exists() else ''
        headers=header_path.read_text(errors='replace') if header_path.exists() else ''
        if order==1:
            date_header=re.search(r'^date:\s*(.+)$',headers,re.I|re.M)
            if date_header:checked=parsedate_to_datetime(date_header[1].strip()).isoformat()
        title=re.search(r'<title[^>]*>(.*?)</title>',html,re.I|re.S)
        challenge=bool(re.search(r'cf-mitigated:\s*challenge',headers,re.I) or 'challenges.cloudflare.com' in html or 'Just a moment' in html)
        blocked=status in [401,403,429] or challenge
        accessible=200<=status<300 and not challenge
        outcome=dict(row,verifie_le_utc=checked,http_status=status,url_finale=final,nombre_redirections=redirects,
            page_accessible='oui' if accessible else 'non',blocage_technique='Cloudflare challenge' if challenge else 'restriction HTTP' if blocked else '',
            titre_html=title[1] if title else '',contenu_bien_exploitable='inaccessible' if not accessible else 'a_examiner',
            resultat_vente_exploitable='inaccessible' if not accessible else 'a_examiner',
            preuve_acces='HTTP '+str(status)+('; cf-mitigated: challenge; titre Just a moment...' if challenge else ''),
            html_archive=str(html_path.relative_to(ROOT)),headers_archive=str(header_path.relative_to(ROOT)),erreur_transport=error.strip())
        for field in FIELDS:
            outcome[field]='';outcome[field+'_fiabilite']='inaccessible' if not accessible else 'a_examiner'
            outcome[field+'_source']=row['Url'];outcome[field+'_extrait']=''
        outcomes.append(outcome)
        print(f'{order}/10 · ligne {row["ligne_enregistrement"]} · {row["annee"]} · {row["categorie"]} · HTTP {status} · {outcome["blocage_technique"]}',flush=True)
    with (OUT/'audit_10.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(outcomes[0]));w.writeheader();w.writerows(outcomes)
    # The requested 100-row file truthfully distinguishes examined / not examined.
    by_order={r['ordre_echantillon']:r for r in outcomes}
    full=[]
    for row in sampled:
        if row['ordre_echantillon'] in by_order:full.append(dict(by_order[row['ordre_echantillon']],etat_analyse='examinee'))
        else:
            r={k:'' for k in outcomes[0]};r.update(row);r['etat_analyse']='non_examinee_arret_demande'
            for field in FIELDS:r[field+'_fiabilite']='non_examinee';r[field+'_source']=row['Url']
            full.append(r)
    with (OUT/'audit_echantillon_100.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(full[0]));w.writeheader();w.writerows(full)
    (OUT/'results.json').write_text(json.dumps({'checked':len(outcomes),'accessible':sum(r['page_accessible']=='oui' for r in outcomes),
        'blocked':sum(bool(r['blocage_technique']) for r in outcomes),'records':outcomes},ensure_ascii=False,indent=2))
    print('Arrêt : dix liens examinés, aucune autre collecte.',flush=True)

if __name__=='__main__':audit()
