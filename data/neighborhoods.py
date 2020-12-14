import geojson
import dataflows as DF

from shapely.geometry import shape, mapping
from shapely.ops import unary_union

g = geojson.load(open('stat-areas.geojson'))
geometries = dict((f.properties['STAT11'], f.geometry) for f in g.features)

def unwind_neighborhoods():
    def f(rows):
        for row in rows:
            for n in row['neighborhoods']:
                row['neighborhood'] = n
                yield row

    return DF.Flow(
        DF.add_field('neighborhood', 'string'),
        f,
        DF.delete_fields(['neighborhoods'])
    )

def unite_geometries(geometries):
    polygons = [shape(x) for x in geometries]
    u = unary_union(polygons)
    return mapping(u)

def get_neighborhood_features():
    return DF.Flow(
        DF.load('neighborhoods.xlsx', name='stat-areas', deduplicate_headers=True),
        DF.add_field('neighborhoods', 'array', lambda r: [v for k, v in r.items() if v and k.startswith('neighborhood')]),
        DF.add_field('geometry', 'object', lambda r: geometries[r['stat-area']]),
        DF.concatenate(dict(
            stat_area=['stat-area'],
            neighborhoods=[], geometry=[]
        )),
        DF.update_resource(-1, name='stat-areas'),
        unwind_neighborhoods(),
        DF.join_with_self('stat-areas', ['neighborhood'], dict(
            neighborhood=None,
            stat_areas=dict(name='stat_area', aggregate='array'),
            geometries=dict(name='geometry', aggregate='array'),
        )),
        DF.add_field('geometry', 'object', lambda r: unite_geometries(r['geometries'])),
        DF.delete_fields(['geometries']),
        DF.update_resource(-1, name='neighborhoods'),
        DF.add_field('properties', 'object', lambda r: dict(
            x=3,
            title=r['neighborhood'],
            stat_areas=r['stat_areas']
        )),
        DF.delete_fields(['neighborhood', 'stat_areas']),
        DF.checkpoint('_cache_neighborhoods')
    ).results()[0][0]

def prepare_neighborhoods_geojson():
    features = [geojson.Feature(**f) for f in get_neighborhood_features()]
    return geojson.dumps(geojson.FeatureCollection(features=features), 
                         ensure_ascii=False, indent=2, sort_keys=True)
                #   open('../../ui/projects/businessgate/src/assets/neighborhoods.geojson', 'w'),
    # neighborhoods_geojson
    # return 

if __name__ == '__main__':
    print(prepare_neighborhoods_geojson())