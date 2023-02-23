import os
import re
import glob
import json

import dataflows as DF

import pyproj
import geojson

from fetch_utils import fetch_airtable, fetch_ckan, to_data_url, _cache
from geo_utils import contains, to_point
from addresses import prepare_addresses, prepare_locations
from neighborhoods import prepare_neighborhoods_geojson, get_neighborhood_features

def crossref_commercial_area(geometry):
    if not os.path.exists('_cache_addresses'):
        prepare_addresses()

    arnona_zones = dict()

    def crossref():
        def func(row):
            point = to_point(row['lat'], row['lon'])
            if contains(point, geometry['coordinates']):
                arnona_zones.update(row['arnona_zones'])
        return func

    DF.Flow(
        DF.load('_cache_addresses/datapackage.json'),
        crossref()
    ).process()

    return dict(arnona_zones=arnona_zones)

def process_stack_commercial_areas(stack):
    key = 'stack:commercial_areas'
    try:
        cards = _cache.get(key)
    except KeyError:
        g = geojson.load(fetch_ckan('businesscenters-br7', 'GeoJSON'))
        geo_features = dict((f.properties['Name'].replace('\xa0', ''), f) for f in g.features)

        commercial_areas = fetch_airtable('commercial-areas')
        cards = []
        for card in commercial_areas:
            if card['name'] not in geo_features:
                print('MISSING COMMERCIAL AREA GEO', card['name'])
                continue
            card['geometry'] = geo_features[card['name']]
            card.update(crossref_commercial_area(card['geometry']['geometry']))
            card.pop('cards', None)
            if 'photo' in card:
                card['image'] = to_data_url(card.pop('photo')[0]['url'], width=680)
            card['שם'] = card['title'].strip()
            cards.append(card)
        _cache.set(key, cards)

    stack.update(dict(
        selectButtonText='יאללה, נשמע טוב!',
        disableClose=True,
        layout='gallery',
        map=True,
    ))
    stack.setdefault('cards', []).extend(cards)

def process_stack_demand(stack):

    def collect_cats():
        F = 'כלל המדגם'
        
        def f(rows):
            cat = None
            for row in rows:
                if F in row:
                    v = row[F]
                    if v.startswith('סך הכל '):
                        cat = v[7:]
                    elif v.startswith('--- '):
                        if not v.endswith('ללא פירוט'):
                            subcat = v[4:]
                            row['category'] = cat
                            row['subcategory'] = subcat
                            yield row
                else:
                    yield row
        return DF.Flow(
            DF.add_field('category', 'string', resources=-1),
            DF.add_field('subcategory', 'string', resources=-1),
            f,
            DF.delete_fields([F], resources=-1),
        )

    def fix_nones(row):
        row['demand_pct'] = row['demand_pct'] or 0

    key = 'stack:demand'
    try:
        demand_stacks = _cache.get(key)
    except KeyError:        
        demand_stacks = DF.Flow(
            DF.load('demand.xlsx', infer_strategy=DF.load.INFER_STRINGS, headers=2),
            collect_cats(),
            DF.update_schema(-1, missingValues=['--']),
            DF.unpivot(
                unpivot_fields=[dict(
                    name='(.+) \\([A-Z]\\)',
                    keys=dict(
                        neighborhood='\\1'
                    ),
                )],
                extra_keys=[dict(
                    name='neighborhood', type='string'
                )],
                extra_value=dict(
                    name='demand_pct', type='number'
                ),
                resources=-1
            ),
            DF.validate(),
            DF.duplicate('demand', 'demand_stacks'),
            DF.join_with_self('demand', ['category', 'subcategory'], dict(
                category=None, subcategory=None, max_demand=dict(name='demand_pct', aggregate='max')
            )),
            DF.join(
                'demand', ['category', 'subcategory'],
                'demand_stacks', ['category', 'subcategory'],
                dict(
                    max_demand=None
                )
            ),
            fix_nones,
            DF.add_field('display', 'string', lambda r: '{:.0f}%'.format(r['demand_pct'] * 100)),
            DF.add_field('value', 'number', lambda r: r['demand_pct']),
            DF.add_field('score', 'number', lambda r: r['demand_pct'] / r['max_demand'] * 6),
            DF.delete_fields(['demand_pct', 'max_demand']),
            DF.sort_rows('{score}', reverse=True),
            DF.add_field('scores', 'object', lambda r: dict(
                title=r['neighborhood'],
                score_display=r['display'],
                score_value=float(r['value']),
                geometry_score=float(r['score']),
            )),
            DF.join_with_self('demand_stacks', ['category', 'subcategory'], dict(
                category=None, subcategory=None,
                scores=dict(aggregate='array'),
            )),
            DF.add_field('card', 'object', lambda r: dict(
                title='ביקוש ל{}'.format(r['subcategory']),
                content='',
                scores=r['scores'],
                test='demand__{category}__{subcategory}'.format(**r).replace(' ', '_')
            )),
            DF.join_with_self('demand_stacks', ['category'], dict(
                category=None,
                cards=dict(name='card', aggregate='array'),
            )),
            DF.add_field('name', 'string', lambda r: 'demand.{}'.format(r['category']).replace(' ', '_')),
        ).results()[0][0]
        _cache.set(key, demand_stacks)
                    
    cards = [s for s in demand_stacks if s['name'] == stack['name']][0]['cards']
    stack.update(dict(
        layout='scores',
        currentField='neighborhood',
        map=True
    ))
    stack.setdefault('cards', []).extend(cards)

def process_demographics(stack):
    key = 'stack:demographics'
    try:
        demographics_cards = _cache.get(key)
    except KeyError:        
        def add_source():
            def f(rows):
                for row in rows:
                    row['source'] = rows.res.name
                    yield row
            return DF.Flow(
                DF.add_field('source', 'string'),
                f
            )

        def map_to_cards():
            MAP = {
                ("דו''ח אג''ס לפי עולים וותיקים",
                        ("סה''כ עולים",)
                ): 'immigrants',
                ("דו''ח אג''ס לפי קבוצות גיל",
                        ('0-5', '6-12')
                ): 'kids',
                ("דו''ח אג''ס לפי קבוצות גיל",
                        ('13-17',)
                ): 'teenagers',
                ("דו''ח אג''ס לפי קבוצות גיל",
                        ('60-64', '65-69', '70-74', '75-120')
                ): 'elderly',
                ("דו''ח אג''ס לפי קבוצות גיל",
                        ('18-21','22-24','25-29','30-34','35-39','40-44','45-49','50-54','55-59')
                ): 'adults',
            }
            
            def f(rows):
                for row in rows:
                    for (source, kinds), kind in MAP.items():
                        if row['source'] == source and row['kind'] in kinds:
                            row['kind'] = kind
                            yield row
            return f

        s2n = dict(
            (int(stat_area), f['properties']['title'])
            for f in get_neighborhood_features()
            for stat_area in f['properties']['stat_areas']
        )

        MAP2 = dict(
            adults=('אוכלוסיה בוגרת', 'גברים ונשים בין גיל 18 ל-60', 0),
            kids=('ילדים', 'תינוקות וילדים עד גיל 12', 1),
            teenagers=('בני נוער', 'נערים ונערות עד גיל 18', 2),
            elderly=('הגיל השלישי', 'גברים ונשים מעל גיל 60', 3),
            immigrants=('עולים לישראל', 'תושבים שאינם ילידי ישראל', 4),
        )

        demographics_cards = DF.Flow(
            *[
                DF.load(f, headers=4)
                for f in glob.glob('demographics/*.csv')
            ],
            DF.add_field('stat_id', 'string', lambda r: r["אג''ס"]),
            DF.add_field('total', 'number', lambda r: r.get("סה''כ")),
            DF.delete_fields(["אג''ס", "סה''כ "]),
            DF.unpivot([dict(
                name="([-'א-ת0-9 ].+)",
                keys=dict(
                    kind=r'\1'
                )
            )], [dict(
                name='kind', type='string'
            )], dict(
                name='value', type='number'
            )),
            DF.validate(),
            add_source(),
            map_to_cards(),
            DF.concatenate(dict(
                total=[], value=[], kind=[], stat_id=[]
            )),
            DF.add_field('neighborhood', 'string', lambda r: s2n.get(int(r['stat_id']))),
            DF.filter_rows(lambda r: r['neighborhood']),
            DF.join_with_self('concat', ['neighborhood', 'kind'], dict(
                neighborhood=None,
                kind=None,
                total=dict(aggregate='sum'),
                value=dict(aggregate='sum'),
            )),
            DF.duplicate('concat', 'maxes'),
            DF.join_with_self('concat', ['neighborhood'], dict(neighborhood=None, total=None)),
            DF.join('concat', ['neighborhood'], 'maxes', ['neighborhood'], dict(
                total=None,
            )),
            DF.add_field('score_value', 'number', lambda r: r['value']), # /r['total']  
            DF.sort_rows('{score_value}', reverse=True),
            DF.duplicate('maxes', 'demographics'),
            DF.join_with_self('maxes', ['kind'], dict(kind=None, max_value=dict(name='score_value', aggregate='max'))),
            DF.join('maxes', ['kind'], 'demographics', ['kind'], dict(max_value=None)),
            DF.add_field('geometry_score', 'number', lambda r: 6*r['score_value']/r['max_value']),
            DF.add_field('score_display', 'string', lambda r: '{:,} ({:.0f}%)'.format(r['value'], 100*r['score_value']/r['total'])),
            DF.add_field('scores', 'object', lambda r: dict(
                title=r['neighborhood'],
                score_value=float(r['score_value']),
                score_display=r['score_display'],
                geometry_score=float(r['geometry_score']),
            )),
            DF.join_with_self('demographics', ['kind'], dict(
                kind=None, scores=dict(aggregate='array'),
            )),
            DF.add_field('title', 'string', lambda r: MAP2[r['kind']][0]),
            DF.add_field('content', 'string', lambda r: MAP2[r['kind']][1]),
            DF.add_field('order', 'integer', lambda r: MAP2[r['kind']][2]),
            DF.sort_rows('{order}'),
            DF.delete_fields(['kind']),
        ).results()[0][0]
        _cache.set(key, demographics_cards)

    # features = [
    #     dict(type='Feature', geometry=r['geometry'], properties=dict(title=r['neighborhoods'][0]))
    #     for r in DF.Flow(
    #         DF.load('geo/stat-areas/stat-areas/datapackage.json'),
    #     ).results()[0][0]
    # ]
    # geometry=dict(type='FeatureCollection', features=features)

    stack.update(dict(
        map=True,
        scheme='green',
        currentField='neighborhood',
        layout='scores',
        # geometry=geometry
    ))
    stack.setdefault('cards', []).extend(demographics_cards)

def process_institutions(stack):
    key = 'stack:institutions'
    try:
        institutions_cards = _cache.get(key)
    except KeyError:
        CRS = '+ellps=GRS80 +k=1.00007 +lat_0=31.73439361111111 +lon_0=35.20451694444445 +no_defs +proj=tmerc +units=m +x_0=219529.584 +y_0=626907.39'
        projector = pyproj.Proj(CRS)

        def proj():
            def func(row):
                row['lon'], row['lat'] = projector(row['X'], row['Y'], inverse=True)
            return DF.Flow(
                DF.add_field('lon', 'number'),
                DF.add_field('lat', 'number'),
                func,
                DF.delete_fields(['X', 'Y'])
            )

        def translate_kind():
            translations = {
                'מרפאה': 'מרפאות',
                'איצטדיון': 'איצטדיון',
                'ספרייה': 'ספריות',
                'בית ספר': 'בתי ספר',
                'מועדון קהילתי כולל מרכז צעירים': 'מועדון קהילתי',
                'בית כנסת': 'בתי כנסת',
                'מועדון נוער': 'מועדון נוער',
                'אולם מופעים, היכל תרבות': 'מוסדות תרבות',
                'מועדון קשישים, מרכז לאזרחים ותיקים,מרכז יום לקשישים': 'מרכזי פעילות לקשישים',
            }
            def func(row):
                row['kind'] = translations[row['kind']]
            return func

        def translate_kind_singular():
            translations = {
                'מרפאה': 'מרפאה',
                'איצטדיון': 'איצטדיון',
                'ספרייה': 'ספרייה',
                'בית ספר': 'בית ספר',
                'מועדון קהילתי כולל מרכז צעירים': 'מועדון קהילתי',
                'בית כנסת': 'בית כנסת',
                'מועדון נוער': 'מועדון נוער',
                'אולם מופעים, היכל תרבות': 'אולם',
                'מועדון קשישים, מרכז לאזרחים ותיקים,מרכז יום לקשישים': 'מרכז לקשישים',
            }
            def func(row):
                row['kind_singular'] = translations[row['kind']]
            return DF.Flow(
                DF.add_field('kind_singular', 'string'),
                func,
            )

        institutions_cards = DF.Flow(
            *[
                DF.load(f)
                for f in glob.glob('institutions/*xlsx')
            ],
            DF.concatenate(dict(
                kind=['סוג המוסד'],
                title=['שם המוסד'],
                address=['כתובת'],
                X=[], Y=[]
            )),
            translate_kind_singular(),
            translate_kind(),
            proj(),
            DF.add_field('geometry', 'geojson', lambda r: geojson.Point(coordinates=[float(r['lon']), float(r['lat'])])),
            DF.dump_to_path('institutions_geo', format='geojson'),
            DF.add_field('feature', 'object', 
                        lambda r: geojson.Feature(
                            properties=dict(title=r['title'], address=r['address']),
                            geometry=r['geometry']
                        )),
            DF.delete_fields(['title', 'lon', 'lat', 'address', 'geometry', 'name', 'kind_singular']),
            DF.join_with_self('concat', ['kind'], dict(
                title=dict(name='kind'),
                features=dict(name='feature', aggregate='array')
            )),
            DF.sort_rows('{title}', reverse=True),
            DF.add_field('pointGeometry', 'object', lambda r: geojson.FeatureCollection(features=r['features'])),
            DF.add_field('content', 'string', '&nbsp;'),
            DF.delete_fields(['features']),
        #     DF.printer(tablefmt='html')
        ).results()[0][0]
        _cache.set(key, institutions_cards)

    stack.update(dict(
        map=True,
    ))
    stack.setdefault('cards', [])
    current_cards = dict(
        (c['title'], c) for c in stack['cards']
    )
    for card in institutions_cards:
        current_card = current_cards.pop(card['title'], None)
        if current_card is not None:
            card['content'] = current_card['content']
        else:
            print('SPURIOUS CARD for INSTITUTIONS', card['title'])
    stack['cards'] = [
        c for c in stack['cards']
        if c['title'] in current_cards
    ] + institutions_cards

def get_owner(rid):
    o = fetch_airtable('owners', rid)
    if 'avatar' in o:
        o['avatar'] = to_data_url(o['avatar'][0]['thumbnails']['large']['url'])
    return o

def fetch_static_stacks():
    stacks = fetch_airtable('stacks')
    for stack in stacks:
        if 'owner' in stack:
            owners = [get_owner(x) for x in stack['owner']]
            stack['owner'] = None
            for o in owners:
                if 'name' in o:
                    stack['owner'] = o
                    break
        if not stack.get('owner'):
            stack['owner'] = dict(
                name='EMPTY', title='EMPTY', avatar='https://www.gravatar.com/avatar/HASH'
            )
        stack['cards'] = [fetch_airtable('cards', x) for x in stack['cards']] if 'cards' in stack else []
        for card in stack['cards']:
            del card['stack']
            if card.get('content'):
                card['content'] = card['content'].replace(r'\_', '_')
            for k in ('business-kinds', 'commercial-areas'):
                if k in card:
                    card[k.replace('-', '_')] = [fetch_airtable(k, x)['name'] for x in card[k]]
                    del card[k]
            

    return stacks

def get_content():
    content = fetch_airtable('content', view='website')
    content = dict((x.get('key'), x) for x in content)
    for item in content.values():
        item['credits'] = [
            get_owner(x)
            for x in (item.get('credits') or [])
        ]
    return content

processors = {
    'commercial-areas': process_stack_commercial_areas,
    'demand.+': process_stack_demand,
    'demographics': process_demographics,
    'institutions': process_institutions,
}

if __name__ == "__main__":
    stacks = fetch_static_stacks()
    for stack in stacks:
        for k, v in processors.items():
            if re.match(k, stack['name']):
                cards = stack.setdefault('cards', [])
                for card in cards:
                    card['layout'] = 'simple'
                v(stack)
    with open('../ui/projects/businessgate/src/assets/all_stacks.json', 'w') as f:
        json.dump(stacks, f, ensure_ascii=False, indent=2, sort_keys=True)
    
    with open('../ui/projects/businessgate/src/assets/locations.json', 'w') as f:
        locations = prepare_locations()
        json.dump(locations, f, ensure_ascii=False, indent=2)

    with open('../ui/projects/businessgate/src/assets/neighborhoods.geojson', 'w') as f:
        neighborhoods_geojson = prepare_neighborhoods_geojson()
        f.write(neighborhoods_geojson)

    with open('../ui/projects/businessgate/src/assets/content.json', 'w') as f:
        content = get_content()
        json.dump(content, f, ensure_ascii=False, indent=2)
