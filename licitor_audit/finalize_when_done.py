"""One-shot local finalizer for the already-authorized collection; no network calls."""
import json,time
from pathlib import Path
from summarize_walk import summarize
OUT=Path(__file__).resolve().parent
if __name__=='__main__':
    print('Finalisation locale en attente du collecteur Licitor.',flush=True)
    while True:
        try:progress=json.loads((OUT/'walk_progress.json').read_text())
        except (FileNotFoundError,json.JSONDecodeError):progress={}
        if progress.get('complete') or progress.get('stop_reason'):
            result=summarize()
            result['collection_stop_reason']=progress.get('stop_reason','')
            (OUT/'FINAL_RESULT.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
            print('Rapport final écrit dans licitor_audit/RAPPORT.md',flush=True)
            break
        time.sleep(20)
