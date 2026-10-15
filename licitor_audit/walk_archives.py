"""Walk all publicly linked Licitor hearing pages; conservative locality census.
No authentication, no forbidden robots paths, no attempt to bypass challenges.
One request starts at most every 1.2 seconds; results persist after every page.
"""
import concurrent.futures, csv, datetime, gzip, hashlib, html, json, re, sqlite3
import subprocess, time, unicodedata
from pathlib import Path
from urllib.parse import urljoin, urlsplit, parse_qs, urlunsplit
from urllib.robotparser import RobotFileParser
from census import anchors, text, counters, ad_entries

OUT=Path(__file__).resolve().parent; ROOT=OUT.parent; BASE='https://www.licitor.com'
def norm(v):
    s=unicodedata.normalize('NFKD',v.replace('œ','oe').replace('Œ','OE').replace('æ','ae')).encode('ascii','ignore').decode().lower()
    s=re.sub(r'\bst\b','saint',s);s=re.sub(r'\bste\b','sainte',s)
    return re.sub('[^a-z0-9]','',s)
def main():
    ref=json.loads((ROOT/'data/reference/communes.json').read_text())
    towns={};by_code={r['code']:r for r in ref}
    for r in ref:towns.setdefault((r['codeDepartement'],norm(r['nom'])),[]).append(r)
    robot=RobotFileParser();robot.parse((OUT/'robots.txt').read_text().splitlines())
    db=sqlite3.connect(OUT/'archive_walk.sqlite');db.execute('PRAGMA journal_mode=WAL')
    db.executescript('''CREATE TABLE IF NOT EXISTS pages(url TEXT PRIMARY KEY,state TEXT,html BLOB,status INTEGER);
    CREATE TABLE IF NOT EXISTS ads(id TEXT PRIMARY KEY,url TEXT,city TEXT,dep TEXT,nature TEXT,commune TEXT,
    precision TEXT,origin_page TEXT,context_date TEXT,price_or_status TEXT);
    CREATE TABLE IF NOT EXISTS observations(ad_id TEXT,page_url TEXT,PRIMARY KEY(ad_id,page_url));''')
    seeds=counters((OUT/'historique.html').read_text(),'courts')
    for r in seeds:db.execute('INSERT OR IGNORE INTO pages(url,state) VALUES (?,?)',(r['url'],'pending'))
    db.commit();last_start=0;stop_reason='';active={};fetched=0
    def fetch(url):
        response=subprocess.run(['curl','-LsS','--max-time','30','--max-redirs','3','-w','\n%{http_code}',url],capture_output=True)
        content,_,status=response.stdout.rpartition(b'\n')
        return content,int(status or 0),response.returncode,response.stderr.decode(errors='replace')
    def process(url,content,status):
        s=content.decode('utf-8',errors='replace')
        if status in (401,403,429) or 'Just a moment' in s or 'challenges.cloudflare.com' in s:
            return f'Protection ou restriction HTTP {status} à {url} : arrêt sans contournement.'
        if status in (404,410):
            db.execute('UPDATE pages SET state=?,html=?,status=? WHERE url=?',('missing',gzip.compress(content),status,url));db.commit();return ''
        if status!=200:return f'HTTP {status} à {url} : parcours interrompu, exhaustivité non atteinte.'
        db.execute('UPDATE pages SET state=?,html=?,status=? WHERE url=?',('done',gzip.compress(content),status,url))
        # Follow only actual publicly linked hearing dates, not calendars, APIs or forms.
        for attrs,body in anchors(s):
            href=re.search(r'href="([^"]+)"',attrs)
            if not href:continue
            dest=urljoin(BASE,html.unescape(href[1])).split('#')[0]
            if urlsplit(dest).netloc!='www.licitor.com':continue
            # Month/year links alter the calendar, not the set of advertisements.
            # Canonicalize them to the hearing; retain only genuine ad pagination.
            parts=urlsplit(dest);q=parse_qs(parts.query)
            query='p='+q['p'][0] if q.get('p') and q['p'][0].isdigit() and int(q['p'][0])>1 else ''
            dest=urlunsplit((parts.scheme,parts.netloc,parts.path,query,''))
            if re.fullmatch(r'/ventes-judiciaires-immobilieres/[^/]+/[^/?]+\.html',urlsplit(dest).path):
                if robot.can_fetch('*',dest):db.execute('INSERT OR IGNORE INTO pages(url,state) VALUES (?,?)',(dest,'pending'))
        for attrs,body in anchors(s):
            if not re.search(r'class="Ad(?:\s|\")',attrs):continue
            href=re.search(r'href="([^"]+)"',attrs)
            if not href or not href[1].startswith('/annonce/'):continue
            dest=urljoin(BASE,html.unescape(href[1]));ident=re.search(r'/(\d+)\.html$',dest)
            if not ident:continue
            def extract(cls):
                m=re.search(r'<(?:span|p) class="'+cls+r'">(.*?)</(?:span|p)>',body,re.S)
                return text(m[1]) if m else ''
            city,dep,nature=extract('City'),extract('Number'),extract('Name')
            normalized=norm(city); candidates=towns.get((dep,normalized),[])
            if dep=='75' and normalized.startswith('paris'):candidates=[by_code['75056']]
            elif dep=='69' and re.fullmatch(r'lyon\d*(?:er|eme|e)?',normalized):candidates=[by_code['69123']]
            elif dep=='13' and re.fullmatch(r'marseille\d*(?:er|eme|e)?',normalized):candidates=[by_code['13055']]
            commune=candidates[0]['code'] if len(candidates)==1 else ''
            price=re.search(r'<p class="(?:Result|Unsold|Price).*?">(.*?)</p>',body,re.S)
            value=text(price[1]) if price else ''
            db.execute('INSERT OR IGNORE INTO ads VALUES (?,?,?,?,?,?,?,?,?,?)',
                (ident[1],dest,city,dep,nature,commune,'commune_approximative' if commune else 'a_verifier',url,url.split('/')[-1].removesuffix('.html'),value))
            db.execute('INSERT OR IGNORE INTO observations VALUES (?,?)',(ident[1],url))
        db.commit();return ''
    def progress(complete=False):
        states=dict(db.execute('SELECT state,count(*) FROM pages GROUP BY state'))
        count=db.execute('SELECT count(*) FROM ads').fetchone()[0]
        mapped=db.execute("SELECT count(*) FROM ads WHERE commune!=''").fetchone()[0]
        result=dict(updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),states=states,
                    unique_ads=count,locality_matched=mapped,network_pages_this_run=fetched,
                    complete=complete,stop_reason=stop_reason,
                    unit='annonce identifiée par URL, pas bien physique unique',
                    individual_property_pages_read=False,geocoding_service_used=False)
        (OUT/'walk_progress.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
        print(json.dumps(result,ensure_ascii=False,separators=(',',':')),flush=True)
    # A restart safely resumes the pending queue; no repeated network reads for done pages.
    db.execute("UPDATE pages SET state='pending' WHERE state='running'")
    db.execute("DELETE FROM pages WHERE state='pending' AND (url LIKE '%month=%' OR url LIKE '%year=%')")
    db.commit()
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        while True:
            while len(active)<1:
                row=db.execute("SELECT url FROM pages WHERE state='pending' ORDER BY rowid LIMIT 1").fetchone()
                if not row:break
                url=row[0]
                if not robot.can_fetch('*',url):stop_reason='Chemin interdit par robots.txt : '+url;break
                time.sleep(max(0,1.2-(time.monotonic()-last_start)));last_start=time.monotonic()
                db.execute("UPDATE pages SET state='running' WHERE url=?",(url,));db.commit()
                active[pool.submit(fetch,url)]=url
            if stop_reason or not active:break
            done,_=concurrent.futures.wait(active,return_when=concurrent.futures.FIRST_COMPLETED)
            for future in done:
                url=active.pop(future);content,status,code,error=future.result();fetched+=1
                if code:stop_reason=f'Erreur réseau pour {url}: {error}';break
                stop_reason=process(url,content,status)
                if stop_reason:
                    db.execute('UPDATE pages SET state=?,status=?,html=? WHERE url=?',('blocked',status,gzip.compress(content),url));db.commit();break
                if fetched%40==0:progress()
            if stop_reason:break
        # At most two requests are in flight. Preserve them without enqueueing further work.
        for future,url in active.items():
            content,status,code,error=future.result()
            db.execute("UPDATE pages SET state='pending' WHERE url=?",(url,))
        db.commit()
    complete=not stop_reason and not db.execute("SELECT 1 FROM pages WHERE state NOT IN ('done','missing') LIMIT 1").fetchone()
    with (OUT/'annonces_recensees.csv').open('w',encoding='utf-8-sig',newline='') as f:
        cursor=db.execute('SELECT * FROM ads ORDER BY CAST(id AS INTEGER)');w=csv.writer(f)
        w.writerow([c[0] for c in cursor.description]);w.writerows(cursor)
    progress(complete);db.close()
if __name__=='__main__':main()
