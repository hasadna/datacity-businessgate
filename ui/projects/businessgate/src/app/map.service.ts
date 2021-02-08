import * as mapboxgl from 'mapbox-gl';
import pointOnFeature from '@turf/point-on-feature';

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class MapService {

  ACCESS_TOKEN = 'pk.eyJ1IjoiYnVzaW5lc3NnYXRlIiwiYSI6ImNrajhycnp6NTA4dngycnBlbGs4YXl2MHkifQ.Xxbg8tuWET8qOGVk0qkYTA';

  constructor(private http: HttpClient) {
    (mapboxgl as any).accessToken = this.ACCESS_TOKEN;
    mapboxgl.setRTLTextPlugin(
      'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.2.3/mapbox-gl-rtl-text.js',
      null,
      true // Lazy load the plugin
    );
  }

  isochrone(coordinates, minutes) {
    const urlBase = 'https://api.mapbox.com/isochrone/v1/mapbox';
    const url = `${urlBase}/walking/${coordinates[0]},${coordinates[1]}` +
      `?contours_minutes=${minutes}&polygons=true&access_token=${this.ACCESS_TOKEN}`;
    return this.http.get(url).pipe(
      map((geojson: GeoJSON.FeatureCollection) => {
        for (const feature of geojson.features) {
          feature.properties['iso-distance'] = minutes;
        }
        return geojson;
      })
    );
  }

  calculatePoint(geometry) {
    if (geometry.type === 'Polygon') {
      return pointOnFeature(geometry);
    } else if (geometry.type === 'Point') {
      return geometry;
    } else if (geometry.type === 'Feature') {
      return this.calculatePoint(geometry.geometry);
    } else {
      return null;
    }
  }

}
