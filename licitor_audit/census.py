"""Census of every public geographic index and every published court counter.
This does not claim to have downloaded individual property files or geocoded them.
"""
import csv, datetime, html, json, math, re, subprocess, time
from pathlib import Path

OUT=Path(__file__).resolve().parent
BASE='https://www.licitor.com'
def fetch(path,name):
    file=OUT/name
    if file.exists():return file.read_text(errors='replace')
    time.sleep(1)
    r=subprocess.run(['curl','-LsS','--max-time','30','-o',str(file),'-w','%{http_code}',BASE+path],capture_output=True,text=True)
    if r.returncode or r.stdout!='200':raise RuntimeError(f'Accès interrompu : {path}, HTTP {r.stdout}, {r.stderr}')
    s=file.read_text(errors='replace')
    if 'Just a moment' in s:raise RuntimeError('Protection technique : arrêt sans contournement')
    return s
def text(s):return html.unescape(re.sub('<[^>]*>',' ',s)).strip()
def anchors(s):return re.findall(r'<a\s+([^>]+)>(.*?)</a>',s,re.S)
def counters(s,mode):
    output=[]
    for attrs,body in anchors(s):
        count=re.search(r'<span class="Count">(\d+)</span>',body)
        href=re.search(r'href="([^"]+)"',attrs)
        if not count or not href:continue
        if mode=='courts' and 'Consulter l\'historique' not in attrs:continue
        if mode=='zones' and 'data-areaname' not in attrs:continue
        label=text(re.sub(r'<span class="Count">.*?</span>','',body))
        output.append(dict(label=label,count=int(count[1]),url=BASE+html.unescape(href[1])))
    return output
def ad_entries(s):
    result=[]
    for attrs,body in anchors(s):
        if not re.search(r'class="Ad(?:\s|\")',attrs):continue
        href=re.search(r'href="([^"]+)"',attrs)
        if not href or not href[1].startswith('/annonce/'):continue
        city=re.search(r'<span class="City">(.*?)</span>',body,re.S)
        dep=re.search(r'<span class="Number">(.*?)</span>',body,re.S)
        result.append({'url':BASE+href[1],'city':text(city[1]) if city else '',
                       'dep':text(dep[1]) if dep else ''})
    return result

def main():
    history=fetch('/historique-des-adjudications.html','historique.html')
    current=fetch('/','actuelles.html')
    courts=counters(history,'courts');zones=[];checked_entries=[]
    for kind,s in [('historique',history),('a_venir',current)]:
        for i,z in enumerate(counters(s,'zones')):
            path=z['url'].removeprefix(BASE)
            page=fetch(path,f'{kind}_zone_{i}.html')
            total=re.search(r'name="total" value="(\d+)"',page)
            if total is None:raise RuntimeError('Pagination non trouvée : '+z['url'])
            limit=int(re.search(r'name="limit" value="(\d+)"',page)[1])
            count=int(total[1]);last=math.ceil(count/limit) if count else 1
            entries=ad_entries(page)
            if last>1:
                end=fetch(path+f'?p={last}',f'{kind}_zone_{i}_last.html')
                end_entries=ad_entries(end);entries+=end_entries
                if len(end_entries)!=(count%limit or limit):raise RuntimeError('Dernière page incohérente : '+z['url'])
            for entry in entries:checked_entries.append(dict(index_kind=kind,zone=z['label'],**entry))
            zones.append(dict(kind=kind,**z,pagination_total=count,pages=last,
                              first_last_entries_checked=len(entries)))
            print(f'{kind} · {z["label"]} : {count} annonces, {last} pages',flush=True)
    for filename,rows in [('juridictions.csv',courts),('zones.csv',zones),('index_entries_checked.csv',checked_entries)]:
        with (OUT/filename).open('w',encoding='utf-8-sig',newline='') as f:
            w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    data=dict(checked_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
              court_count=len(courts),court_sum=sum(c['count'] for c in courts),
              geographic_history=sum(z['pagination_total'] for z in zones if z['kind']=='historique'),
              geographic_upcoming=sum(z['pagination_total'] for z in zones if z['kind']=='a_venir'),
              geographic_index_pages=sum(z['pages'] for z in zones),
              first_last_entries_checked=len(checked_entries),
              checked_entry_localities_present=sum(bool(r['city'] and r['dep']) for r in checked_entries),
              individual_all_records_downloaded=False,geocoding_performed=False,zones=zones)
    (OUT/'census.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in data.items() if k!='zones'},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
