from shapely.geometry import Point
from shapely.geometry.polygon import Polygon

def to_point(lat, lon):
    return Point(lon, lat)


def contains(point, coordinates):
    if len(coordinates) > 0:
        if isinstance(coordinates[0], list):
            if len(coordinates[0]) > 0:
                if isinstance(coordinates[0][0], float):
                    polygon = Polygon(coordinates)
                    return polygon.contains(point)
                else:
                    return any(contains(point, c) for c in coordinates)
    return False

