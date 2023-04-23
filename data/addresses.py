import geojson
import dataflows as DF
import tempfile
import shutil
import re

from fetch_utils import fetch_ckan
from geo_utils import contains, to_point

arnona = {
    'משרד, שירותים ומסחר': geojson.load(open('./data/arnona/arnona_zone_mishar')),
    'תעשיה': geojson.load(open('./data/arnona/arnona_zone_taasia')),
    'מבני מגורים': geojson.load(open('./data/arnona/arnona_zone_megurim')),
}

def match_arnona():
    def func(row):
        point = to_point(row['lat'], row['lon'])
        for k, v in arnona.items():
            for feature in v['features']:
                coordinates = feature['geometry']['coordinates']
                if contains(point, coordinates):
                    props = feature['properties']
                    row['arnona_zones'][k] = props.get('אזורי') or props['Leter']
                    break

    return DF.Flow(
        DF.set_type('lat', type='number'),
        DF.set_type('lon', type='number'),
        DF.add_field('arnona_zones', 'object', {}),
        func
    )


def prepare_addresses():
    with tempfile.NamedTemporaryFile(suffix='.csv', mode='wb') as source:
        shutil.copyfileobj(fetch_ckan('addresses-br7', 'CSV'), source)
        source.flush()
        DF.Flow(
            DF.load(source.name),
            DF.concatenate(dict(
                street_name=['streetName'],
                house_number=['HouseNuber'],
                letter=[],
                lat=[], lon=[]
            )),
            match_arnona(),
            DF.dump_to_path('_cache_addresses'),
            DF.checkpoint('_cache_addresses')
        ).process()

def sort_street_address(street_name):
    if re.match('^[0-9]+$', street_name):
        return 'תתתתתתת ' + street_name
    else:
        return street_name

def prepare_locations():
    prepare_addresses()
    return DF.Flow(
        DF.load('_cache_addresses/datapackage.json'),
        DF.add_field('address', 'string',
                    lambda r: '{} {}{}'.format(
                        r['street_name'], r['house_number'], r['letter'] or '')),
        DF.add_field('item', 'object', lambda r: dict(
            value=dict(
                lat=float(r['lat']), lon=float(r['lon']), arnona_zones=r['arnona_zones'], שם=r['address']
            ),
            display=r['address']
        )),
        DF.sort_rows('{house_number}'),
        DF.delete_fields(['house_number', 'letter', 'lat', 'lon', 'arnona_zones', 'address']),
        DF.join_with_self('concat', ['street_name'], dict(
            display=dict(name='street_name'),
            items=dict(name='item', aggregate='array')
        )),
        DF.add_field('sort_street_address', 'string', lambda r: sort_street_address(r['display'])),
        DF.sort_rows('{sort_street_address}'),
        DF.delete_fields(['sort_street_address']),
        DF.printer(),
        DF.dump_to_path('_cache_locations'),
        DF.checkpoint('_cache_locations')
    ).results()[0][0]


if __name__ == '__main__':
    prepare_addresses()
    prepare_locations()