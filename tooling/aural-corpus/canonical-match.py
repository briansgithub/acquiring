"""Stream the CC0 canonical dump; retain only catalog-name candidates, never extract 7GB CSV.
Requires zstandard and Unidecode. Generated data remains under acquiring_data.
Name matches are candidates, not exact-identifier or human-reviewed confirmations.
"""
import argparse, csv, io, json, re, sqlite3, tarfile
from pathlib import Path
import zstandard
from unidecode import unidecode

def normalize(text):
    return re.sub(r'[^a-z0-9]', '', unidecode(text).lower())

def match_dump(dump, catalog, output):
    with sqlite3.connect(catalog) as db:
        songs = [dict(zip(('slug','artist','title'), row)) for row in db.execute('select slug,artist,title from songs order by slug')]
    wanted = {}
    for song in songs:
        wanted.setdefault(normalize(song['artist']) + normalize(song['title']), []).append(song)
    matches = {}; scanned=0
    with open(dump,'rb') as source, zstandard.ZstdDecompressor().stream_reader(source) as decoded, tarfile.open(fileobj=decoded,mode='r|') as archive:
        for entry in archive:
            if not entry.name.endswith('/canonical_musicbrainz_data.csv'): continue
            reader = csv.DictReader(line.decode('utf-8') for line in archive.extractfile(entry))
            for row in reader:
                scanned+=1
                candidates=wanted.get(row['combined_lookup'],[])
                for song in candidates:
                    if normalize(row['artist_credit_name']) != normalize(song['artist']) or normalize(row['recording_name']) != normalize(song['title']): continue
                    matches.setdefault(song['slug'],[]).append({key:row[key] for key in ('artist_credit_name','recording_name','recording_mbid','release_name','release_mbid','score')})
            break
    result={'source':Path(dump).name,'license':'CC0-1.0','rowsScanned':scanned,'catalogSongs':len(songs),'matchedNames':len(matches),'candidates':matches}
    Path(output).write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='candidates'}))

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('dump'); parser.add_argument('catalog'); parser.add_argument('output')
    args=parser.parse_args(); match_dump(args.dump,args.catalog,args.output)
