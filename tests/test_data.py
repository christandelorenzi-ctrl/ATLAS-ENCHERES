import collections, csv, hashlib, json, math, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class LicitorDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source=ROOT/'licitor_audit/lots_audiences.csv'
        cls.raw=list(csv.DictReader(cls.source.open(encoding='utf-8-sig')))
        cls.data=json.loads((ROOT/'app/data/atlas.json').read_text())
        cls.records=cls.data['records'];cls.audit=cls.data['audit']
        cls.aggregates=json.loads((ROOT/'reports/aggregates.json').read_text())
    def test_exclusive_replacement(self):
        self.assertEqual(len(self.records),87811);self.assertEqual(self.audit['dataset'],'licitor')
        self.assertEqual(self.audit['sha256'],hashlib.sha256(self.source.read_bytes()).hexdigest())
        self.assertEqual({r['id'] for r in self.records},{r['entree_audience_id'] for r in self.raw})
        self.assertEqual(len({r['id'] for r in self.records}),87811)
        self.assertEqual(self.data['urlPrefix'],'https://www.licitor.com/annonce/')
        self.assertEqual(collections.Counter(self.data['urlPrefix']+r['url'] for r in self.records),collections.Counter(r['url'] for r in self.raw))
        self.assertEqual(len({r['announcementId'] for r in self.records}),80591)
    def test_lots_preserved(self):
        actual=collections.Counter(r['announcementId'] for r in self.records)
        self.assertEqual(actual,collections.Counter(r['annonce_id'] for r in self.raw))
        self.assertEqual(actual['086679'],30)
    def test_date_source_and_anomaly(self):
        self.assertEqual((self.audit['min_year'],self.audit['max_year']),(1999,2026))
        anomalies=[r for r in self.records if r.get('dateAnomaly')]
        self.assertEqual(len(anomalies),1);self.assertEqual(anomalies[0]['date'],'1982-03-27');self.assertIsNone(anomalies[0]['year'])
        self.assertEqual(sum(r['year']==2024 for r in self.records),4601)
        self.assertEqual(sum('upcoming' not in r for r in self.records),87337)
    def test_cube_and_source_year_counts(self):
        actual=collections.Counter((r['year'],r['category'],r['dep'],r['commune'],r['precision']) for r in self.records)
        self.assertEqual(actual,{tuple(a[:-1]):a[-1] for a in self.aggregates})
        expected=collections.Counter(int(r['source_audience'].split('.html')[0][-4:]) for r in self.raw)
        expected[None]=expected.pop(1982)
        self.assertEqual(expected,collections.Counter(r['year'] for r in self.records))
    def test_only_commune_coordinates(self):
        source={r['entree_audience_id']:r for r in self.raw}
        self.assertEqual(sum(r['coordinates'] is not None for r in self.records),85232)
        self.assertTrue(all(r['precision'] in ('commune','non_resolue') for r in self.records))
        for r in self.records:
            if r['coordinates'] is None:continue
            x,y=r['coordinates'];raw=source[r['id']]
            self.assertEqual([x,y],[float(raw['longitude_centre_commune']),float(raw['latitude_centre_commune'])])
            self.assertTrue(math.isfinite(x) and math.isfinite(y));self.assertTrue(-180<=x<=180 and -85<=y<=85)
            self.assertEqual(self.data['communes'][r['commune']]['dep'],r['dep'])
    def test_nonphysical_assets_not_mapped(self):
        entries=[r for r in self.records if r.get('immaterial')]
        self.assertEqual(len(entries),117)
        self.assertTrue(all(r['coordinates'] is None and r['category']=='actifs-immateriels' for r in entries))
    def test_precision_reconciles(self):
        self.assertEqual(dict(collections.Counter(r['precision'] for r in self.records)),{k:v for k,v in self.audit['precision'].items() if v})
        self.assertEqual(self.audit['without_department'],sum(not r['dep'] for r in self.records))
        self.assertEqual(self.audit['without_commune'],2479)
if __name__=='__main__':unittest.main()
